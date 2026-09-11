/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Financeiro > Faturamento GW Jacobina — agregações do relatório de parede.
 *
 * Funções puras, sem React e sem Supabase: o painel da TV só formata o que sai
 * daqui, e o cálculo fica testável sem montar componente.
 *
 * O estado de um tramo é um funil de três passos, não três categorias soltas:
 * `pendente` → `faturado` (NF emitida) → `expedido` (saiu da fábrica). Quem lê
 * a parede quer saber onde a torre parou, então o estado é sempre o passo mais
 * avançado que o registro alcançou.
 */

import type { FinFatGwjaco } from '../types';

export type EstadoTramo = 'expedido' | 'faturado' | 'pendente';

export const TRAMOS_ORDEM = ['T1', 'T2', 'T3', 'T4', 'T5'] as const;

/**
 * Semana ISO-8601 de uma data `YYYY-MM-DD`.
 *
 * Monta a data em UTC a partir da string fatiada em vez de `new Date(iso)`:
 * `new Date('2026-09-01')` volta como 31/08 em UTC-3 e jogaria a virada de
 * semana um dia para trás. Confere com a numeração que o time já usa na
 * planilha (31/08/2026 = semana 36, 13/08/2026 = semana 33).
 */
export function semanaISO(dataISO: string): number | null {
  const partes = dataISO.slice(0, 10).split('-');
  if (partes.length !== 3) return null;
  const [ano, mes, dia] = partes.map(Number);
  if (!ano || !mes || !dia) return null;

  const data = new Date(Date.UTC(ano, mes - 1, dia));
  // Quinta-feira da mesma semana define o ano ISO a que a semana pertence.
  const diaSemana = (data.getUTCDay() + 6) % 7; // segunda = 0
  data.setUTCDate(data.getUTCDate() - diaSemana + 3);
  const primeiraQuinta = new Date(Date.UTC(data.getUTCFullYear(), 0, 4));
  const deslocamento = (primeiraQuinta.getUTCDay() + 6) % 7;
  primeiraQuinta.setUTCDate(primeiraQuinta.getUTCDate() - deslocamento + 3);
  return 1 + Math.round((data.getTime() - primeiraQuinta.getTime()) / (7 * 24 * 3600 * 1000));
}

export function estadoTramo(linha: FinFatGwjaco): EstadoTramo {
  if (linha.data_expedido) return 'expedido';
  if (linha.data_faturado) return 'faturado';
  return 'pendente';
}

/**
 * Semana do faturamento: o que foi digitado manda, porque é o número que o
 * cliente usa na cobrança. Sem ele, deriva da data para a linha não sumir do
 * gráfico semanal.
 */
export function semanaDaLinha(linha: FinFatGwjaco): number | null {
  if (linha.semana_faturamento != null) return linha.semana_faturamento;
  if (linha.data_faturado) return semanaISO(linha.data_faturado);
  return null;
}

export interface ResumoFaturamento {
  total: number;
  faturados: number;
  expedidos: number;
  pendentes: number;
  /** Faturados sobre o total, 0–100, arredondado. */
  percentual: number;
  /** Torres com pelo menos um tramo faturado. */
  torresIniciadas: number;
  /** Torres com os 5 tramos faturados. */
  torresConcluidas: number;
  totalTorres: number;
  /** Faturados na semana passada como referência (`semanaAtual`). */
  naSemana: number;
  ultimaNota: FinFatGwjaco | null;
}

export function resumoFaturamento(linhas: FinFatGwjaco[], semanaAtual?: number | null): ResumoFaturamento {
  const faturados = linhas.filter((l) => l.data_faturado);
  const expedidos = linhas.filter((l) => l.data_expedido);

  const porTorre = new Map<number, FinFatGwjaco[]>();
  for (const l of linhas) {
    const atual = porTorre.get(l.torre_numero);
    if (atual) atual.push(l);
    else porTorre.set(l.torre_numero, [l]);
  }

  let torresIniciadas = 0;
  let torresConcluidas = 0;
  for (const tramos of porTorre.values()) {
    const comNf = tramos.filter((t) => t.data_faturado).length;
    if (comNf > 0) torresIniciadas += 1;
    if (comNf === tramos.length) torresConcluidas += 1;
  }

  const ordenadasPorData = faturados
    .slice()
    .sort((a, b) => (b.data_faturado ?? '').localeCompare(a.data_faturado ?? ''));

  return {
    total: linhas.length,
    faturados: faturados.length,
    expedidos: expedidos.length,
    pendentes: linhas.length - faturados.length,
    percentual: linhas.length ? Math.round((faturados.length / linhas.length) * 100) : 0,
    torresIniciadas,
    torresConcluidas,
    totalTorres: porTorre.size,
    naSemana: semanaAtual == null ? 0 : faturados.filter((l) => semanaDaLinha(l) === semanaAtual).length,
    ultimaNota: ordenadasPorData[0] ?? null,
  };
}

export interface CelulaMatriz {
  torre: number;
  tramo: string;
  serie: number | null;
  estado: EstadoTramo;
  restricao: boolean;
  notaFiscal: string | null;
  dataFaturado: string | null;
}

export interface MatrizTorreTramo {
  torres: number[];
  /** Uma linha por tramo (T1 em cima), na ordem de `TRAMOS_ORDEM`. */
  linhas: { tramo: string; celulas: (CelulaMatriz | null)[] }[];
}

/**
 * Matriz torre × tramo — a visão que a planilha original não dá: numa olhada
 * se vê que as torres 1 a 4 andaram e as 7 em diante estão intocadas.
 * Célula ausente (torre cadastrada sem aquele tramo) vem como `null`.
 */
export function matrizTorreTramo(linhas: FinFatGwjaco[]): MatrizTorreTramo {
  const torres = [...new Set(linhas.map((l) => l.torre_numero))].sort((a, b) => a - b);
  const indice = new Map<string, FinFatGwjaco>();
  for (const l of linhas) indice.set(`${l.torre_numero}|${l.tramo}`, l);

  return {
    torres,
    linhas: TRAMOS_ORDEM.map((tramo) => ({
      tramo,
      celulas: torres.map((torre) => {
        const l = indice.get(`${torre}|${tramo}`);
        if (!l) return null;
        return {
          torre,
          tramo,
          serie: l.serie,
          estado: estadoTramo(l),
          restricao: Boolean(l.restricao),
          notaFiscal: l.nota_fiscal,
          dataFaturado: l.data_faturado,
        };
      }),
    })),
  };
}

/** Um tramo dentro da barra da semana — vira um segmento identificável. */
export interface TramoNaSemana {
  id: string;
  serie: number | null;
  torre: number;
  tramo: string;
  restricao: boolean;
  notaFiscal: string | null;
}

export interface PontoSemana {
  semana: number;
  rotulo: string;
  faturados: number;
  comRestricao: number;
  ehAtual: boolean;
  /** Os tramos da semana, do menor para o maior seq. */
  tramos: TramoNaSemana[];
}

/**
 * Faturados por semana, só das semanas com movimento, limitado às `limite`
 * mais recentes — a parede mostra ritmo recente, não o histórico inteiro.
 *
 * Devolve os tramos, não só a contagem: na parede cada barra é empilhada num
 * segmento por tramo, com o seq impresso dentro, então quem olha vê o volume
 * da semana e *quais* tramos a compõem no mesmo lugar.
 */
export function faturadosPorSemana(
  linhas: FinFatGwjaco[],
  semanaAtual?: number | null,
  limite = 12,
): PontoSemana[] {
  const porSemana = new Map<number, TramoNaSemana[]>();
  for (const l of linhas) {
    if (!l.data_faturado) continue;
    const semana = semanaDaLinha(l);
    if (semana == null) continue;
    const item: TramoNaSemana = {
      id: l.id,
      serie: l.serie,
      torre: l.torre_numero,
      tramo: l.tramo,
      restricao: Boolean(l.restricao),
      notaFiscal: l.nota_fiscal,
    };
    const atual = porSemana.get(semana);
    if (atual) atual.push(item);
    else porSemana.set(semana, [item]);
  }

  return [...porSemana.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-limite)
    .map(([semana, tramos]) => ({
      semana,
      rotulo: `S${semana}`,
      faturados: tramos.length,
      comRestricao: tramos.filter((t) => t.restricao).length,
      ehAtual: semana === semanaAtual,
      tramos: tramos.slice().sort((a, b) => (a.serie ?? 0) - (b.serie ?? 0)),
    }));
}

export interface PontoTramo {
  tramo: string;
  faturados: number;
  expedidos: number;
  total: number;
}

export function faturadosPorTramo(linhas: FinFatGwjaco[]): PontoTramo[] {
  return TRAMOS_ORDEM.map((tramo) => {
    const doTramo = linhas.filter((l) => l.tramo === tramo);
    return {
      tramo,
      faturados: doTramo.filter((l) => l.data_faturado).length,
      expedidos: doTramo.filter((l) => l.data_expedido).length,
      total: doTramo.length,
    };
  });
}

/** Últimas notas emitidas, da mais recente para a mais antiga. */
export function ultimasNotas(linhas: FinFatGwjaco[], limite = 6): FinFatGwjaco[] {
  return linhas
    .filter((l) => l.data_faturado && l.nota_fiscal)
    .sort((a, b) => {
      const porData = (b.data_faturado ?? '').localeCompare(a.data_faturado ?? '');
      if (porData !== 0) return porData;
      // Empate no dia: a NF maior é a mais recente.
      return (b.nota_fiscal ?? '').localeCompare(a.nota_fiscal ?? '', 'pt-BR', { numeric: true });
    })
    .slice(0, limite);
}
