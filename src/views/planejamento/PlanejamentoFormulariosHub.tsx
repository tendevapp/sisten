/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulários › Planejamento — grupo dos formulários do Planejamento.
 * Mesmo desenho dos hubs de SSMA/Portaria: um card por formulário liberado.
 * Formulário novo do grupo entra em FORMULARIOS_PLANEJAMENTO (e em
 * FORMULARIOS_DETALHADOS, em lib/pages.ts, com grupoId 'planejamento').
 */

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, ArrowRight, CalendarRange, Lightbulb } from 'lucide-react';
import type { Profile } from '../../types';
import { canAccessForm } from '../../lib/pages';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const FORMULARIOS_PLANEJAMENTO: { id: string; codigo: string; titulo: string; desc: string; path: string; icon: LucideIcon }[] = [
  {
    id: 'form_planejamento_kaizen',
    codigo: 'FRM.ENG-0017',
    titulo: 'Aqui TEN Melhoria! (Kaizen)',
    desc: 'Registre um desperdício ou problema, a causa, a melhoria implantada e o resultado, com fotos.',
    path: '/formularios/planejamento-kaizen',
    icon: Lightbulb,
  },
];

export default function PlanejamentoFormulariosHub({ user, onNavigate }: Props) {
  const visiveis = FORMULARIOS_PLANEJAMENTO.filter(f => canAccessForm(user, f.id));

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      <div>
        <button
          type="button"
          onClick={() => onNavigate('/formularios')}
          className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
          Voltar para Módulos de Formulários
        </button>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-500/20">
            <CalendarRange className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">Planejamento</h1>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Formulários do Planejamento e melhoria contínua</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visiveis.length === 0 ? (
          <p className="col-span-full rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-800">
            Nenhum formulário do Planejamento liberado para o seu perfil. Peça liberação ao administrador.
          </p>
        ) : (
          visiveis.map(f => {
            const Icon = f.icon;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onNavigate(f.path)}
                className="group flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-blue-500/50 hover:shadow-lg hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex w-full items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">{f.codigo}</span>
                </div>
                <h3 className="mt-3.5 text-base font-bold text-slate-900 group-hover:text-blue-700 dark:text-slate-100 dark:group-hover:text-blue-400">{f.titulo}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{f.desc}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-700 transition-transform group-hover:translate-x-1 dark:text-blue-400">
                  Acessar <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
