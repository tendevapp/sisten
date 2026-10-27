/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Situação de uma peça de projeto (etiqueta BOM, Ctrl+K). A peça sem código
 * SAP não tem ZL0024, RM nem MIGO: tudo vem do módulo Projetos do SISTEN
 * (RPC `proj_situacao_peca`) — saldo, localização, o que ainda vai chegar,
 * últimos movimentos e o consumo por tramo da BOM.
 *
 * A autonomia é calculada aqui (puro, testável): para cada tramo, quantos
 * tramos o saldo cobre sozinho e quanto falta para os tramos ainda pendentes;
 * para a torre, quantas torres completas o saldo fecha.
 */

import { supabase } from '../db/supabaseClient';
import { normalizarPartNumber } from './projetos';

export interface ConsumoTramoPeca {
  tramo: string;
  secao: string | null;
  /** Quantidade da peça em um tramo (da BOM). */
  qtd_por_torre: number;
  subconjuntos: string[];
  /** Tramos desse tipo ainda sem kit (`proj_tramos_gwjaco.status = 'pendente'`). */
  tramos_pendentes: number;
  tramos_total: number;
}

export interface MovimentoPeca {
  tipo: string;
  quantidade: number;
  documento: string | null;
  tramo: string | null;
  em: string;
  por: string | null;
}

export interface SituacaoPecaProjeto {
  item: {
    id: string;
    projeto: string;
    part_number: string;
    part_number_norm: string;
    cod_sap: string | null;
    descricao: string | null;
    description: string | null;
    uom: string | null;
    fornecedor: string | null;
    estoque_minimo: number | null;
    fora_da_bom: boolean;
    ignorar_premontagem: boolean;
  };
  saldo: { entradas: number; saidas: number; refugo: number; saldo: number };
  cadastro_bom: { posicao_estoque: string | null; etiqueta_descricao: string | null; imagem_path: string | null } | null;
  consumo: ConsumoTramoPeca[];
  pendentes_entrega: { quantidade: number; linhas: number; notas: number; desde: string | null };
  movimentos: MovimentoPeca[];
}

export interface AutonomiaTramoPeca {
  tramo: string;
  secao: string | null;
  porTramo: number;
  /** Tramos que o saldo cobre se for todo para este tramo. */
  tramosCobertos: number;
  pendentes: number;
  /** Peças para os tramos pendentes deste tipo. */
  necessario: number;
}

export interface AutonomiaPeca {
  tramos: AutonomiaTramoPeca[];
  /** Soma da peça numa torre (todos os tramos). */
  porTorre: number;
  /** Torres completas que o saldo fecha; `null` sem consumo na BOM. */
  torres: number | null;
  /** Peças para todos os tramos pendentes. */
  demandaPendente: number;
  /** Quanto falta para os pendentes, descontado o saldo (não conta o que vai chegar). */
  falta: number;
}

const num = (v: unknown) => Number(v) || 0;

export function calcularAutonomiaPeca(saldo: number, consumo: ConsumoTramoPeca[]): AutonomiaPeca {
  const disponivel = Math.max(0, saldo);
  const tramos = consumo
    .filter(c => c.qtd_por_torre > 0)
    .map((c): AutonomiaTramoPeca => ({
      tramo: c.tramo,
      secao: c.secao,
      porTramo: c.qtd_por_torre,
      tramosCobertos: Math.floor(disponivel / c.qtd_por_torre),
      pendentes: c.tramos_pendentes,
      necessario: c.qtd_por_torre * c.tramos_pendentes,
    }));
  const porTorre = tramos.reduce((s, t) => s + t.porTramo, 0);
  const demandaPendente = tramos.reduce((s, t) => s + t.necessario, 0);
  return {
    tramos,
    porTorre,
    torres: porTorre > 0 ? Math.floor(disponivel / porTorre) : null,
    demandaPendente,
    falta: Math.max(0, demandaPendente - disponivel),
  };
}

export const ROTULO_MOVIMENTO_PECA: Record<string, string> = {
  entrada_nf: 'Entrada (NF)',
  entrada_compra: 'Entrada (compra)',
  entrada_sem_pedido: 'Entrada sem pedido',
  saida_premontagem: 'Saída pré-montagem',
  saida_sobressalente: 'Sobressalente (refugo)',
  saida_avulsa: 'Saída avulsa',
  saida_remessa: 'Remessa',
  estorno_entrada: 'Estorno de entrada',
  estorno_consumo: 'Estorno de consumo',
  ajuste_inventario: 'Ajuste de inventário',
};

export function rotuloMovimentoPeca(tipo: string): string {
  return ROTULO_MOVIMENTO_PECA[tipo] ?? tipo.replace(/_/g, ' ');
}

export function normalizarSituacaoPeca(raw: any): SituacaoPecaProjeto | null {
  if (!raw?.item) return null;
  return {
    item: { ...raw.item, estoque_minimo: raw.item.estoque_minimo != null ? num(raw.item.estoque_minimo) : null },
    saldo: {
      entradas: num(raw.saldo?.entradas), saidas: num(raw.saldo?.saidas),
      refugo: num(raw.saldo?.refugo), saldo: num(raw.saldo?.saldo),
    },
    cadastro_bom: raw.cadastro_bom ?? null,
    consumo: (raw.consumo ?? []).map((c: any): ConsumoTramoPeca => ({
      tramo: String(c.tramo ?? ''),
      secao: c.secao ?? null,
      qtd_por_torre: num(c.qtd_por_torre),
      subconjuntos: Array.isArray(c.subconjuntos) ? c.subconjuntos : [],
      tramos_pendentes: num(c.tramos_pendentes),
      tramos_total: num(c.tramos_total),
    })),
    pendentes_entrega: {
      quantidade: num(raw.pendentes_entrega?.quantidade), linhas: num(raw.pendentes_entrega?.linhas),
      notas: num(raw.pendentes_entrega?.notas), desde: raw.pendentes_entrega?.desde ?? null,
    },
    movimentos: (raw.movimentos ?? []).map((m: any): MovimentoPeca => ({ ...m, quantidade: num(m.quantidade) })),
  };
}

/** Mesma janela do resumo SAP: reabrir a mesma peça em seguida não refaz a consulta. */
const VALIDADE_MS = 60_000;
const cache = new Map<string, { em: number; dados: SituacaoPecaProjeto | null }>();

/** `chave` = part number (com ou sem pontos) ou o código SAP da peça. */
export async function buscarSituacaoPeca(chave: string, forcar = false): Promise<SituacaoPecaProjeto | null> {
  const k = normalizarPartNumber(chave);
  if (!k) return null;
  const guardado = cache.get(k);
  if (!forcar && guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.dados;

  const { data, error } = await (supabase.rpc as any)('proj_situacao_peca', { p_chave: k });
  if (error) throw new Error(error.message);
  const dados = normalizarSituacaoPeca(data);
  cache.set(k, { em: Date.now(), dados });
  return dados;
}

export interface PecaEncontrada {
  part_number: string;
  part_number_norm: string;
  cod_sap: string | null;
  descricao: string | null;
  uom: string | null;
}

/** Peças do projeto por part number ou descrição (Ctrl+K). */
export async function buscarPecasProjeto(termo: string, limite = 6): Promise<PecaEncontrada[]> {
  const { data, error } = await (supabase.rpc as any)('proj_buscar_pecas', { p_termo: termo, p_limite: limite });
  if (error) throw new Error(error.message);
  return (data ?? []) as PecaEncontrada[];
}
