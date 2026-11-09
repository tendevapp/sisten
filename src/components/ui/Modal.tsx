import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Pilha dos modais abertos, do mais antigo ao do topo.
 *
 * Cada modal escutava o Esc na `window` por conta própria: num modal sobre
 * modal, um Esc fechava os dois, e quem estava preenchendo o de trás perdia o
 * que digitou. Agora só o do topo reage. A pilha também liga a trava de
 * rolagem (`modal-aberto` no <html>, ver index.css) enquanto não estiver vazia.
 */
const pilhaModais: string[] = [];

function atualizarTravaRolagem() {
  document.documentElement.classList.toggle('modal-aberto', pilhaModais.length > 0);
}

const SELETOR_FOCAVEL = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

function focaveis(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL)).filter(
    el => el.offsetParent !== null || el === document.activeElement,
  );
}

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
  /** Caixa centralizada e com altura do conteúdo, inclusive no celular. */
  layout?: 'sheet' | 'dialog';
}

export default function Modal({
  onClose,
  children,
  maxWidth = 'max-w-2xl',
  ariaLabel,
  zIndexClassName = 'z-[100]',
  disableOutsideClose = false,
  layout = 'sheet',
}: ModalProps) {
  const id = useId();
  const painelRef = useRef<HTMLDivElement>(null);
  // Refs para o efeito de montagem não depender de `onClose`: as telas passam
  // arrow function nova a cada render, e re-registrar o modal reordenaria a
  // pilha.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const disableOutsideCloseRef = useRef(disableOutsideClose);
  disableOutsideCloseRef.current = disableOutsideClose;

  useEffect(() => {
    const origem = document.activeElement as HTMLElement | null;
    pilhaModais.push(id);
    atualizarTravaRolagem();

    // Foco entra no modal. Se um campo com autoFocus já o pegou, respeita.
    // Sem autoFocus, foca o próprio painel e não o primeiro campo: no celular,
    // focar um campo abriria o teclado por cima da gaveta.
    const painel = painelRef.current;
    if (painel && !painel.contains(document.activeElement)) {
      painel.focus({ preventScroll: true });
    }

    const noTopo = () => pilhaModais[pilhaModais.length - 1] === id;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!noTopo() || e.defaultPrevented) return;
      if (e.key === 'Escape') {
        // Um modal que só fecha por botão continua no topo e engole o Esc,
        // para não fechar o modal de baixo por engano.
        e.preventDefault();
        if (!disableOutsideCloseRef.current) onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && painelRef.current) {
        // Prende o Tab dentro do painel.
        const lista = focaveis(painelRef.current);
        if (lista.length === 0) {
          e.preventDefault();
          painelRef.current.focus();
          return;
        }
        const primeiro = lista[0];
        const ultimo = lista[lista.length - 1];
        const ativo = document.activeElement;
        if (e.shiftKey && (ativo === primeiro || ativo === painelRef.current)) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && ativo === ultimo) {
          e.preventDefault();
          primeiro.focus();
        } else if (!painelRef.current.contains(ativo)) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      const i = pilhaModais.lastIndexOf(id);
      if (i >= 0) pilhaModais.splice(i, 1);
      atualizarTravaRolagem();
      // Devolve o foco a quem abriu o modal, se ele ainda existe na tela.
      if (origem && origem.isConnected && typeof origem.focus === 'function') {
        origem.focus({ preventScroll: true });
      }
    };
  }, [id]);

  // Só fecha quando o gesto INTEIRO acontece no backdrop: press e release no
  // próprio overlay. Sem isso, selecionar uma opção num popover/lista de dentro
  // do modal e soltar o mouse fora do painel fechava o modal — o `click` é
  // emitido no ancestral comum (o backdrop) quando down e up têm alvos
  // diferentes.
  const pressIniciouNoBackdrop = useRef(false);
  const marcarOrigem = (e: React.MouseEvent | React.TouchEvent) => {
    pressIniciouNoBackdrop.current = e.target === e.currentTarget;
  };

  return (
    <div
      className={`fixed inset-0 ${zIndexClassName} flex ${layout === 'dialog' ? 'items-center p-4' : 'items-end sm:items-center p-0 sm:p-4'} justify-center bg-slate-950/60 dark:bg-black/70 backdrop-blur-xs animate-fade-in`}
      onMouseDown={marcarOrigem}
      onTouchStart={marcarOrigem}
      onClick={e => {
        if (disableOutsideClose) return;
        if (e.target === e.currentTarget && pressIniciouNoBackdrop.current) onClose();
        pressIniciouNoBackdrop.current = false;
      }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`w-full ${maxWidth} bg-white dark:bg-slate-900 outline-none ${layout === 'dialog' ? 'rounded-2xl h-auto' : 'rounded-t-3xl sm:rounded-2xl h-[92dvh] sm:h-auto pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-0'} shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden [&>form]:flex [&>form]:flex-col [&>form]:flex-1 [&>form]:min-h-0 [&>form]:overflow-hidden`}
      >
        {/* Mobile top pill indicator */}
        {layout === 'sheet' && <div className="sm:hidden mx-auto mt-2.5 mb-0.5 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0" />}
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
          className="shrink-0 rounded-xl p-2 -m-1 text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
