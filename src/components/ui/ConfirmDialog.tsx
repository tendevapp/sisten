/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Substituto de `window.confirm()` — diálogo nativo trava a thread, não é
 * estilizável e é o único elemento do app fora do sistema de Modal/Toast.
 * Uso: cada tela guarda seu próprio `useState` (mesmo padrão já usado para
 * os demais modais do app) e renderiza condicionalmente.
 */

import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Modal, { ModalBody, ModalFooter } from './Modal';

interface ConfirmDialogProps {
  titulo: string;
  mensagem: React.ReactNode;
  confirmarLabel?: string;
  cancelarLabel?: string;
  /** 'perigo' usa vermelho no botão de confirmar — para ações destrutivas (excluir). */
  variante?: 'padrao' | 'perigo';
  confirmando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

export default function ConfirmDialog({
  titulo, mensagem, confirmarLabel = 'Confirmar', cancelarLabel = 'Cancelar',
  variante = 'padrao', confirmando = false, onConfirmar, onCancelar,
}: ConfirmDialogProps) {
  return (
    <Modal onClose={onCancelar} maxWidth="max-w-md" ariaLabel={titulo} zIndexClassName="z-[120]">
      <ModalBody className="p-5">
        <div className="flex items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            variante === 'perigo'
              ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
              : 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
          }`}>
            <AlertTriangle className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">{titulo}</h3>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{mensagem}</div>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <div className="flex w-full items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            disabled={confirmando}
            className="rounded-xl px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-200"
          >
            {cancelarLabel}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={confirmando}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:pointer-events-none disabled:opacity-40 ${
              variante === 'perigo' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {confirmando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmarLabel}
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
