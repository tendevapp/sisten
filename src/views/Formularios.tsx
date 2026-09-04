/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Página "Formulários" — hub central que agrupa, por área, os botões de
 * acesso a formulários operacionais do SISTEN (portaria, almoxarifado, etc.).
 *
 * Os formulários em si ainda não existem: cada item aqui é um placeholder
 * "em breve". Conforme cada formulário for construído, seu botão passa a
 * navegar (`path` deixa de ser `undefined`) e o card sai do estado desabilitado
 * — sem precisar mexer no restante da página. Novas áreas entram simplesmente
 * acrescentando um bloco em `AREAS`.
 */

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  DoorOpen, Boxes, PackageCheck, Truck, Clock, ArrowRight,
  Users2, Timer, Wrench, Bus, ClipboardList, ShieldCheck,
  Building2, Sparkles, ChevronRight, FileText, ShieldAlert
} from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import { canAccessPage, canAccessFormGroup } from '../lib/pages';
import { Profile } from '../types';

interface FormulariosProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

interface ModuloFormulario {
  id: string;
  label: string;
  codigo?: string;
  icon: LucideIcon;
  desc: string;
  path?: string;
  badge?: string;
  badgeCor?: string;
  corIcone: string;
  corBordaHover: string;
  itensResumo: string[];
}

const MODULOS: ModuloFormulario[] = [
  {
    id: 'portaria',
    label: 'Portaria & Segurança Patrimonial',
    codigo: 'MÓDULO DE SEGURANÇA',
    icon: ShieldCheck,
    desc: 'Passagem de plantão, relatório de ocorrências, transportes de funcionários, carretas de chapas, controle de ferramentas de terceiros e briefings.',
    path: '/formularios/portaria',
    badge: '6 Formulários Ativos',
    badgeCor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300',
    corIcone: 'bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-indigo-500/20 shadow-lg',
    corBordaHover: 'hover:border-indigo-500/50 hover:shadow-indigo-500/10',
    itensResumo: [
      'Passagem de Plantão (FRM.SGP-0010)',
      'Relatório de Ocorrências (FRM.SGP-0010)',
      'Chegada de Transportes (FRM.SGP-0009)',
      'Equipamentos Terceiros (FRM.SGP-0011)',
      'Carretas de Chapas (FRM.SGP-0020)',
      'Briefing de Segurança (FRM.SGP-0013)',
    ],
  },
  {
    id: 'logistica',
    label: 'Logística & Expedição',
    codigo: 'MÓDULO DE EXPEDIÇÃO',
    icon: PackageCheck,
    desc: 'Controle operacional de expedição e carregamento de tramos, horários das etapas, fotos comprobatórias e relatórios de frete.',
    path: '/formularios/logistica-expedicao',
    badge: '1 Formulário Ativo',
    badgeCor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300',
    corIcone: 'bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-emerald-500/20 shadow-lg',
    corBordaHover: 'hover:border-emerald-500/50 hover:shadow-emerald-500/10',
    itensResumo: [
      'Registro de Expedição de Tramos',
      'Controle de 3 Horários & Fotos',
      'Disparo de E-mail de Notificação',
    ],
  },
  {
    id: 'rh',
    label: 'RH & Departamento Pessoal',
    codigo: 'MÓDULO DE RH',
    icon: Users2,
    desc: 'Autorização de Serviços Extraordinários (ASE), justificativas operacionais, gestão de horas extras por setor e fluxo de aprovação.',
    path: '/formularios/rh-ase-hora-extra',
    badge: '1 Formulário Ativo',
    badgeCor: 'bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300',
    corIcone: 'bg-gradient-to-br from-violet-500 to-purple-700 text-white shadow-violet-500/20 shadow-lg',
    corBordaHover: 'hover:border-violet-500/50 hover:shadow-violet-500/10',
    itensResumo: [
      'ASE - Hora Extra (FRM.RHU-0007)',
      'Controle por Setor e Turno',
      'Exportação em PDF e Planilhas',
    ],
  },
  {
    id: 'ssma',
    label: 'SSMA - Saúde, Segurança & Meio Ambiente',
    codigo: 'MÓDULO DE SEGURANÇA & MEIO AMBIENTE',
    icon: ShieldAlert,
    desc: 'Registro de Identificação de Desvio (RID), classificação de riscos comportamentais e condições inseguras, evidências fotográficas e ações preventivas.',
    path: '/formularios/ssma',
    badge: '1 Formulário Ativo',
    badgeCor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300',
    corIcone: 'bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-emerald-500/20 shadow-lg',
    corBordaHover: 'hover:border-emerald-500/50 hover:shadow-emerald-500/10',
    itensResumo: [
      'RID - Identificação de Desvio (FRM.SSMA-0001)',
      'Classificação de Riscos & Evidências',
      'Acompanhamento e Histórico de Ações',
    ],
  },
  {
    id: 'almoxarifado',
    label: 'Almoxarifado & Estoque',
    codigo: 'MÓDULO DE ESTOQUE',
    icon: Boxes,
    desc: 'Formulários para conferência de recebimento físico de materiais, requisições internas de almoxarifado e inventário cíclico.',
    badge: 'Em Breve',
    badgeCor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300',
    corIcone: 'bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-amber-500/20 shadow-lg',
    corBordaHover: 'hover:border-amber-500/50 hover:shadow-amber-500/10',
    itensResumo: [
      'Requisição Interna de Materiais',
      'Recebimento Físico & Divergências',
      'Controle de Inventário Cíclico',
    ],
  },
];

export default function Formularios({ user, onNavigate }: FormulariosProps) {
  const toast = useToast();
  const [busca, setBusca] = React.useState('');
  const [filtroStatus, setFiltroStatus] = React.useState<'todos' | 'ativos' | 'em_breve'>('todos');

  const handleAcessarModulo = (mod: ModuloFormulario) => {
    if (mod.path) {
      onNavigate(mod.path);
      return;
    }
    toast.info(`${mod.label}: módulo e formulários dedicados em desenvolvimento. Em breve disponível.`);
  };

  // Filtra os modulos pelas subpermissoes do usuario
  const modulosAcessiveis = MODULOS.filter((mod) => canAccessFormGroup(user, mod.id));

  // Filtro por texto de busca e status
  const modulosFiltrados = modulosAcessiveis.filter((mod) => {
    const termo = busca.toLowerCase().trim();
    const matchesBusca =
      !termo ||
      mod.label.toLowerCase().includes(termo) ||
      (mod.codigo && mod.codigo.toLowerCase().includes(termo)) ||
      mod.desc.toLowerCase().includes(termo) ||
      mod.itensResumo.some((item) => item.toLowerCase().includes(termo));

    if (!matchesBusca) return false;

    if (filtroStatus === 'ativos') return Boolean(mod.path);
    if (filtroStatus === 'em_breve') return !mod.path;
    return true;
  });

  const totalAtivos = modulosAcessiveis.filter((m) => Boolean(m.path)).length;
  const totalEmBreve = modulosAcessiveis.length - totalAtivos;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      {/* Header Compacto */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-5 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
              <FileText className="h-3.5 w-3.5" />
              SISTEN Hub Operacional
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              • {modulosAcessiveis.length} módulos disponíveis
            </span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Formulários Operacionais
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Acesse formulários dedicados, registros de turno e rotinas de cada setor.
          </p>
        </div>

        {/* Barra de Filtro e Busca */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Campo de Busca */}
          <div className="relative min-w-[220px]">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar módulo ou formulário..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 shadow-2xs transition-all focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder-slate-500"
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ×
              </button>
            )}
          </div>

          {/* Filtro de Status em Pills */}
          <div className="flex items-center rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
            <button
              onClick={() => setFiltroStatus('todos')}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                filtroStatus === 'todos'
                  ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Todos ({modulosAcessiveis.length})
            </button>
            <button
              onClick={() => setFiltroStatus('ativos')}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                filtroStatus === 'ativos'
                  ? 'bg-white text-emerald-700 shadow-2xs dark:bg-slate-700 dark:text-emerald-400'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Ativos ({totalAtivos})
            </button>
            <button
              onClick={() => setFiltroStatus('em_breve')}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                filtroStatus === 'em_breve'
                  ? 'bg-white text-amber-700 shadow-2xs dark:bg-slate-700 dark:text-amber-400'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Em Breve ({totalEmBreve})
            </button>
          </div>
        </div>
      </div>

      {/* Grid Otimizado: 3 a 4 colunas em telas médias e grandes */}
      {modulosFiltrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Nenhum módulo encontrado para a busca "{busca}".
          </p>
          <button
            onClick={() => {
              setBusca('');
              setFiltroStatus('todos');
            }}
            className="mt-3 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {modulosFiltrados.map((modulo) => {
            const IconComponent = modulo.icon;
            const disponivel = Boolean(modulo.path);

            return (
              <div
                key={modulo.id}
                onClick={() => handleAcessarModulo(modulo)}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200/90 bg-white p-3 sm:p-4 shadow-2xs transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 ${
                  modulo.corBordaHover
                }`}
              >
                <div className="space-y-2 sm:space-y-3">
                  {/* Linha Superior: Ícone à esquerda + Badge de Status à direita */}
                  <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                    <div
                      className={`flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl transition-transform duration-200 group-hover:scale-105 ${
                        modulo.corIcone
                      }`}
                    >
                      <IconComponent className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>

                    {modulo.badge && (
                      <span
                        className={`rounded-full px-1.5 sm:px-2.5 py-0.5 text-[9px] sm:text-[10px] font-bold truncate max-w-[90px] sm:max-w-none ${
                          modulo.badgeCor || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {modulo.badge}
                      </span>
                    )}
                  </div>

                  {/* Bloco de Título com Largura Total (sem truncar) */}
                  <div>
                    {modulo.codigo && (
                      <p className="text-[8px] sm:text-[10px] font-mono font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase mb-0.5 truncate">
                        {modulo.codigo}
                      </p>
                    )}
                    <h2 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors dark:text-slate-100 dark:group-hover:text-blue-400 leading-tight sm:leading-snug">
                      {modulo.label}
                    </h2>
                  </div>

                  {/* Descrição: Oculta no mobile (hidden sm:block) para economizar espaço */}
                  <p className="hidden sm:block text-xs text-slate-500 leading-relaxed dark:text-slate-400 line-clamp-3">
                    {modulo.desc}
                  </p>
                </div>

                {/* Rodapé Compacto com Ação e Seta */}
                <div className="mt-2.5 sm:mt-4 flex items-center justify-between border-t border-slate-100 pt-2 sm:pt-2.5 dark:border-slate-800/80">
                  <span
                    className={`inline-flex items-center text-[10px] sm:text-xs font-semibold ${
                      disponivel
                        ? 'text-blue-600 dark:text-blue-400 group-hover:underline'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {disponivel ? 'Acessar' : 'Em breve'}
                  </span>
                  <div
                    className={`flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-md sm:rounded-lg transition-all duration-200 ${
                      disponivel
                        ? 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white dark:bg-blue-950/80 dark:text-blue-400 dark:group-hover:bg-blue-600 dark:group-hover:text-white'
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                    }`}
                  >
                    <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

