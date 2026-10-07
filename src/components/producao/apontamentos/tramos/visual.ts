/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cores por etapa do tramo — as mesmas dos cilindros do Controle de Entrega
 * (CONFIG_CATEGORIAS), para a fábrica reconhecer a etapa pela cor nas duas telas.
 */

import type { EtapaTramo, FaixaEspera } from '../../../../lib/producaoTramos';

export const COR_ETAPA: Record<EtapaTramo, { fundo: string; texto: string; borda: string }> = {
  corte: { fundo: '#e2e8f0', texto: '#334155', borda: '#cbd5e1' },
  nav01: { fundo: '#fdba74', texto: '#7c2d12', borda: '#fb923c' },
  nav02: { fundo: '#38bdf8', texto: '#082f49', borda: '#0284c7' },
  jato: { fundo: '#facc15', texto: '#713f12', borda: '#eab308' },
  patio: { fundo: '#4ade80', texto: '#14532d', borda: '#22c55e' },
  expedido: { fundo: '#27272a', texto: '#fafafa', borda: '#09090b' },
};

export const CLASSE_FAIXA: Record<FaixaEspera, string> = {
  normal: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  alerta: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  critico: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
};

export const fmtNum = (v: number | null | undefined, casas = 0): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

export const fmtPct = (v: number): string => `${Math.round(v * 100)}%`;
