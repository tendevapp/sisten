/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Componente de busca por palavras-chave com adição de chips (tags),
 * idêntico ao padrão do Catálogo de Materiais SAP (Materials.tsx).
 *
 * Cada palavra digitada e confirmada (Enter ou botão Adicionar) vira um chip ativo.
 * A busca filtra exigindo a presença cumulativa (AND) de todos os chips ativos.
 */

import React, { useState, useRef } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { extrairPalavrasChave, adicionarChipsKeywords, removerChipKeyword } from '../../lib/buscaKeywords';

export interface SearchKeywordsChipsProps {
  /** Lista de chips/palavras-chave ativas */
  chips: string[];
  /** Callback chamado quando a lista de chips muda */
  onChangeChips: (chips: string[]) => void;
  /** Placeholder para o campo de digitação */
  placeholder?: string;
  /** Tema de cor de destaque */
  accent?: 'blue' | 'emerald' | 'amber' | 'brand';
  /** Rótulo do botão de adicionar */
  buttonLabel?: string;
  /** Classe CSS adicional para o container */
  className?: string;
  /** Modo compacto (altura reduzida) */
  compact?: boolean;
}

export default function SearchKeywordsChips({
  chips,
  onChangeChips,
  placeholder = 'Digite um termo e pressione Enter (cada termo vira um chip — busca cumulativa AND)',
  accent = 'emerald',
  buttonLabel = 'Adicionar',
  className = '',
  compact = false,
}: SearchKeywordsChipsProps) {
  const [queryInput, setQueryInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = queryInput.trim();
    if (!clean) return;

    const novaLista = adicionarChipsKeywords(chips, clean);
    if (novaLista !== chips) {
      onChangeChips(novaLista);
    }
    setQueryInput('');
  };

  const handleRemoveChip = (chipToRemove: string) => {
    onChangeChips(removerChipKeyword(chips, chipToRemove));
  };

  const handleClearAll = () => {
    setQueryInput('');
    onChangeChips([]);
    inputRef.current?.focus();
  };

  // Cores por tema
  const getThemeClasses = () => {
    switch (accent) {
      case 'blue':
        return {
          btn: 'bg-[#0056c6] hover:bg-[#004bb0] active:scale-95 text-white',
          chip: 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800/60 text-blue-800 dark:text-blue-200',
          chipBtn: 'text-blue-500 hover:text-blue-800 dark:hover:text-blue-100',
          focus: 'focus:border-[#0056c6] focus:ring-1 focus:ring-[#0056c6]/20',
        };
      case 'amber':
        return {
          btn: 'bg-amber-600 hover:bg-amber-700 active:scale-95 text-white',
          chip: 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200',
          chipBtn: 'text-amber-500 hover:text-amber-800 dark:hover:text-amber-100',
          focus: 'focus:border-amber-600 focus:ring-1 focus:ring-amber-600/20',
        };
      case 'brand':
        return {
          btn: 'bg-[var(--brand)] hover:opacity-90 active:scale-95 text-white',
          chip: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200',
          chipBtn: 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-100',
          focus: 'focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]/20',
        };
      case 'emerald':
      default:
        return {
          btn: 'bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white',
          chip: 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200',
          chipBtn: 'text-emerald-500 hover:text-emerald-800 dark:hover:text-emerald-100',
          focus: 'focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/20',
        };
    }
  };

  const theme = getThemeClasses();

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Barra de input com botão Adicionar */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <div className="relative flex-1">
          <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} text-slate-400 pointer-events-none`} />
          <input
            ref={inputRef}
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !queryInput && chips.length > 0) {
                e.preventDefault();
                handleRemoveChip(chips[chips.length - 1]);
              }
            }}
            placeholder={placeholder}
            className={`w-full pl-10 pr-4 ${compact ? 'py-1.5 text-xs' : 'py-2.5 text-sm'} rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none ${theme.focus} transition-all`}
          />
        </div>
        <button
          type="submit"
          className={`flex items-center gap-1.5 px-4 ${compact ? 'py-1.5 text-[11px]' : 'py-2.5 text-xs'} font-bold rounded-xl shadow-xs transition-all cursor-pointer shrink-0 ${theme.btn}`}
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{buttonLabel}</span>
        </button>
      </form>

      {/* Container de Chips Ativos */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center pt-0.5 animate-fade-in">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1">
            Termos ativos:
          </span>
          {chips.map((chip, idx) => (
            <span
              key={`${chip}-${idx}`}
              className={`inline-flex items-center gap-1.5 rounded-full border py-0.5 px-2.5 text-xs font-semibold shadow-2xs transition-all ${theme.chip}`}
            >
              <span>{chip}</span>
              <button
                type="button"
                onClick={() => handleRemoveChip(chip)}
                className={`focus:outline-none cursor-pointer rounded-full p-0.5 transition-colors ${theme.chipBtn}`}
                title={`Remover palavra "${chip}"`}
                aria-label={`Remover palavra "${chip}"`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={handleClearAll}
            className="text-xs font-bold text-red-500 hover:text-red-600 dark:text-red-400 hover:underline ml-2 cursor-pointer"
          >
            Limpar termos
          </button>
        </div>
      )}
    </div>
  );
}
