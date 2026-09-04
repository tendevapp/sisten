/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tela inicial do módulo Facilities — ponto único de acesso às páginas de
 * cadastro e aos relatórios operacionais alimentados pelos formulários de
 * Portaria e RH/ASE.
 *
 * A tela é montada a partir de `SECOES`: conforme cada página ou relatório for
 * publicado, basta acrescentar (ou preencher o `path` de) um item — o card sai
 * automaticamente do estado "em breve" e passa a navegar, sem mexer no layout.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Building2, Route, ArrowRight, Clock, DoorOpen, Timer, ClipboardList,
  BusFront, BarChart3, Shield, Wrench,
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { canAccessPage } from '../../lib/pages';
import type { Profile } from '../../types';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

interface FacilityItem {
  id: string;
  label: string;
  icon: LucideIcon;
  desc: string;
  /** Cor do chip do ícone — mantém cada card reconhecível na grade. */
  cor: string;
  /** Ausente enquanto a página não existe: o card fica em modo "em breve". */
  path?: string;
  /** Chave em `pages.ts` que precisa liberar o item para o usuário atual. */
  gateId?: string;
  /** Origem do dado, exibida como legenda no rodapé do card. */
  fonte?: string;
}

interface Secao {
  id: string;
  label: string;
  descricao: string;
  icon: LucideIcon;
  itens: FacilityItem[];
}

const SECOES: Secao[] = [
  {
    id: 'cadastros',
    label: 'Cadastros',
    descricao: 'Tabelas mestre que abastecem os formulários e os relatórios do módulo.',
    icon: ClipboardList,
    itens: [
      {
        id: 'rotas',
        label: 'Cadastro de Rotas',
        icon: BusFront,
        desc: 'Colaboradores, pontos de embarque e horários do transporte fretado. Edição, ativação e inativação em massa.',
        cor: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400',
        path: '/facilities/rotas',
        gateId: 'facilities_rotas',
        fonte: 'Base rh_rotas',
      },
      {
        id: 'servicos',
        label: 'Lista de Serviços',
        icon: Wrench,
        desc: 'Serviços atendidos pelo Facilities. Alimenta a categoria do chamado em Nova Solicitação — cadastre, edite, reordene e inative sem depender de deploy.',
        cor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
        path: '/facilities/servicos',
        gateId: 'facilities_servicos',
        fonte: 'Base fac_servicos',
      },
      {
        id: 'materiais_vigilancia',
        label: 'Materiais da Vigilância',
        icon: Shield,
        desc: 'Controle dos armamentos, coletes, rádios e munições sob custódia da portaria para a checagem da passagem de plantão.',
        cor: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400',
        path: '/facilities/materiais',
        gateId: 'facilities_materiais',
        fonte: 'Base port_materiais_seguranca',
      },
    ],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    descricao: 'Consolidações a partir dos formulários de Portaria e RH/ASE, criadas conforme os formulários entram em operação.',
    icon: BarChart3,
    itens: [
      {
        id: 'rel_portaria',
        label: 'Relatórios de Portaria',
        icon: DoorOpen,
        desc: 'Movimentação de transportes, equipamentos de terceiros, carretas de chapas e ocorrências de plantão por período.',
        cor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400',
        fonte: 'Formulários da Portaria',
      },
      {
        id: 'rel_ase',
        label: 'Relatórios de ASE — Hora Extra',
        icon: Timer,
        desc: 'Horas autorizadas por setor, turno e colaborador, com totais de transporte e refeição para o rateio de facilities.',
        cor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
        path: '/formularios/rh-ase-hora-extra',
        fonte: 'Formulário ASE (FRM.RHU-0007)',
      },
    ],
  },
];

export default function FacilitiesHome({ user, onNavigate }: Props) {
  const toast = useToast();

  const abrir = (item: FacilityItem) => {
    if (item.path) { onNavigate(item.path); return; }
    toast.info(`${item.label}: em desenvolvimento. Disponível assim que o formulário de origem entrar em operação.`);
  };

  const secoesVisiveis = SECOES.map(secao => ({
    ...secao,
    itens: secao.itens.filter(item => !item.gateId || canAccessPage(user, item.gateId)),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-sm shadow-teal-500/25">
            <Building2 className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">Facilities</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Cadastros e relatórios de serviços gerais — transporte fretado, portaria e horas
              extras. Novas páginas aparecem aqui conforme os formulários de origem entram em
              operação.
            </p>
          </div>
        </div>
      </header>

      {secoesVisiveis.map(secao => {
        const SecaoIcon = secao.icon;
        return (
          <section key={secao.id} className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <SecaoIcon className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">{secao.label}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{secao.descricao}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {secao.itens.map(item => {
                const ItemIcon = item.icon;
                const disponivel = Boolean(item.path);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => abrir(item)}
                    aria-disabled={!disponivel}
                    className={`group relative flex h-full flex-col items-start rounded-2xl border p-4 text-left transition-all duration-200 ${
                      disponivel
                        ? 'cursor-pointer border-slate-200 bg-white hover:-translate-y-0.5 hover:border-teal-400/60 hover:shadow-lg hover:shadow-slate-900/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-400/40'
                        : 'border-dashed border-slate-200 bg-white/60 opacity-90 hover:opacity-100 dark:border-slate-800 dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.cor}`}>
                        <ItemIcon className="h-4.5 w-4.5" />
                      </span>
                      {disponivel ? (
                        <ArrowRight className="mt-1.5 h-4 w-4 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-teal-500" />
                      ) : (
                        <span className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                          <Clock className="h-3 w-3" />
                          Em breve
                        </span>
                      )}
                    </div>
                    <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-50">{item.label}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.desc}</p>
                    {item.fonte && (
                      <span className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        <Route className="h-3 w-3" />
                        {item.fonte}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
