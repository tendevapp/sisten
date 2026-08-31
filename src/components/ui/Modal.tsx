import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Modal compartilhado do SISTEN.
 *
 * Comportamento responsivo: bottom-sheet colado na base da tela no mobile
 * (rodapé sempre alcançável com o polegar) e caixa centralizada no desktop.
 * O painel é um flex-col com max-h; o corpo (ModalBody) rola internamente,
 * garantindo que cabeçalho e rodapé nunca saiam da viewport.
 *
 * Uso típico:
 *   <Modal onClose={...} ariaLabel="Novo Fornecedor">
 *     <ModalHeader onClose={...}>...</ModalHeader>
 *     <form onSubmit={...} className="flex flex-col flex-1 min-h-0">
 *       <ModalBody>...</ModalBody>
 *       <ModalFooter>...</ModalFooter>
 *     </form>
 *   </Modal>
 */

interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  /** Classe Tailwind de largura máxima do painel no desktop. */
  maxWidth?: string;
  ariaLabel?: string;
  /** z-index do overlay (padrão z-50). Use z-[60] para modais sobre modais. */
  zIndexClassName?: string;
  /** Quando true, desabilita fechar clicando fora do painel ou pressionando Esc — só fecha via botão explícito (X, Cancelar, Salvar). */
  disableOutsideClose?: boolean;
}

export default function Modal({
  onClose,
  children,
  maxWidth = 'max-w-2xl',
  ariaLabel,
  zIndexClassName = 'z-[100]',
  disableOutsideClose = false
}: ModalProps) {
  useEffect(() => {
    if (disableOutsideClose) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, disableOutsideClose]);

  return (
    <div
      className={`fixed inset-0 ${zIndexClassName} flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 animate-fade-in`}
      onClick={e => { if (!disableOutsideClose && e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`w-full ${maxWidth} bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 h-[92dvh] sm:h-auto max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-0 [&>form]:flex [&>form]:flex-col [&>form]:flex-1 [&>form]:min-h-0 [&>form]:overflow-hidden`}
      >
        {/* Mobile top pill indicator */}
        <div className="sm:hidden mx-auto mt-2.5 mb-0.5 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0" />
        {children}
      </div>
    </div>
  );
}

interface ModalHeaderProps {
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

/** Cabeçalho fixo do modal (não rola). Inclui botão de fechar quando onClose é passado. */
export function ModalHeader({ children, onClose, className = '' }: ModalHeaderProps) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 dark:border-slate-800 shrink-0 ${className}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="shrink-0 rounded-xl p-2 -m-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

/** Corpo rolável do modal. */
export function ModalBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 sm:py-5 ${className}`}>
      {children}
    </div>
  );
}

/** Rodapé fixo do modal (não rola) — botões de ação sempre visíveis. */
export function ModalFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-end gap-2.5 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 dark:border-slate-800 bg-white sm:bg-slate-50 dark:bg-slate-900 dark:sm:bg-slate-800/50 shrink-0 ${className}`}>
      {children}
    </div>
  );
}
