/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Seleção múltipla dos setores cujos quadros do módulo Demandas este usuário
 * enxerga além do próprio — inline na aba de Governança de Gestão de Usuários.
 *
 * Espelha `AprovadorSetoresSelect`, mas com semântica própria: aqui não há o
 * "Cadastro SAP", e seleção vazia significa "só o próprio setor", não "nenhum".
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Sector } from '../../types';

interface Props {
  sectors: Sector[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export default function DemandasSetoresSelect({ sectors, selected, onChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  const visiveis = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sectors.filter(s => s.name.toLowerCase().includes(q)) : sectors;
  }, [sectors, query]);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  };

  const resumo = selected.length === 0
    ? 'Só o próprio setor'
    : selected.length === 1
      ? (sectors.find(s => s.id === selected[0])?.name || '1 setor')
      : `${selected.length} setores`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center gap-1 pl-3 pr-8 py-1.5 rounded-xl border text-xs font-semibold text-left truncate transition-colors cursor-pointer disabled:opacity-40 ${
          selected.length > 0
            ? 'border-indigo-500 text-indigo-700 bg-indigo-50/60'
            : 'border-slate-200 text-slate-500 hover:border-slate-300 bg-white'
        }`}
      >
        <span className="truncate">{resumo}</span>
        <ChevronDown className={`absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none transition-transform ${open ? 'rotate-180' : ''} ${selected.length > 0 ? 'text-indigo-500' : 'text-slate-400'}`} />
      </button>

      {open && (
        <div role="listbox" aria-multiselectable className="absolute z-40 mt-1 w-72 max-h-80 overflow-hidden flex flex-col rounded-lg border border-slate-200 bg-white shadow-xl">
          <p className="px-3 pt-2.5 pb-2 text-[11px] text-slate-500 leading-snug border-b border-slate-100">
            Vê os quadros de Demandas destes setores, além do próprio. Vazio = só o setor dele.
          </p>
          {sectors.length >= 8 && (
            <div className="relative border-b border-slate-100 p-2">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar setor..."
                className="w-full pl-8 pr-2 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          )}
          <div className="overflow-y-auto flex-1 p-1">
            {visiveis.length === 0 && <p className="px-3 py-4 text-xs text-slate-400 text-center">Nenhum setor encontrado</p>}
            {visiveis.map(s => {
              const marcado = selected.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(s.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40"
                >
                  <span className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center ${marcado ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                    {marcado && <Check className="h-3 w-3 text-white" />}
                  </span>
                  <span className="truncate">{s.name}</span>
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange([])}
              className="border-t border-slate-100 px-3 py-2 text-xs font-bold text-slate-500 hover:text-indigo-700 transition-colors cursor-pointer"
            >
              Limpar ({selected.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
