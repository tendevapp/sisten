/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Substitui o antigo campo "Vigilante Responsável" (um <select> manual) nos
 * formulários da Portaria: cada vigilante agora tem login próprio, então quem
 * está lançando o registro é sempre quem está autenticado — não faz mais
 * sentido perguntar e correr o risco de alguém selecionar outro nome.
 */

import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface Props {
  nome: string;
  label?: string;
  className?: string;
}

export default function VigilanteOperadorAtual({ nome, label = 'Vigilante Responsável', className = '' }: Props) {
  return (
    <div className={`w-full ${className}`}>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
        <span>{label}</span>
      </label>
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-base font-medium text-slate-700 sm:py-2 sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        <span>{nome || '—'}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Usuário logado
        </span>
      </div>
    </div>
  );
}
