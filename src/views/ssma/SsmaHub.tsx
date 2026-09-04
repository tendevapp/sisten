/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hub / Painel Geral de SSMA — reúne todos os formulários de Saúde, Segurança e Meio Ambiente.
 * Modelo arquitetural idêntico ao Hub da Portaria.
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  ClipboardCheck,
  Flame,
  HardHat,
  FileCheck,
  Activity,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import type { Profile, SsmaRidMetricas } from '../../types';
import { obterMetricasRid } from '../../lib/ssmaApi';
import SsmaMetricsBar from '../../components/ssma/SsmaMetricsBar';
import SsmaRidView from './SsmaRidView';
import { useToast } from '../../components/ui/Toast';

interface SsmaHubProps {
  user: Profile;
  onNavigate: (path: string) => void;
  initialTab?: string;
}

export default function SsmaHub({ user, onNavigate, initialTab = 'visao_geral' }: SsmaHubProps) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [metricas, setMetricas] = useState<SsmaRidMetricas | null>(null);

  useEffect(() => {
    obterMetricasRid().then(setMetricas).catch(console.error);
    const interval = setInterval(() => {
      obterMetricasRid().then(setMetricas).catch(console.error);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleChildNavigate = (path: string) => {
    if (path === '/formularios/ssma') {
      setActiveTab('visao_geral');
      return;
    }
    setActiveTab('visao_geral');
    onNavigate(path);
  };

  const FORMULARIOS_SSMA = [
    {
      id: 'rid',
      codigo: 'FRM.SSMA-0001',
      title: 'RID - Registro de Identificação de Desvio',
      desc: 'Identificação de desvios comportamentais e condições inseguras na fábrica, registro fotográfico e planos de ação corretiva.',
      icon: AlertTriangle,
      cor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
      badge: `${metricas?.total || 0} registrados`,
      ativo: true,
      badgeCor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    },
    {
      id: 'inspecao_5s',
      codigo: 'FRM.SSMA-0002',
      title: 'Inspeção de Segurança & 5S',
      desc: 'Checklist diário e semanal de organização, rotas de fuga, extintores, desobstrução e boas práticas de 5S no chão de fábrica.',
      icon: ClipboardCheck,
      cor: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400',
      badge: 'Em Breve',
      ativo: false,
      badgeCor: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    },
    {
      id: 'quase_acidente',
      codigo: 'FRM.SSMA-0003',
      title: 'Relato de Quase Acidente (Near Miss)',
      desc: 'Comunicação imediata de quase acidentes e situações de alto potencial de dano com intervenção preventiva rápida.',
      icon: Flame,
      cor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
      badge: 'Em Breve',
      ativo: false,
      badgeCor: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    },
    {
      id: 'epi',
      codigo: 'FRM.SSMA-0004',
      title: 'Auditoria & Inspeção de EPI',
      desc: 'Acompanhamento do uso correto de EPIs por setor, estado de conservação, CA válido e controle de entrega.',
      icon: HardHat,
      cor: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400',
      badge: 'Em Breve',
      ativo: false,
      badgeCor: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    },
    {
      id: 'permissao_trabalho',
      codigo: 'FRM.SSMA-0005',
      title: 'Permissão de Trabalho (PT / APR)',
      desc: 'Liberação formal e análise preliminar de risco para trabalhos em altura, espaço confinado, a quente e eletricidade.',
      icon: FileCheck,
      cor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400',
      badge: 'Em Breve',
      ativo: false,
      badgeCor: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    },
    {
      id: 'incidente',
      codigo: 'FRM.SSMA-0006',
      title: 'Comunicação Preliminar de Incidente (CPI)',
      desc: 'Abertura oficial de ocorrência com primeiros socorros, danos materiais ou ambientais para investigação formal.',
      icon: Activity,
      cor: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
      badge: 'Em Breve',
      ativo: false,
      badgeCor: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    },
  ];

  // Se a aba for RID, exibe a subpágina completa do formulário
  if (activeTab === 'rid') {
    return <SsmaRidView user={user} onNavigate={handleChildNavigate} />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => onNavigate('/formularios')}
          className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700 hover:shadow-sm active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
          <span>Voltar para Módulos de Formulários</span>
        </button>

        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-500/20">
            <ShieldAlert className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
              Módulo de SSMA — Saúde, Segurança & Meio Ambiente
            </h1>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Painel operacional dos formulários padrão TEN (Torres Eólicas do Nordeste)
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Bar */}
      <SsmaMetricsBar metricas={metricas} onSelectTab={(tab) => tab === 'rid' && setActiveTab('rid')} />

      {/* Forms Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FORMULARIOS_SSMA.map((form) => {
          const Icon = form.icon;
          return (
            <button
              key={form.id}
              type="button"
              onClick={() => {
                if (form.ativo) {
                  setActiveTab(form.id);
                } else {
                  toast.info(`O formulário ${form.title} está em fase de homologação.`);
                }
              }}
              className={`group flex flex-col items-start justify-between rounded-2xl border p-5 text-left transition-all duration-200 ${
                form.ativo
                  ? 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-slate-900/5 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-400/40 cursor-pointer'
                  : 'border-slate-200/60 bg-slate-50/50 opacity-80 hover:opacity-100 hover:border-slate-300 dark:border-slate-800/60 dark:bg-slate-900/40 cursor-pointer'
              }`}
            >
              <div className="w-full">
                <div className="flex w-full items-center justify-between">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${form.cor}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {form.codigo}
                  </span>
                </div>

                <h3
                  className={`mt-3.5 text-base font-bold transition-colors ${
                    form.ativo
                      ? 'text-slate-900 group-hover:text-emerald-700 dark:text-slate-100 dark:group-hover:text-emerald-400'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
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

                {form.ativo ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 transition-transform group-hover:translate-x-1 dark:text-emerald-400">
                    Acessar
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                    <Sparkles className="h-3 w-3" />
                    Planejado
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
