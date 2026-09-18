/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hub / Painel Geral do módulo Qualidade — reúne os formulários e
 * ferramentas de gestão da qualidade. Mesmo modelo arquitetural dos hubs de
 * Portaria e SSMA: um grid de cartões, cada um abrindo um formulário/tela do
 * módulo.
 */

import React, { useEffect, useState } from 'react';
import { ClipboardCheck, ArrowRight, Target, AlertTriangle } from 'lucide-react';
import type { Profile, QuaRncMetricas } from '../../types';
import { obterMetricasRnc } from '../../lib/qualidadeApi';

interface QualidadeHubProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function QualidadeHub({ onNavigate }: QualidadeHubProps) {
  const [metricas, setMetricas] = useState<QuaRncMetricas | null>(null);

  useEffect(() => {
    obterMetricasRnc().then(setMetricas).catch(() => {});
  }, []);

  const FORMULARIOS_QUALIDADE = [
    {
      id: 'rnc',
      codigo: 'FRM.QUA-0026',
      title: 'RNC - Relatório de Não Conformidade',
      desc: 'Abertura de não conformidades, plano de ação com prazos e responsáveis, anexos e relatórios individuais ou consolidados em PDF.',
      icon: ClipboardCheck,
      cor: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
      badge: `${metricas?.total ?? 0} registradas`,
      badgeCor: 'bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200 dark:border-rose-800',
      path: '/qualidade/rnc',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-sm shadow-rose-500/20">
            <ClipboardCheck className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
              Módulo de Qualidade
            </h1>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Gestão de não conformidades, planos de ação e relatórios da TEN (Torres Eólicas do Nordeste)
            </p>
          </div>
        </div>
      </div>

      {/* Métricas rápidas */}
      {metricas && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total de RNCs</span>
            <p className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-slate-100">{metricas.total}</p>
          </div>
          <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 shadow-2xs dark:border-amber-900/40 dark:bg-amber-950/20">
            <span className="text-amber-700 dark:text-amber-400 text-xs font-bold uppercase tracking-wider">Abertas</span>
            <p className="mt-1 font-display text-2xl font-bold text-amber-600 dark:text-amber-400">{metricas.abertas}</p>
          </div>
          <div className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-4 shadow-2xs dark:border-blue-900/40 dark:bg-blue-950/20">
            <span className="text-blue-700 dark:text-blue-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
              <Target className="h-3.5 w-3.5" /> Em Tratamento
            </span>
            <p className="mt-1 font-display text-2xl font-bold text-blue-600 dark:text-blue-400">{metricas.emTratamento}</p>
          </div>
          <div className="rounded-2xl border border-rose-200/80 bg-rose-50/40 p-4 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/20">
            <span className="text-rose-700 dark:text-rose-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Atividades Atrasadas
            </span>
            <p className="mt-1 font-display text-2xl font-bold text-rose-600 dark:text-rose-400">{metricas.atividadesAtrasadas}</p>
          </div>
        </div>
      )}

      {/* Grid de formulários */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FORMULARIOS_QUALIDADE.map((form) => {
          const Icon = form.icon;
          return (
            <button
              key={form.id}
              type="button"
              onClick={() => onNavigate(form.path)}
              className="group flex flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-500/50 hover:shadow-lg hover:shadow-slate-900/5 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:hover:border-rose-400/40 cursor-pointer"
            >
              <div className="w-full">
                <div className="flex w-full items-center justify-between gap-1">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${form.cor}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {form.codigo}
                  </span>
                </div>

                <h3 className="mt-3.5 text-base font-bold text-slate-900 group-hover:text-rose-700 transition-colors dark:text-slate-100 dark:group-hover:text-rose-400">
                  {form.title}
                </h3>

                <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {form.desc}
                </p>
              </div>

              <div className="mt-5 flex w-full items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${form.badgeCor}`}>
                  {form.badge}
                </span>

                <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 transition-transform group-hover:translate-x-1 dark:text-rose-400">
                  Acessar
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
