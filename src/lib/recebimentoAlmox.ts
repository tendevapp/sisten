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
import { casarTokens } from './buscaKeywords';

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
export type TipoNaoConformidade = TipoDivergencia | 'volume' | 'outros';

export const ROTULO_NAO_CONFORMIDADE: Record<TipoNaoConformidade, string> = {
  falta: 'Falta',
  excedente: 'Excedente',
  avaria: 'Avaria',
  material_errado: 'Material errado',
  sem_pedido: 'Sem pedido',
  volume: 'Volume',
  outros: 'Outros',
};

export const ROTULO_DIVERGENCIA: Record<TipoDivergencia, string> = {
  falta: 'Faltou',
  excedente: 'Veio a mais',
  avaria: 'Avariado',
  material_errado: 'Material trocado',
  sem_pedido: 'Fora do pedido',
};

/** Uma linha da conferência, do jeito que a tela a mantém enquanto confere. */
/** NCRs em tratativa ou resolvidas preservam o histórico operacional. */
export function podeExcluirNaoConformidade(status: string): boolean {
  return status === 'aberta';
}

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
  /**
   * Parcial confirmado como "de acordo com a NF": o fornecedor faturou só isso,
   * então não abre pendência com Suprimentos. `false` = divergente da NF (abre).
   */
  parcialConformeNf?: boolean;
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
export function classificarDivergencia(
  linha: {
    qtdPedido: number | null;
    qtdJaFornecida?: number | null;
    qtdRecebida: number;
    avaria?: boolean;
    itemManual?: boolean;
    parcial?: boolean;
  },
  retornoRemessa?: boolean,
): TipoDivergencia | null {
  if (retornoRemessa) {
    // Retorno de remessa não possui PO relacionado; itens manuais são o fluxo esperado.
    // Não existe falta, excedente ou 'sem_pedido' sem PO de referência. Apenas avaria é flagrada.
    return linha.avaria ? 'avaria' : null;
  }
  if (linha.avaria) return 'avaria';
  if (linha.itemManual || linha.qtdPedido === null) return 'sem_pedido';

  const pendente = linha.qtdPedido - (linha.qtdJaFornecida ?? 0);
  const delta = linha.qtdRecebida - pendente;
  if (delta > EPSILON_QTD) return 'excedente';
  if (delta < -EPSILON_QTD) return linha.parcial ? null : 'falta';
  return null;
}

/**
 * Ao marcar a linha como parcial só vale perguntar se confere com a NF quando
 * ela de fato chegou com menos que o pendente do PO — senão o parcial não muda nada.
 */
export function parcialPrecisaConfirmarNf(linha: {
  qtdPedido: number | null;
  qtdJaFornecida?: number | null;
  qtdRecebida: number;
  itemManual?: boolean;
}): boolean {
  if (linha.itemManual || linha.qtdPedido === null) return false;
  const pendente = linha.qtdPedido - (linha.qtdJaFornecida ?? 0);
  return linha.qtdRecebida - pendente < -EPSILON_QTD;
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

/**
 * Notas fiscais da ficha cega. A coluna `nota_fiscal` é um texto só; várias NFs
 * ficam separadas por vírgula ("123, 456"). Registros antigos (uma NF solta)
 * continuam válidos — viram uma lista de um item.
 */
export function separarNotasFiscais(texto: string | null | undefined): string[] {
  const vistas = new Set<string>();
  for (const parte of String(texto ?? '').split(/[,;\n]+/)) {
    const nf = parte.trim().toUpperCase();
    if (nf) vistas.add(nf);
  }
  return [...vistas];
}

export function juntarNotasFiscais(notas: string[]): string {
  return separarNotasFiscais(notas.join(',')).join(', ');
}

/** Chave do mapa PO → NFs para os itens fora de pedido. */
export const NF_SEM_PO = '__sem_po__';

/** PO (ou `NF_SEM_PO`) → NFs que trouxeram aquele pedido. Aceita o formato
 *  antigo do rascunho (uma NF solta por PO). */
export type NfPorPedido = Record<string, string[] | string>;

/**
 * NFs que cobrem um PO da conferência. Uma NF só vale para todos os POs — é o
 * caso de 2 pedidos do mesmo fornecedor faturados numa nota, e o usuário não
 * digita de novo. Com várias NFs vale o que ele apontou para o PO, que pode
 * ser mais de uma (fornecedor faturou o pedido em notas separadas); NF
 * apontada que saiu da lista não conta. Sai na ordem da lista de NFs.
 */
export function nfsDoPedido(
  po: string | null | undefined,
  notas: string[],
  nfPorPedido: NfPorPedido,
): string[] {
  if (notas.length === 1) return [notas[0]];
  const v = nfPorPedido[po || NF_SEM_PO];
  const apontadas = Array.isArray(v) ? v : v ? [v] : [];
  return notas.filter((nf) => apontadas.includes(nf));
}

/**
 * NF de um item: a única do PO dele ou, quando o PO veio em várias notas, a
 * que foi escolhida no próprio item.
 */
export function nfDoItem(
  po: string | null | undefined,
  nfItem: string | null | undefined,
  notas: string[],
  nfPorPedido: NfPorPedido,
): string | null {
  const nfs = nfsDoPedido(po, notas, nfPorPedido);
  if (nfs.length === 1) return nfs[0];
  return nfItem && nfs.includes(nfItem) ? nfItem : null;
}

/** POs (ou `NF_SEM_PO`) ainda sem NF — só acontece com mais de uma NF. */
export function pedidosSemNf(
  pedidos: (string | null | undefined)[],
  notas: string[],
  nfPorPedido: NfPorPedido,
): string[] {
  if (notas.length < 2) return [];
  const chaves = [...new Set(pedidos.map((po) => po || NF_SEM_PO))];
  return chaves.filter((k) => !nfsDoPedido(k === NF_SEM_PO ? null : k, notas, nfPorPedido).length);
}

/** Índices dos itens de PO dividido em várias NFs que ainda não têm a sua. */
export function itensSemNf(
  linhas: { nroPedido?: string | null; notaFiscal?: string | null }[],
  notas: string[],
  nfPorPedido: NfPorPedido,
): number[] {
  const out: number[] = [];
  linhas.forEach((l, i) => {
    if (nfsDoPedido(l.nroPedido, notas, nfPorPedido).length > 1 && !nfDoItem(l.nroPedido, l.notaFiscal, notas, nfPorPedido)) {
      out.push(i);
    }
  });
  return out;
}

/** Reconstrói o mapa PO → NFs a partir dos itens gravados (edição). */
export function nfPorPedidoDosItens(
  itens: { nro_pedido?: string | null; nota_fiscal?: string | null }[],
): Record<string, string[]> {
  const mapa: Record<string, string[]> = {};
  for (const it of itens) {
    const nf = String(it.nota_fiscal ?? '').trim();
    if (!nf) continue;
    const chave = it.nro_pedido || NF_SEM_PO;
    const lista = (mapa[chave] ??= []);
    if (!lista.includes(nf)) lista.push(nf);
  }
  return mapa;
}

/** Foto da NF: anexo comum com o número da nota a que pertence. */
export interface FotoNotaFiscal extends AnexoRecebimento {
  nf: string;
}

/** "NF 123: PO 1, PO 2" — quais POs cada NF cobriu, na ordem dos itens. */
export function resumoNfPorPedido(
  itens: { nro_pedido?: string | null; nota_fiscal?: string | null }[],
): { nf: string; pedidos: string[] }[] {
  const porNf = new Map<string, string[]>();
  for (const it of itens) {
    const nf = String(it.nota_fiscal ?? '').trim();
    if (!nf) continue;
    if (!porNf.has(nf)) porNf.set(nf, []);
    const pos = porNf.get(nf)!;
    const po = it.nro_pedido || 'fora de pedido';
    if (!pos.includes(po)) pos.push(po);
  }
  return [...porNf.entries()].map(([nf, pedidos]) => ({ nf, pedidos }));
}

/** Uma linha de PO achada pela busca por descrição do item. */
export interface ItemPoEncontrado extends ItemPoAberto {
  /** PO da linha, sem zeros à esquerda. */
  numero: string;
  fornecedor: string;
}

/**
 * Busca linhas do cache ZL0132 por palavras-chave (AND) na descrição ou no
 * código do material. **Só entram linhas que já têm PO** — requisição ainda
 * sem pedido não vira resultado, porque não há o que receber. Aceita `tokens`
 * já extraídos (`extrairPalavrasChave`); sem tokens devolve vazio.
 *
 * Ordem: saldo pendente primeiro (é o que se espera receber), depois PO e
 * descrição. Linha com PO e saldo zerado continua na lista — o cache pode
 * estar defasado em relação ao que chegou na doca.
 */
export function buscarItensComPo(records: LinhaCacheSAP[], tokens: string[]): ItemPoEncontrado[] {
  if (!tokens.length) return [];

  const achados: ItemPoEncontrado[] = [];
  for (const r of records) {
    const numero = String(r.documento_compra ?? '').trim().replace(/^0+/, '');
    if (!numero) continue;
    const materialCode = String(r.material_code ?? '');
    const descricao = r.texto_breve ?? '';
    if (!casarTokens([descricao, materialCode], tokens)) continue;

    const qtdPedido = typeof r.qtd_po === 'number' ? r.qtd_po : null;
    const qtdJaFornecida = typeof r.qtd_fornecida_po === 'number' ? r.qtd_fornecida_po : null;
    achados.push({
      numero,
      fornecedor: String(r.fornecedor_name ?? '').trim(),
      linhaRef: r.ri_po || null,
      materialCode,
      descricao,
      unidade: r.unidade_medida ?? '',
      rm: r.requisicao_de_compra ?? null,
      qtdPedido,
      qtdJaFornecida,
      pendente: pendentePedido(qtdPedido, qtdJaFornecida),
    });
  }

  return achados.sort((a, b) =>
    Number(b.pendente > EPSILON_QTD) - Number(a.pendente > EPSILON_QTD)
    || a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true })
    || a.descricao.localeCompare(b.descricao, 'pt-BR'));
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
export function resumoConferencia(linhas: LinhaConferencia[], retornoRemessa?: boolean): ResumoConferencia {
  const tipos = new Set<TipoDivergencia>();
  let ok = 0;
  let parciais = 0;
  let divergentes = 0;

  for (const l of linhas) {
    const d = classificarDivergencia(l, retornoRemessa);
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
    temNc: retornoRemessa ? false : divergentes > 0,
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

/** Busca POs no cache por trecho do número ou do fornecedor, inclusive os já atendidos. */
export function buscarPedidosParaNc(records: LinhaCacheSAP[], termo: string): { numero: string; fornecedor: string }[] {
  const alvo = semAcento(termo);
  if (!alvo) return [];

  const pedidos = new Map<string, { numero: string; fornecedor: string }>();
  for (const r of records) {
    const fornecedor = String(r.fornecedor_name ?? '').trim();
    const numero = String(r.documento_compra ?? '').trim().replace(/^0+/, '');
    if (!fornecedor || !numero) continue;
    if (semAcento(fornecedor).includes(alvo) || semAcento(numero).includes(alvo)) {
      pedidos.set(numero, { numero, fornecedor });
    }
  }
  return [...pedidos.values()].sort((a, b) => a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }));
}

/** Uma NCR avulsa pode existir sem carga, conferência ou pedido de compra. */
export function validarNovaNcAvulsa(input: {
  descricao: string;
  tipo?: TipoNaoConformidade;
  itens?: { qtd_pedido?: number | null; qtd_verificada?: number | null }[];
}): string | null {
  if (!input.descricao.trim()) return 'Informe a descrição da não conformidade.';
  if (
    (input.tipo === 'falta' || input.tipo === 'excedente')
    && input.itens?.some((item) => item.qtd_pedido != null && item.qtd_verificada == null)
  ) return 'Informe a quantidade verificada para cada item selecionado.';
  return null;
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
