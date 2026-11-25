/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hub / Painel Geral da Portaria — reúne todos os formulários e o acompanhamento do pátio ao vivo.
 */

import React, { useState, useEffect } from 'react';
import {
  DoorOpen, Wrench, Bus, Truck, ClipboardList, ShieldCheck, Shield,
  ArrowRight, ArrowLeft, Activity, Clock, FileDown, Calendar,
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
import PortariaAlcoolemia from './PortariaAlcoolemia';
import { canAccessForm } from '../../lib/pages';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';
import PdfPreviewModal from '../../components/ui/PdfPreviewModal';
import type { PdfGerado } from '../../lib/pdfExport/core';
import { gerarRelatorioGeralPortariaPdf } from '../../lib/pdfExport/exportPortariaGeralPdf';
import { useToast } from '../../components/ui/Toast';

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
  const toast = useToast();
  const tour = usePageTour('hub-portaria', PORTARIA_HUB_TOUR_STEPS.length);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [metricas, setMetricas] = useState<PortariaMetricas | null>(null);

  // Relatorio PDF Geral Consolidado (dia unico ou periodo)
  const [modalRelatorioGeral, setModalRelatorioGeral] = useState(false);
  const [modoRelatorio, setModoRelatorio] = useState<'dia' | 'periodo'>('dia');
  const [dataInicioRel, setDataInicioRel] = useState(() => api.hojeISO());
  const [dataFimRel, setDataFimRel] = useState(() => api.hojeISO());
  const [pdfPreviewGeral, setPdfPreviewGeral] = useState<{ gerar: () => Promise<PdfGerado>; titulo?: string } | null>(null);

  const aplicarAtalhoPeriodo = (tipo: 'hoje' | 'ontem' | '7d' | 'mes') => {
    const hoje = new Date();
    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dia = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dia}`;
    };
    const hojeStr = fmt(hoje);
    if (tipo === 'hoje') {
      setModoRelatorio('dia');
      setDataInicioRel(hojeStr);
      setDataFimRel(hojeStr);
    } else if (tipo === 'ontem') {
      const ontem = new Date(hoje);
      ontem.setDate(hoje.getDate() - 1);
      const ontemStr = fmt(ontem);
      setModoRelatorio('dia');
      setDataInicioRel(ontemStr);
      setDataFimRel(ontemStr);
    } else if (tipo === '7d') {
      const ini = new Date(hoje);
      ini.setDate(hoje.getDate() - 6);
      setModoRelatorio('periodo');
      setDataInicioRel(fmt(ini));
      setDataFimRel(hojeStr);
    } else {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      setModoRelatorio('periodo');
      setDataInicioRel(fmt(ini));
      setDataFimRel(hojeStr);
    }
  };

  const handleAbrirRelatorioGeralPdf = () => {
    const inicio = dataInicioRel;
    const fim = modoRelatorio === 'dia' ? dataInicioRel : dataFimRel;
    if (!inicio || !fim) {
      toast.error('Informe a data ou o período para gerar o relatório.');
      return;
    }
    if (fim < inicio) {
      toast.error('A data final não pode ser anterior à data inicial.');
      return;
    }

    const pode = {
      relatorio: canAccessForm(user, PORTARIA_FORM_PAGE_MAP.relatorio),
      passagem: canAccessForm(user, PORTARIA_FORM_PAGE_MAP.passagem),
      transportes: canAccessForm(user, PORTARIA_FORM_PAGE_MAP.transportes),
      equipamentos: canAccessForm(user, PORTARIA_FORM_PAGE_MAP.equipamentos),
      carretas: canAccessForm(user, PORTARIA_FORM_PAGE_MAP.carretas),
      briefing: canAccessForm(user, PORTARIA_FORM_PAGE_MAP.briefing),
      alcoolemia: canAccessForm(user, PORTARIA_FORM_PAGE_MAP.alcoolemia),
    };

    setModalRelatorioGeral(false);
    setPdfPreviewGeral({
      titulo: inicio === fim ? `Relatório Geral Portaria — ${inicio}` : `Relatório Geral Portaria — ${inicio} a ${fim}`,
      gerar: async () => {
        const [relatoriosBrutos, passagens, transportes, equipamentos, carretas, briefings, alcoolemia] = await Promise.all([
          pode.relatorio ? api.listarRelatorios({ dataInicio: inicio, dataFim: fim }) : Promise.resolve([]),
          pode.passagem ? api.listarPassagensPlantao({ dataInicio: inicio, dataFim: fim }) : Promise.resolve([]),
          pode.transportes ? api.listarTransportes({ dataInicio: inicio, dataFim: fim }) : Promise.resolve([]),
          pode.equipamentos ? api.listarEquipamentos({ dataInicio: inicio, dataFim: fim }) : Promise.resolve([]),
          pode.carretas ? api.listarCarretas({ dataInicio: inicio, dataFim: fim }) : Promise.resolve([]),
          pode.briefing ? api.listarSessoesBriefing({ dataInicio: inicio, dataFim: fim }) : Promise.resolve([]),
          pode.alcoolemia ? api.listarTestesAlcoolemia({ dataInicio: inicio, dataFim: fim }) : Promise.resolve([]),
        ]);

        // Carrega tambem eventual foto legada (base64 em foto_url) para nao faltar nenhuma imagem.
        const relatorios = await Promise.all(
          relatoriosBrutos.map(async (rel) => {
            const ocs = await Promise.all(
              (rel.ocorrencias || []).map(async (oc) => {
                if (oc.tem_foto_legado && !oc.foto_url) {
                  const legado = await api.obterFotoLegadoOcorrencia(oc.id).catch(() => null);
                  return legado ? { ...oc, foto_url: legado } : oc;
                }
                return oc;
              }),
            );
            return { ...rel, ocorrencias: ocs };
          }),
        );

        return gerarRelatorioGeralPortariaPdf({
          inicioISO: inicio,
          fimISO: fim,
          relatorios,
          passagens,
          transportes,
          equipamentos,
          carretas,
          briefings,
          alcoolemia,
          secoes: pode,
        });
      },
    });
  };

  useEffect(() => {
    // 7 contagens por rodada: a cada 60 s e só com a aba visível (eram 15 s,
    // inclusive escondida — ~7 mil requests/dia de 3 aparelhos).
    const carregar = () => {
      if (document.hidden) return;
      api.obterMetricasPortaria().then(setMetricas).catch(console.error);
    };
    carregar();
    const interval = setInterval(carregar, 60_000);
    document.addEventListener('visibilitychange', carregar);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', carregar); };
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
    {
      id: 'alcoolemia',
      codigo: 'FRM.SGP-0015',
      title: 'Teste de Alcoolemia',
      desc: 'Livro diário de sorteados, pesquisa no RH Pessoas e aferição com etilômetro para TEN e PJs.',
      icon: Shield,
      cor: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
      badge: `${metricas?.alcoolemiaHoje || 0} sorteados hoje`,
    },
  ];

  const PORTARIA_FORM_PAGE_MAP: Record<string, string> = {
    passagem: 'form_portaria_plantao',
    relatorio: 'form_portaria_relatorio',
    transportes: 'form_portaria_transportes',
    equipamentos: 'form_portaria_equipamentos',
    carretas: 'form_portaria_carretas',
    briefing: 'form_portaria_briefing',
    alcoolemia: 'form_portaria_alcoolemia',
  };

  const formulariosVisiveis = FORMULARIOS_PORTARIA.filter((form) => {
    const pageId = PORTARIA_FORM_PAGE_MAP[form.id];
    return pageId ? canAccessForm(user, pageId) : false;
  });

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

  if (activeTab !== 'visao_geral') {
    const pageId = PORTARIA_FORM_PAGE_MAP[activeTab];
    if (pageId && !canAccessForm(user, pageId)) {
      setActiveTab('visao_geral');
      return null;
    }
  }

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
  if (activeTab === 'alcoolemia') {
    return <PortariaAlcoolemia user={user} onNavigate={handleChildNavigate} />;
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
        <div className="flex flex-wrap items-center justify-between gap-3">
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

          {formulariosVisiveis.length > 0 && (
            <button
              type="button"
              onClick={() => setModalRelatorioGeral(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500 active:scale-95 cursor-pointer dark:bg-blue-500 dark:hover:bg-blue-400"
              title="Gerar PDF consolidado de todos os formulários da Portaria para um dia ou período"
            >
              <FileDown className="h-4 w-4" />
              <span>Relatório Geral (PDF)</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Bar: oculto no mobile */}
      <div data-tour="portaria-hub-metricas" className="hidden sm:block">
        <PortariaMetricsBar metricas={metricas} onSelectTab={setActiveTab} />
      </div>

      {/* Forms Grid: 3 blocos por linha no mobile e descricao oculta */}
      <div data-tour="portaria-hub-grid" className="grid grid-cols-3 gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {formulariosVisiveis.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
            <DoorOpen className="mx-auto h-8 w-8 text-blue-500 mb-2" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Nenhum formulário da Portaria liberado para o seu perfil.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Caso precise de acesso aos registros do pátio, solicite liberação ao administrador no módulo de Acessos.
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
              className="group flex flex-col items-start justify-between rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-500/50 hover:shadow-lg hover:shadow-slate-900/5 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-400/40 cursor-pointer"
            >
              <div className="w-full">
                <div className="flex w-full items-center justify-between gap-1">
                  <span className={`flex h-7 w-7 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl ${form.cor}`}>
                    <Icon className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                  </span>
                  <span className="font-mono text-[10px] sm:text-[11px] font-bold px-1 sm:px-2 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 truncate max-w-[65px] sm:max-w-none">
                    {form.codigo}
                  </span>
                </div>
                <h3 className="mt-2 sm:mt-3.5 text-xs sm:text-base font-bold text-slate-900 group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400 leading-snug line-clamp-2 sm:line-clamp-none">
                  {form.title}
                </h3>
                <p className="hidden sm:block mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {form.desc}
                </p>
              </div>

              <div className="mt-2.5 sm:mt-5 flex w-full items-center justify-between border-t border-slate-100 pt-2 sm:pt-3 dark:border-slate-800">
                <span className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-slate-300 truncate">
                  {form.badge}
                </span>
                <span className="inline-flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs font-bold text-blue-600 transition-transform group-hover:translate-x-1 dark:text-blue-400 shrink-0">
                  <span className="hidden md:inline">Acessar</span>
                  <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </span>
              </div>
            </button>
          );
        })
      )}
      </div>

      {modalRelatorioGeral && (
        <Modal onClose={() => setModalRelatorioGeral(false)} maxWidth="max-w-lg">
          <ModalHeader onClose={() => setModalRelatorioGeral(false)}>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                <FileDown className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Relatório Geral Consolidado (PDF)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Consolida todos os formulários da Portaria no dia ou período
                </p>
              </div>
            </div>
          </ModalHeader>

          <ModalBody className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950/60">
              <button
                type="button"
                onClick={() => setModoRelatorio('dia')}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition cursor-pointer ${
                  modoRelatorio === 'dia'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                Dia único
              </button>
              <button
                type="button"
                onClick={() => setModoRelatorio('periodo')}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition cursor-pointer ${
                  modoRelatorio === 'periodo'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                Período
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {([
                { id: 'hoje', rotulo: 'Hoje' },
                { id: 'ontem', rotulo: 'Ontem' },
                { id: '7d', rotulo: 'Últimos 7 dias' },
                { id: 'mes', rotulo: 'Mês atual' },
              ] as const).map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => aplicarAtalhoPeriodo(op.id)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-700 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-500"
                >
                  {op.rotulo}
                </button>
              ))}
            </div>

            <div className={`grid gap-3 ${modoRelatorio === 'periodo' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <Calendar className="h-3.5 w-3.5 text-blue-600" />
                  {modoRelatorio === 'dia' ? 'Data do Relatório' : 'Data Inicial'}
                </label>
                <input
                  type="date"
                  value={dataInicioRel}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDataInicioRel(v);
                    if (modoRelatorio === 'dia' || v > dataFimRel) setDataFimRel(v);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              {modoRelatorio === 'periodo' && (
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                    <Calendar className="h-3.5 w-3.5 text-blue-600" />
                    Data Final
                  </label>
                  <input
                    type="date"
                    min={dataInicioRel}
                    value={dataFimRel}
                    onChange={(e) => setDataFimRel(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              )}
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
              <span className="font-bold">Conteúdo completo + Privacidade:</span> inclui todas as informações completas, assinaturas e fotos de todos os formulários liberados no período; no <strong>Teste de Alcoolemia</strong>, exibe apenas as <strong>quantidades consolidadas</strong>, sem expor pessoas.
            </div>
          </ModalBody>

          <ModalFooter>
            <button
              type="button"
              onClick={() => setModalRelatorioGeral(false)}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleAbrirRelatorioGeralPdf}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 cursor-pointer dark:bg-blue-500"
            >
              <FileDown className="h-4 w-4" />
              Gerar PDF
            </button>
          </ModalFooter>
        </Modal>
      )}

      {pdfPreviewGeral && (
        <PdfPreviewModal
          gerar={pdfPreviewGeral.gerar}
          tituloPadrao={pdfPreviewGeral.titulo}
          onClose={() => setPdfPreviewGeral(null)}
        />
      )}

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
