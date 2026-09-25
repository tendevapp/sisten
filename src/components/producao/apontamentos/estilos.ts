/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Classes Tailwind repetidas nas telas de Apontamentos — mesmo visual dos
 * Lançamentos de Produção.
 */

export const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export const labelCls = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400';

export const btnPrimario =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';

export const btnSecundario =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800';

export const btnPerigo =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-50';

export const cardCls = 'rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';

export const msgErro = (e: unknown, padrao: string): string => (e instanceof Error ? e.message : padrao);
