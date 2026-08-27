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

import type { LucideIcon } from 'lucide-react';
import {
  DoorOpen, Boxes, UserCheck, PackageCheck, Truck, Clock, ArrowRight,
  Users2, Timer, Wrench, Bus, ClipboardList, ShieldCheck
} from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import { canAccessPage, canAccessFormGroup } from '../lib/pages';
import { Profile } from '../types';

interface FormulariosProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

interface FormularioItem {
  id: string;
  label: string;
  icon: LucideIcon;
  desc: string;
  /** Ausente enquanto o formulário não existe — o card fica em modo "em breve". */
  path?: string;
  /**
   * Chave em `pages.ts` que precisa liberar o item para o usuário atual.
   * Ausente = todo mundo que tem acesso ao grupo enxerga o card.
   */
  gateId?: string;
}

interface AreaFormularios {
  id: string;
  label: string;
  icon: LucideIcon;
  itens: FormularioItem[];
}

const AREAS: AreaFormularios[] = [
  {
    id: 'portaria',
    label: 'Portaria & Segurança Patrimonial',
    icon: DoorOpen,
    itens: [
      {
        id: 'portaria_equipamentos',
        label: 'Equipamentos de Terceiros (FRM.SGP-0011)',
        icon: Wrench,
        desc: 'Controle de entrada e devolução de ferramentas e instrumentos de terceirizados.',
        path: '/formularios/portaria-equipamentos',
      },
      {
        id: 'portaria_transportes',
        label: 'Chegada de Transportes (FRM.SGP-0009)',
        icon: Bus,
        desc: 'Registro diário de movimentação de veículos, vans, carros e ônibus por turno.',
        path: '/formularios/portaria-transportes',
      },
      {
        id: 'portaria_carretas',
        label: 'Carretas de Chapas (FRM.SGP-0020)',
        icon: Truck,
        desc: 'Controle de chegada, descarregamento de aço e liberação de carretas de chapas.',
        path: '/formularios/portaria-carretas',
      },
      {
        id: 'portaria_relatorio',
        label: 'Relatório de Portaria (FRM.SGP-0010)',
        icon: ClipboardList,
        desc: 'Livro de plantão digital, registro de rondas e histórico de ocorrências do turno.',
        path: '/formularios/portaria-relatorio',
      },
      {
        id: 'portaria_briefing',
        label: 'Briefing de Segurança (FRM.SGP-0013)',
        icon: ShieldCheck,
        desc: 'Lista de presença com assinatura digital e verificação de validade de CPF.',
        path: '/formularios/portaria-briefing',
      },
    ],
  },
  {
    id: 'logistica',
    label: 'Logística & Expedição',
    icon: PackageCheck,
    itens: [
      {
        id: 'portaria_logistica_expedicao',
        label: 'Logística - Expedição',
        icon: PackageCheck,
        desc: 'Carregamento de tramos: veículo, motorista, os três horários e as fotos de cada etapa.',
        path: '/formularios/logistica-expedicao',
      },
    ],
  },
  {
    id: 'rh',
    label: 'RH & Departamento Pessoal',
    icon: Users2,
    itens: [
      {
        id: 'rh_ase_hora_extra',
        label: 'ASE - Hora Extra',
        icon: Timer,
        desc: 'Autorização de Serviços Extraordinários (FRM.RHU-0007): setor, turno, colaboradores e horários.',
        path: '/formularios/rh-ase-hora-extra',
      },
    ],
  },
  {
    id: 'almoxarifado',
    label: 'Almoxarifado',
    icon: Boxes,
    itens: [],
  },
];

export default function Formularios({ user, onNavigate }: FormulariosProps) {
  const toast = useToast();

  const handleAbrir = (item: FormularioItem) => {
    if (item.path) { onNavigate(item.path); return; }
    toast.info(`${item.label}: formulário em desenvolvimento. Em breve disponível.`);
  };

  // Filtra as áreas pelas subpermissões do usuário via canAccessFormGroup
  const areasVisiveis = AREAS
    .filter(area => canAccessFormGroup(user, area.id))
    .map(area => ({
      ...area,
      itens: area.itens.filter(item => !item.gateId || canAccessPage(user, item.gateId)),
    }))
    .filter(area => area.itens.length > 0 || AREAS.find(a => a.id === area.id)!.itens.length === 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">Formulários</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Ponto único de acesso aos formulários operacionais do SISTEN, organizados por área.
          Novos formulários aparecem aqui conforme forem publicados.
        </p>
      </header>

      <div className="space-y-6">
        {areasVisiveis.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center dark:border-slate-800 dark:bg-slate-900">
            <ClipboardList className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Nenhum grupo de formulários liberado para o seu usuário
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Entre em contato com o administrador do sistema para solicitar acesso aos grupos de formulários desejados.
            </p>
          </div>
        ) : (
          areasVisiveis.map(area => {
            const AreaIcon = area.icon;
            return (
              <section
                key={area.id}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-6 sm:px-8 sm:py-7 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <AreaIcon className="h-5 w-5" />
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{area.label}</h2>
                </div>

                {area.itens.length === 0 ? (
                  <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-5 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Nenhum formulário publicado ainda nesta área.
                  </div>
                ) : (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {area.itens.map(item => {
                      const ItemIcon = item.icon;
                      const disponivel = Boolean(item.path);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleAbrir(item)}
                          aria-disabled={!disponivel}
                          className={`group relative flex flex-col items-start rounded-xl border p-4 text-left transition-all duration-200 ${
                            disponivel
                              ? 'cursor-pointer border-slate-200 hover:-translate-y-0.5 hover:border-blue-400/50 hover:shadow-lg hover:shadow-slate-900/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:hover:border-blue-400/40'
                              : 'border-dashed border-slate-200 opacity-80 hover:opacity-100 dark:border-slate-700'
                          }`}
                        >
                          <div className="flex w-full items-start justify-between gap-2">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              <ItemIcon className="h-4.5 w-4.5" />
                            </span>
                            {disponivel ? (
                              <ArrowRight className="mt-1.5 h-4 w-4 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-blue-500" />
                            ) : (
                              <span className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                                <Clock className="h-3 w-3" />
                                Em breve
                              </span>
                            )}
                          </div>
                          <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-50">{item.label}</h3>
                          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

