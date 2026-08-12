/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Bug, Lightbulb } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { getRecentLogs } from '../../lib/consoleLogBuffer';
import { localDb } from '../../db/localDb';

interface FeedbackModalProps {
  mode: 'bug' | 'sugestao';
  pagePath: string;
  /** Pré-preenchido quando o modal abre a partir do ErrorBoundary (via feedbackReportBus). */
  prefillDescription?: string;
  prefillStack?: string;
  onClose: () => void;
}

export default function FeedbackModal({ mode, pagePath, prefillDescription, prefillStack, onClose }: FeedbackModalProps) {
  const toast = useToast();
  const [description, setDescription] = useState(prefillDescription || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error(mode === 'bug' ? 'Descreva o que aconteceu.' : 'Descreva sua sugestão.');
      return;
    }

    setSubmitting(true);
    const ok = await localDb.submitFeedbackReport({
      type: mode,
      description: description.trim(),
      pagePath,
      screenshotBlob: null,
      consoleLogs: getRecentLogs(),
      errorStack: prefillStack,
    });
    setSubmitting(false);

    if (!ok) {
      toast.error('Não foi possível enviar. Tente novamente.');
      return;
    }
    toast.success(mode === 'bug' ? 'Erro reportado. Obrigado!' : 'Sugestão enviada. Obrigado!');
    onClose();
  };

  const isBug = mode === 'bug';

  return (
    <Modal onClose={onClose} ariaLabel={isBug ? 'Reportar um erro' : 'Enviar sugestão'} zIndexClassName="z-[95]">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          {isBug ? <Bug className="h-5 w-5 text-red-600" /> : <Lightbulb className="h-5 w-5 text-amber-500" />}
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
            {isBug ? 'Reportar um erro' : 'Enviar sugestão'}
          </h2>
        </div>
      </ModalHeader>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-4">
          <div>
            <label htmlFor="feedback-description" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              {isBug ? 'O que aconteceu?' : 'Sua sugestão'}
            </label>
            <textarea
              id="feedback-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              autoFocus
              placeholder={isBug ? 'Descreva o problema e, se possível, os passos para reproduzir.' : 'Conte o que você gostaria de ver melhorado.'}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? 'Enviando...' : 'Enviar'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
