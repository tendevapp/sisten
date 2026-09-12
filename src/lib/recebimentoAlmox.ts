/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Recebimento de material — regras puras dos dois formulários.
 *
 *   F1 · Ficha cega de volumes (RCV) — conta caixa/pallet e fotografa a carga
 *        como chegou da transportadora, antes de abrir volume.
 *   F2 · Recebimento e contagem (RCM) — abre o PO, confere item a item, e
 *        toda divergência gera uma não conformidade (NCR) consolidada.
 *
 * Sem React e sem Supabase: só o que decide "isto é divergência?" e como
 * resumir a conferência. O acesso ao banco fica em `recebimentoAlmoxApi.ts`.
 */

import { isProjetoItem } from './rastreio';

/** Prefixos dos registros — regra 2 do CLAUDE.md, índice reinicia POR DIA. */
export const PREFIXO_RECEB = {
  carga: 'RCV',
  conferencia: 'RCM',
  naoConformidade: 'NCR',
} as const;

/** Folga para ruído de ponto flutuante em quantidades fracionadas (kg, m³). */
export const EPSILON_QTD = 0.001;

/** Anexo já no bucket `alm-recebimento`. Mesma forma dos demais módulos. */
export interface AnexoRecebimento {
  path: string;
  nome: string;
  tipo: string;
}

export type TipoEmbalagem = 'caixa' | 'pallet' | 'fardo' | 'amarrado' | 'avulso' | 'misto';
export type DestinoPrevisto = 'projeto' | 'consumo' | 'misto' | 'indefinido';
export type TipoItemConferencia = 'projeto' | 'consumo' | 'misto';
export type FontePedido = 'cache_sap' | 'supabase' | 'manual' | 'sem_pedido';
export type TipoDivergencia = 'falta' | 'excedente' | 'avaria' | 'material_errado' | 'sem_pedido';

export const ROTULO_DIVERGENCIA: Record<TipoDivergencia, string> = {
  falta: 'Faltou',
  excedente: 'Veio a mais',
  avaria: 'Avariado',
  material_errado: 'Material trocado',
  sem_pedido: 'Fora do pedido',
};

/** Uma linha da conferência, do jeito que a tela a mantém enquanto confere. */
export interface LinhaConferencia {
  linhaRef: string | null;
  /** PO a que a linha pertence (uma conferência pode ter vários). */
  nroPedido: string | null;
  materialCode: string;
  descricao: string;
  unidade: string;
  /** Quantidade da linha do PO. `null` em item que chegou fora do pedido. */
  qtdPedido: number | null;
  /** Quanto MIGOs anteriores já baixaram deste PO (snapshot). */
  qtdJaFornecida: number | null;
  /** Quanto o conferente contou agora. */
  qtdRecebida: number;
  conferido: boolean;
  itemManual: boolean;
  avaria: boolean;
  /**
   * Recebimento parcial DESTE lote: chegou menos que o pendente, mas está
   * certo — o resto vem em outra entrega. Não conta como falta / NC.
   */
  parcial: boolean;
  observacao: string;
  evidencias: AnexoRecebimento[];
}

/**
 * Classifica a divergência de uma linha, ou `null` quando está tudo certo.
 *
 * Prioridade: avaria e material trocado são marcações explícitas do
 * conferente e vêm primeiro; depois a aritmética de quantidade contra o
 * saldo pendente do PO (pedido − já fornecido). Se a linha está marcada
 * como `parcial`, receber MENOS que o pendente não é falta — é entrega
 * parcial (mesma lógica da Central de Compras); receber a MAIS ainda
 * flagra excedente.
 */
export function classificarDivergencia(linha: {
  qtdPedido: number | null;
  qtdJaFornecida?: number | null;
  qtdRecebida: number;
  avaria?: boolean;
  itemManual?: boolean;
  parcial?: boolean;
}): TipoDivergencia | null {
  if (linha.avaria) return 'avaria';
  if (linha.itemManual || linha.qtdPedido === null) return 'sem_pedido';

  const pendente = linha.qtdPedido - (linha.qtdJaFornecida ?? 0);
  const delta = linha.qtdRecebida - pendente;
  if (delta > EPSILON_QTD) return 'excedente';
  if (delta < -EPSILON_QTD) return linha.parcial ? null : 'falta';
  return null;
}

/**
 * O que a linha do PO já recebeu ANTES desta conferência (entregas parciais
 * anteriores, coluna `qtd_fornecida` da ZL0132). `null` quando não há PO ou
 * nada foi entregue ainda — nesses casos não há alerta a mostrar.
 */
export function entregaParcialAnterior(
  qtdPedido: number | null,
  qtdJaFornecida?: number | null,
): { jaRecebido: number; pendente: number; completo: boolean } | null {
  if (qtdPedido === null) return null;
  const ja = qtdJaFornecida ?? 0;
  if (ja <= EPSILON_QTD) return null;
  return {
    jaRecebido: ja,
    pendente: Math.max(0, qtdPedido - ja),
    completo: ja >= qtdPedido - EPSILON_QTD,
  };
}

/** Saldo ainda esperado desta linha do PO (nunca negativo). */
export function pendentePedido(qtdPedido: number | null, qtdJaFornecida?: number | null): number {
  if (qtdPedido === null) return 0;
  return Math.max(0, qtdPedido - (qtdJaFornecida ?? 0));
}

// ---------------------------------------------------------------------------
// Busca por fornecedor — do cache SAP, sem rede
// ---------------------------------------------------------------------------

/**
 * Uma linha do cache ZL0132 (`getEnrichedSAPRequisicoes`), reduzida ao que a
 * busca por fornecedor precisa. Mantida solta (não importa `EnrichedSAPRecord`)
 * pra função continuar pura e testável.
 */
export interface LinhaCacheSAP {
  documento_compra?: string | null;
  fornecedor_name?: string | null;
  material_code?: string | number | null;
  texto_breve?: string | null;
  unidade_medida?: string | null;
  ri_po?: string | null;
  requisicao_de_compra?: string | null;
  qtd_po?: number | null;
  qtd_fornecida_po?: number | null;
}

export interface ItemPoAberto {
  linhaRef: string | null;
  materialCode: string;
  descricao: string;
  unidade: string;
  rm: string | null;
  qtdPedido: number | null;
  qtdJaFornecida: number | null;
  pendente: number;
}

export interface PoAberto {
  numero: string;
  fornecedor: string;
  itens: ItemPoAberto[];
  /** Linhas com saldo a receber. */
  itensPendentes: number;
  /** Soma do saldo pendente de todas as linhas do PO. */
  pendenteTotal: number;
}

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

/** Nomes de fornecedor distintos que têm ao menos um PO no cache. */
export function listarFornecedoresDoCache(records: LinhaCacheSAP[]): string[] {
  const vistos = new Map<string, string>();
  for (const r of records) {
    const nome = String(r.fornecedor_name ?? '').trim();
    if (!nome || !String(r.documento_compra ?? '').trim()) continue;
    const k = semAcento(nome);
    if (!vistos.has(k)) vistos.set(k, nome);
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * POs abertos (com saldo a receber) de um fornecedor, montados a partir do
 * cache ZL0132. `termo` casa por trecho do nome, sem acento e sem caixa —
 * some do resultado o PO cujo saldo pendente já zerou.
 */
export function posAbertosDoFornecedor(records: LinhaCacheSAP[], termo: string): PoAberto[] {
  const alvo = semAcento(termo);
  if (!alvo) return [];

  const porPo = new Map<string, PoAberto>();
  for (const r of records) {
    const numero = String(r.documento_compra ?? '').trim().replace(/^0+/, '');
    const fornecedor = String(r.fornecedor_name ?? '').trim();
    if (!numero || !fornecedor || !semAcento(fornecedor).includes(alvo)) continue;

    const qtdPedido = typeof r.qtd_po === 'number' ? r.qtd_po : null;
    const qtdJaFornecida = typeof r.qtd_fornecida_po === 'number' ? r.qtd_fornecida_po : null;
    const pendente = pendentePedido(qtdPedido, qtdJaFornecida);

    let po = porPo.get(numero);
    if (!po) {
      po = { numero, fornecedor, itens: [], itensPendentes: 0, pendenteTotal: 0 };
      porPo.set(numero, po);
    }
    po.itens.push({
      linhaRef: r.ri_po || null,
      materialCode: String(r.material_code ?? ''),
      descricao: r.texto_breve ?? '',
      unidade: r.unidade_medida ?? '',
      rm: r.requisicao_de_compra ?? null,
      qtdPedido,
      qtdJaFornecida,
      pendente,
    });
    po.pendenteTotal += pendente;
    if (pendente > EPSILON_QTD) po.itensPendentes += 1;
  }

  return [...porPo.values()]
    .filter((po) => po.pendenteTotal > EPSILON_QTD)
    .map((po) => ({
      ...po,
      itens: [...po.itens].sort((a, b) => Number(b.pendente > 0) - Number(a.pendente > 0)),
    }))
    .sort((a, b) => a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }));
}

/** `projeto` (material 100000…), `consumo`, ou `misto` quando a lista tem os dois. */
export function tipoItemDaLista(materiais: string[]): TipoItemConferencia {
  let temProjeto = false;
  let temConsumo = false;
  for (const m of materiais) {
    if (isProjetoItem(m)) temProjeto = true;
    else temConsumo = true;
  }
  if (temProjeto && temConsumo) return 'misto';
  return temProjeto ? 'projeto' : 'consumo';
}

export interface ResumoConferencia {
  total: number;
  ok: number;
  /** Linhas conferidas OK mas marcadas como recebimento parcial. */
  parciais: number;
  divergentes: number;
  temNc: boolean;
  tipoItem: TipoItemConferencia;
  /** Tipos de divergência presentes, para pré-selecionar o tipo da NC. */
  tiposDivergencia: TipoDivergencia[];
}

/** Consolida o estado das linhas: contadores e se abre não conformidade. */
export function resumoConferencia(linhas: LinhaConferencia[]): ResumoConferencia {
  const tipos = new Set<TipoDivergencia>();
  let ok = 0;
  let parciais = 0;
  let divergentes = 0;

  for (const l of linhas) {
    const d = classificarDivergencia(l);
    if (d) {
      divergentes += 1;
      tipos.add(d);
    } else if (l.conferido) {
      ok += 1;
      if (l.parcial) parciais += 1;
    }
  }

  return {
    total: linhas.length,
    ok,
    parciais,
    divergentes,
    temNc: divergentes > 0,
    tipoItem: tipoItemDaLista(linhas.map((l) => l.materialCode)),
    tiposDivergencia: [...tipos],
  };
}

/**
 * Tipo sugerido para a NC consolidada a partir das divergências das linhas.
 * Avaria e material trocado pesam mais que sobra/falta na hora de rotular.
 */
export function tipoNcSugerido(tipos: TipoDivergencia[]): TipoDivergencia | 'outros' {
  const ordem: TipoDivergencia[] = ['avaria', 'material_errado', 'falta', 'excedente', 'sem_pedido'];
  for (const t of ordem) if (tipos.includes(t)) return t;
  return 'outros';
}

/** Data de hoje em `YYYY-MM-DD` no fuso local (não UTC, que vira ontem). */
export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ficha cega diverge se contou diferente do declarado ou viu avaria. */
export function cargaDivergente(input: {
  qtdVolumesDeclarada: number | null;
  qtdVolumesContada: number;
  avariaAparente: boolean;
}): boolean {
  if (input.avariaAparente) return true;
  return input.qtdVolumesDeclarada !== null && input.qtdVolumesDeclarada !== input.qtdVolumesContada;
}

/**
 * Extrai os identificadores `ri_po` para marcacao de chegada fisica no almoxarifado
 * a partir dos itens marcados como conferidos no formulario de recebimento e contagem.
 *
 * Prioridade de resolucao de cada item conferido:
 *  1. Match por pedido + material no cache SAP (para obter o `ri_po` oficial da linha, ex: 120009113100290-4100460761);
 *  2. `linhaRef` existente que ja contenha hifen (padrao <ri>-<PO>);
 *  3. Composicao `${linhaRef || materialCode}-${nroPedido}`.
 *
 * Linhas nao conferidas (conferido === false) ou avariadas sao ignoradas.
 */
export function extrairRiPosConferidos(
  linhas: {
    conferido?: boolean | null;
    linhaRef?: string | null;
    nroPedido?: string | null;
    materialCode?: string | null;
  }[],
  cacheSap: LinhaCacheSAP[] = [],
): string[] {
  const norm = (v: unknown) => String(v ?? '').trim().replace(/^0+/, '');
  const vistos = new Set<string>();

  for (const l of linhas) {
    if (!l.conferido) continue;

    const po = norm(l.nroPedido);
    const mat = String(l.materialCode ?? '').trim();

    // 1. Busca correspondencia exata no cache SAP por pedido e codigo de material
    if (po && mat && cacheSap.length > 0) {
      const match = cacheSap.find(
        (r) => norm(r.documento_compra) === po && String(r.material_code ?? '').trim() === mat,
      );
      if (match?.ri_po) {
        vistos.add(match.ri_po);
        continue;
      }
    }

    // 2. linhaRef ja formatado com hifen (ex: 120009113100290-4100460761)
    const ref = String(l.linhaRef ?? '').trim();
    if (ref && ref.includes('-')) {
      vistos.add(ref);
      continue;
    }

    // 3. Fallback se temos ref/mat e po
    if (po && (ref || mat)) {
      vistos.add(`${ref || mat}-${po}`);
    }
  }

  return Array.from(vistos);
}
