/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Alertas de consumo — o que mudou no ritmo de saída de um material e o que
 * isso significa para o estoque.
 *
 * Entrada: a série semanal de consumo (MB51, `consumoSemanal.ts`) só com
 * semanas COMPLETAS — a semana corrente pela metade puxaria a média recente
 * para baixo e esconderia justamente o aumento — e a faixa do Controle de
 * Estoque (saldo, mínimo, lead time, intervalo de compra).
 *
 * Cinco sinais, todos com o motivo escrito para quem lê:
 *  - RUPTURA: no ritmo atual o saldo acaba antes de a reposição chegar;
 *  - MINIMO_DEFASADO: o mínimo cadastrado foi dimensionado para um consumo
 *    menor que o atual (mesma fórmula do Controle de Estoque);
 *  - AUMENTO: média das últimas 8 semanas ≥ 1,5× a das 16 anteriores;
 *  - TENDENCIA: a série virou de estável/queda para alta nas últimas 8 semanas;
 *  - PICO: a última semana ficou fora do padrão (média + 3 desvios).
 *
 * Proteção contra demanda intermitente (54% dos materiais saem numa única
 * semana): aumento, tendência e pico exigem base com pelo menos 4 semanas de
 * saída — sem isso, uma saída isolada seria "aumento infinito".
 *
 * Por que 8 × 16 e não 4 × 12: a MB51 concentra baixas no fechamento do mês
 * (as semanas de virada têm 3–5× mais lançamentos). Uma janela de 4 semanas
 * pega um fechamento em 4 e a base, dois em 12 — a razão infla sem o consumo
 * ter mudado. Com 8 × 16 as duas janelas cobrem meses inteiros. Calibrado em
 * 27/10/2026: 47 de 192 itens de consumo com histórico acima de 1,5× (contra
 * 151 de 314 na janela curta), e os do topo são aumentos reais (luvas NBR
 * tam. 9/10, macacão).
 */

export const SEMANAS_RECENTES = 8;
export const SEMANAS_BASE = 16;
export const SEMANAS_TENDENCIA = 8;
export const FATOR_AUMENTO = 1.5;
export const FATOR_AUMENTO_CRITICO = 2;
export const DESVIOS_PICO = 3;
export const MIN_SEMANAS_ATIVAS_BASE = 4;
export const MIN_SEMANAS_ATIVAS_RECENTES = 3;
/** Mínimo cadastrado só é "defasado" a partir de 25% abaixo do sugerido. */
export const FOLGA_MINIMO = 1.25;
/**
 * Lead time e intervalo de compra do Controle de Estoque são em dias úteis
 * (o consumo/dia de lá divide por `dias_uteis`); a semana tem 5.
 */
export const DIAS_UTEIS_SEMANA = 5;

export type TipoAlertaConsumo = 'RUPTURA' | 'MINIMO_DEFASADO' | 'AUMENTO' | 'TENDENCIA' | 'PICO';
export type GrauAlerta = 'CRITICO' | 'ATENCAO';

export const ORDEM_ALERTA: TipoAlertaConsumo[] = ['RUPTURA', 'MINIMO_DEFASADO', 'AUMENTO', 'TENDENCIA', 'PICO'];

export const ROTULO_ALERTA: Record<TipoAlertaConsumo, string> = {
  RUPTURA: 'Ruptura antes da reposição',
  MINIMO_DEFASADO: 'Estoque mínimo defasado',
  AUMENTO: 'Aumento de consumo',
  TENDENCIA: 'Virada de tendência',
  PICO: 'Pico fora do padrão',
};

export const ROTULO_CURTO_ALERTA: Record<TipoAlertaConsumo, string> = {
  RUPTURA: 'Ruptura',
  MINIMO_DEFASADO: 'Mínimo defasado',
  AUMENTO: 'Aumento',
  TENDENCIA: 'Tendência',
  PICO: 'Pico',
};

export interface AlertaConsumo {
  tipo: TipoAlertaConsumo;
  grau: GrauAlerta;
  motivo: string;
}

export interface EstoqueParaAlerta {
  saldo: number | null;
  minimo: number | null;
  leadTimeDias: number | null;
  intervaloCompraDias: number | null;
}

export interface AnaliseConsumo {
  mediaBase: number;
  mediaRecente: number;
  /** mediaRecente ÷ mediaBase; null sem base. */
  variacao: number | null;
  semanasAtivasBase: number;
  semanasAtivasRecentes: number;
  ultimaSemana: number;
  limitePico: number | null;
  inclinacaoRecente: number;
  inclinacaoAnterior: number;
  /** Ritmo usado para estoque: o maior entre a média recente e a base. */
  consumoSemanalRitmo: number;
  coberturaDiasUteis: number | null;
  minimoSugerido: number | null;
  alertas: AlertaConsumo[];
  grau: GrauAlerta | null;
}

const media = (v: number[]) => (v.length === 0 ? 0 : v.reduce((s, x) => s + x, 0) / v.length);

function desvioPadrao(v: number[]): number {
  if (v.length < 2) return 0;
  const m = media(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

/** Inclinação da reta de mínimos quadrados (unidades por semana). */
export function inclinacao(v: number[]): number {
  const n = v.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = media(v);
  let num = 0;
  let den = 0;
  v.forEach((y, x) => { num += (x - mx) * (y - my); den += (x - mx) ** 2; });
  return den === 0 ? 0 : num / den;
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: n >= 10 ? 0 : 1 });
const fmtFator = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * Analisa um material. `serie` em ordem cronológica, uma posição por semana
 * completa, semanas sem saída como zero.
 */
export function analisarConsumo(serie: number[], estoque: EstoqueParaAlerta | null, umb = ''): AnaliseConsumo {
  const recentes = serie.slice(-SEMANAS_RECENTES);
  const base = serie.slice(-(SEMANAS_RECENTES + SEMANAS_BASE), -SEMANAS_RECENTES);
  const mediaBase = media(base);
  const mediaRecente = media(recentes);
  const semanasAtivasBase = base.filter(x => x > 0).length;
  const semanasAtivasRecentes = recentes.filter(x => x > 0).length;
  const baseConfiavel = base.length >= SEMANAS_RECENTES && semanasAtivasBase >= MIN_SEMANAS_ATIVAS_BASE && mediaBase > 0;
  const variacao = mediaBase > 0 ? mediaRecente / mediaBase : null;
  const ultimaSemana = serie.length > 0 ? serie[serie.length - 1] : 0;
  // Piso de 25% da média: base muito regular tem desvio ~0 e qualquer
  // oscilação mínima viraria "pico".
  const desvio = Math.max(desvioPadrao(base), 0.25 * mediaBase);
  const limitePico = baseConfiavel ? mediaBase + DESVIOS_PICO * desvio : null;
  const inclinacaoRecente = inclinacao(serie.slice(-SEMANAS_TENDENCIA));
  const inclinacaoAnterior = inclinacao(serie.slice(-2 * SEMANAS_TENDENCIA, -SEMANAS_TENDENCIA));
  const un = umb ? ` ${umb}` : '';
  const alertas: AlertaConsumo[] = [];

  // Sinais de comportamento -------------------------------------------------
  const temAumento = baseConfiavel && semanasAtivasRecentes >= MIN_SEMANAS_ATIVAS_RECENTES && variacao !== null && variacao >= FATOR_AUMENTO;
  if (temAumento) {
    alertas.push({
      tipo: 'AUMENTO',
      grau: variacao! >= FATOR_AUMENTO_CRITICO ? 'CRITICO' : 'ATENCAO',
      motivo: `Últimas ${SEMANAS_RECENTES} semanas: ${fmt(mediaRecente)}${un}/sem., ${fmtFator(variacao!)}× a média das ${base.length} anteriores (${fmt(mediaBase)}${un}/sem.).`,
    });
  }

  const recentes8 = serie.slice(-SEMANAS_TENDENCIA);
  const crescimentoJanela = inclinacaoRecente * (SEMANAS_TENDENCIA - 1);
  if (
    baseConfiavel
    && !temAumento
    && recentes8.filter(x => x > 0).length >= SEMANAS_TENDENCIA / 2
    && inclinacaoAnterior <= 0
    && inclinacaoRecente > 0
    && crescimentoJanela >= 0.5 * mediaBase
  ) {
    alertas.push({
      tipo: 'TENDENCIA',
      grau: 'ATENCAO',
      motivo: `Consumo vinha estável ou caindo e passou a subir ~${fmt(inclinacaoRecente)}${un} por semana nas últimas ${SEMANAS_TENDENCIA}.`,
    });
  }

  if (limitePico !== null && ultimaSemana > limitePico) {
    alertas.push({
      tipo: 'PICO',
      grau: 'ATENCAO',
      motivo: `Última semana: ${fmt(ultimaSemana)}${un}, acima do padrão (até ${fmt(limitePico)}${un}).`,
    });
  }

  // Sinais de estoque ------------------------------------------------------
  // Ritmo pelo maior dos dois: num item que caiu de ritmo, a base ainda é a
  // referência prudente para mínimo e cobertura.
  const consumoSemanalRitmo = Math.max(mediaRecente, baseConfiavel ? mediaBase : 0);
  const consumoDia = consumoSemanalRitmo / DIAS_UTEIS_SEMANA;
  const lead = estoque?.leadTimeDias ?? null;
  const intervalo = estoque?.intervaloCompraDias ?? null;
  const saldo = estoque?.saldo ?? null;

  const coberturaDiasUteis = saldo !== null && consumoDia > 0 ? Math.max(0, saldo) / consumoDia : null;
  if (saldo !== null && lead !== null && consumoDia > 0 && semanasAtivasRecentes > 0) {
    if (saldo <= 0) {
      alertas.push({
        tipo: 'RUPTURA',
        grau: 'CRITICO',
        motivo: `Estoque zerado com consumo ativo (${fmt(mediaRecente)}${un}/sem. nas últimas ${SEMANAS_RECENTES} semanas).`,
      });
    } else if (coberturaDiasUteis! < lead) {
      alertas.push({
        tipo: 'RUPTURA',
        grau: 'CRITICO',
        motivo: `Saldo de ${fmt(saldo)}${un} dura ~${fmt(coberturaDiasUteis!)} dias úteis no ritmo atual; o lead time é ${fmt(lead)}.`,
      });
    }
  }

  const minimoSugerido = lead !== null && intervalo !== null && consumoDia > 0
    ? Math.ceil(consumoDia * (lead + intervalo))
    : null;
  const minimo = estoque?.minimo ?? null;
  if (minimoSugerido !== null && minimo !== null && minimoSugerido >= Math.max(1, minimo * FOLGA_MINIMO)) {
    alertas.push({
      tipo: 'MINIMO_DEFASADO',
      grau: minimo === 0 || minimoSugerido >= minimo * 2 ? 'CRITICO' : 'ATENCAO',
      motivo: `Mínimo cadastrado ${fmt(minimo)}${un}; no ritmo atual o cálculo do Controle de Estoque daria ${fmt(minimoSugerido)}${un}.`,
    });
  }

  alertas.sort((a, b) => ORDEM_ALERTA.indexOf(a.tipo) - ORDEM_ALERTA.indexOf(b.tipo));
  const grau: GrauAlerta | null = alertas.some(a => a.grau === 'CRITICO') ? 'CRITICO' : alertas.length > 0 ? 'ATENCAO' : null;

  return {
    mediaBase, mediaRecente, variacao, semanasAtivasBase, semanasAtivasRecentes, ultimaSemana, limitePico,
    inclinacaoRecente, inclinacaoAnterior, consumoSemanalRitmo, coberturaDiasUteis, minimoSugerido, alertas, grau,
  };
}

/**
 * Prioridade para ordenar a lista: o alerta mais grave do material
 * (ruptura > mínimo > aumento > tendência > pico), crítico antes de atenção,
 * e o maior aumento primeiro dentro do mesmo tipo. Menor = mais urgente.
 */
export function prioridadeAnalise(a: AnaliseConsumo): number {
  if (a.alertas.length === 0) return Number.MAX_SAFE_INTEGER;
  const primeiro = a.alertas[0];
  const grau = a.alertas.some(x => x.grau === 'CRITICO') ? 0 : 1;
  const variacao = Math.min(a.variacao ?? 0, 99);
  return ORDEM_ALERTA.indexOf(primeiro.tipo) * 1000 + grau * 100 + (99 - variacao);
}

/**
 * Quantas semanas do período estão completas: a semana que contém o último
 * lançamento da base só conta se ele for de domingo — antes disso ela está
 * pela metade (ou a MB51 ainda não foi reimportada).
 */
export function semanasCompletas(semanas: string[], ultimaData: string | null): number {
  if (!ultimaData) return 0;
  let n = 0;
  for (const s of semanas) {
    const fim = new Date(`${s}T12:00:00Z`);
    fim.setUTCDate(fim.getUTCDate() + 6);
    if (fim.toISOString().slice(0, 10) <= ultimaData) n++;
    else break;
  }
  return n;
}

/** Data (ISO) em que o saldo zera, contando dias úteis a partir de `hojeIso`. */
export function dataRuptura(coberturaDiasUteis: number | null, hojeIso: string): string | null {
  if (coberturaDiasUteis === null || !Number.isFinite(coberturaDiasUteis)) return null;
  const d = new Date(`${hojeIso}T12:00:00Z`);
  let restantes = Math.floor(coberturaDiasUteis);
  while (restantes > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6) restantes--;
  }
  return d.toISOString().slice(0, 10);
}
