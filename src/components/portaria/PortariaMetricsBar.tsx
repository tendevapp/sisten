/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Wrench, Bus, Truck, ClipboardList, ShieldCheck } from 'lucide-react';
import type { PortariaMetricas } from '../../lib/portariaApi';

interface PortariaMetricsBarProps {
  metricas: PortariaMetricas | null;
  onSelectTab?: (tab: string) => void;
  activeTab?: string;
}

export default function PortariaMetricsBar({ metricas, onSelectTab, activeTab }: PortariaMetricsBarProps) {
  if (!metricas) return null;

  const cards = [
    {
      id: 'equipamentos',
      label: 'Equipamentos Terceiros',
      sub: 'No pátio para devolução',
      val: metricas.equipamentosNoPatio,
      icon: Wrench,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      border: 'border-amber-200/70 dark:border-amber-800/40',
    },
    {
      id: 'transportes',
      label: 'Transportes / Vans',
      sub: 'Veículos no pátio agora',
      val: metricas.transportesNoPatio,
      icon: Bus,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      border: 'border-blue-200/70 dark:border-blue-800/40',
    },
    {
      id: 'carretas',
      label: 'Carretas de Chapas',
      sub: 'Recebimento de aço ativo',
      val: metricas.carretasNoPatio,
      icon: Truck,
      color: 'text-cyan-600 dark:text-cyan-400',
      bg: 'bg-cyan-50 dark:bg-cyan-950/40',
      border: 'border-cyan-200/70 dark:border-cyan-800/40',
    },
    {
      id: 'relatorios',
      label: 'Livro de Plantão',
      sub: 'Relatórios em andamento',
      val: metricas.relatoriosEmAberto,
      icon: ClipboardList,
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-950/40',
      border: 'border-indigo-200/70 dark:border-indigo-800/40',
    },
    {
      id: 'briefings',
      label: 'Briefing Segurança',
      sub: 'Integrados hoje',
      val: metricas.briefingsHoje,
      icon: ShieldCheck,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      border: 'border-emerald-200/70 dark:border-emerald-800/40',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => {
        const Icon = c.icon;
        const isSelected = activeTab === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectTab?.(c.id)}
            className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
              isSelected
                ? 'ring-2 ring-blue-500 bg-white dark:bg-slate-800 border-transparent shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.bg} ${c.color}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">{c.val}</span>
            </div>
            <h4 className="mt-2.5 text-xs font-bold text-slate-900 dark:text-slate-100">{c.label}</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">{c.sub}</p>
          </button>
        );
      })}
    </div>
  );
}
