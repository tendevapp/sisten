import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Paginação compartilhada do SISTEN.
 *
 * `page` é 0-indexado (primeira página = 0). Alvos de toque ≥40px e layout
 * que empilha no mobile. No mobile mostra apenas Anterior/Próxima + contador;
 * no desktop (sm+) mostra a janela numérica de páginas.
 */

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Texto opcional à esquerda (ex.: "1.234 registros"). */
  info?: React.ReactNode;
  className?: string;
}

export default function Pagination({ page, totalPages, onPageChange, info, className = '' }: PaginationProps) {
  if (totalPages <= 1) return null;

  const windowStart = Math.max(0, Math.min(page - 2, totalPages - 5));
  const windowSize = Math.min(5, totalPages);

  const btnBase = 'inline-flex items-center justify-center rounded-lg text-xs font-medium transition-colors min-h-[40px] min-w-[40px] px-3 disabled:opacity-40 disabled:cursor-not-allowed';
  const btnIdle = 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 ${className}`}>
      {info && <span className="text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">{info}</span>}
      <nav className="flex items-center gap-1.5" aria-label="Paginação">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className={`${btnBase} ${btnIdle}`}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="hidden sm:flex items-center gap-1.5">
          {Array.from({ length: windowSize }, (_, i) => {
            const p = windowStart + i;
            const isCurrent = p === page;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={isCurrent ? 'page' : undefined}
                className={`${btnBase} ${isCurrent ? 'bg-blue-600 text-white' : btnIdle}`}
              >
                {p + 1}
              </button>
            );
          })}
        </div>
        <span className="sm:hidden text-xs font-medium text-slate-600 dark:text-slate-300 px-2">
          {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className={`${btnBase} ${btnIdle}`}
          aria-label="Próxima página"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}
