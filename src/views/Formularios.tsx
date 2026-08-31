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
  Building2, Sparkles, ChevronRight, FileText
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

  const handleAcessarModulo = (mod: ModuloFormulario) => {
    if (mod.path) {
      onNavigate(mod.path);
      return;
    }
    toast.info(`${mod.label}: módulo e formulários dedicados em desenvolvimento. Em breve disponível.`);
  };

  // Filtra os módulos pelas subpermissões do usuário
  const modulosVisiveis = MODULOS.filter((mod) => canAccessFormGroup(user, mod.id));

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      {/* Header Premium */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-6 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
              <FileText className="h-3.5 w-3.5" />
              SISTEN Hub Operacional
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Formulários Operacionais
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
            Selecione o módulo operacional desejado para acessar os formulários dedicados, livros de registro e emissões oficiais.
          </p>
        </div>
      </div>

      {/* Grid de Módulos de Formulários */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
        {modulosVisiveis.map((modulo) => {
          const IconComponent = modulo.icon;
          const disponivel = Boolean(modulo.path);

          return (
            <div
              key={modulo.id}
              onClick={() => handleAcessarModulo(modulo)}
              className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 ${
                modulo.corBordaHover
              }`}
            >
              <div className="space-y-4">
                {/* Cabeçalho do Card */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105 ${
                        modulo.corIcone
                      }`}
                    >
                      <IconComponent className="h-6 w-6" />
                    </div>
                    <div>
                      {modulo.codigo && (
                        <p className="text-[10px] font-mono font-bold tracking-wider text-slate-400 uppercase">
                          {modulo.codigo}
                        </p>
                      )}
                      <h2 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors dark:text-slate-100 dark:group-hover:text-blue-400">
                        {modulo.label}
                      </h2>
                    </div>
                  </div>

                  {modulo.badge && (
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${
                        modulo.badgeCor || 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {modulo.badge}
                    </span>
                  )}
                </div>

                {/* Descrição */}
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed dark:text-slate-400">
                  {modulo.desc}
                </p>

                {/* Resumo dos Formulários Contidos */}
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 dark:text-slate-400">
                    Formulários & Registros Disponíveis:
                  </p>
                  <ul className="space-y-1.5">
                    {modulo.itensResumo.map((item, idx) => (
                      <li
                        key={idx}
                        className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500/70 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Rodapé / Botão de Ação */}
              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-500 group-hover:text-blue-600 dark:text-slate-400 dark:group-hover:text-blue-400 flex items-center gap-1">
                  {disponivel ? 'Abrir formulários dedicados' : 'Em desenvolvimento'}
                </span>
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 ${
                    disponivel
                      ? 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white dark:bg-blue-950/80 dark:text-blue-400 dark:group-hover:bg-blue-600 dark:group-hover:text-white'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                  }`}
                >
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

