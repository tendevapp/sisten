/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Série semanal de consumo e entrada por material.
 *
 * A regra que atravessa este arquivo: **semanas sem movimento aparecem como
 * zero, nunca são omitidas**. Com demanda intermitente — e 54% dos materiais
 * saem numa única semana de 25 — pular a semana vazia comprimiria o eixo e
 * faria três saídas espalhadas por seis meses parecerem três semanas seguidas
 * de consumo. O vazio é a informação principal aqui.
 *
 * Agrega sobre a MB51 já em cache (localDb.fetchMb51), sem view nova: são 22
 * mil linhas, o balde semanal é uma passada só, e manter o cálculo em TS deixa
 * a regra do zero testável.
 */

import { format, startOfISOWeek, endOfISOWeek, getISOWeek, parseISO, isValid, addWeeks } from 'date-fns';
import { MB51Classificado } from '../types';

/**
 * Início da semana ISO (segunda-feira) em `YYYY-MM-DD`.
 *
 * Usa a mesma maquinaria de `bucketDate(..., 'semana')` em lib/demandas.ts —
 * as duas telas precisam concordar sobre onde uma semana começa, senão o mesmo
 * movimento cai em semanas diferentes conforme a página aberta.
 */
export function inicioDaSemana(iso: string): string {
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return format(startOfISOWeek(d), 'yyyy-MM-dd');
}

/** Todas as semanas entre duas datas, inclusive as sem movimento. */
export function semanasDoPeriodo(inicioIso: string, fimIso: string): string[] {
  const semanas: string[] = [];
  const fim = inicioDaSemana(fimIso);
  let atual = inicioDaSemana(inicioIso);
  // Guarda contra intervalo invertido: sem ela o laço não terminaria.
  if (atual > fim) return [atual];
  while (atual <= fim) {
    semanas.push(atual);
    atual = format(addWeeks(parseISO(atual), 1), 'yyyy-MM-dd');
  }
  return semanas;
}

export interface PontoSemanal {
  semana: string;
  consumo: number;
  entrada: number;
  /** Saldo acumulado do período, para leitura de tendência. */
  acumulado: number;
  eventosConsumo: number;
}

export interface ResumoMaterial {
  material: string;
  descricao: string;
  umb: string;
  consumoTotal: number;
  entradaTotal: number;
  eventosConsumo: number;
  semanasAtivas: number;
  totalSemanas: number;
  /** Consumo por semana, alinhado a `semanasDoPeriodo`. Alimenta o sparkline. */
  serie: number[];
  ultimoConsumo: string | null;
}

interface Balde { consumo: number; entrada: number; eventos: number }

/**
 * Percorre a MB51 uma vez e devolve o período coberto mais o agregado por
 * material e semana. Transferência interna fica de fora: ela troca o material
 * de depósito sem consumir nem repor nada.
 */
function agregar(movs: MB51Classificado[]) {
  const porMaterial = new Map<string, Map<string, Balde>>();
  const meta = new Map<string, { descricao: string; umb: string; ultimo: string | null }>();
  let minData: string | null = null;
  let maxData: string | null = null;

  for (const m of movs) {
    if (!m.material || !m.data_lancamento || !m.movimenta_estoque) continue;
    const ehConsumo = m.categoria === 'consumo';
    const ehEntrada = m.categoria === 'entrada_compra' || m.categoria === 'entrada_sem_pedido';
    if (!ehConsumo && !ehEntrada) continue;

    if (!minData || m.data_lancamento < minData) minData = m.data_lancamento;
    if (!maxData || m.data_lancamento > maxData) maxData = m.data_lancamento;

    const semana = inicioDaSemana(m.data_lancamento);
    let semanas = porMaterial.get(m.material);
    if (!semanas) { semanas = new Map(); porMaterial.set(m.material, semanas); }
    let balde = semanas.get(semana);
    if (!balde) { balde = { consumo: 0, entrada: 0, eventos: 0 }; semanas.set(semana, balde); }

    const qtd = m.qtd_um_registro ?? 0;
    if (ehConsumo) {
      balde.consumo += Math.abs(qtd);
      balde.eventos += 1;
      const info = meta.get(m.material);
      if (!info || !info.ultimo || m.data_lancamento > info.ultimo) {
        meta.set(m.material, {
          descricao: info?.descricao || m.texto_breve_material?.trim() || '',
          umb: info?.umb || m.unid_medida_basica?.trim() || '',
          ultimo: m.data_lancamento,
        });
      }
    } else {
      balde.entrada += Math.abs(qtd);
    }

    if (!meta.has(m.material)) {
      meta.set(m.material, {
        descricao: m.texto_breve_material?.trim() || '',
        umb: m.unid_medida_basica?.trim() || '',
        ultimo: null,
      });
    }
  }

  return { porMaterial, meta, minData, maxData };
}

export interface BaseSemanal {
  semanas: string[];
  materiais: ResumoMaterial[];
  /** Índice para montar a série detalhada sem repassar a MB51 inteira. */
  agregado: Map<string, Map<string, Balde>>;
}

export function construirBaseSemanal(movs: MB51Classificado[]): BaseSemanal {
  const { porMaterial, meta, minData, maxData } = agregar(movs);
  if (!minData || !maxData) {
    return { semanas: [], materiais: [], agregado: porMaterial };
  }

  const semanas = semanasDoPeriodo(minData, maxData);

  const materiais: ResumoMaterial[] = [];
  porMaterial.forEach((baldes, material) => {
    const info = meta.get(material);
    let consumoTotal = 0;
    let entradaTotal = 0;
    let eventosConsumo = 0;
    let semanasAtivas = 0;

    const serie = semanas.map(s => {
      const b = baldes.get(s);
      if (!b) return 0;
      consumoTotal += b.consumo;
      entradaTotal += b.entrada;
      eventosConsumo += b.eventos;
      if (b.consumo > 0) semanasAtivas += 1;
      return b.consumo;
    });

    // Material que só teve entrada e nunca saiu não pertence a uma tela de
    // perfil de consumo — apareceria como série inteira de zeros.
    if (consumoTotal <= 0) return;

    materiais.push({
      material,
      descricao: info?.descricao || '',
      umb: info?.umb || '',
      consumoTotal,
      entradaTotal,
      eventosConsumo,
      semanasAtivas,
      totalSemanas: semanas.length,
      serie,
      ultimoConsumo: info?.ultimo ?? null,
    });
  });

  // Mais movimentado primeiro: é o material cuja série tem o que ler.
  materiais.sort((a, b) => b.consumoTotal - a.consumoTotal);

  return { semanas, materiais, agregado: porMaterial };
}

/** Série detalhada de um material, alinhada às semanas do período. */
export function serieDoMaterial(
  base: BaseSemanal,
  material: string
): PontoSemanal[] {
  const baldes = base.agregado.get(material);
  let acumulado = 0;
  return base.semanas.map(semana => {
    const b = baldes?.get(semana);
    const consumo = b?.consumo ?? 0;
    const entrada = b?.entrada ?? 0;
    acumulado += entrada - consumo;
    return { semana, consumo, entrada, acumulado, eventosConsumo: b?.eventos ?? 0 };
  });
}

/**
 * Rótulo de semana para o eixo: `W<nº da semana ISO>`.
 *
 * Mesma numeração ISO usada pelo painel de Suprimentos (lib/demandas.ts, que
 * a exibe com prefixo "S"): o número da semana é o mesmo, então "W28" aqui e
 * "S28" lá são a mesma semana do calendário.
 */
export function rotuloSemana(iso: string): string {
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return `W${getISOWeek(d)}`;
}

/** Intervalo de datas da semana (`dd/MM-dd/MM`), para o tooltip. */
export function intervaloSemana(iso: string): string {
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return `${format(startOfISOWeek(d), 'dd/MM')}-${format(endOfISOWeek(d), 'dd/MM')}`;
}

/** Média por semana ativa — a média sobre todas as semanas esconderia o pico. */
export function mediaPorSemanaAtiva(r: ResumoMaterial): number {
  return r.semanasAtivas > 0 ? r.consumoTotal / r.semanasAtivas : 0;
}
