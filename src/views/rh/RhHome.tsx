/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tela inicial do módulo RH — mesmo desenho do hub de Facilities: uma grade de
 * cards agrupados em "Cadastros" (as tabelas mestre do RH) e "Relatórios" (o
 * que se produz a partir delas).
 *
 * Montada a partir de `SECOES`: para publicar uma página nova, basta
 * acrescentar o item com seu `path` — o card sai do estado "em breve" e passa a
 * navegar, sem mexer no layout.
 */

import type { LucideIcon } from 'lucide-react';
import {
  UserCog, Users, Map, Clock, Percent, BusFront, Timer, ArrowRight,
  ClipboardList, BarChart3, Database, Clock3,
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { canAccessPage } from '../../lib/pages';
import type { Profile } from '../../types';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

interface RhItem {
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
  itens: RhItem[];
}

const SECOES: Secao[] = [
  {
    id: 'cadastros',
    label: 'Cadastros',
    descricao: 'Tabelas mestre do RH. São elas que abastecem o formulário de ASE e as buscas de colaborador nos demais módulos.',
    icon: ClipboardList,
    itens: [
      {
        id: 'colaboradores',
        label: 'Colaboradores',
        icon: Users,
        desc: 'Matrícula, nome, macroárea, área, subsetor, cargo, liderança, turno e situação. Cadastre e edite sem depender de nova importação de planilha.',
        cor: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400',
        path: '/rh/colaboradores',
        gateId: 'rh_colaboradores',
        fonte: 'Base rh_pessoas',
      },
      {
        id: 'setores',
        label: 'Setores do RH',
        icon: Map,
        desc: 'Setores que aparecem no cabeçalho da ASE e definem a sigla do protocolo. Inative em vez de excluir para preservar o histórico.',
        cor: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-400',
        path: '/rh/setores',
        gateId: 'rh_setores_cad',
        fonte: 'Base rh_setores',
      },
      {
        id: 'turnos',
        label: 'Turnos',
        icon: Clock,
        desc: 'Turnos de trabalho oferecidos no campo "Turno" da ASE (ADM, 2º Turno, 3º Turno).',
        cor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
        path: '/rh/turnos',
        gateId: 'rh_turnos_cad',
        fonte: 'Base rh_turnos',
      },
      {
        id: 'rotas',
        label: 'Rotas de Transporte',
        icon: BusFront,
        desc: 'Colaboradores, pontos de embarque e horários do transporte fretado. É o que preenche a programação de transporte da ASE.',
        cor: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400',
        path: '/rh/rotas',
        gateId: 'rh_rotas_cad',
        fonte: 'Base rh_rotas',
      },
      {
        id: 'percentual_he',
        label: 'Percentual de Hora Extra',
        icon: Percent,
        desc: 'Calendário de %HE por data. Quando a data não está cadastrada, a ASE aplica o padrão do dia da semana (domingo 100%, sábado 80%, seg-sex 60%).',
        cor: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
        path: '/rh/percentual-he',
        gateId: 'rh_percentual_he',
        fonte: 'Base rh_hora_extra',
      },
    ],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    descricao: 'Consolidações a partir dos formulários de RH.',
    icon: BarChart3,
    itens: [
      {
        id: 'rel_ase',
        label: 'ASE — Hora Extra',
        icon: Timer,
        desc: 'Abrir o formulário de Autorização para Serviços Extraordinários: lista das ASEs, filtros por status e período, e as exportações consolidadas do dia em PDF e Excel.',
        cor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
        path: '/formularios/rh-ase-hora-extra',
        fonte: 'Formulário ASE (FRM.RHU-0007)',
      },
    ],
  },
];

export default function RhHome({ user, onNavigate }: Props) {
  const toast = useToast();

  const abrir = (item: RhItem) => {
    if (item.path) { onNavigate(item.path); return; }
    toast.info(`${item.label}: em desenvolvimento.`);
  };

  const secoesVisiveis = SECOES.map(secao => ({
    ...secao,
    itens: secao.itens.filter(item => !item.gateId || canAccessPage(user, item.gateId)),
  })).filter(secao => secao.itens.length > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-500/25">
            <UserCog className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">RH</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Cadastros de pessoal e os relatórios de hora extra. As tabelas daqui abastecem o
              formulário de ASE e a busca de colaboradores nos demais módulos do SISTEN.
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
                        ? 'cursor-pointer border-slate-200 bg-white hover:-translate-y-0.5 hover:border-blue-400/60 hover:shadow-lg hover:shadow-slate-900/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-400/40'
                        : 'border-dashed border-slate-200 bg-white/60 opacity-90 hover:opacity-100 dark:border-slate-800 dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.cor}`}>
                        <ItemIcon className="h-4.5 w-4.5" />
                      </span>
                      {disponivel ? (
                        <ArrowRight className="mt-1.5 h-4 w-4 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-blue-500" />
                      ) : (
                        <span className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                          <Clock3 className="h-3 w-3" />
                          Em breve
                        </span>
                      )}
                    </div>
                    <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-50">{item.label}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.desc}</p>
                    {item.fonte && (
                      <span className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        <Database className="h-3 w-3" />
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
