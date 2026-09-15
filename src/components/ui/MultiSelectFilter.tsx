import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useFilterDropdownPosition } from './useFilterDropdownPosition';

/**
 * Filtro de seleção múltipla do SISTEN.
 *
 * Substitui o <select> nativo quando o usuário precisa marcar mais de um valor.
 * Seleção vazia = "todos" (nenhuma restrição), que é o estado inicial dos filtros.
 *
 * O gatilho mantém o mesmo visual dos selects da barra de filtros (pílula com
 * ícone à esquerda), e o painel abre sobreposto (portal) ancorado abaixo com busca opcional,
 * livre de qualquer recorte de overflow-x-auto no mobile.
 */

export interface MultiSelectFilterProps {
  /** Rótulo curto exibido quando nada está selecionado (ex: "RM"). */
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Ícone do lucide-react renderizado à esquerda do gatilho. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Texto do estado vazio no gatilho (padrão: "Todos"). */
  allLabel?: string;
  /** Formata cada opção para exibição (o value continua sendo a string crua). */
  renderOption?: (option: string) => string;
  /** Exibe o campo de busca. Padrão: automático a partir de 8 opções. */
  searchable?: boolean;
  className?: string;
  /**
   * Largura do painel sobreposto quando aberto. Por padrão o painel acompanha
   * a largura do gatilho (`w-full min-w-[200px]`).
   */
  panelClassName?: string;
}

export default function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  icon: Icon,
  allLabel = 'Todos',
  renderOption,
  searchable,
  className = 'min-w-[150px]',
  panelClassName,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const preferredWidth = useMemo(() => {
    if (panelClassName?.includes('w-96')) return 384;
    if (panelClassName?.includes('w-80')) return 320;
    if (panelClassName?.includes('w-72')) return 288;
    if (panelClassName?.includes('w-64')) return 256;
    return 240;
  }, [panelClassName]);

  const coords = useFilterDropdownPosition(open, containerRef, preferredWidth);
  const showSearch = searchable ?? options.length >= 8;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Ao fechar, limpa a busca para o próximo uso começar da lista inteira.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const visibleOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.toLowerCase().includes(q) || (renderOption?.(o) || '').toLowerCase().includes(q));
  }, [options, query, renderOption]);

  const toggle = (option: string) => {
    const next = new Set(selected);
    if (next.has(option)) next.delete(option); else next.add(option);
    onChange(next);
  };

  const resumo = selected.size === 0
    ? `${label}: ${allLabel}`
    : selected.size === 1
      ? (renderOption ? renderOption(Array.from(selected)[0]) : Array.from(selected)[0])
      : `${label}: ${selected.size} selecionados`;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center gap-1.5 ${Icon ? 'pl-8' : 'pl-3'} pr-8 py-2 rounded-xl border bg-slate-50 dark:bg-slate-950 text-xs font-bold text-left truncate focus:outline-none cursor-pointer transition-all ${
          selected.size > 0
            ? 'border-[#0056c6] text-[#0056c6]'
            : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 focus:border-[#0056c6]'
        }`}
      >
        {Icon && (
          <Icon className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none ${selected.size > 0 ? 'text-[#0056c6]' : 'text-slate-450'}`} />
        )}
        <span className="truncate">{resumo}</span>
        <ChevronDown className={`absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none transition-transform ${open ? 'rotate-180' : ''} ${selected.size > 0 ? 'text-[#0056c6]' : 'text-slate-400'}`} />
      </button>

      {selected.size > 0 && !open && (
        <button
          type="button"
          onClick={() => onChange(new Set())}
          aria-label={`Limpar filtro ${label}`}
          className="absolute -top-1.5 -right-1.5 rounded-full bg-[#0056c6] text-white p-0.5 shadow-xs hover:bg-[#00459e] transition-colors cursor-pointer"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {open && coords && typeof document !== 'undefined' && createPortal(
        <>
          {/* Backdrop mobile para fechar ao tocar fora e dar foco de overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/15 sm:bg-transparent"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            role="listbox"
            aria-multiselectable
            style={{
              top: coords.top,
              bottom: coords.bottom,
              left: coords.left,
              width: coords.width,
              maxHeight: coords.maxHeight,
            }}
            className={`fixed z-50 overflow-hidden flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl animate-fade-in ${
              panelClassName || ''
            }`}
          >
            {showSearch && (
              <div className="relative border-b border-slate-150 dark:border-slate-850 p-2 shrink-0">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar..."
                  className="w-full pl-8 pr-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:border-[#0056c6] focus:outline-none"
                />
              </div>
            )}

            <div className="overflow-y-auto flex-1 p-1 custom-scrollbar">
              {visibleOptions.length === 0 && (
                <p className="px-3 py-4 text-xs font-semibold text-slate-400 text-center">Nenhuma opção</p>
              )}
              {visibleOptions.map(option => {
                const marcado = selected.has(option);
                return (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={marcado}
                    onClick={() => toggle(option)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-850 transition-colors cursor-pointer"
                  >
                    <span className={`h-4 w-4 shrink-0 mt-0.5 rounded border flex items-center justify-center transition-colors ${
                      marcado ? 'bg-[#0056c6] border-[#0056c6]' : 'border-slate-300 dark:border-slate-700'
                    }`}>
                      {marcado && <Check className="h-3 w-3 text-white" />}
                    </span>
                    <span className="break-words leading-snug">{renderOption ? renderOption(option) : option}</span>
                  </button>
                );
              })}
            </div>

            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="border-t border-slate-150 dark:border-slate-850 px-3 py-2 text-xs font-bold text-slate-500 hover:text-[#0056c6] transition-colors cursor-pointer shrink-0"
              >
                Limpar seleção ({selected.size})
              </button>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
