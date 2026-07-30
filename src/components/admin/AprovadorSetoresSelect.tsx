/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Seleção múltipla dos setores que um usuário gerencia — inline na tabela de
 * usuários do Painel de Administração.
 *
 * Marcar um setor aqui tem dois efeitos, e é por isso que o controle mora na
 * mesma linha do papel do usuário em vez de numa tela à parte: quem está
 * marcado passa a receber a notificação de nova solicitação daquele setor
 * (localDb.publishRequest) e passa a ver essas solicitações na fila de
 * Aprovações (Approvals.tsx).
 *
 * Não reusa MultiSelectFilter de propósito: lá seleção vazia significa "todos"
 * (é um filtro), e aqui significa "nenhum setor". Inverter esse contrato
 * deixaria o componente mentindo para quem o lesse depois.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Sector } from '../../types';

interface Props {
  sectors: Sector[];
  /** Ids dos setores que o usuário aprova. */
  selected: string[];
  cadastroSap: boolean;
  onChangeSetores: (next: string[]) => void;
  onChangeCadastroSap: (next: boolean) => void;
  disabled?: boolean;
}

export default function AprovadorSetoresSelect({
  sectors, selected, cadastroSap, onChangeSetores, onChangeCadastroSap, disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  const visiveis = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sectors.filter(s => s.name.toLowerCase().includes(q)) : sectors;
  }, [sectors, query]);

  const toggle = (id: string) => {
    onChangeSetores(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  };

  // O resumo nomeia o setor quando é só um: "Setor 5" diz mais que "1 setor",
  // e a coluna é estreita demais para listar dois ou mais.
  const resumo = (() => {
    const partes: string[] = [];
    if (selected.length === 1) {
      partes.push(sectors.find(s => s.id === selected[0])?.name || '1 setor');
    } else if (selected.length > 1) {
      partes.push(`${selected.length} setores`);
    }
    if (cadastroSap) partes.push('Cadastro SAP');
    return partes.length ? partes.join(' + ') : 'Nenhum';
  })();

  const ativo = selected.length > 0 || cadastroSap;

  return (
    <div ref={ref} className="relative min-w-[130px]">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Definir setores que este usuário aprova"
        className={`w-full flex items-center gap-1 pl-2.5 pr-7 py-1 rounded border text-xs font-semibold text-left truncate transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
          ativo
            ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/30'
            : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 bg-white dark:bg-slate-900'
        }`}
      >
        <span className="truncate">{resumo}</span>
        <ChevronDown className={`absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none transition-transform ${open ? 'rotate-180' : ''} ${ativo ? 'text-emerald-600' : 'text-slate-400'}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute z-40 mt-1 w-64 max-h-80 overflow-hidden flex flex-col rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl"
        >
          <p className="px-3 pt-2.5 pb-2 text-[11px] text-slate-500 dark:text-slate-400 leading-snug border-b border-slate-100 dark:border-slate-800">
            Recebe notificação e pode aprovar as solicitações de compra destes setores.
          </p>

          <label className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <input
              type="checkbox"
              checked={cadastroSap}
              disabled={disabled}
              onChange={e => onChangeCadastroSap(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 shrink-0"
            />
            <span>Também aprovador de Cadastro SAP</span>
          </label>

          {sectors.length >= 8 && (
            <div className="relative border-b border-slate-100 dark:border-slate-800 p-2">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar setor..."
                className="w-full pl-8 pr-2 py-1.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 focus:border-emerald-600 focus:outline-none"
              />
            </div>
          )}

          <div className="overflow-y-auto flex-1 p-1">
            {visiveis.length === 0 && (
              <p className="px-3 py-4 text-xs text-slate-400 text-center">Nenhum setor encontrado</p>
            )}
            {visiveis.map(s => {
              const marcado = selected.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={marcado}
                  disabled={disabled}
                  onClick={() => toggle(s.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40"
                >
                  <span className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                    marcado ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300 dark:border-slate-600'
                  }`}>
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
              onClick={() => onChangeSetores([])}
              className="border-t border-slate-100 dark:border-slate-800 px-3 py-2 text-xs font-bold text-slate-500 hover:text-emerald-700 transition-colors cursor-pointer"
            >
              Desmarcar todos ({selected.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
