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
 * Ordem dos tramos na matriz visual de avanço de torre.
 * A torre é montada da base para o topo: T5 no topo (em cima) e T1 na base (embaixo).
 */
export const TRAMOS_MATRIZ_ORDEM = ['T5', 'T4', 'T3', 'T2', 'T1'] as const;

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
  /** Faturados no mês passado como referência (`mesAtual`, formato YYYY-MM). */
  noMes: number;
  ultimaNota: FinFatGwjaco | null;
}

export type ModoMatrizFaturamento = 'cadastro' | 'sequencial';

export function resumoFaturamento(
  linhas: FinFatGwjaco[],
  semanaAtual?: number | null,
  mesAtual?: string | null,
  modo: ModoMatrizFaturamento = 'cadastro',
): ResumoFaturamento {
  const faturados = linhas.filter((l) => l.data_faturado);
  const expedidos = linhas.filter((l) => l.data_expedido);

  const torres = [...new Set(linhas.map((l) => l.torre_numero))].sort((a, b) => a - b);
  const totalTorres = torres.length;

  let torresIniciadas = 0;
  let torresConcluidas = 0;

  if (modo === 'cadastro') {
    const porTorre = new Map<number, FinFatGwjaco[]>();
    for (const l of linhas) {
      const atual = porTorre.get(l.torre_numero);
      if (atual) atual.push(l);
      else porTorre.set(l.torre_numero, [l]);
    }

    for (const tramos of porTorre.values()) {
      const comNfOuExp = tramos.filter((t) => t.data_faturado || t.data_expedido).length;
      if (comNfOuExp > 0) torresIniciadas += 1;
      if (comNfOuExp === tramos.length && tramos.length > 0) torresConcluidas += 1;
    }
  } else {
    // Tramos presentes na base
    const tramosUnicos = [...new Set(linhas.map((l) => l.tramo))];
    const tramosAlvo = tramosUnicos.length > 0 && tramosUnicos.length < 5
      ? tramosUnicos
      : (TRAMOS_ORDEM as readonly string[]);

    // Para cada tipo de tramo, contagem de expedidos + faturados
    const contagemPorTramo = tramosAlvo.map((t) =>
      linhas.filter((l) => l.tramo === t && (l.data_expedido || l.data_faturado)).length,
    );

    for (let i = 0; i < totalTorres; i++) {
      const tramosDaTorre = contagemPorTramo.filter((cnt) => cnt > i).length;
      if (tramosDaTorre > 0) torresIniciadas += 1;
      if (tramosDaTorre === tramosAlvo.length && tramosAlvo.length > 0) torresConcluidas += 1;
    }
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
    totalTorres,
    naSemana: semanaAtual == null ? 0 : faturados.filter((l) => semanaDaLinha(l) === semanaAtual).length,
    noMes: mesAtual == null ? 0 : faturados.filter((l) => l.data_faturado?.slice(0, 7) === mesAtual).length,
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
  linha?: FinFatGwjaco | null;
}

export interface MatrizTorreTramo {
  torres: number[];
  /** Uma linha por tramo (T5 em cima, T1 embaixo), na ordem de `TRAMOS_MATRIZ_ORDEM`. */
  linhas: { tramo: string; celulas: (CelulaMatriz | null)[] }[];
}

/**
 * Matriz torre × tramo.
 * - Modo 'cadastro' (padrão no módulo Financeiro): cada coluna corresponde estritamente
 *   à torre física cadastrada (torre_numero) e ao seu respectivo tramo cadastrado.
 * - Modo 'sequencial' (padrão na visão Geral/Relatórios): visão de avanço sequencial,
 *   agrupando os tramos preenchidos (expedidos e faturados) para preencher as torres
 *   da esquerda para a direita.
 *
 * Tramos ordenados do topo para a base (T5 -> T1) para refletir a torre física.
 */
export function matrizTorreTramo(
  linhas: FinFatGwjaco[],
  modo: ModoMatrizFaturamento = 'cadastro',
): MatrizTorreTramo {
  const torres = [...new Set(linhas.map((l) => l.torre_numero))].sort((a, b) => a - b);

  if (modo === 'cadastro') {
    const indice = new Map<string, FinFatGwjaco>();
    for (const l of linhas) indice.set(`${l.torre_numero}|${l.tramo}`, l);

    return {
      torres,
      linhas: TRAMOS_MATRIZ_ORDEM.map((tramo) => ({
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
            linha: l,
          };
        }),
      })),
    };
  }

  return {
    torres,
    linhas: TRAMOS_MATRIZ_ORDEM.map((tramo) => {
      const doTramo = linhas.filter((l) => l.tramo === tramo);

      // Prioriza expedidos primeiro, depois faturados, e por fim pendentes.
      // Dentro de cada grupo, ordena por serie crescente (ou torre_numero).
      const ordenados = doTramo.slice().sort((a, b) => {
        const pesoEstado = (l: FinFatGwjaco) => {
          if (l.data_expedido) return 0;
          if (l.data_faturado) return 1;
          return 2;
        };
        const pA = pesoEstado(a);
        const pB = pesoEstado(b);
        if (pA !== pB) return pA - pB;

        if (a.serie != null && b.serie != null && a.serie !== b.serie) {
          return a.serie - b.serie;
        }
        return a.torre_numero - b.torre_numero;
      });

      return {
        tramo,
        celulas: torres.map((torre, colIdx) => {
          const l = ordenados[colIdx];
          if (!l) return null;
          return {
            torre,
            tramo,
            serie: l.serie,
            estado: estadoTramo(l),
            restricao: Boolean(l.restricao),
            notaFiscal: l.nota_fiscal,
            dataFaturado: l.data_faturado,
            linha: l,
          };
        }),
      };
    }),
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

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** `2026-09` → `Set/26`. */
export function rotuloMes(mesISO: string): string {
  const [ano, mes] = mesISO.split('-').map(Number);
  if (!ano || !mes || mes < 1 || mes > 12) return mesISO;
  return `${MESES_ABREV[mes - 1]}/${String(ano).slice(-2)}`;
}

export interface PontoMes {
  mes: string; // YYYY-MM
  rotulo: string;
  faturados: number;
  ehAtual: boolean;
}

/**
 * Faturados por mês civil de `data_faturado` — visão padrão da parede, o
 * recorte que a diretoria acompanha. Mês vem sempre da data, nunca da semana
 * digitada: mês não é campo do formulário, então não tem "o que a pessoa
 * quis dizer" para respeitar como em `semanaDaLinha`.
 */
export function faturadosPorMes(
  linhas: FinFatGwjaco[],
  mesAtual?: string | null,
  limite = 12,
): PontoMes[] {
  const contagem = new Map<string, number>();
  for (const l of linhas) {
    if (!l.data_faturado) continue;
    const mes = l.data_faturado.slice(0, 7);
    if (mes.length !== 7) continue;
    contagem.set(mes, (contagem.get(mes) ?? 0) + 1);
  }

  return [...contagem.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-limite)
    .map(([mes, faturados]) => ({
      mes,
      rotulo: rotuloMes(mes),
      faturados,
      ehAtual: mes === mesAtual,
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
