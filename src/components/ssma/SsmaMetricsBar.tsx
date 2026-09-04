/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Barra de Métricas do Módulo de SSMA — exibe os principais indicadores de segurança e desvios.
 */

import React from 'react';
import { ShieldAlert, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import type { SsmaRidMetricas } from '../../types';

interface SsmaMetricsBarProps {
  metricas: SsmaRidMetricas | null;
  onSelectTab?: (tab: string) => void;
  activeTab?: string;
}

export default function SsmaMetricsBar({ metricas, onSelectTab, activeTab }: SsmaMetricsBarProps) {
  if (!metricas) return null;

  const cards = [
    {
      id: 'rid',
      label: 'Total de Desvios (RID)',
      sub: 'Registros no sistema',
      val: metricas.total,
      icon: ShieldAlert,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      border: 'border-emerald-200/70 dark:border-emerald-800/40',
    },
    {
      id: 'sanados',
      label: 'Sanados no Ato',
      sub: `${metricas.taxaResolucaoImediata}% resolvidos no local`,
      val: metricas.sanadosImediato,
      icon: CheckCircle2,
      color: 'text-teal-600 dark:text-teal-400',
      bg: 'bg-teal-50 dark:bg-teal-950/40',
      border: 'border-teal-200/70 dark:border-teal-800/40',
    },
    {
      id: 'pendentes',
      label: 'Aguardando Ação',
      sub: 'Necessitam plano corretivo',
      val: metricas.pendentesTratamento,
      icon: Clock,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      border: 'border-amber-200/70 dark:border-amber-800/40',
    },
    {
      id: 'semana',
      label: 'Registros na Semana',
      sub: 'Movimentação recente',
      val: metricas.totalEstaSemana,
      icon: TrendingUp,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      border: 'border-blue-200/70 dark:border-blue-800/40',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        const isClickable = !!onSelectTab;
        const isSelected = activeTab === c.id;

        return (
          <button
            key={c.id}
            type="button"
            disabled={!isClickable}
            onClick={() => onSelectTab && onSelectTab(c.id)}
            className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-all ${c.bg} ${c.border} ${
              isClickable ? 'hover:-translate-y-0.5 hover:shadow-md cursor-pointer' : 'cursor-default'
            } ${isSelected ? 'ring-2 ring-emerald-500 shadow-md' : ''}`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {c.label}
              </span>
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-white/80 dark:bg-slate-900/80 shadow-2xs ${c.color}`}>
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {c.val}
            </div>
            <span className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {c.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}
