import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Upload } from 'lucide-react';
import Modal, { ModalBody, ModalFooter } from './Modal';
import ProgressoImportacao from './ProgressoImportacao';

interface Props {
  sigla: string;
  descricao: string;
  ocupado: boolean;
  progresso: number;
  mensagem?: string;
  onClose?: () => void;
  concluido?: boolean;
  children?: ReactNode;
}

const naoFechar = () => {};

/** Mesmo painel para todos os pontos de entrada de planilhas SAP. */
export default function ModalImportacaoSap({
  sigla, descricao, ocupado, progresso, mensagem = 'Enviando os dados…',
  onClose = naoFechar, concluido = false, children,
}: Props) {
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const anterior = document.activeElement;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    painel.current?.focus();
    const prenderFoco = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elementos = painel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]');
      const primeiro = elementos?.[0];
      const ultimo = elementos?.[elementos.length - 1];
      if (!primeiro || !ultimo) {
        event.preventDefault();
        painel.current?.focus();
      } else if (event.shiftKey && (document.activeElement === primeiro || document.activeElement === painel.current)) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener('keydown', prenderFoco);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', prenderFoco);
      if (anterior instanceof HTMLElement && anterior.isConnected) anterior.focus();
    };
  }, []);

  const modal = (
    <Modal onClose={ocupado ? naoFechar : onClose} layout="dialog" maxWidth="max-w-lg" ariaLabel={`Importar ${sigla}`} disableOutsideClose>
      <div ref={painel} tabIndex={-1} className="flex min-h-0 flex-col outline-none" aria-busy={ocupado}>
        <div className="flex shrink-0 items-start gap-3 border-b border-slate-100 px-4 py-5 sm:px-6 dark:border-slate-800">
          <div className="shrink-0 rounded-xl bg-emerald-50 p-2.5 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <Upload className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Importar {sigla}</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{descricao}</p>
          </div>
        </div>
        <ModalBody className="space-y-4">
          {ocupado && <ProgressoImportacao tamanho="compacto" pct={progresso} mensagem={mensagem} />}
          {children}
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={ocupado}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {concluido ? 'Fechar' : 'Cancelar'}
          </button>
        </ModalFooter>
      </div>
    </Modal>
  );
  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
}
