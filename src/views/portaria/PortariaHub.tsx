/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hub / Painel Geral da Portaria — reúne todos os formulários e o acompanhamento do pátio ao vivo.
 */

import React, { useState, useEffect } from 'react';
import {
  DoorOpen, Wrench, Bus, Truck, ClipboardList, ShieldCheck,
  ArrowRight, Activity, Clock
} from 'lucide-react';
import type { Profile } from '../../types';
import * as api from '../../lib/portariaApi';
import type { PortariaMetricas } from '../../lib/portariaApi';
import PortariaMetricsBar from '../../components/portaria/PortariaMetricsBar';
import PortariaEquipamentos from './PortariaEquipamentos';
import PortariaTransportes from './PortariaTransportes';
import PortariaCarretas from './PortariaCarretas';
import PortariaRelatorio from './PortariaRelatorio';
import PortariaBriefing from './PortariaBriefing';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
  initialTab?: string;
}

export default function PortariaHub({ user, onNavigate, initialTab = 'visao_geral' }: Props) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [metricas, setMetricas] = useState<PortariaMetricas | null>(null);

  useEffect(() => {
    api.obterMetricasPortaria().then(setMetricas).catch(console.error);
    const interval = setInterval(() => {
      api.obterMetricasPortaria().then(setMetricas).catch(console.error);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const FORMULARIOS_PORTARIA = [
    {
      id: 'equipamentos',
      codigo: 'FRM.SGP-0011',
      title: 'Controle de Equipamento e Ferramentas de Terceiros',
      desc: 'Entrada e devolução de máquinas, ferramentas e instrumentos de terceirizados e prestadores de serviço.',
      icon: Wrench,
      cor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
      badge: `${metricas?.equipamentosNoPatio || 0} no pátio`,
    },
    {
      id: 'transportes',
      codigo: 'FRM.SGP-0009',
      title: 'Registro de Chegada de Transportes',
      desc: 'Controle diário de chegadas e saídas de vans, carros, ônibus e caminhões por turno.',
      icon: Bus,
      cor: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400',
      badge: `${metricas?.transportesNoPatio || 0} no pátio`,
    },
    {
      id: 'carretas',
      codigo: 'FRM.SGP-0020',
      title: 'Controle de Chegada e Saída de Carretas de Chapas',
      desc: 'Recebimento de aço para produção, conferência de cavalo, carreta, motorista e nota fiscal.',
      icon: Truck,
      cor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-400',
      badge: `${metricas?.carretasNoPatio || 0} ativas`,
    },
    {
      id: 'relatorio',
      codigo: 'FRM.SGP-0010',
      title: 'Relatório de Portaria & Ocorrências',
      desc: 'Livro de plantão digital, registro de rondas patrimoniais, ocorrências e passagem de turno.',
      icon: ClipboardList,
      cor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400',
      badge: `${metricas?.relatoriosEmAberto || 0} aberto`,
    },
    {
      id: 'briefing',
      codigo: 'FRM.SGP-0013',
      title: 'Lista de Presença — Briefing de Segurança',
      desc: 'Registro de integração, validação de CPF e coleta de assinatura digital do termo de responsabilidade.',
      icon: ShieldCheck,
      cor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
      badge: `${metricas?.briefingsHoje || 0} hoje`,
    },
  ];

  if (activeTab === 'equipamentos') {
    return <PortariaEquipamentos user={user} onNavigate={onNavigate} />;
  }
  if (activeTab === 'transportes') {
    return <PortariaTransportes user={user} onNavigate={onNavigate} />;
  }
  if (activeTab === 'carretas') {
    return <PortariaCarretas user={user} onNavigate={onNavigate} />;
  }
  if (activeTab === 'relatorio') {
    return <PortariaRelatorio user={user} onNavigate={onNavigate} />;
  }
  if (activeTab === 'briefing') {
    return <PortariaBriefing user={user} onNavigate={onNavigate} />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => onNavigate('/formularios')}
          className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400"
        >
          ← Voltar para Todos os Formulários
        </button>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-500/20">
            <DoorOpen className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
              Módulo de Portaria & Segurança Patrimonial
            </h1>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Painel operacional dos formulários padrão TEN (Torres Eólicas do Nordeste)
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Bar */}
      <PortariaMetricsBar metricas={metricas} onSelectTab={setActiveTab} />

      {/* Forms Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FORMULARIOS_PORTARIA.map((form) => {
          const Icon = form.icon;
          return (
            <button
              key={form.id}
              type="button"
              onClick={() => setActiveTab(form.id)}
              className="group flex flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-500/50 hover:shadow-lg hover:shadow-slate-900/5 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-400/40"
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
                <h3 className="mt-3.5 text-base font-bold text-slate-900 group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400">
                  {form.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {form.desc}
                </p>
              </div>

              <div className="mt-5 flex w-full items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {form.badge}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 transition-transform group-hover:translate-x-1 dark:text-blue-400">
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
