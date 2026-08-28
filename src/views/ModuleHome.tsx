/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tela inicial genérica de um módulo. Recebe `moduleId`, busca a definição em
 * `lib/moduleHomes.ts` e monta a grade de cards a partir das páginas de `PAGES`
 * daquele grupo que o usuário tem acesso — mantendo o hub sempre alinhado ao
 * que o Sidebar mostra. Facilities tem tela própria (`views/facilities`) por
 * ter seções e relatórios sob medida.
 */

import { ArrowRight, LayoutGrid } from 'lucide-react';
import { PAGES, canAccessPage } from '../lib/pages';
import { getModuleHome } from '../lib/moduleHomes';
import type { Profile } from '../types';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
  moduleId: string;
}

export default function ModuleHome({ user, onNavigate, moduleId }: Props) {
  const def = getModuleHome(moduleId);
  if (!def) return null;

  const Icon = def.icon;
  const cards = PAGES.filter(p =>
    p.group === def.group && p.path && p.path !== def.homePath && canAccessPage(user, p.id),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex items-start gap-3.5">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm ${def.accent.tile}`}>
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">{def.title}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {def.description}
          </p>
        </div>
      </header>

      {cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center dark:border-slate-800 dark:bg-slate-900">
          <LayoutGrid className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Nenhuma página deste módulo liberada para o seu usuário
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Fale com o administrador do sistema para solicitar acesso.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(p => {
            const CardIcon = p.icon!;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onNavigate(p.path!)}
                className={`group relative flex h-full flex-col items-start rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5 focus:outline-none focus-visible:ring-2 dark:border-slate-800 dark:bg-slate-900 ${def.accent.hoverBorder} ${def.accent.ring}`}
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <CardIcon className="h-4.5 w-4.5" />
                  </span>
                  <ArrowRight
                    className={`mt-1.5 h-4 w-4 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-1 ${def.accent.arrow}`}
                  />
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-50">{p.label}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {def.cardDescriptions[p.id] ?? 'Abrir esta área do módulo.'}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
