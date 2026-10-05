/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pendências de Recebimento — regras puras.
 *
 * Divergência na conferência do almoxarifado (avaria, falta, excedente,
 * material errado, sem pedido) ou item recebido como entrega parcial vira uma
 * pendência para o comprador do PO decidir; a decisão volta ao almoxarifado,
 * que confirma a execução. Quem cria a pendência é o banco
 * (migration `20261002120000_sup_pendencias_recebimento`).
 *
 *   aguardando_comprador → aguardando_almox → concluida   (ou cancelada)
 *
 * O catálogo de decisões por motivo espelha `sup_receb_decisoes_validas` —
 * o teste lê a migration e falha se os dois divergirem.
 */

import { EPSILON_QTD } from './recebimentoAlmox';

export type MotivoPendencia =
  | 'parcial' | 'falta' | 'excedente' | 'avaria' | 'material_errado' | 'sem_pedido' | 'outros';

export type StatusPendencia = 'aguardando_comprador' | 'aguardando_almox' | 'concluida' | 'cancelada';

export type DecisaoPendencia =
  | 'receber_parcial_aguardar'
  | 'receber_parcial_encerrar'
  | 'assumir_nc'
  | 'aceitar_excedente'
  | 'aceitar_substituto'
  | 'vincular_po'
  | 'devolver_repor'
  | 'devolver'
  | 'abrir_rnc'
  | 'outro';

export interface EventoPendencia {
  em: string;
  evento: string;
  texto: string | null;
  por_id: string | null;
  por_nome: string | null;
}

export interface PendenciaRecebimento {
  id: string;
  codigo: string;
  origem: 'conferencia' | 'nc';
  conferencia_id: string | null;
  conferencia_codigo: string | null;
  nc_id: string | null;
  nc_codigo: string | null;
  carga_id: string | null;
  nro_pedido: string | null;
  linha_ref: string | null;
  material_code: string | null;
  descricao: string | null;
  unidade: string | null;
  fornecedor: string | null;
  motivo: MotivoPendencia;
  qtd_pedido: number | null;
  qtd_ja_fornecida: number | null;
  qtd_recebida: number | null;
  observacao_almox: string | null;
  evidencias: { path: string; nome?: string; tipo?: string }[];
  grupo_compras: string | null;
  comprador_id: string | null;
  comprador_nome: string | null;
  status: StatusPendencia;
  cancelamento: 'auto' | 'manual' | null;
  decisao: DecisaoPendencia | null;
  decisao_obs: string | null;
  pedido_vinculado: string | null;
  decidido_por_id: string | null;
  decidido_por_nome: string | null;
  decidido_em: string | null;
  execucao_obs: string | null;
  executado_por_id: string | null;
  executado_por_nome: string | null;
  executado_em: string | null;
  aberto_por_id: string | null;
  aberto_por_nome: string | null;
  historico: EventoPendencia[];
  created_at: string;
  updated_at: string;
}

export const ROTULO_MOTIVO: Record<MotivoPendencia, string> = {
  parcial: 'Entrega parcial',
  falta: 'Falta',
  excedente: 'Excedente',
  avaria: 'Avaria',
  material_errado: 'Material errado',
  sem_pedido: 'Sem pedido',
  outros: 'Outra NC',
};

export const ROTULO_STATUS: Record<StatusPendencia, string> = {
  aguardando_comprador: 'Aguardando comprador',
  aguardando_almox: 'Aguardando almoxarifado',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const DECISOES_POR_MOTIVO: Record<MotivoPendencia, DecisaoPendencia[]> = {
  parcial: ['receber_parcial_aguardar', 'receber_parcial_encerrar', 'devolver', 'abrir_rnc', 'outro'],
  falta: ['receber_parcial_aguardar', 'receber_parcial_encerrar', 'devolver', 'abrir_rnc', 'outro'],
  avaria: ['assumir_nc', 'devolver_repor', 'devolver', 'abrir_rnc', 'outro'],
  excedente: ['aceitar_excedente', 'devolver', 'abrir_rnc', 'outro'],
  material_errado: ['devolver_repor', 'aceitar_substituto', 'devolver', 'abrir_rnc', 'outro'],
  sem_pedido: ['vincular_po', 'devolver', 'abrir_rnc', 'outro'],
  outros: ['assumir_nc', 'devolver_repor', 'devolver', 'abrir_rnc', 'outro'],
};

/** Mesmo texto de `sup_receb_rotulo_decisao` — aparece na NCR e nas notificações. */
export function rotuloDecisao(decisao: DecisaoPendencia, motivo?: MotivoPendencia | null): string {
  switch (decisao) {
    case 'receber_parcial_aguardar': return 'Receber o parcial — o saldo segue aberto no PO';
    case 'receber_parcial_encerrar': return 'Receber o parcial e encerrar o saldo do PO';
    case 'assumir_nc': return 'Assumir a NC — receber como está';
    case 'aceitar_excedente': return 'Receber o excedente — Suprimentos ajusta o PO';
    case 'aceitar_substituto': return 'Aceitar o material entregue como substituto';
    case 'vincular_po': return 'Receber vinculando a outro PO';
    case 'devolver_repor': return 'Devolver ao fornecedor para reposição';
    case 'devolver': return motivo === 'excedente' ? 'Devolver o excedente ao fornecedor' : 'Recusar e devolver ao fornecedor';
    case 'abrir_rnc': return 'Abrir RNC e verificar com o fornecedor';
    case 'outro': return 'Outra tratativa';
  }
}

/**
 * Decisões que abrem a RNC (NCR do Recebimento) sozinhas — espelha
 * `sup_receb_decisao_abre_rnc`. Se a conferência já tem NCR, só registra a tratativa nela.
 */
export const DECISOES_QUE_ABREM_RNC: DecisaoPendencia[] = ['abrir_rnc', 'devolver', 'devolver_repor'];

export function abreRnc(decisao: DecisaoPendencia | null | undefined): boolean {
  return !!decisao && DECISOES_QUE_ABREM_RNC.includes(decisao);
}

/** O que o almoxarifado faz com a decisão — orienta quem decide e quem executa. */
export function instrucaoAlmox(decisao: DecisaoPendencia): string {
  switch (decisao) {
    case 'receber_parcial_aguardar': return 'Dar entrada no que chegou. O fornecedor entrega o restante.';
    case 'receber_parcial_encerrar': return 'Dar entrada no que chegou. Suprimentos elimina o saldo no SAP — não esperar o restante.';
    case 'assumir_nc': return 'Dar entrada normalmente; a NC fica registrada contra o fornecedor.';
    case 'aceitar_excedente': return 'Dar entrada em tudo. Suprimentos ajusta a quantidade do PO.';
    case 'aceitar_substituto': return 'Dar entrada no material entregue no lugar do pedido.';
    case 'vincular_po': return 'Dar entrada contra o PO informado.';
    case 'devolver_repor': return 'Separar e devolver ao fornecedor; aguardar a reposição. A RNC é aberta automaticamente.';
    case 'devolver': return 'Não dar entrada. Separar e devolver ao fornecedor. A RNC é aberta automaticamente.';
    case 'abrir_rnc': return 'Não dar entrada: separar o material e mantê-lo retido. A RNC é aberta automaticamente e Suprimentos verifica com o fornecedor.';
    case 'outro': return 'Seguir a orientação escrita pelo comprador.';
  }
}

/** Decisões que valem para todas as pendências selecionadas (decisão em lote). */
export function decisoesComuns(motivos: MotivoPendencia[]): DecisaoPendencia[] {
  if (motivos.length === 0) return [];
  const [primeiro, ...resto] = motivos;
  return DECISOES_POR_MOTIVO[primeiro].filter((d) => resto.every((m) => DECISOES_POR_MOTIVO[m].includes(d)));
}

/** PO de compra no padrão SAP — só dígitos. */
export function normalizarPedido(texto: string): string {
  return (texto || '').replace(/\D/g, '');
}

/** Erro a mostrar antes de enviar a decisão (o banco valida de novo). */
export function validarDecisao(input: {
  decisao: DecisaoPendencia | null;
  obs: string;
  pedido: string;
}): string | null {
  if (!input.decisao) return 'Escolha a decisão.';
  if (input.decisao === 'outro' && !input.obs.trim()) return 'Descreva a tratativa.';
  if (input.decisao === 'vincular_po' && normalizarPedido(input.pedido).length < 6) return 'Informe o PO a vincular.';
  return null;
}

/** Saldo do PO antes desta entrega (pedido − já fornecido). */
export function saldoAntesDaEntrega(p: Pick<PendenciaRecebimento, 'qtd_pedido' | 'qtd_ja_fornecida'>): number | null {
  if (p.qtd_pedido === null || p.qtd_pedido === undefined) return null;
  return Number(p.qtd_pedido) - Number(p.qtd_ja_fornecida ?? 0);
}

/**
 * Recebido − saldo do PO: negativo = faltou, positivo = sobrou.
 * `null` quando não há PO (sem pedido / NCR avulsa) ou dá zero.
 */
export function diferencaQtd(p: Pick<PendenciaRecebimento, 'qtd_pedido' | 'qtd_ja_fornecida' | 'qtd_recebida'>): number | null {
  const saldo = saldoAntesDaEntrega(p);
  if (saldo === null || p.qtd_recebida === null || p.qtd_recebida === undefined) return null;
  const d = Number(p.qtd_recebida) - saldo;
  return Math.abs(d) <= EPSILON_QTD ? null : d;
}

/** Prazo para o comprador responder antes de a pendência aparecer como atrasada. */
export const PRAZO_RESPOSTA_HORAS = 48;

export function idadeHoras(desdeISO: string, agora: Date = new Date()): number {
  const t = new Date(desdeISO).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (agora.getTime() - t) / 3_600_000);
}

/** Esperando o comprador há mais que o prazo — o material está parado na doca. */
export function atrasada(p: Pick<PendenciaRecebimento, 'status' | 'created_at'>, agora: Date = new Date()): boolean {
  return p.status === 'aguardando_comprador' && idadeHoras(p.created_at, agora) > PRAZO_RESPOSTA_HORAS;
}

export function rotuloIdade(desdeISO: string, agora: Date = new Date()): string {
  const h = idadeHoras(desdeISO, agora);
  if (h < 1) return 'agora';
  if (h < 24) return `há ${Math.floor(h)} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

export type FiltroStatus = 'abertas' | StatusPendencia | 'todas';

export interface FiltrosPendencia {
  status: FiltroStatus;
  /** Só as do comprador logado (e as sem comprador, que alguém precisa assumir). */
  somenteMinhas: boolean;
  usuarioId: string;
  motivos: Set<MotivoPendencia>;
  compradores: Set<string>;
  busca: string;
}

const SEM_COMPRADOR = 'Sem comprador';

export function nomeComprador(p: Pick<PendenciaRecebimento, 'comprador_nome'>): string {
  return p.comprador_nome?.trim() || SEM_COMPRADOR;
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function filtrarPendencias(lista: PendenciaRecebimento[], f: FiltrosPendencia): PendenciaRecebimento[] {
  const termos = normalizar(f.busca).split(/\s+/).filter(Boolean);
  return lista.filter((p) => {
    if (f.status === 'abertas' && p.status !== 'aguardando_comprador' && p.status !== 'aguardando_almox') return false;
    if (f.status !== 'abertas' && f.status !== 'todas' && p.status !== f.status) return false;
    if (f.somenteMinhas && p.comprador_id && p.comprador_id !== f.usuarioId) return false;
    if (f.motivos.size > 0 && !f.motivos.has(p.motivo)) return false;
    if (f.compradores.size > 0 && !f.compradores.has(nomeComprador(p))) return false;
    if (termos.length > 0) {
      const alvo = normalizar([
        p.codigo, p.nro_pedido, p.material_code, p.descricao, p.fornecedor,
        p.conferencia_codigo, p.nc_codigo, p.comprador_nome,
      ].filter(Boolean).join(' '));
      if (!termos.every((t) => alvo.includes(t))) return false;
    }
    return true;
  });
}

export interface GrupoPedido {
  chave: string;
  nroPedido: string | null;
  fornecedor: string | null;
  comprador: string;
  itens: PendenciaRecebimento[];
}

/** Agrupa por PO (o comprador responde o pedido de uma vez), mais antigos primeiro. */
export function agruparPorPedido(lista: PendenciaRecebimento[]): GrupoPedido[] {
  const mapa = new Map<string, GrupoPedido>();
  for (const p of lista) {
    const chave = p.nro_pedido || `sem-po:${p.id}`;
    let g = mapa.get(chave);
    if (!g) {
      g = { chave, nroPedido: p.nro_pedido, fornecedor: p.fornecedor, comprador: nomeComprador(p), itens: [] };
      mapa.set(chave, g);
    }
    g.itens.push(p);
  }
  const grupos = [...mapa.values()];
  grupos.forEach((g) => g.itens.sort((a, b) => a.codigo.localeCompare(b.codigo)));
  const maisAntigo = (g: GrupoPedido) => Math.min(...g.itens.map((i) => new Date(i.created_at).getTime()));
  return grupos.sort((a, b) => maisAntigo(a) - maisAntigo(b));
}

export interface ResumoPendencias {
  aguardandoComprador: number;
  aguardandoAlmox: number;
  atrasadas: number;
  concluidas: number;
  semComprador: number;
}

export function resumirPendencias(lista: PendenciaRecebimento[], agora: Date = new Date()): ResumoPendencias {
  const r: ResumoPendencias = { aguardandoComprador: 0, aguardandoAlmox: 0, atrasadas: 0, concluidas: 0, semComprador: 0 };
  for (const p of lista) {
    if (p.status === 'aguardando_comprador') r.aguardandoComprador += 1;
    if (p.status === 'aguardando_almox') r.aguardandoAlmox += 1;
    if (p.status === 'concluida') r.concluidas += 1;
    if (atrasada(p, agora)) r.atrasadas += 1;
    if (!p.comprador_id && (p.status === 'aguardando_comprador' || p.status === 'aguardando_almox')) r.semComprador += 1;
  }
  return r;
}

/** Parâmetros do deep-link das notificações: `#/rota?id=…`, `?conf=…`, `?status=…`. */
export function parametrosDaRota(hash: string): { id: string | null; conf: string | null; status: string | null; vista: string | null } {
  const i = hash.indexOf('?');
  const q = new URLSearchParams(i === -1 ? '' : hash.slice(i + 1));
  return { id: q.get('id'), conf: q.get('conf'), status: q.get('status'), vista: q.get('vista') };
}
