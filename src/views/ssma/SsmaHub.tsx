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
  Activity,
  ArrowRight,
  ArrowLeft,
  HelpCircle,
  Bug,
  Lightbulb,
  FileSignature,
  BookOpen,
  BriefcaseBusiness,
  HardHat,
} from 'lucide-react';
import TourSpotlight from '../../components/help/TourSpotlight';
import { usePageTour } from '../../components/help/TourRegistryContext';
import type { TourStep } from '../../components/help/types';
import type { Profile, SsmaRidMetricas } from '../../types';
import { obterMetricasRid } from '../../lib/ssmaApi';
import SsmaMetricsBar from '../../components/ssma/SsmaMetricsBar';
import SsmaRidView from './SsmaRidView';
import SsmaAlcoolemiaView from './SsmaAlcoolemiaView';
import { canAccessForm } from '../../lib/pages';
import SsmaBookEpisView from './SsmaBookEpisView';
import SsmaEpiPorFuncaoView from './SsmaEpiPorFuncaoView';
import SsmaFichaEpiView from './SsmaFichaEpiView';

interface SsmaHubProps {
  user: Profile;
  onNavigate: (path: string) => void;
  initialTab?: string;
  /** No hub de Formulários, exibe somente os formulários operacionais. */
  modo?: 'modulo' | 'formularios';
}

const SSMA_HUB_TOUR_STEPS: TourStep[] = [
  {
    icon: ShieldAlert,
    title: 'Hub de SSMA — Segurança & Meio Ambiente',
    description:
      'Painel centralizador de normas, relatórios de desvios e formulários operacionais de prevenção de acidentes da TEN.',
  },
  {
    target: 'ssma-hub-header',
    icon: ShieldAlert,
    title: 'Módulo de SSMA e Governança',
    description:
      'Apresenta o escopo de procedimentos de segurança do trabalho e botão de retorno para o hub geral de formulários.',
  },
  {
    target: 'ssma-hub-metricas',
    icon: Activity,
    title: 'Métricas ao vivo da segurança',
    description:
      'Painel resumido de desvios registrados no mês, índice de desvios sanados na fábrica e link rápido para a gestão do RID.',
  },
  {
    target: 'ssma-hub-grid',
    icon: ClipboardCheck,
    title: 'Catálogo de formulários SSMA',
    description:
      'Acesse os formulários operacionais oficiais: RID (FRM.SSMA-0001) para desvios e Teste de Alcoolemia (FRM.SOC-0042) integrado à Portaria.',
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

export default function SsmaHub({ user, onNavigate, initialTab = 'visao_geral', modo = 'modulo' }: SsmaHubProps) {
  const tour = usePageTour('hub-ssma', SSMA_HUB_TOUR_STEPS.length);
  const [activeTab, setActiveTab] = useState<string>(initialTab);
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

  const mostrarCadastros = modo === 'modulo';

  const handleChildNavigate = (path: string) => {
    if (path === '/formularios/ssma' || path === '/ssma') {
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
      badgeCor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    },
    {
      id: 'alcoolemia',
      codigo: 'FRM.SOC-0042',
      title: 'Teste de Alcoolemia & Termo Psicoativo',
      desc: 'Execução de teste de alcoolemia por etilômetro, emissão do termo para assinatura física e controle de sorteados da portaria.',
      icon: FileSignature,
      cor: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400',
      badge: 'Ativo • Portaria & SSMA',
      badgeCor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    },
    {
      id: 'ficha_epi',
      codigo: 'FRM.SEG-0008',
      title: 'Ficha de EPI',
      desc: 'Entrega de EPI pela matriz da função, com assinatura do colaborador, histórico de retiradas e análise de consumo.',
      icon: HardHat,
      cor: 'bg-lime-100 text-lime-700 dark:bg-lime-950/60 dark:text-lime-400',
      badge: 'Termo + consumo',
      badgeCor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    },
  ];

  const formulariosVisiveis = FORMULARIOS_SSMA.filter((form) =>
    canAccessForm(user, `form_ssma_${form.id}`)
  );

  // Se a aba for RID ou Planos de Ação, exibe a subpágina completa do formulário
  if (activeTab === 'rid' || activeTab === 'rid_planos') {
    if (!canAccessForm(user, 'form_ssma_rid')) {
      setActiveTab('visao_geral');
      return null;
    }
    return (
      <SsmaRidView
        user={user}
        onNavigate={handleChildNavigate}
        abaInicial={activeTab === 'rid_planos' ? 'plano_acao' : 'novo'}
      />
    );
  }

  // Se a aba for alcoolemia, exibe o formulário do Termo FRM.SOC-0042
  if (activeTab === 'alcoolemia') {
    if (!canAccessForm(user, 'form_ssma_alcoolemia')) {
      setActiveTab('visao_geral');
      return null;
    }
    return <SsmaAlcoolemiaView user={user} onNavigate={handleChildNavigate} />;
  }

  if (activeTab === 'ficha_epi') {
    if (!canAccessForm(user, 'form_ssma_ficha_epi')) {
      setActiveTab('visao_geral');
      return null;
    }
    return <SsmaFichaEpiView user={user} onBack={() => setActiveTab('visao_geral')} />;
  }

  if (activeTab === 'book_epis' && mostrarCadastros) {
    return <SsmaBookEpisView onBack={() => setActiveTab('visao_geral')} />;
  }

  if (activeTab === 'epi_por_funcao' && mostrarCadastros) {
    return <SsmaEpiPorFuncaoView onBack={() => setActiveTab('visao_geral')} />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      {/* Header */}
      <div data-tour="ssma-hub-header">
        {modo === 'formularios' && (
          <button
            type="button"
            onClick={() => onNavigate('/formularios')}
            className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700 hover:shadow-sm active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            <span>Voltar para Módulos de Formulários</span>
          </button>
        )}

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

      {/* Metrics Bar: oculto no mobile */}
      <div data-tour="ssma-hub-metricas" className="hidden sm:block">
        <SsmaMetricsBar metricas={metricas} onSelectTab={(tab) => tab === 'rid' && setActiveTab('rid')} />
      </div>

      {mostrarCadastros && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <ClipboardCheck className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">Cadastros</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tabelas mestre que abastecem a prevenção e as solicitações de compras.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <button
              type="button"
              onClick={() => setActiveTab('book_epis')}
              className="group flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-400/60 hover:shadow-lg hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-400/40 cursor-pointer"
            >
              <div className="flex w-full items-start justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <BookOpen className="h-4.5 w-4.5" />
                </span>
                <ArrowRight className="mt-1.5 h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-emerald-500" />
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-50">Book de EPIs</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Cadastro editável por usuários SSMA, com CA, validade, fabricante, tamanhos, código SAP e foto reutilizável em Compras.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('epi_por_funcao')}
              className="group flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-400/60 hover:shadow-lg hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-400/40 cursor-pointer"
            >
              <div className="flex w-full items-start justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <BriefcaseBusiness className="h-4.5 w-4.5" />
                </span>
                <ArrowRight className="mt-1.5 h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-emerald-500" />
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-50">EPI por função</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Matriz editável de requisitos por função, vinculada às variantes do Book para a futura ficha de EPI.
              </p>
            </button>
          </div>
        </section>
      )}

      {/* Forms Grid: 3 blocos por linha no mobile e descricao oculta */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">Relatórios</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {modo === 'modulo'
                ? 'Consultas e controles dos formulários SSMA liberados para você.'
                : 'Formulários operacionais SSMA liberados para você.'}
            </p>
          </div>
        </div>
      <div data-tour="ssma-hub-grid" className="grid grid-cols-3 gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {formulariosVisiveis.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-500 mb-2" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Nenhum formulário de SSMA liberado para o seu perfil.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Caso precise de acesso, solicite liberação ao administrador no módulo de Acessos.
            </p>
          </div>
        ) : (
          formulariosVisiveis.map((form) => {
          const Icon = form.icon;
          return (
            <button
              key={form.id}
              type="button"
              onClick={() => setActiveTab(form.id)}
              className="group flex flex-col items-start justify-between rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-slate-900/5 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-400/40 cursor-pointer"
            >
              <div className="w-full">
                <div className="flex w-full items-center justify-between gap-1">
                  <span className={`flex h-7 w-7 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl ${form.cor}`}>
                    <Icon className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                  </span>
                  <span className="font-mono text-[9px] sm:text-[11px] font-bold px-1 sm:px-2 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 truncate max-w-[65px] sm:max-w-none">
                    {form.codigo}
                  </span>
                </div>

                <h3 className="mt-2 sm:mt-3.5 text-xs sm:text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors dark:text-slate-100 dark:group-hover:text-emerald-400 leading-snug line-clamp-2 sm:line-clamp-none">
                  {form.title}
                </h3>

                <p className="hidden sm:block mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {form.desc}
                </p>
              </div>

              <div className="mt-2.5 sm:mt-5 flex w-full items-center justify-between border-t border-slate-100 pt-2 sm:pt-3 dark:border-slate-800">
                <span className={`rounded-full border px-1.5 sm:px-2.5 py-0.5 text-[9px] sm:text-[11px] font-semibold truncate ${form.badgeCor}`}>
                  {form.badge}
                </span>

                <span className="inline-flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs font-bold text-emerald-700 transition-transform group-hover:translate-x-1 dark:text-emerald-400 shrink-0">
                  <span className="hidden md:inline">Acessar</span>
                  <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </span>
              </div>
            </button>
          );
        })
      )}
      </div>
      </section>

      {tour.isOpen && (
        <TourSpotlight
          steps={SSMA_HUB_TOUR_STEPS}
          stepIndex={tour.stepIndex}
          onNext={tour.next}
          onBack={tour.back}
          onClose={tour.close}
        />
      )}
    </div>
  );
}
