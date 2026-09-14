/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Campo de pessoa (executante/inspetor) — seleciona de `rh_pessoas` ou digita
 * o nome à mão, mesmo micro-padrão de `components/portaria/VigilanteSelect.tsx`
 * (toggle lista/manual). Sem `pessoa_id` quando digitado — mesmo desenho do
 * RID (`ssma_rid_desvios.pessoa_id` opcional + nome desnormalizado).
 */

import React, { useState } from 'react';
import { ChevronDown, User } from 'lucide-react';
import type { RhPessoa } from '../../types';

export interface ValorPessoa {
  pessoaId: string | null;
  nome: string;
}

interface Props {
  label: string;
  pessoas: RhPessoa[];
  loading?: boolean;
  value: ValorPessoa;
  onChange: (v: ValorPessoa) => void;
  required?: boolean;
}

export default function SeletorPessoaField({ label, pessoas, loading, value, onChange, required = false }: Props) {
  const [modoManual, setModoManual] = useState(() => !value.pessoaId && !!value.nome);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
          <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            {label} {required && <span className="text-red-500">*</span>}
          </span>
        </label>
        <button
          type="button"
          onClick={() => {
            setModoManual(m => !m);
            onChange({ pessoaId: null, nome: '' });
          }}
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400"
        >
          {modoManual ? 'Selecionar da lista' : '✍️ Digitar nome'}
        </button>
      </div>

      {modoManual ? (
        <input
          type="text"
          value={value.nome}
          onChange={e => onChange({ pessoaId: null, nome: e.target.value })}
          placeholder="Nome"
          required={required}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:py-2 sm:text-sm"
        />
      ) : (
        <div className="relative">
          <select
            required={required}
            value={value.pessoaId ?? ''}
            onChange={e => {
              if (!e.target.value) {
                onChange({ pessoaId: null, nome: '' });
                return;
              }
              const p = pessoas.find(x => x.id === e.target.value);
              onChange({ pessoaId: p?.id ?? null, nome: p?.nome ?? '' });
            }}
            className="w-full cursor-pointer appearance-none truncate rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3.5 pr-10 text-base font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:py-2 sm:text-sm"
          >
            <option value="">{loading ? 'Carregando...' : 'Selecione...'}</option>
            {pessoas.map(p => (
              <option key={p.id} value={p.id}>
                {p.nome}
                {p.registro ? ` • ${p.registro}` : ''}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400">
            <ChevronDown className="h-4 w-4 shrink-0" />
          </div>
        </div>
      )}
    </div>
  );
}
