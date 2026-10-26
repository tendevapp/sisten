/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Situação de um material — o mini-relatório do Ctrl+K e da leitura do QR da
 * etiqueta: saldo por depósito (ZL0024), chegada física no almoxarifado ainda
 * sem MIGO (conferência do Recebimento / marcação do Rastreio), RM aberta
 * (ME5A), pedido (ZL0132) com previsão de entrega e MIGO, entradas da MB51 e
 * o último movimento.
 *
 * Vem da RPC `alm_situacao_material` (migration `20261026150000`), que aplica
 * as regras do Dossiê do Controle de Estoque a um material só — a view do
 * Dossiê leva ~8 s por item, a RPC ~25 ms. Sem valores em R$.
 *
 * As regras de exibição (situação do pedido e da RM) são puras e testadas.
 */

import { supabase } from '../db/supabaseClient';

export interface DepositoSituacao {
  deposito: string;
  saldo: number;
  posicao: string | null;
}

export type SituacaoRm = 'sem_pedido' | 'em_pedido' | 'atendida';

export interface RmSituacao {
  ri: string | null;
  requisicao: string | null;
  item: string | null;
  data: string | null;
  requisitante: string | null;
  quantidade: number | null;
  deposito: string | null;
  pedido: string | null;
  item_pedido: string | null;
  entrega_prevista: string | null;
  entrega_confirmada: boolean;
  situacao: SituacaoRm;
}

export interface PedidoSituacao {
  pedido: string;
  item: string | null;
  ri: string | null;
  requisicao: string | null;
  data: string | null;
  remessa_prevista: string | null;
  data_migo: string | null;
  fornecedor: string | null;
  deposito: string | null;
  quantidade_pedida: number | null;
  quantidade_fornecida: number | null;
  quantidade_pendente: number;
  recebido_mb51: number | null;
  ultima_entrada: string | null;
  /** Data da chegada física mais recente registrada para a linha (RI-PO). */
  chegada_almox: string | null;
}

/** Chegada física no almoxarifado: conferência do Recebimento (RCM) ou marcação do Rastreio. */
export interface ChegadaSituacao {
  codigo: string | null;
  data: string;
  pedido: string | null;
  ri_po: string | null;
  /** Contada na conferência; nula na marcação do Rastreio. */
  quantidade: number | null;
  unidade: string | null;
  parcial: boolean;
  divergencia: boolean;
  tipo_divergencia: string | null;
  registrado_por: string | null;
  origem: 'conferencia' | 'rastreio';
  /** Primeira MIGO do pedido a partir da chegada; nula = ainda não entrou saldo. */
  migo_em: string | null;
}

export interface SituacaoMaterial {
  material: string;
  centro: string | null;
  descricao: string | null;
  umb: string | null;
  no_catalogo_sap: boolean;
  saldo_total: number;
  depositos: DepositoSituacao[];
  posicao_cadastro: string | null;
  estoque_minimo: number | null;
  estoque_importado_em: string | null;
  movimentos_importados_em: string | null;
  rms: RmSituacao[];
  pedidos: PedidoSituacao[];
  chegadas: ChegadaSituacao[];
  ultimo_movimento: {
    data: string | null;
    tipo: string | null;
    descricao: string | null;
    quantidade: number | null;
    deposito: string | null;
    pedido: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Regras de exibição (puras)
// ---------------------------------------------------------------------------

export type SituacaoPedido = 'chegou' | 'atrasado' | 'aberto' | 'recebido';

/**
 * Pedido com quantidade pendente está aberto — "chegou" se há chegada física
 * sem MIGO para ele (material na prateleira, sem saldo ainda; quem chama
 * cruza com `aguardandoMigo`), senão atrasado se a remessa prevista já
 * passou. Datas comparadas como texto ISO (sem `new Date`, que volta um dia
 * em UTC-3).
 */
export function situacaoPedido(
  p: Pick<PedidoSituacao, 'quantidade_pendente' | 'remessa_prevista'>,
  hojeISO: string,
  chegouSemMigo = false,
): SituacaoPedido {
  if (!(p.quantidade_pendente > 0)) return 'recebido';
  if (chegouSemMigo) return 'chegou';
  if (p.remessa_prevista && p.remessa_prevista.slice(0, 10) < hojeISO) return 'atrasado';
  return 'aberto';
}

export const ROTULO_SITUACAO_PEDIDO: Record<SituacaoPedido, string> = {
  chegou: 'Chegou — aguardando MIGO',
  atrasado: 'Entrega atrasada',
  aberto: 'Aguardando entrega',
  recebido: 'Recebido',
};

/** Chegadas sem MIGO e a quantidade contada nelas (a marcação do Rastreio não tem quantidade). */
export function aguardandoMigo(chegadas: ChegadaSituacao[]): { chegadas: ChegadaSituacao[]; quantidade: number; semQuantidade: number } {
  const pendentes = chegadas.filter(c => !c.migo_em);
  return {
    chegadas: pendentes,
    quantidade: pendentes.reduce((s, c) => s + (Number(c.quantidade) || 0), 0),
    semQuantidade: pendentes.filter(c => c.quantidade == null).length,
  };
}

export const ROTULO_SITUACAO_RM: Record<SituacaoRm, string> = {
  sem_pedido: 'Sem pedido',
  em_pedido: 'Em pedido',
  atendida: 'Já atendida',
};

/** Saldo abaixo do mínimo do Cadastro de Itens (só quando há mínimo cadastrado). */
export function abaixoDoMinimo(s: Pick<SituacaoMaterial, 'saldo_total' | 'estoque_minimo'>): boolean {
  return s.estoque_minimo != null && s.estoque_minimo > 0 && s.saldo_total < s.estoque_minimo;
}

/** `1100339951` + `20` → `1100339951/20`; item vazio ou "0" fica de fora. */
export function documentoComItem(doc: string | null | undefined, item: string | null | undefined): string {
  const d = (doc ?? '').trim();
  const i = (item ?? '').trim().replace(/^0+/, '');
  return i ? `${d}/${i}` : d;
}

// ---------------------------------------------------------------------------
// Busca (com cópia curta em memória: o mesmo item lido duas vezes não refaz a ida)
// ---------------------------------------------------------------------------

const VALIDADE_MS = 2 * 60 * 1000;
const cache = new Map<string, { em: number; dados: SituacaoMaterial | null }>();

const chave = (material: string) => material.trim().toUpperCase().replace(/^0+/, '');

export async function buscarSituacaoMaterial(material: string, forcar = false): Promise<SituacaoMaterial | null> {
  const k = chave(material);
  if (!k) return null;
  const guardado = cache.get(k);
  if (!forcar && guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.dados;

  const { data, error } = await (supabase.rpc as any)('alm_situacao_material', { p_material: k });
  if (error) throw new Error(error.message);
  const dados = (data ?? null) as SituacaoMaterial | null;
  if (dados) {
    dados.saldo_total = Number(dados.saldo_total) || 0;
    dados.depositos = dados.depositos ?? [];
    dados.rms = dados.rms ?? [];
    dados.chegadas = dados.chegadas ?? [];
    dados.pedidos = (dados.pedidos ?? []).map(p => ({ ...p, quantidade_pendente: Number(p.quantidade_pendente) || 0 }));
  }
  cache.set(k, { em: Date.now(), dados });
  return dados;
}
