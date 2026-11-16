/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Auditoria de contratos: confronta o contrato (ME3N) com os pedidos de
 * call-off e com o que o Financeiro lançou e pagou na FBL1N.
 *
 * O vínculo com a FBL1N é indireto (a FBL1N vem sem pedido): contrato →
 * pedidos → MIRO (ZL0170) → documento contábil. Ver a migration
 * `20261116120000_contratos_auditoria.sql`, que monta as views lidas aqui.
 *
 * Dois níveis de vínculo:
 *  - `miro`: a partida sai de uma MIRO de pedido do contrato. Confirmado.
 *  - `fornecedor`: partida do fornecedor que não sai de nenhuma MIRO (lançada
 *    direto no FI, ou MIRO posterior ao corte da ZL0170). Só é atribuída
 *    quando o fornecedor tem UM contrato — "a conferir". Com mais de um
 *    contrato, fica em `naoAtribuidos`.
 *
 * Sinal: a FBL1N traz a fatura negativa. Aqui `valor` é a obrigação em
 * positivo (−montante). Partida anulada (estorno MR8M compensado sem
 * pagamento) aparece na lista, mas não entra em nenhuma soma.
 */

import type { ContratoComDetalhes } from './contratos';

/* --------------------------------------------------------------------- */
/* Linhas das views                                                       */
/* --------------------------------------------------------------------- */

export interface PedidoAuditoria {
  contrato: string;
  pedido: string;
  origem: 'ZL0132' | 'ME2L' | string;
  valor: number | null;
  valor_fonte: string | null;
  valor_eliminado: number | null;
  data_pedido: string | null;
  modificado_em: string | null;
  fornecedor_codigo: string | null;
  fornecedor_nome: string | null;
  texto: string | null;
}

/** `vw_contratos_aud_partidas`: MIRO do contrato + partida FBL1N (ou nulos). */
export interface PartidaMiroRow {
  contrato: string;
  pedidos: string | null;
  doc_miro: string | null;
  ano_miro: string | null;
  numero_doc_contabil: string | null;
  referencia_miro: string | null;
  data_lancamento_miro: string | null;
  valor_miro_estimado: number | null;
  doc_pagamento_miro: string | null;
  data_pagamento_miro: string | null;
  fornecedor_miro: string | null;
  fbl_id: number | null;
  empresa: string | null;
  tipo_documento: string | null;
  montante_moeda_doc: number | null;
  montante_irf: number | null;
  referencia: string | null;
  data_documento: string | null;
  data_lancamento: string | null;
  vencimento_liquido: string | null;
  data_compensacao: string | null;
  doc_compensacao: string | null;
  bloqueio_pagamento: string | null;
  fornecedor: string | null;
  razao_social_fornecedor: string | null;
  texto: string | null;
  estorno_com: string | null;
  anulada: boolean | null;
}

/** `vw_contratos_aud_partidas_sem_pedido`. `contratos` = "5200…, 5200…". */
export interface PartidaSemPedidoRow {
  contratos: string;
  fbl_id: number;
  empresa: string | null;
  numero_documento: string | null;
  tipo_documento: string | null;
  montante_moeda_doc: number | null;
  referencia: string | null;
  data_documento: string | null;
  data_lancamento: string | null;
  vencimento_liquido: string | null;
  data_compensacao: string | null;
  doc_compensacao: string | null;
  bloqueio_pagamento: string | null;
  fornecedor: string | null;
  razao_social_fornecedor: string | null;
  texto: string | null;
  estorno_com: string | null;
  anulada: boolean | null;
}

export interface AlteracaoContrato {
  id: number;
  documento_compras: string;
  item: string | null;
  origem: 'ME3N' | 'Cadastro' | string;
  campo: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  alterado_por: string | null;
  alterado_em: string;
}

export interface CoberturaAuditoria {
  me3n_importado_em: string | null;
  zl0170_importado_em: string | null;
  zl0170_de: string | null;
  zl0170_ate: string | null;
  fbl1n_importado_em: string | null;
  fbl1n_de: string | null;
  fbl1n_ate: string | null;
  me2l_importado_em: string | null;
}

/* --------------------------------------------------------------------- */
/* Resultado                                                              */
/* --------------------------------------------------------------------- */

export type VinculoLancamento = 'miro' | 'fornecedor' | 'miro_sem_fbl1n';

export interface LancamentoAuditoria {
  chave: string;
  contrato: string | null;
  vinculo: VinculoLancamento;
  pedidos: string | null;
  docMiro: string | null;
  docPagamentoMiro: string | null;
  documento: string | null;
  tipo: string | null;
  referencia: string | null;
  dataDocumento: string | null;
  dataLancamento: string | null;
  vencimento: string | null;
  dataCompensacao: string | null;
  docCompensacao: string | null;
  bloqueio: string | null;
  fornecedor: string | null;
  razao: string | null;
  texto: string | null;
  /** Obrigação em positivo (−montante da FBL1N); crédito sai negativo. */
  valor: number;
  /** Parte paga (compensada e não anulada). */
  pago: number;
  /** Parte em aberto. */
  aberto: number;
  anulada: boolean;
  /** Valor veio da MIRO (sem partida na FBL1N), não do Financeiro. */
  estimado: boolean;
}

export type Severidade = 'critico' | 'alerta' | 'info';

export type RegraAuditoria =
  | 'lancado_acima_contrato'
  | 'pedidos_acima_contrato'
  | 'consumo_alto'
  | 'fora_vigencia'
  | 'nf_repetida'
  | 'vencido_aberto'
  | 'bloqueio_pagamento'
  | 'pago_com_atraso'
  | 'fornecedor_divergente'
  | 'miro_sem_fbl1n'
  | 'pagamento_divergente'
  | 'sem_pedido'
  | 'parcela_excedida'
  | 'fatura_aumentou'
  | 'projecao_saldo'
  | 'pedido_sem_valor'
  | 'valor_alterado'
  | 'vigencia_alterada'
  | 'sem_lancamento';

export const ROTULO_REGRA: Record<RegraAuditoria, string> = {
  lancado_acima_contrato: 'Lançado acima do valor do contrato',
  pedidos_acima_contrato: 'Pedidos acima do valor do contrato',
  consumo_alto: 'Consumo alto do contrato',
  projecao_saldo: 'Saldo não cobre até o fim da vigência',
  fora_vigencia: 'Lançamento fora da vigência',
  nf_repetida: 'Mesma NF em documentos diferentes',
  vencido_aberto: 'Partida vencida em aberto',
  bloqueio_pagamento: 'Partida com bloqueio de pagamento',
  pago_com_atraso: 'Pago depois do vencimento',
  fornecedor_divergente: 'Fornecedor diferente do contrato',
  miro_sem_fbl1n: 'MIRO sem partida na FBL1N',
  pagamento_divergente: 'MIRO paga × FBL1N em aberto',
  sem_pedido: 'Lançado sem pedido do contrato',
  parcela_excedida: 'Faturado acima da parcela do contrato',
  fatura_aumentou: 'Fatura mensal subiu sem alteração registrada',
  pedido_sem_valor: 'Pedido sem valor na base',
  valor_alterado: 'Valor do contrato alterado',
  vigencia_alterada: 'Vigência alterada',
  sem_lancamento: 'Sem lançamento no Financeiro',
};

/** Rótulo curto para selo em tabela e cartão. */
export const ROTULO_CURTO_REGRA: Record<RegraAuditoria, string> = {
  lancado_acima_contrato: 'Acima do contrato',
  pedidos_acima_contrato: 'Pedidos > contrato',
  consumo_alto: 'Consumo alto',
  projecao_saldo: 'Saldo não cobre',
  fora_vigencia: 'Fora da vigência',
  nf_repetida: 'NF repetida',
  vencido_aberto: 'Vencida em aberto',
  bloqueio_pagamento: 'Bloqueio',
  pago_com_atraso: 'Pago com atraso',
  fornecedor_divergente: 'Outro fornecedor',
  miro_sem_fbl1n: 'MIRO sem FBL1N',
  pagamento_divergente: 'MIRO paga × aberta',
  sem_pedido: 'Sem pedido',
  parcela_excedida: 'Acima da parcela',
  fatura_aumentou: 'Fatura subiu',
  pedido_sem_valor: 'PO sem valor',
  valor_alterado: 'Valor alterado',
  vigencia_alterada: 'Vigência alterada',
  sem_lancamento: 'Sem lançamento',
};

export type CategoriaRegra = 'valor' | 'faturamento' | 'pagamento' | 'vinculo' | 'cadastro';

export const ROTULO_CATEGORIA: Record<CategoriaRegra, string> = {
  valor: 'Valor e saldo',
  faturamento: 'Faturamento',
  pagamento: 'Pagamento',
  vinculo: 'Vínculo com o SAP',
  cadastro: 'Cadastro e histórico',
};

export const ORDEM_CATEGORIA: CategoriaRegra[] = ['valor', 'faturamento', 'pagamento', 'vinculo', 'cadastro'];

export const CATEGORIA_REGRA: Record<RegraAuditoria, CategoriaRegra> = {
  lancado_acima_contrato: 'valor',
  pedidos_acima_contrato: 'valor',
  consumo_alto: 'valor',
  projecao_saldo: 'valor',
  parcela_excedida: 'faturamento',
  fatura_aumentou: 'faturamento',
  nf_repetida: 'faturamento',
  fora_vigencia: 'faturamento',
  vencido_aberto: 'pagamento',
  bloqueio_pagamento: 'pagamento',
  pago_com_atraso: 'pagamento',
  pagamento_divergente: 'pagamento',
  fornecedor_divergente: 'vinculo',
  miro_sem_fbl1n: 'vinculo',
  sem_pedido: 'vinculo',
  pedido_sem_valor: 'vinculo',
  valor_alterado: 'cadastro',
  vigencia_alterada: 'cadastro',
  sem_lancamento: 'cadastro',
};

/** O que conferir quando a regra acusa — vai no detalhe da ocorrência. */
export const ORIENTACAO_REGRA: Record<RegraAuditoria, string> = {
  lancado_acima_contrato: 'Peça o aditivo de valor ou bloqueie novas MIROs até regularizar.',
  pedidos_acima_contrato: 'Confira se um pedido repete o valor global ou se falta aditivo.',
  consumo_alto: 'Avalie aditivo de valor ou nova contratação antes do saldo acabar.',
  projecao_saldo: 'Programe o aditivo de valor ou revise o valor que está sendo faturado.',
  parcela_excedida: 'Confira na NF o motivo da diferença (reajuste, hora extra, serviço adicional) e se existe aditivo. Sem aditivo, é cobrança acima do contratado.',
  fatura_aumentou: 'Confira se houve reajuste ou aditivo e atualize a parcela no cadastro do contrato.',
  nf_repetida: 'Compare as NFs na FBL1N; se for o mesmo serviço, estorne o lançamento em dobro.',
  fora_vigencia: 'Confira a data do serviço e se o contrato foi prorrogado.',
  vencido_aberto: 'Cobre o Financeiro ou confira se a partida está retida por pendência.',
  bloqueio_pagamento: 'Confira o motivo do bloqueio com o Financeiro.',
  pago_com_atraso: 'Só informativo: atraso pode gerar multa ou juros do fornecedor.',
  pagamento_divergente: 'Confira a compensação na FBL1N; a MIRO consta paga.',
  fornecedor_divergente: 'Confira se o pedido do contrato foi faturado por outro CNPJ.',
  miro_sem_fbl1n: 'Confira se a MIRO foi estornada ou se a FBL1N extraída não cobre a data.',
  sem_pedido: 'Confira se o lançamento é deste contrato; reimportar a ZL0170 fecha o vínculo.',
  pedido_sem_valor: 'A soma de pedidos fica por baixo; o valor aparece com a ZL0132 atualizada.',
  valor_alterado: 'Confira se a alteração tem aditivo assinado.',
  vigencia_alterada: 'Confira se a prorrogação tem aditivo assinado.',
  sem_lancamento: 'Confira se o serviço está sendo prestado ou se o contrato pode ser encerrado.',
};

export const ORDEM_SEVERIDADE: Record<Severidade | 'ok', number> = { critico: 0, alerta: 1, info: 2, ok: 3 };

/** Como o contrato é cobrado, lido do campo livre "modalidade" do cadastro. */
export type Periodicidade = 'mensal' | 'trimestral' | 'anual' | 'demanda';

/** Total faturado num mês de competência (data da NF; sem ela, data de lançamento). */
export interface MesFaturado {
  /** YYYY-MM */
  mes: string;
  valor: number;
  documentos: string[];
  /** Acima da parcela cadastrada (só contrato mensal). */
  acima: boolean;
  /** Quantas parcelas exatas o mês acumula (2–3) quando o anterior veio vazio; 0 nos demais. */
  acumulado: number;
}

export interface ProjecaoSaldo {
  /** Mediana dos últimos 3 meses faturados. */
  ritmoMensal: number;
  /** Último mês faturado (YYYY-MM). */
  ultimoMes: string;
  /** Meses depois do último faturado até o mês do fim da vigência. */
  mesesRestantes: number;
  necessario: number;
  /** Saldo usado na projeção: valor global − lançado dentro da vigência. */
  saldo: number;
  /** Necessário − saldo (positivo = falta dinheiro). */
  falta: number;
  /** Mês em que o saldo acaba no ritmo atual (null quando já acabou). */
  esgotaEm: string | null;
}

export interface Ocorrencia {
  regra: RegraAuditoria;
  severidade: Severidade;
  titulo: string;
  detalhe: string;
  valor?: number;
  documentos?: string[];
}

export interface AuditoriaContrato {
  contrato: ContratoComDetalhes;
  fornecedorCodigo: string | null;
  valorGlobal: number;
  valorPedidos: number;
  pedidosSemValor: number;
  /** Lançado confirmado (partida de MIRO do contrato). */
  lancadoMiro: number;
  /** Lançado só pelo fornecedor, sem pedido — a conferir. */
  lancadoFornecedor: number;
  lancado: number;
  pago: number;
  aberto: number;
  vencidoAberto: number;
  /** Valor global − lançado. */
  saldo: number;
  /** Valor global − pedidos. */
  saldoPedidos: number;
  /** Lançado ÷ valor global (null sem valor global). */
  consumo: number | null;
  periodicidade: Periodicidade;
  /** Parcela do cadastro do contrato (null quando não preenchida). */
  parcela: number | null;
  /** Faturado por mês de competência, do 1º ao último mês, com os meses vazios no meio. */
  faturamentoMensal: MesFaturado[];
  /** Só contrato mensal vigente com faturamento. */
  projecao: ProjecaoSaldo | null;
  pedidos: PedidoAuditoria[];
  lancamentos: LancamentoAuditoria[];
  alteracoes: AlteracaoContrato[];
  ocorrencias: Ocorrencia[];
  severidade: Severidade | 'ok';
}

export interface ResultadoAuditoria {
  contratos: AuditoriaContrato[];
  /** Partidas de fornecedor com mais de um contrato, sem MIRO que diga qual. */
  naoAtribuidos: LancamentoAuditoria[];
}

/* --------------------------------------------------------------------- */
/* Parâmetros                                                             */
/* --------------------------------------------------------------------- */

/** Folga sobre o valor global antes de acusar estouro (arredondamento, reajuste de centavos). */
export const TOLERANCIA_ESTOURO = 0.005;
/** A partir de quanto do valor global o contrato pede atenção. */
export const CONSUMO_ALERTA = 0.8;
/** Folga da fatura sobre a parcela cadastrada. */
export const TOLERANCIA_PARCELA = 0.02;
/** Quanto a fatura mensal precisa subir (sem parcela que acuse) para apontar degrau. */
export const AUMENTO_FATURA = 0.1;
/** Dias de vigência sem nenhum lançamento antes de apontar. */
export const DIAS_SEM_LANCAMENTO = 60;

/** Tipos de documento que são pagamento/compensação — não são obrigação lançada. */
const TIPOS_PAGAMENTO = new Set(['KZ', 'ZP', 'AB']);
/** Tipos de fatura em que a referência é a NF (parcelas KS/KA repetem a referência de propósito). */
const TIPOS_FATURA_NF = new Set(['RE', 'KR', 'FI']);

const CAMPOS_VALOR = new Set(['valor_efetivo', 'valor_solicitado', 'preco_liquido', 'qtd_solicit_anterior', 'valor_parcela']);
const CAMPOS_VIGENCIA = new Set(['inicio_validade', 'fim_validade', 'vigencia_label']);

/* --------------------------------------------------------------------- */
/* Auxiliares                                                             */
/* --------------------------------------------------------------------- */

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const texto = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  return s && s !== '—' ? s : null;
};

/** Data ISO (YYYY-MM-DD) sem passar por `new Date` — fuso UTC-3 desloca o dia. */
const iso = (v: string | null | undefined): string | null => {
  const s = texto(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

const diasEntre = (de: string, ate: string): number => {
  const u = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return Math.round((u(ate) - u(de)) / 86_400_000);
};

/** Código do fornecedor do contrato: o cadastro manda; senão, o 1º token da ME3N ("1000094231 L. SILVA"). */
export function codigoFornecedorContrato(c: Pick<ContratoComDetalhes, 'fornecedor' | 'detalhes'>): string | null {
  const manual = texto(c.detalhes?.codigo_fornecedor);
  if (manual) return manual;
  const token = (c.fornecedor || '').trim().split(/\s+/)[0];
  return /^\d{5,}$/.test(token) ? token : null;
}

/** Referência de NF comparável: só letras/dígitos, sem zeros à esquerda ("000123-0" → "1230"). */
export function normalizarReferencia(ref: string | null | undefined): string {
  return (ref || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
}

/** Lê o campo livre "modalidade" ("Mensal", "FIXO MENSAL", "Mensalidade", "12 Meses", "Por Demanda"…). */
export function periodicidadeContrato(modalidade: string | null | undefined): Periodicidade {
  const m = (modalidade || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (/trimes/.test(m)) return 'trimestral';
  if (/anual/.test(m)) return 'anual';
  if (/mens|^\d+\s*mes/.test(m)) return 'mensal';
  return 'demanda';
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-08" → "ago/26". */
export function rotuloMes(ym: string): string {
  return `${MESES_ABREV[+ym.slice(5, 7) - 1] ?? '?'}/${ym.slice(2, 4)}`;
}

/** Soma `n` meses a um YYYY-MM. */
export function somarMeses(ym: string, n: number): string {
  const total = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Meses de `de` até `ate` (ate − de). */
export function mesesEntre(de: string, ate: string): number {
  return (+ate.slice(0, 4) * 12 + +ate.slice(5, 7)) - (+de.slice(0, 4) * 12 + +de.slice(5, 7));
}

function mediana(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Faturado por mês de competência, preenchendo os meses sem fatura entre o 1º e o último. */
export function montarFaturamentoMensal(
  lancamentos: LancamentoAuditoria[],
  parcela: number | null,
  periodicidade: Periodicidade,
): MesFaturado[] {
  const porMes = new Map<string, { valor: number; documentos: string[] }>();
  lancamentos.forEach(l => {
    if (l.anulada || l.valor <= 0 || TIPOS_PAGAMENTO.has(l.tipo || '')) return;
    const d = l.dataDocumento || l.dataLancamento;
    if (!d) return;
    const mes = d.slice(0, 7);
    const g = porMes.get(mes) || { valor: 0, documentos: [] };
    g.valor += l.valor;
    const doc = l.documento || l.docMiro;
    if (doc && !g.documentos.includes(doc)) g.documentos.push(doc);
    porMes.set(mes, g);
  });
  const meses = Array.from(porMes.keys()).sort();
  if (!meses.length) return [];
  const mensal = parcela && periodicidade === 'mensal' ? parcela : null;
  const out: MesFaturado[] = [];
  for (let m = meses[0]; m <= meses[meses.length - 1]; m = somarMeses(m, 1)) {
    const g = porMes.get(m);
    const valor = g?.valor ?? 0;
    let acima = mensal !== null && valor > mensal * (1 + TOLERANCIA_PARCELA);
    let acumulado = 0;
    if (acima && mensal) {
      // 2 ou 3 parcelas exatas no 1º mês ou depois de mês sem fatura: competências acumuladas, não excedente.
      const k = Math.round(valor / mensal);
      const anteriorVazio = out.length === 0 || out[out.length - 1].valor === 0;
      if (k >= 2 && k <= 3 && Math.abs(valor - k * mensal) <= mensal * TOLERANCIA_PARCELA && anteriorVazio) {
        acima = false;
        acumulado = k;
      }
    }
    out.push({ mes: m, valor, documentos: g?.documentos ?? [], acima, acumulado });
  }
  return out;
}

/** Projeção só vale com faturamento corrente: último mês faturado até 2 meses antes de hoje. */
const MESES_SEM_FATURA_PROJECAO = 2;
/** O mês do fim da vigência conta como mês a faturar quando o contrato vai até este dia. */
const DIA_MINIMO_MES_FINAL = 20;

/**
 * Projeção do saldo no ritmo atual (mediana dos últimos 3 meses faturados)
 * até o fim da vigência. Só para contrato mensal vigente e faturando.
 * `saldo` é o da vigência: lançamento fora dela não consome o contrato (e já
 * é apontado em "fora da vigência").
 */
export function calcularProjecao(
  serie: MesFaturado[], saldo: number, fim: string | null, hoje: string,
): ProjecaoSaldo | null {
  if (!fim || fim < hoje) return null;
  const faturados = serie.filter(m => m.valor > 0);
  if (!faturados.length) return null;
  const ritmoMensal = mediana(faturados.slice(-3).map(m => m.valor));
  if (ritmoMensal <= 0) return null;
  const ultimoMes = faturados[faturados.length - 1].mes;
  if (mesesEntre(ultimoMes, hoje.slice(0, 7)) > MESES_SEM_FATURA_PROJECAO) return null;
  const mesesRestantes = mesesEntre(ultimoMes, fim.slice(0, 7)) - (+fim.slice(8, 10) < DIA_MINIMO_MES_FINAL ? 1 : 0);
  if (mesesRestantes <= 0) return null;
  const necessario = ritmoMensal * mesesRestantes;
  return {
    ritmoMensal,
    ultimoMes,
    mesesRestantes,
    necessario,
    saldo,
    falta: necessario - saldo,
    esgotaEm: saldo > 0 ? somarMeses(ultimoMes, Math.floor(saldo / ritmoMensal) + 1) : null,
  };
}

function partidaCompensada(dataCompensacao: string | null, docCompensacao: string | null): boolean {
  return Boolean(texto(docCompensacao) || iso(dataCompensacao));
}

function montarLancamento(
  base: {
    chave: string; contrato: string | null; vinculo: VinculoLancamento;
    pedidos?: string | null; docMiro?: string | null; docPagamentoMiro?: string | null;
  },
  p: {
    numero_documento?: string | null; tipo_documento: string | null; montante_moeda_doc: number | null;
    referencia: string | null; data_documento: string | null; data_lancamento: string | null;
    vencimento_liquido: string | null; data_compensacao: string | null; doc_compensacao: string | null;
    bloqueio_pagamento: string | null; fornecedor: string | null; razao_social_fornecedor: string | null;
    texto: string | null; anulada: boolean | null;
  },
): LancamentoAuditoria {
  const valor = -num(p.montante_moeda_doc);
  const anulada = Boolean(p.anulada);
  const compensada = partidaCompensada(p.data_compensacao, p.doc_compensacao);
  return {
    chave: base.chave,
    contrato: base.contrato,
    vinculo: base.vinculo,
    pedidos: base.pedidos ?? null,
    docMiro: base.docMiro ?? null,
    docPagamentoMiro: base.docPagamentoMiro ?? null,
    documento: texto(p.numero_documento),
    tipo: texto(p.tipo_documento),
    referencia: texto(p.referencia),
    dataDocumento: iso(p.data_documento),
    dataLancamento: iso(p.data_lancamento),
    vencimento: iso(p.vencimento_liquido),
    dataCompensacao: iso(p.data_compensacao),
    docCompensacao: texto(p.doc_compensacao),
    bloqueio: texto(p.bloqueio_pagamento),
    fornecedor: texto(p.fornecedor),
    razao: texto(p.razao_social_fornecedor),
    texto: texto(p.texto),
    valor,
    pago: !anulada && compensada ? valor : 0,
    aberto: !anulada && !compensada ? valor : 0,
    anulada,
    estimado: false,
  };
}

function lancamentoDaMiro(r: PartidaMiroRow): LancamentoAuditoria {
  const base = {
    contrato: r.contrato,
    pedidos: r.pedidos,
    docMiro: r.doc_miro,
    docPagamentoMiro: texto(r.doc_pagamento_miro),
  };
  if (r.fbl_id == null) {
    // MIRO sem partida na FBL1N extraída: valor estimado pela MIRO e pagamento
    // segundo a própria ZL0170.
    const valor = num(r.valor_miro_estimado);
    const pago = texto(r.doc_pagamento_miro) ? valor : 0;
    return {
      chave: `miro:${r.contrato}:${r.doc_miro}:${r.ano_miro ?? ''}`,
      ...base,
      vinculo: 'miro_sem_fbl1n',
      documento: texto(r.numero_doc_contabil),
      tipo: null,
      referencia: texto(r.referencia_miro),
      dataDocumento: null,
      dataLancamento: iso(r.data_lancamento_miro),
      vencimento: null,
      dataCompensacao: iso(r.data_pagamento_miro),
      docCompensacao: texto(r.doc_pagamento_miro),
      bloqueio: null,
      fornecedor: texto(r.fornecedor_miro),
      razao: null,
      texto: null,
      valor,
      pago,
      aberto: valor - pago,
      anulada: false,
      estimado: true,
    };
  }
  return montarLancamento(
    { chave: `fbl:${r.fbl_id}`, ...base, vinculo: 'miro' },
    { ...r, numero_documento: r.numero_doc_contabil },
  );
}

/* --------------------------------------------------------------------- */
/* Regras                                                                 */
/* --------------------------------------------------------------------- */

const somar = (ls: LancamentoAuditoria[], f: (l: LancamentoAuditoria) => number) =>
  ls.reduce((s, l) => s + (l.anulada ? 0 : f(l)), 0);

const docs = (ls: LancamentoAuditoria[]) =>
  Array.from(new Set(ls.map(l => l.documento || l.docMiro || '').filter(Boolean)));

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const vezes = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

interface ContextoRegras {
  hoje: string;
  cobertura: CoberturaAuditoria | null;
}

export function avaliarOcorrencias(a: Omit<AuditoriaContrato, 'ocorrencias' | 'severidade'>, ctx: ContextoRegras): Ocorrencia[] {
  const out: Ocorrencia[] = [];
  const validos = a.lancamentos.filter(l => !l.anulada && l.valor > 0);
  const inicio = iso(a.contrato.inicio_validade);
  const fim = iso(a.contrato.fim_validade);
  const limite = a.valorGlobal * (1 + TOLERANCIA_ESTOURO) + 1;

  // Estouro / consumo. Crítico só quando o que vem da MIRO do contrato já
  // passa do valor: o vinculado só pelo fornecedor pode ser compra avulsa
  // (ex.: o gás da Air Liquide fora do contrato de cilindros), então sozinho
  // ele vira alerta.
  if (a.valorGlobal > 0 && a.lancado > limite) {
    const confirmado = a.lancadoMiro > limite;
    out.push({
      regra: 'lancado_acima_contrato', severidade: confirmado ? 'critico' : 'alerta',
      titulo: ROTULO_REGRA.lancado_acima_contrato,
      detalhe: `Lançado ${brl(a.lancado)} contra valor global de ${brl(a.valorGlobal)} (${pct(a.consumo ?? 0)}).`
        + (a.lancadoFornecedor > 0
          ? confirmado
            ? ` Inclui ${brl(a.lancadoFornecedor)} vinculado só pelo fornecedor.`
            : ` Só passa somando ${brl(a.lancadoFornecedor)} vinculado pelo fornecedor, sem pedido — confira se é deste contrato.`
          : ''),
      valor: a.lancado - a.valorGlobal,
    });
  } else if (a.consumo !== null && a.consumo >= CONSUMO_ALERTA) {
    out.push({
      regra: 'consumo_alto', severidade: 'alerta',
      titulo: ROTULO_REGRA.consumo_alto,
      detalhe: `${pct(a.consumo)} do valor global já lançado; saldo de ${brl(a.saldo)}.`,
      valor: a.saldo,
    });
  }
  if (a.valorGlobal > 0 && a.valorPedidos > limite) {
    out.push({
      regra: 'pedidos_acima_contrato', severidade: 'critico',
      titulo: ROTULO_REGRA.pedidos_acima_contrato,
      detalhe: `${vezes(a.pedidos.length, 'pedido soma', 'pedidos somam')} ${brl(a.valorPedidos)} contra valor global de ${brl(a.valorGlobal)}.`,
      valor: a.valorPedidos - a.valorGlobal,
      documentos: a.pedidos.map(p => p.pedido),
    });
  }

  // Vigência
  if (inicio || fim) {
    const fora = validos.filter(l => {
      const d = l.dataDocumento || l.dataLancamento;
      if (!d) return false;
      return (inicio !== null && d < inicio) || (fim !== null && d > fim);
    });
    if (fora.length) {
      const depois = fim ? fora.filter(l => (l.dataDocumento || l.dataLancamento)! > fim).length : 0;
      out.push({
        regra: 'fora_vigencia', severidade: depois > 0 ? 'critico' : 'alerta',
        titulo: ROTULO_REGRA.fora_vigencia,
        detalhe: `${vezes(fora.length, 'lançamento', 'lançamentos')} com data fora de `
          + `${inicio ? dataBR(inicio) : '—'} a ${fim ? dataBR(fim) : '—'}`
          + (depois > 0 ? ` (${depois} depois do fim).` : '.'),
        valor: somar(fora, l => l.valor),
        documentos: docs(fora),
      });
    }
  }

  // NF repetida
  const porNf = new Map<string, LancamentoAuditoria[]>();
  validos
    .filter(l => !l.estimado && TIPOS_FATURA_NF.has(l.tipo || ''))
    .forEach(l => {
      const ref = normalizarReferencia(l.referencia);
      if (!ref) return;
      const k = `${l.fornecedor || ''}|${ref}`;
      const g = porNf.get(k);
      if (g) g.push(l); else porNf.set(k, [l]);
    });
  porNf.forEach(grupo => {
    const docsGrupo = docs(grupo);
    if (docsGrupo.length < 2) return;
    const mesmoValor = grupo.every(l => Math.abs(l.valor - grupo[0].valor) < 0.01);
    out.push({
      regra: 'nf_repetida', severidade: mesmoValor ? 'critico' : 'alerta',
      titulo: ROTULO_REGRA.nf_repetida,
      detalhe: `NF ${grupo[0].referencia} em ${docsGrupo.length} documentos`
        + (mesmoValor ? `, todos de ${brl(grupo[0].valor)} — possível lançamento em dobro.` : ' com valores diferentes.'),
      valor: somar(grupo, l => l.valor),
      documentos: docsGrupo,
    });
  });

  // Situação das partidas
  const vencidas = validos.filter(l => l.aberto > 0 && l.vencimento && l.vencimento < ctx.hoje);
  if (vencidas.length) {
    out.push({
      regra: 'vencido_aberto', severidade: 'alerta',
      titulo: ROTULO_REGRA.vencido_aberto,
      detalhe: `${vezes(vencidas.length, 'partida vencida', 'partidas vencidas')} sem compensação.`,
      valor: somar(vencidas, l => l.aberto),
      documentos: docs(vencidas),
    });
  }
  const bloqueadas = validos.filter(l => l.bloqueio && l.aberto > 0);
  if (bloqueadas.length) {
    out.push({
      regra: 'bloqueio_pagamento', severidade: 'alerta',
      titulo: ROTULO_REGRA.bloqueio_pagamento,
      detalhe: `${vezes(bloqueadas.length, 'partida em aberto bloqueada', 'partidas em aberto bloqueadas')} (${Array.from(new Set(bloqueadas.map(l => l.bloqueio))).join(', ')}).`,
      valor: somar(bloqueadas, l => l.aberto),
      documentos: docs(bloqueadas),
    });
  }
  const atrasadas = validos.filter(l => l.pago > 0 && l.vencimento && l.dataCompensacao && l.dataCompensacao > l.vencimento);
  if (atrasadas.length) {
    const maior = Math.max(...atrasadas.map(l => diasEntre(l.vencimento!, l.dataCompensacao!)));
    out.push({
      regra: 'pago_com_atraso', severidade: 'info',
      titulo: ROTULO_REGRA.pago_com_atraso,
      detalhe: `${vezes(atrasadas.length, 'partida paga', 'partidas pagas')} depois do vencimento; maior atraso de ${vezes(maior, 'dia', 'dias')}.`,
      valor: somar(atrasadas, l => l.pago),
      documentos: docs(atrasadas),
    });
  }
  if (a.fornecedorCodigo) {
    const outros = validos.filter(l => l.fornecedor && l.fornecedor !== a.fornecedorCodigo);
    if (outros.length) {
      out.push({
        regra: 'fornecedor_divergente', severidade: 'alerta',
        titulo: ROTULO_REGRA.fornecedor_divergente,
        detalhe: `${vezes(outros.length, 'partida', 'partidas')} de outro fornecedor (${Array.from(new Set(outros.map(l => l.razao || l.fornecedor))).join(', ')}) em pedido do contrato.`,
        valor: somar(outros, l => l.valor),
        documentos: docs(outros),
      });
    }
  }

  // Ponte MIRO × FBL1N
  const semFbl = a.lancamentos.filter(l => l.vinculo === 'miro_sem_fbl1n');
  if (semFbl.length) {
    const de = iso(ctx.cobertura?.fbl1n_de);
    const ate = iso(ctx.cobertura?.fbl1n_ate);
    const dentro = semFbl.filter(l => l.dataLancamento && (!de || l.dataLancamento >= de) && (!ate || l.dataLancamento <= ate));
    out.push({
      regra: 'miro_sem_fbl1n', severidade: dentro.length ? 'alerta' : 'info',
      titulo: ROTULO_REGRA.miro_sem_fbl1n,
      detalhe: `${vezes(semFbl.length, 'MIRO', 'MIROs')} sem partida na FBL1N`
        + (dentro.length ? ` (${dentro.length} dentro do período extraído — confira no Financeiro).` : ' (fora do período extraído da FBL1N).'),
      valor: semFbl.reduce((s, l) => s + l.valor, 0),
      documentos: docs(semFbl),
    });
  }
  const pagoSoNaMiro = a.lancamentos.filter(l => l.vinculo === 'miro' && !l.anulada && l.docPagamentoMiro && l.aberto > 0);
  if (pagoSoNaMiro.length) {
    out.push({
      regra: 'pagamento_divergente', severidade: 'alerta',
      titulo: ROTULO_REGRA.pagamento_divergente,
      detalhe: `${vezes(pagoSoNaMiro.length, 'MIRO consta paga', 'MIROs constam pagas')} na ZL0170, mas a partida segue em aberto na FBL1N.`,
      valor: somar(pagoSoNaMiro, l => l.aberto),
      documentos: docs(pagoSoNaMiro),
    });
  }

  // Lançado sem pedido
  const semPedido = validos.filter(l => l.vinculo === 'fornecedor');
  if (semPedido.length) {
    const corte = iso(ctx.cobertura?.zl0170_ate);
    const aposCorte = corte ? semPedido.filter(l => l.dataLancamento && l.dataLancamento > corte).length : 0;
    out.push({
      regra: 'sem_pedido', severidade: 'alerta',
      titulo: ROTULO_REGRA.sem_pedido,
      detalhe: `${vezes(semPedido.length, 'partida', 'partidas')} do fornecedor sem MIRO de pedido do contrato`
        + (aposCorte > 0 && corte ? ` (${aposCorte} depois de ${dataBR(corte)}, último dia da ZL0170 — podem ser MIROs ainda não importadas).` : '.'),
      valor: somar(semPedido, l => l.valor),
      documentos: docs(semPedido),
    });
  }

  // Parcela e valor faturado por mês
  const parcela = a.parcela ?? 0;
  const serie = a.faturamentoMensal;
  const altValorRegistrada = a.alteracoes.find(x => CAMPOS_VALOR.has(x.campo));
  const semAditivo = altValorRegistrada
    ? ` Há alteração de valor registrada em ${dataBR(altValorRegistrada.alterado_em.slice(0, 10))} — confira se cobre o valor faturado.`
    : ' Nenhum reajuste ou aditivo registrado no SISTEN.';
  if (parcela > 0 && a.periodicidade === 'mensal') {
    const acima = serie.filter(m => m.acima);
    if (acima.length) {
      const excedente = acima.reduce((s, m) => s + (m.valor - parcela), 0);
      // Sequência de meses acima da parcela que chega até o último mês faturado.
      const faturados = serie.filter(m => m.valor > 0);
      let seguidos = 0;
      for (let i = faturados.length - 1; i >= 0 && faturados[i].acima; i--) seguidos++;
      const patamar = mediana(acima.map(m => m.valor));
      const detalhe = seguidos >= 2
        ? `Desde ${rotuloMes(faturados[faturados.length - seguidos].mes)} a fatura mensal está em ${brl(patamar)} contra a parcela de ${brl(parcela)} `
          + `(+${pct(patamar / parcela - 1)}), ${seguidos} meses seguidos.`
        : `${vezes(acima.length, 'mês faturado', 'meses faturados')} acima da parcela de ${brl(parcela)}: `
          + acima.map(m => `${rotuloMes(m.mes)} ${brl(m.valor)} (+${pct(m.valor / parcela - 1)})`).join(', ') + '.';
      out.push({
        regra: 'parcela_excedida',
        // Crítico: o valor acima é o que está sendo cobrado agora (últimos meses seguidos)
        // ou o excedente já soma uma parcela inteira. Mês isolado e pequeno fica em alerta.
        severidade: seguidos >= 2 || excedente >= parcela ? 'critico' : 'alerta',
        titulo: ROTULO_REGRA.parcela_excedida,
        detalhe: `${detalhe} Excedente acumulado de ${brl(excedente)}.${semAditivo}`,
        valor: excedente,
        documentos: acima.flatMap(m => m.documentos),
      });
    }
  } else if (parcela > 0) {
    // Por demanda/medição/trimestral: a parcela é teto por documento.
    const porDoc = new Map<string, number>();
    validos.filter(l => !l.estimado && l.documento).forEach(l => {
      porDoc.set(l.documento!, (porDoc.get(l.documento!) || 0) + l.valor);
    });
    const acima = Array.from(porDoc.entries()).filter(([, v]) => v > parcela * (1 + TOLERANCIA_PARCELA));
    if (acima.length) {
      out.push({
        regra: 'parcela_excedida', severidade: 'alerta',
        titulo: ROTULO_REGRA.parcela_excedida,
        detalhe: `${vezes(acima.length, 'documento', 'documentos')} acima da parcela cadastrada de ${brl(parcela)} (maior: ${brl(Math.max(...acima.map(([, v]) => v)))}).`,
        valor: acima.reduce((s, [, v]) => s + (v - parcela), 0),
        documentos: acima.map(([d]) => d),
      });
    }
  }

  // Degrau no valor mensal sem parcela que o acuse: valor estável que passa a
  // vir ≥ 10% maior nos últimos meses seguidos.
  if (!out.some(o => o.regra === 'parcela_excedida')) {
    const faturados = serie.filter(m => m.valor > 0);
    if (faturados.length >= 4 && (a.periodicidade === 'mensal' || faturados.length === serie.length)) {
      const base = mediana(faturados.slice(0, -2).map(m => m.valor));
      let seguidos = 0;
      for (let i = faturados.length - 1; i >= 0 && faturados[i].valor >= base * (1 + AUMENTO_FATURA); i--) seguidos++;
      const anteriores = faturados.slice(0, faturados.length - seguidos).map(m => m.valor);
      const estavel = anteriores.length >= 2 && Math.max(...anteriores) <= Math.min(...anteriores) * (1 + AUMENTO_FATURA);
      if (base > 0 && seguidos >= 2 && estavel) {
        const recentes = faturados.slice(-seguidos);
        const novo = mediana(recentes.map(m => m.valor));
        out.push({
          regra: 'fatura_aumentou', severidade: 'alerta',
          titulo: ROTULO_REGRA.fatura_aumentou,
          detalhe: `A fatura mensal passou de ${brl(base)} para ${brl(novo)} (+${pct(novo / base - 1)}) a partir de ${rotuloMes(recentes[0].mes)}, `
            + `${seguidos} meses seguidos.${parcela > 0 ? '' : ' Sem parcela cadastrada para comparar.'}${semAditivo}`,
          valor: recentes.reduce((s, m) => s + (m.valor - base), 0),
          documentos: recentes.flatMap(m => m.documentos),
        });
      }
    }
  }

  // Projeção: o saldo aguenta até o fim da vigência no ritmo atual?
  const pj = a.projecao;
  if (pj && a.valorGlobal > 0 && a.saldo > 0 && pj.saldo > 0 && pj.falta > Math.max(1, pj.ritmoMensal * 0.1)) {
    const excedente = out.find(o => o.regra === 'parcela_excedida')?.valor ?? 0;
    const foraVigencia = pj.saldo - a.saldo;
    const naParcela = parcela > 0 && pj.ritmoMensal > parcela * (1 + TOLERANCIA_PARCELA)
      ? parcela * pj.mesesRestantes <= pj.saldo + excedente
        ? ` Se a cobrança tivesse ficado na parcela de ${brl(parcela)}, o saldo cobriria até o fim: o estouro vem do valor acima do contratado.`
        : ` Mesmo voltando à parcela de ${brl(parcela)}, o saldo não cobre.`
      : '';
    out.push({
      regra: 'projecao_saldo',
      severidade: pj.falta >= pj.ritmoMensal ? 'critico' : 'alerta',
      titulo: ROTULO_REGRA.projecao_saldo,
      detalhe: `No ritmo atual de ${brl(pj.ritmoMensal)}/mês, faltam ${vezes(pj.mesesRestantes, 'mês', 'meses')} até o fim da vigência`
        + `${fim ? ` (${dataBR(fim)})` : ''}: precisa de ${brl(pj.necessario)} e o saldo é ${brl(pj.saldo)}`
        + `${foraVigencia > 1 ? ` (sem contar ${brl(foraVigencia)} lançado fora da vigência)` : ''}.`
        + `${pj.esgotaEm ? ` O saldo acaba em ${rotuloMes(pj.esgotaEm)};` : ''} faltam ${brl(pj.falta)}.${naParcela}`,
      valor: pj.falta,
    });
  }

  // Cadastro e histórico
  if (a.pedidosSemValor > 0) {
    out.push({
      regra: 'pedido_sem_valor', severidade: 'info',
      titulo: ROTULO_REGRA.pedido_sem_valor,
      detalhe: `${vezes(a.pedidosSemValor, 'pedido', 'pedidos')} sem valor na ZL0132/ME2L/ZL0170 — a soma de pedidos fica por baixo.`,
      documentos: a.pedidos.filter(p => p.valor == null).map(p => p.pedido),
    });
  }
  const altValor = a.alteracoes.filter(x => CAMPOS_VALOR.has(x.campo));
  if (altValor.length) {
    out.push({
      regra: 'valor_alterado', severidade: 'info',
      titulo: ROTULO_REGRA.valor_alterado,
      detalhe: `${vezes(altValor.length, 'alteração registrada', 'alterações registradas')}; última em ${dataBR(altValor[0].alterado_em.slice(0, 10))}.`,
    });
  }
  const altVig = a.alteracoes.filter(x => CAMPOS_VIGENCIA.has(x.campo));
  if (altVig.length) {
    out.push({
      regra: 'vigencia_alterada', severidade: 'info',
      titulo: ROTULO_REGRA.vigencia_alterada,
      detalhe: `${vezes(altVig.length, 'alteração registrada', 'alterações registradas')}; última em ${dataBR(altVig[0].alterado_em.slice(0, 10))}.`,
    });
  }
  if (validos.length === 0 && inicio && inicio <= ctx.hoje && diasEntre(inicio, ctx.hoje) >= DIAS_SEM_LANCAMENTO
      && (!fim || fim >= ctx.hoje)) {
    out.push({
      regra: 'sem_lancamento', severidade: 'info',
      titulo: ROTULO_REGRA.sem_lancamento,
      detalhe: `Vigente há ${vezes(diasEntre(inicio, ctx.hoje), 'dia', 'dias')} sem nenhuma partida vinculada na FBL1N.`,
    });
  }

  return out.sort((x, y) =>
    ORDEM_SEVERIDADE[x.severidade] - ORDEM_SEVERIDADE[y.severidade]
    || ORDEM_CATEGORIA.indexOf(CATEGORIA_REGRA[x.regra]) - ORDEM_CATEGORIA.indexOf(CATEGORIA_REGRA[y.regra])
    || (y.valor ?? 0) - (x.valor ?? 0));
}

/* --------------------------------------------------------------------- */
/* Montagem                                                               */
/* --------------------------------------------------------------------- */

export interface EntradaAuditoria {
  contratos: ContratoComDetalhes[];
  pedidos: PedidoAuditoria[];
  partidas: PartidaMiroRow[];
  semPedido: PartidaSemPedidoRow[];
  alteracoes: AlteracaoContrato[];
  cobertura: CoberturaAuditoria | null;
  /** Hoje em ISO local (`hojeISO()`). */
  hoje: string;
}

function agruparPor<T>(lista: T[], chave: (t: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  lista.forEach(t => {
    const k = chave(t);
    if (!k) return;
    const g = m.get(k);
    if (g) g.push(t); else m.set(k, [t]);
  });
  return m;
}

export function montarAuditoria(e: EntradaAuditoria): ResultadoAuditoria {
  const conhecidos = new Set(e.contratos.map(c => c.documento_compras));
  const pedidosPor = agruparPor(e.pedidos, p => p.contrato);
  const alteracoesPor = agruparPor(
    [...e.alteracoes].sort((a, b) => b.alterado_em.localeCompare(a.alterado_em)),
    a => a.documento_compras,
  );

  // Lançamentos com vínculo pela MIRO (uma partida por contrato, mesmo que duas MIROs apontem o mesmo documento).
  const lancPor = new Map<string, Map<string, LancamentoAuditoria>>();
  const incluir = (contrato: string, l: LancamentoAuditoria) => {
    let m = lancPor.get(contrato);
    if (!m) { m = new Map(); lancPor.set(contrato, m); }
    if (!m.has(l.chave)) m.set(l.chave, l);
  };
  e.partidas.forEach(r => { if (r.contrato) incluir(r.contrato, lancamentoDaMiro(r)); });

  // Sem pedido: atribui quando o fornecedor tem um contrato só.
  const naoAtribuidos: LancamentoAuditoria[] = [];
  e.semPedido.forEach(r => {
    if (TIPOS_PAGAMENTO.has((r.tipo_documento || '').trim())) return;
    const contratos = (r.contratos || '').split(',').map(s => s.trim()).filter(s => conhecidos.has(s));
    const unico = contratos.length === 1 ? contratos[0] : null;
    const l = montarLancamento({ chave: `fbl:${r.fbl_id}`, contrato: unico, vinculo: 'fornecedor' }, r);
    if (unico) incluir(unico, l);
    else if (contratos.length > 1) naoAtribuidos.push({ ...l, pedidos: contratos.join(', ') });
  });

  const contratos = e.contratos.map(c => {
    const pedidos = pedidosPor.get(c.documento_compras) || [];
    const lancamentos = Array.from(lancPor.get(c.documento_compras)?.values() || [])
      .sort((a, b) => (b.dataLancamento || '').localeCompare(a.dataLancamento || ''));
    const alteracoes = alteracoesPor.get(c.documento_compras) || [];

    const valorGlobal = num(c.valor_efetivo);
    const valorPedidos = pedidos.reduce((s, p) => s + num(p.valor), 0);
    const lancadoMiro = somar(lancamentos.filter(l => l.vinculo !== 'fornecedor'), l => l.valor);
    const lancadoFornecedor = somar(lancamentos.filter(l => l.vinculo === 'fornecedor'), l => l.valor);
    const lancado = lancadoMiro + lancadoFornecedor;
    const pago = somar(lancamentos, l => l.pago);
    const aberto = somar(lancamentos, l => l.aberto);
    const vencidoAberto = somar(lancamentos.filter(l => l.vencimento && l.vencimento < e.hoje), l => l.aberto);
    const periodicidade = periodicidadeContrato(c.detalhes?.modalidade);
    const parcela = num(c.detalhes?.valor_parcela) > 0 ? num(c.detalhes?.valor_parcela) : null;
    const faturamentoMensal = montarFaturamentoMensal(lancamentos, parcela, periodicidade);
    const saldo = valorGlobal - lancado;
    const inicioVig = iso(c.inicio_validade);
    const fimVig = iso(c.fim_validade);
    const lancadoNaVigencia = somar(lancamentos.filter(l => {
      const d = l.dataDocumento || l.dataLancamento;
      return !d || ((!inicioVig || d >= inicioVig) && (!fimVig || d <= fimVig));
    }), l => l.valor);
    const projecao = periodicidade === 'mensal'
      ? calcularProjecao(faturamentoMensal, valorGlobal - lancadoNaVigencia, fimVig, e.hoje)
      : null;

    const base = {
      contrato: c,
      fornecedorCodigo: codigoFornecedorContrato(c),
      valorGlobal,
      valorPedidos,
      pedidosSemValor: pedidos.filter(p => p.valor == null).length,
      lancadoMiro,
      lancadoFornecedor,
      lancado,
      pago,
      aberto,
      vencidoAberto,
      saldo,
      saldoPedidos: valorGlobal - valorPedidos,
      consumo: valorGlobal > 0 ? lancado / valorGlobal : null,
      periodicidade,
      parcela,
      faturamentoMensal,
      projecao,
      pedidos,
      lancamentos,
      alteracoes,
    };
    const ocorrencias = avaliarOcorrencias(base, { hoje: e.hoje, cobertura: e.cobertura });
    const severidade: Severidade | 'ok' = ocorrencias.length
      ? ocorrencias.reduce<Severidade>((pior, o) => (ORDEM_SEVERIDADE[o.severidade] < ORDEM_SEVERIDADE[pior] ? o.severidade : pior), 'info')
      : 'ok';
    return { ...base, ocorrencias, severidade };
  });

  return { contratos, naoAtribuidos };
}

/** Rótulo do vínculo para tela/Excel. */
export function rotuloVinculo(v: VinculoLancamento): string {
  switch (v) {
    case 'miro': return 'Pedido do contrato (MIRO)';
    case 'fornecedor': return 'Só pelo fornecedor — a conferir';
    case 'miro_sem_fbl1n': return 'MIRO sem partida na FBL1N';
  }
}

/** Rótulo do campo do log de alterações. */
export function rotuloCampoAlteracao(campo: string): string {
  const m: Record<string, string> = {
    item_incluido: 'Item incluído',
    valor_efetivo: 'Valor global (efetivo)',
    valor_solicitado: 'Valor fixado',
    preco_liquido: 'Preço líquido',
    qtd_solicit_anterior: 'Quantidade',
    valor_pendente: 'Valor pendente',
    inicio_validade: 'Início da vigência',
    fim_validade: 'Fim da vigência',
    codigo_eliminacao: 'Código de eliminação',
    fornecedor: 'Fornecedor',
    valor_parcela: 'Parcela',
    status: 'Status',
    vigencia_label: 'Vigência (texto)',
    po_pedido_compra: 'PO',
    modalidade: 'Modalidade',
    gestor: 'Gestor',
    tipo: 'Tipo',
    codigo_fornecedor: 'Código do fornecedor',
  };
  return m[campo] || campo;
}
