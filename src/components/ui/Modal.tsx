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
}

export default function Modal({ onClose, children, maxWidth = 'max-w-2xl', ariaLabel, zIndexClassName = 'z-50' }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 ${zIndexClassName} flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-in`}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`w-full ${maxWidth} bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0`}
      >
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
    <div className={`flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0 ${className}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="shrink-0 rounded-lg p-2 -m-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
    <div className={`flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 ${className}`}>
      {children}
    </div>
  );
}

/** Rodapé fixo do modal (não rola) — botões de ação sempre visíveis. */
export function ModalFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-end gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 shrink-0 ${className}`}>
      {children}
    </div>
  );
}
