/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lista de inventários separada por data (a data do inventário, não a hora
 * em que foi criado). A data é texto AAAA-MM-DD e é comparada como texto —
 * `new Date('2026-09-01')` volta como 31/08 em UTC-3.
 */

/** A data do inventário cai no intervalo [de, até] (pontas vazias = sem limite)? */
export function dataNoIntervalo(data: string, intervalo: { de: string; ate: string } | null): boolean {
  if (!intervalo) return true;
  const dia = data.slice(0, 10);
  if (intervalo.de && dia < intervalo.de) return false;
  if (intervalo.ate && dia > intervalo.ate) return false;
  return true;
}

export interface GrupoPorData<T> {
  data: string;
  rotulo: string;
  itens: T[];
}

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "Hoje · 02/11/2026", "Ontem · 01/11/2026", "Sexta · 31/10/2026". */
export function rotuloDia(data: string, hoje: string, ontem: string): string {
  const [a, m, d] = data.slice(0, 10).split('-');
  const dataBr = `${d}/${m}/${a}`;
  if (data === hoje) return `Hoje · ${dataBr}`;
  if (data === ontem) return `Ontem · ${dataBr}`;
  const semana = SEMANA[new Date(Number(a), Number(m) - 1, Number(d)).getDay()];
  return `${semana[0].toUpperCase()}${semana.slice(1)} · ${dataBr}`;
}

/** Grupos do dia mais recente para o mais antigo; dentro do dia, a ordem de entrada. */
export function agruparPorData<T extends { data: string }>(lista: T[], hoje: string, ontem: string): GrupoPorData<T>[] {
  const grupos = new Map<string, T[]>();
  for (const item of lista) {
    const dia = item.data.slice(0, 10);
    const grupo = grupos.get(dia);
    if (grupo) grupo.push(item); else grupos.set(dia, [item]);
  }
  return Array.from(grupos.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([data, itens]) => ({ data, rotulo: rotuloDia(data, hoje, ontem), itens }));
}
