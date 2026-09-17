/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { Bug, ChevronDown, ChevronUp, HelpCircle, Lightbulb } from 'lucide-react';
import { useTourRegistry } from '../help/TourRegistryContext';
import { onBugPrefill, BugPrefill } from '../../lib/feedbackReportBus';
import FeedbackModal from './FeedbackModal';

interface FeedbackButtonProps {
  pagePath: string;
}

type ModalState = { mode: 'bug' | 'sugestao'; prefill?: BugPrefill } | null;

/**
 * Botão flutuante único, montado uma vez no layout autenticado (App.tsx).
 * Fica discretamente recolhido no canto inferior direito, sem o botão verde expandido.
 * Ao clicar, abre o menu de ações: Tour guiado (se disponível), Reportar erro e Enviar sugestão.
 */
export default function FeedbackButton({ pagePath }: FeedbackButtonProps) {
  const { activeTour } = useTourRegistry();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => onBugPrefill(prefill => {
    setMenuOpen(false);
    setModal({ mode: 'bug', prefill });
  }), []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const pulse = !!activeTour && !activeTour.seen && !activeTour.isOpen;

  return (
    <div ref={containerRef} className="fixed bottom-20 right-4 z-[90] sm:right-6">
      {menuOpen && (
        <div
          role="menu"
          className="absolute bottom-9 right-0 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {activeTour && (
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); activeTour.open(); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <HelpCircle className="h-4 w-4 text-emerald-600 shrink-0" />
              Tour guiado desta página
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => { setMenuOpen(false); setModal({ mode: 'bug' }); }}
            className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer ${activeTour ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}
          >
            <Bug className="h-4 w-4 text-red-600 shrink-0" />
            Reportar um erro
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setMenuOpen(false); setModal({ mode: 'sugestao' }); }}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-t border-slate-100 dark:border-slate-800 cursor-pointer"
          >
            <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
            Enviar sugestão
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setMenuOpen(v => !v)}
        aria-label="Ajuda e reportes"
        aria-expanded={menuOpen}
        title="Ajuda / Reportar"
        data-tour="help-button"
        className="relative flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-700 hover:shadow active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
      >
        {pulse && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        )}
        {menuOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>

      {modal && (
        <FeedbackModal
          mode={modal.mode}
          pagePath={pagePath}
          prefillDescription={modal.prefill?.message}
          prefillStack={modal.prefill?.stack}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
