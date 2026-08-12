/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Bug, HelpCircle, Lightbulb, MessageCircleQuestion } from 'lucide-react';
import { useTourRegistry } from '../help/TourRegistryContext';
import { onBugPrefill, BugPrefill } from '../../lib/feedbackReportBus';
import FeedbackModal from './FeedbackModal';

interface FeedbackButtonProps {
  pagePath: string;
}

type ModalState = { mode: 'bug' | 'sugestao'; prefill?: BugPrefill } | null;

/**
 * Botão flutuante único, montado uma vez no layout autenticado (App.tsx).
 * Substitui o antigo HelpButton por página: o "Tour guiado" só aparece no
 * menu quando a página atual registrou um tour via usePageTour.
 */
export default function FeedbackButton({ pagePath }: FeedbackButtonProps) {
  const { activeTour } = useTourRegistry();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  useEffect(() => onBugPrefill(prefill => {
    setMenuOpen(false);
    setModal({ mode: 'bug', prefill });
  }), []);

  const pulse = !!activeTour && !activeTour.seen && !activeTour.isOpen;

  return (
    <div className="fixed bottom-6 right-6 z-[90]" data-tour="help-button">
      {pulse && (
        <motion.span
          className="absolute inset-0 rounded-full bg-emerald-500"
          animate={{ scale: [1, 1.6], opacity: [0.55, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
      )}

      {menuOpen && (
        <div
          role="menu"
          className="absolute bottom-16 right-0 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          {activeTour && (
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); activeTour.open(); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <HelpCircle className="h-4 w-4 text-emerald-600 shrink-0" />
              Tour guiado desta página
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => { setMenuOpen(false); setModal({ mode: 'bug' }); }}
            className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${activeTour ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}
          >
            <Bug className="h-4 w-4 text-red-600 shrink-0" />
            Reportar um erro
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setMenuOpen(false); setModal({ mode: 'sugestao' }); }}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-t border-slate-100 dark:border-slate-800"
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
        title="Ajuda / Reportar"
        className="relative flex items-center justify-center h-12 w-12 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 transition-colors active:scale-95"
      >
        <MessageCircleQuestion className="h-5.5 w-5.5" />
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
