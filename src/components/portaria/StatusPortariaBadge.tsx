/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface StatusPortariaBadgeProps {
  status: string;
  className?: string;
}

const LABELS: Record<string, string> = {
  // Equipamentos
  NO_PATIO: 'No Pátio',
  DEVOLVIDO: 'Devolvido',
  RETIDO: 'Retido',
  
  // Transportes & Carretas
  DESCARREGANDO: 'Descarregando',
  LIBERADO: 'Liberado',
  FINALIZADO: 'Finalizado',
  
  // Relatório
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDO: 'Concluído',
  PASSADO: 'Passado',
  
  // Briefing
  ABERTA: 'Aberta',
  
  // Comum
  CANCELADO: 'Cancelado',
};

const STYLES: Record<string, string> = {
  NO_PATIO: 'bg-blue-50 text-blue-700 border-blue-200/60 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/50',
  DESCARREGANDO: 'bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/50',
  EM_ANDAMENTO: 'bg-indigo-50 text-indigo-700 border-indigo-200/60 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800/50',
  ABERTA: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50',
  
  DEVOLVIDO: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50',
  LIBERADO: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50',
  FINALIZADO: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  CONCLUIDO: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  PASSADO: 'bg-purple-50 text-purple-700 border-purple-200/60 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/50',
  
  RETIDO: 'bg-rose-50 text-rose-700 border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/50',
  CANCELADO: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900',
};

export default function StatusPortariaBadge({ status, className = '' }: StatusPortariaBadgeProps) {
  const label = LABELS[status] || status;
  const style = STYLES[status] || 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${style} ${className}`}
    >
      {label}
    </span>
  );
}
