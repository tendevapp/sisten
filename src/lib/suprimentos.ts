/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Agregações de gestão do setor de suprimentos.
 *
 * Cálculo puro, sem React: o shell da página aplica os filtros e chama estas
 * funções dentro de `useMemo`. Cada agregação faz um passe só sobre os
 * registros — a base de RIs chega a dezenas de milhares de linhas e a página
 * recalcula a cada mudança de filtro.
 *
 * Princípio que atravessa o módulo: **um indicador declara sua própria
 * cobertura**. Spend só existe em item com PO e nem todo PO traz valor; OTD só
 * pode ser medido em item já recebido. Em vez de silenciar a diferença (que
 * faria o gestor decidir sobre um número truncado sem saber), toda métrica
 * incompleta devolve junto quantos registros entraram no cálculo e quantos
 * eram elegíveis.
 */

import { EnrichedSAPRecord } from '../types';
import { CompradorInfo, resolveComprador } from './demandas';

/* Datas ------------------------------------------------------------------ */

/** Parse tolerante: a base traz ISO, mas também string vazia e null. */
function toDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DIA_MS = 86_400_000;

/** Dias corridos entre duas datas, ignorando hora. Negativo = `b` antes de `a`. */
function diasEntre(a: Date, b: Date): number {
  const ai = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bi = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bi - ai) / DIA_MS);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Janela padrão da página: os últimos `dias` (inclusive hoje) e a janela de
 * mesmo tamanho imediatamente anterior, que serve de base de comparação.
 */
export function janelaPadrao(dias = 90): {
  de: string;
  ate: string;
  anteriorDe: string;
  anteriorAte: string;
} {
  const hoje = new Date();
  const de = new Date(hoje.getTime() - (dias - 1) * DIA_MS);
  const anteriorAte = new Date(de.getTime() - DIA_MS);
  const anteriorDe = new Date(anteriorAte.getTime() - (dias - 1) * DIA_MS);
  return {
    de: isoDate(de),
    ate: isoDate(hoje),
    anteriorDe: isoDate(anteriorDe),
    anteriorAte: isoDate(anteriorAte),
  };
}

/**
 * Janela anterior de mesma duração para um intervalo arbitrário — usada quando
 * o usuário troca as datas na mão e ainda assim quer ver a variação.
 * Devolve null quando o intervalo não é completo (só uma das pontas definida),
 * porque aí não existe "mesma duração" para comparar contra.
 */
export function janelaAnterior(de: string, ate: string): { de: string; ate: string } | null {
  const dDe = toDate(de);
  const dAte = toDate(ate);
  if (!dDe || !dAte || dAte < dDe) return null;
  const duracao = diasEntre(dDe, dAte); // dias completos entre as pontas
  const antAte = new Date(dDe.getTime() - DIA_MS);
  const antDe = new Date(antAte.getTime() - duracao * DIA_MS);
  return { de: isoDate(antDe), ate: isoDate(antAte) };
}

/* Variação --------------------------------------------------------------- */

export type DirecaoBoa = 'cima' | 'baixo';

export interface Delta {
  /** Diferença absoluta (atual − anterior). */
  absoluto: number;
  /** Variação relativa em %, ou null quando o anterior é zero/ausente. */
  percentual: number | null;
  /** True quando a variação favorece o setor, dado o sentido do indicador. */
  bom: boolean;
  /** False quando não havia base de comparação — a UI mostra "—". */
  comparavel: boolean;
}

/**
 * Variação entre dois períodos.
 *
 * `anterior` igual a zero não vira "+100%": crescer de 0 para 5 não tem
 * percentual definido, e exibir ∞ ou 100% seria inventar informação. Nesse
 * caso `percentual` é null e a UI mostra só o absoluto.
 */
export function delta(atual: number, anterior: number, direcaoBoa: DirecaoBoa = 'cima'): Delta {
  const absoluto = atual - anterior;
  const comparavel = Number.isFinite(anterior) && anterior !== 0;
  const percentual = comparavel ? (absoluto / Math.abs(anterior)) * 100 : null;
  const bom = direcaoBoa === 'cima' ? absoluto >= 0 : absoluto <= 0;
  return { absoluto, percentual, bom, comparavel };
}

/* Predicados de domínio -------------------------------------------------- */

export const temPO = (r: EnrichedSAPRecord): boolean => r.status_requisicao === 'Processado';
export const estaAberto = (r: EnrichedSAPRecord): boolean => !temPO(r);

/** Item já recebido fisicamente — é o que habilita qualquer medição de prazo. */
export const foiRecebido = (r: EnrichedSAPRecord): boolean => Boolean(toDate(r.data_migo));

/* Métricas com cobertura declarada --------------------------------------- */

export interface MetricaComCobertura {
  valor: number;
  /** Registros que entraram no cálculo. */
  base: number;
  /** Registros que seriam elegíveis se o dado estivesse completo. */
  elegiveis: number;
}

/** Fração 0..1 dos elegíveis que de fato entraram no cálculo. */
export function cobertura(m: MetricaComCobertura): number {
  return m.elegiveis > 0 ? m.base / m.elegiveis : 0;
}

/**
 * Spend do período: soma de `valor_total` dos itens com PO.
 *
 * Elegível = item com PO. Base = subconjunto que traz valor. A diferença entre
 * os dois é real na base atual (pedidos importados sem `valor_brl`) e precisa
 * aparecer na tela.
 */
export function calcSpend(records: EnrichedSAPRecord[]): MetricaComCobertura {
  let valor = 0;
  let base = 0;
  let elegiveis = 0;
  for (const r of records) {
    if (!temPO(r)) continue;
    elegiveis++;
    if (typeof r.valor_total === 'number' && Number.isFinite(r.valor_total)) {
      valor += r.valor_total;
      base++;
    }
  }
  return { valor, base, elegiveis };
}

/**
 * Lead time RM→PO em dias: `data_pedido − data_solicitacao`, apenas sobre itens
 * já convertidos em pedido.
 *
 * A métrica que isso substitui promediava `dias_em_aberto` sobre a base
 * inteira, misturando itens fechados (onde o número é o ciclo realizado) com
 * itens abertos (onde é a idade do backlog). A média das duas coisas não é
 * nenhuma das duas.
 */
export function calcLeadTimeRmPo(records: EnrichedSAPRecord[]): MetricaComCobertura {
  let soma = 0;
  let base = 0;
  let elegiveis = 0;
  for (const r of records) {
    if (!temPO(r)) continue;
    elegiveis++;
    const sol = toDate(r.data_solicitacao);
    const ped = toDate(r.data_pedido);
    if (!sol || !ped) continue;
    const d = diasEntre(sol, ped);
    if (d < 0) continue; // pedido anterior à solicitação: dado inconsistente, fora
    soma += d;
    base++;
  }
  return { valor: base > 0 ? soma / base : 0, base, elegiveis };
}

/** Idade média, em dias, dos itens ainda sem pedido. */
export function calcAgingMedio(records: EnrichedSAPRecord[]): number {
  let soma = 0;
  let n = 0;
  for (const r of records) {
    if (!estaAberto(r)) continue;
    soma += r.dias_em_aberto || 0;
    n++;
  }
  return n > 0 ? soma / n : 0;
}

/* OTD -------------------------------------------------------------------- */

export type BaseOtd = 'fornecedor' | 'cliente';

export interface ResultadoOtd extends MetricaComCobertura {
  /** Itens entregues dentro do prazo. */
  noPrazo: number;
  /** Itens com PO ainda não recebidos — fora do denominador, reportados à parte. */
  pendentes: number;
  /** Média de dias de atraso entre os itens entregues com atraso. */
  atrasoMedioDias: number;
}

/**
 * Aderência a prazo, sem tolerância (entregar um dia depois é atraso).
 *
 * Duas bases, que medem responsabilidades diferentes:
 * - `fornecedor`: real (`data_migo`) contra o prometido no pedido
 *   (`data_entrega_sap`) — o fornecedor cumpriu o que assinou.
 * - `cliente`: real contra o requerido pelo solicitante (`data_remessa`) — a
 *   área recebeu quando precisava, independentemente de quem causou o desvio.
 *
 * Só entra no denominador o item já recebido: contar item pendente como "no
 * prazo" infla o indicador, e contá-lo como atraso pune entrega que ainda tem
 * prazo pela frente. Os pendentes saem reportados em `pendentes`.
 */
export function calcOtd(records: EnrichedSAPRecord[], base: BaseOtd): ResultadoOtd {
  let noPrazo = 0;
  let medidos = 0;
  let elegiveis = 0;
  let pendentes = 0;
  let somaAtraso = 0;
  let nAtrasados = 0;

  for (const r of records) {
    if (!temPO(r)) continue;
    elegiveis++;
    const real = toDate(r.data_migo);
    if (!real) {
      pendentes++;
      continue;
    }
    const prazo = toDate(base === 'fornecedor' ? r.data_entrega_sap : r.data_remessa);
    if (!prazo) continue; // sem prazo de referência não há o que aferir
    medidos++;
    const desvio = diasEntre(prazo, real);
    if (desvio <= 0) noPrazo++;
    else {
      somaAtraso += desvio;
      nAtrasados++;
    }
  }

  return {
    valor: medidos > 0 ? (noPrazo / medidos) * 100 : 0,
    base: medidos,
    elegiveis,
    noPrazo,
    pendentes,
    atrasoMedioDias: nAtrasados > 0 ? somaAtraso / nAtrasados : 0,
  };
}

/* Aging da carteira ------------------------------------------------------ */

export interface FaixaAging {
  rotulo: string;
  /** Limite superior em dias, inclusivo. Infinity na última faixa. */
  ate: number;
  itens: number;
  /** Índice na rampa ordinal de atraso (`useChartTokens().atraso`). */
  rampa: number;
}

const FAIXAS: ReadonlyArray<Pick<FaixaAging, 'rotulo' | 'ate' | 'rampa'>> = [
  { rotulo: '0-7 dias', ate: 7, rampa: 0 },
  { rotulo: '8-15 dias', ate: 15, rampa: 1 },
  { rotulo: '16-30 dias', ate: 30, rampa: 2 },
  { rotulo: '31-60 dias', ate: 60, rampa: 3 },
  { rotulo: 'Acima de 60 dias', ate: Infinity, rampa: 4 },
];

/**
 * Distribuição etária da carteira aberta.
 *
 * Aging é escala *ordinal*: as faixas têm ordem e trocá-las mudaria o sentido.
 * Por isso o `rampa` aponta para a rampa de um matiz só já usada em atraso, e
 * não para as cores categóricas de série.
 */
export function calcAging(records: EnrichedSAPRecord[]): FaixaAging[] {
  const faixas: FaixaAging[] = FAIXAS.map(f => ({ ...f, itens: 0 }));
  for (const r of records) {
    if (!estaAberto(r)) continue;
    const dias = r.dias_em_aberto || 0;
    const alvo = faixas.find(f => dias <= f.ate) ?? faixas[faixas.length - 1];
    alvo.itens++;
  }
  return faixas;
}

/**
 * Rótulo da faixa de aging de um registro aberto — mesma regra de `calcAging`,
 * exposta por registro para o modal de composição filtrar de volta os itens
 * de uma faixa clicada no gráfico. `null` para itens já processados.
 */
export function faixaAgingDoRegistro(r: EnrichedSAPRecord): string | null {
  if (!estaAberto(r)) return null;
  const dias = r.dias_em_aberto || 0;
  const alvo = FAIXAS.find(f => dias <= f.ate) ?? FAIXAS[FAIXAS.length - 1];
  return alvo.rotulo;
}

/** Limite a partir do qual um item aberto é tratado como crítico na carteira. */
export const DIAS_CRITICO = 30;

/* Carteira por comprador ------------------------------------------------- */

export interface LinhaComprador {
  comprador: string;
  abertos: number;
  processados: number;
  total: number;
  /** 0..100 */
  conversao: number;
  agingMedio: number;
  criticos: number;
  spend: number;
  /** 0..100; null quando nenhum item do comprador foi recebido com prazo aferível. */
  otd: number | null;
}

/**
 * Uma linha por comprador responsável.
 *
 * A atribuição usa `resolveComprador`, que prioriza quem de fato lançou o PO
 * sobre o grupo nominalmente atribuído — sem isso, cobertura entre compradores
 * credita o trabalho a quem não o fez.
 */
export function calcCarteiraPorComprador(
  records: EnrichedSAPRecord[],
  compradores: CompradorInfo[]
): LinhaComprador[] {
  interface Acc {
    abertos: number;
    processados: number;
    somaAging: number;
    criticos: number;
    spend: number;
    otdMedidos: number;
    otdNoPrazo: number;
  }
  const mapa = new Map<string, Acc>();

  for (const r of records) {
    const nome = resolveComprador(r, compradores);
    let a = mapa.get(nome);
    if (!a) {
      a = { abertos: 0, processados: 0, somaAging: 0, criticos: 0, spend: 0, otdMedidos: 0, otdNoPrazo: 0 };
      mapa.set(nome, a);
    }

    if (temPO(r)) {
      a.processados++;
      if (typeof r.valor_total === 'number' && Number.isFinite(r.valor_total)) a.spend += r.valor_total;
      const real = toDate(r.data_migo);
      const prazo = toDate(r.data_entrega_sap);
      if (real && prazo) {
        a.otdMedidos++;
        if (diasEntre(prazo, real) <= 0) a.otdNoPrazo++;
      }
    } else {
      a.abertos++;
      const dias = r.dias_em_aberto || 0;
      a.somaAging += dias;
      if (dias > DIAS_CRITICO) a.criticos++;
    }
  }

  return Array.from(mapa.entries())
    .map(([comprador, a]) => {
      const total = a.abertos + a.processados;
      return {
        comprador,
        abertos: a.abertos,
        processados: a.processados,
        total,
        conversao: total > 0 ? (a.processados / total) * 100 : 0,
        agingMedio: a.abertos > 0 ? a.somaAging / a.abertos : 0,
        criticos: a.criticos,
        spend: a.spend,
        otd: a.otdMedidos > 0 ? (a.otdNoPrazo / a.otdMedidos) * 100 : null,
      };
    })
    .sort((x, y) => y.abertos - x.abertos);
}

/* Fornecedores ----------------------------------------------------------- */

export interface LinhaFornecedor {
  fornecedor: string;
  codigo?: string;
  itens: number;
  /** Pedidos distintos (`documento_compra`). */
  pedidos: number;
  spend: number;
  /** 0..100; null quando nada foi recebido com prazo aferível. */
  otd: number | null;
  atrasoMedioDias: number;
  /** Participação no spend total, 0..100. */
  participacao: number;
  /** Participação acumulada na ordenação por spend, 0..100 — a curva de Pareto. */
  acumulado: number;
}

/**
 * Ranking de fornecedores por spend, com a curva acumulada já calculada.
 *
 * Só itens com PO participam: fornecedor só existe depois que o pedido é
 * colocado. Itens com PO e sem nome de fornecedor entram como "Não informado"
 * em vez de sumir — spend que não se sabe de quem é continua sendo spend, e
 * escondê-lo faria os percentuais fecharem sobre um total errado.
 */
export function calcFornecedores(records: EnrichedSAPRecord[]): LinhaFornecedor[] {
  interface Acc {
    codigo?: string;
    itens: number;
    pedidos: Set<string>;
    spend: number;
    otdMedidos: number;
    otdNoPrazo: number;
    somaAtraso: number;
    nAtrasados: number;
  }
  const mapa = new Map<string, Acc>();

  for (const r of records) {
    if (!temPO(r)) continue;
    const nome = r.fornecedor_name?.trim() || 'Não informado';
    let a = mapa.get(nome);
    if (!a) {
      a = {
        codigo: r.fornecedor_code,
        itens: 0,
        pedidos: new Set(),
        spend: 0,
        otdMedidos: 0,
        otdNoPrazo: 0,
        somaAtraso: 0,
        nAtrasados: 0,
      };
      mapa.set(nome, a);
    }

    a.itens++;
    if (r.documento_compra) a.pedidos.add(r.documento_compra);
    if (typeof r.valor_total === 'number' && Number.isFinite(r.valor_total)) a.spend += r.valor_total;

    const real = toDate(r.data_migo);
    const prazo = toDate(r.data_entrega_sap);
    if (real && prazo) {
      a.otdMedidos++;
      const desvio = diasEntre(prazo, real);
      if (desvio <= 0) a.otdNoPrazo++;
      else {
        a.somaAtraso += desvio;
        a.nAtrasados++;
      }
    }
  }

  const linhas = Array.from(mapa.entries())
    .map(([fornecedor, a]) => ({
      fornecedor,
      codigo: a.codigo,
      itens: a.itens,
      pedidos: a.pedidos.size,
      spend: a.spend,
      otd: a.otdMedidos > 0 ? (a.otdNoPrazo / a.otdMedidos) * 100 : null,
      atrasoMedioDias: a.nAtrasados > 0 ? a.somaAtraso / a.nAtrasados : 0,
      participacao: 0,
      acumulado: 0,
    }))
    .sort((x, y) => y.spend - x.spend);

  const total = linhas.reduce((s, l) => s + l.spend, 0);
  let acum = 0;
  for (const l of linhas) {
    l.participacao = total > 0 ? (l.spend / total) * 100 : 0;
    acum += l.participacao;
    l.acumulado = acum;
  }
  return linhas;
}

/**
 * Concentração do spend nos `n` maiores fornecedores, em %.
 *
 * É a leitura de risco de dependência: 80% do gasto em três fornecedores é uma
 * posição de negociação muito diferente de 80% espalhado em quarenta.
 */
export function concentracaoTop(linhas: LinhaFornecedor[], n = 10): number {
  const total = linhas.reduce((s, l) => s + l.spend, 0);
  if (total <= 0) return 0;
  const topo = linhas.slice(0, n).reduce((s, l) => s + l.spend, 0);
  return (topo / total) * 100;
}

/* Resumo da Visão Geral -------------------------------------------------- */

export interface ResumoSetor {
  total: number;
  abertos: number;
  processados: number;
  /** 0..100 */
  conversao: number;
  leadTime: MetricaComCobertura;
  spend: MetricaComCobertura;
  otdCliente: ResultadoOtd;
  otdFornecedor: ResultadoOtd;
  agingMedio: number;
  criticos: number;
}

/** Bloco único de indicadores da Visão Geral, para um conjunto já filtrado. */
export function calcResumoSetor(records: EnrichedSAPRecord[]): ResumoSetor {
  const total = records.length;
  let processados = 0;
  let criticos = 0;
  for (const r of records) {
    if (temPO(r)) processados++;
    else if ((r.dias_em_aberto || 0) > DIAS_CRITICO) criticos++;
  }
  const abertos = total - processados;

  return {
    total,
    abertos,
    processados,
    conversao: total > 0 ? (processados / total) * 100 : 0,
    leadTime: calcLeadTimeRmPo(records),
    spend: calcSpend(records),
    otdCliente: calcOtd(records, 'cliente'),
    otdFornecedor: calcOtd(records, 'fornecedor'),
    agingMedio: calcAgingMedio(records),
    criticos,
  };
}
