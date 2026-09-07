/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hub / Painel Geral da Portaria — reúne todos os formulários e o acompanhamento do pátio ao vivo.
 */

import React, { useState, useEffect } from 'react';
import {
  DoorOpen, Wrench, Bus, Truck, ClipboardList, ShieldCheck,
  ArrowRight, ArrowLeft, Activity, Clock,
  HelpCircle, Bug, Lightbulb
} from 'lucide-react';
import TourSpotlight from '../../components/help/TourSpotlight';
import { usePageTour } from '../../components/help/TourRegistryContext';
import type { TourStep } from '../../components/help/types';
import type { Profile } from '../../types';
import * as api from '../../lib/portariaApi';
import type { PortariaMetricas } from '../../lib/portariaApi';
import PortariaMetricsBar from '../../components/portaria/PortariaMetricsBar';
import PortariaEquipamentos from './PortariaEquipamentos';
import PortariaTransportes from './PortariaTransportes';
import PortariaCarretas from './PortariaCarretas';
import PortariaRelatorio from './PortariaRelatorio';
import PortariaBriefing from './PortariaBriefing';
import PortariaPassagemPlantao from './PortariaPassagemPlantao';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
  initialTab?: string;
}

const PORTARIA_HUB_TOUR_STEPS: TourStep[] = [
  {
    icon: DoorOpen,
    title: 'Hub de Portaria & Segurança Patrimonial',
    description:
      'Painel centralizador de controle de acessos, vigilância, fluxo de carretas de chapas, transportes e ferramentas de terceiros na TEN.',
  },
  {
    target: 'portaria-hub-header',
    icon: DoorOpen,
    title: 'Módulo de Portaria e Governança',
    description:
      'Apresenta o escopo de procedimentos da Portaria TEN e botão de retorno para o hub geral de formulários.',
  },
  {
    target: 'portaria-hub-metricas',
    icon: Activity,
    title: 'Métricas do pátio em tempo real',
    description:
      'Acompanhe indicadores ao vivo: plantões e relatórios em aberto, transportes e equipamentos no pátio, carretas ativas e briefings do dia.',
  },
  {
    target: 'portaria-hub-grid',
    icon: ClipboardList,
    title: 'Catálogo de formulários da portaria',
    description:
      'Acesse rapidamente qualquer um dos 6 formulários operacionais (Passagem de Plantão, Ocorrências, Transportes, Equipamentos, Carretas e Briefing).',
  },
  {
    target: 'help-button',
    icon: HelpCircle,
    title: 'Reabra o tour a qualquer momento',
    description:
      'Ficou com alguma dúvida ou quer rever as dicas desta tela? Clique neste botão a qualquer momento no canto inferior e escolha "Tour guiado desta página".',
  },
  {
    target: 'help-button',
    icon: Bug,
    title: 'Encontrou um erro nesta tela?',
    description:
      'No mesmo botão, escolha "Reportar um erro" para descrever o problema — o histórico técnico recente da sessão vai junto, direto para o time responsável.',
  },
  {
    target: 'help-button',
    icon: Lightbulb,
    title: 'Tem uma ideia de melhoria?',
    description:
      'Escolha "Enviar sugestão" no mesmo botão para propor uma melhoria a qualquer momento, sem sair da tela.',
  },
];

export default function PortariaHub({ user, onNavigate, initialTab = 'visao_geral' }: Props) {
  const tour = usePageTour('hub-portaria', PORTARIA_HUB_TOUR_STEPS.length);
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
      id: 'passagem',
      codigo: 'FRM.SGP-0010',
      title: 'Passagem de Plantão & Custódia de Segurança',
      desc: 'Recebimento de posto, escala da vigilância, termo declaratório e conferência de materiais patrimoniais.',
      icon: ShieldCheck,
      cor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400',
      badge: `${metricas?.plantoesEmAberto || 0} em aberto`,
    },
    {
      id: 'relatorio',
      codigo: 'FRM.SGP-0010',
      title: 'Relatório de Ocorrências',
      desc: 'Livro digital de ocorrências: chegadas e saídas de veículos, visitantes, prestadores, colaboradores e rondas.',
      icon: ClipboardList,
      cor: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400',
      badge: `${metricas?.relatoriosEmAberto || 0} aberto`,
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
      id: 'equipamentos',
      codigo: 'FRM.SGP-0011',
      title: 'Controle de Equipamento e Ferramentas de Terceiros',
      desc: 'Entrada e devolução de máquinas, ferramentas e instrumentos de terceirizados e prestadores de serviço.',
      icon: Wrench,
      cor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
      badge: `${metricas?.equipamentosNoPatio || 0} no pátio`,
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
      id: 'briefing',
      codigo: 'FRM.SGP-0013',
      title: 'Lista de Presença — Briefing de Segurança',
      desc: 'Registro de integração, validação de CPF e coleta de assinatura digital do termo de responsabilidade.',
      icon: ShieldCheck,
      cor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
      badge: `${metricas?.briefingsHoje || 0} hoje`,
    },
  ];

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleChildNavigate = (path: string) => {
    if (path === '/formularios/portaria') {
      setActiveTab('visao_geral');
      return;
    }
    setActiveTab('visao_geral');
    onNavigate(path);
  };

  if (activeTab === 'passagem') {
    return <PortariaPassagemPlantao user={user} onNavigate={handleChildNavigate} />;
  }
  if (activeTab === 'equipamentos') {
    return <PortariaEquipamentos user={user} onNavigate={handleChildNavigate} />;
  }
  if (activeTab === 'transportes') {
    return <PortariaTransportes user={user} onNavigate={handleChildNavigate} />;
  }
  if (activeTab === 'carretas') {
    return <PortariaCarretas user={user} onNavigate={handleChildNavigate} />;
  }
  if (activeTab === 'relatorio') {
    return <PortariaRelatorio user={user} onNavigate={handleChildNavigate} />;
  }
  if (activeTab === 'briefing') {
    return <PortariaBriefing user={user} onNavigate={handleChildNavigate} />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div data-tour="portaria-hub-header">
        <button
          type="button"
          onClick={() => onNavigate('/formularios')}
          className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600 hover:shadow-sm active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
          <span>Voltar para Módulos de Formulários</span>
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
      <div data-tour="portaria-hub-metricas">
        <PortariaMetricsBar metricas={metricas} onSelectTab={setActiveTab} />
      </div>

      {/* Forms Grid */}
      <div data-tour="portaria-hub-grid" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      {tour.isOpen && (
        <TourSpotlight
          steps={PORTARIA_HUB_TOUR_STEPS}
          stepIndex={tour.stepIndex}
          onNext={tour.next}
          onBack={tour.back}
          onClose={tour.close}
        />
      )}
    </div>
  );
}
