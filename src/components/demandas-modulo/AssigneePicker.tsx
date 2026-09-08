/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Seleção múltipla de responsáveis / membros — popover de busca sobre os
 * usuários ativos. Usado no cartão, no modal da tarefa e no compartilhamento
 * do quadro.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Avatar, useUsuarios } from './shared';

interface Props {
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  /** Ids que não podem ser escolhidos (ex.: já são membros por setor). */
  bloqueados?: string[];
  disabled?: boolean;
}

export default function AssigneePicker({ selected, onChange, placeholder = 'Adicionar pessoas', bloqueados = [], disabled }: Props) {
  const { lista, porId } = useUsuarios();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const visiveis = useMemo(() => {
    const termo = q.trim().toLowerCase();
    return lista.filter(p => !termo || p.name.toLowerCase().includes(termo) || p.email.toLowerCase().includes(termo));
  }, [lista, q]);

  const toggle = (id: string) => {
    if (bloqueados.includes(id)) return;
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map(id => (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-xs font-semibold"
            style={{ background: 'var(--surface-sunken)', color: 'var(--ink-secondary)' }}
          >
            <Avatar nome={porId.get(id)?.name || 'Usuário'} size={18} />
            <span className="max-w-[120px] truncate">{porId.get(id)?.name || 'Usuário'}</span>
            {!disabled && !bloqueados.includes(id) && (
              <button type="button" onClick={() => toggle(id)} aria-label="Remover" className="hover:text-[var(--status-critical)]">
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs font-semibold transition-colors"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}
          >
            {placeholder} <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-40 mt-1.5 w-72 max-h-80 overflow-hidden flex flex-col rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
          <div className="relative border-b border-slate-100 dark:border-slate-800 p-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar pessoa..."
              className="w-full pl-8 pr-2 py-1.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-[var(--brand)]"
            />
          </div>
          <div className="overflow-y-auto flex-1 p-1">
            {visiveis.length === 0 && <p className="px-3 py-4 text-xs text-slate-400 text-center">Ninguém encontrado</p>}
            {visiveis.map(p => {
              const marcado = selected.includes(p.id);
              const travado = bloqueados.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={travado}
                  onClick={() => toggle(p.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                >
                  <span className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center ${marcado ? 'bg-[var(--brand)] border-[var(--brand)]' : 'border-slate-300 dark:border-slate-600'}`}>
                    {marcado && <Check className="h-3 w-3 text-white" />}
                  </span>
                  <Avatar nome={p.name} size={20} />
                  <span className="min-w-0 flex-1 truncate">{p.name}{travado && ' (por setor)'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
