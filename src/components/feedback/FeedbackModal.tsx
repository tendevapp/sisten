/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Bug, Camera, Lightbulb, Loader2, X } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { captureViewport } from '../../lib/screenshotCapture';
import { getRecentLogs } from '../../lib/consoleLogBuffer';
import { localDb } from '../../db/localDb';

interface FeedbackModalProps {
  mode: 'bug' | 'sugestao';
  pagePath: string;
  /** Print já capturado por FeedbackButton antes de abrir o modal (fluxo normal de bug). Ausente nos demais fluxos. */
  initialScreenshotBlob?: Blob | null;
  /** Pré-preenchido quando o modal abre a partir do ErrorBoundary (via feedbackReportBus). */
  prefillDescription?: string;
  prefillStack?: string;
  onClose: () => void;
}

export default function FeedbackModal({ mode, pagePath, initialScreenshotBlob, prefillDescription, prefillStack, onClose }: FeedbackModalProps) {
  const toast = useToast();
  const [description, setDescription] = useState(prefillDescription || '');
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState<string | null>(null);
  const screenshotPreviewUrlRef = useRef<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    screenshotPreviewUrlRef.current = screenshotPreviewUrl;
  }, [screenshotPreviewUrl]);

  useEffect(() => {
    // O print do fluxo normal de bug já vem pronto de FeedbackButton (capturado
    // antes deste modal existir, para não fotografar o próprio modal).
    if (initialScreenshotBlob) {
      setScreenshotBlob(initialScreenshotBlob);
      setScreenshotPreviewUrl(URL.createObjectURL(initialScreenshotBlob));
    }
    return () => {
      if (screenshotPreviewUrlRef.current) URL.revokeObjectURL(screenshotPreviewUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retakeScreenshot = async () => {
    // `capturing` também esconde o <Modal> inteiro (prop `hidden`) enquanto
    // esta captura roda, já que a recaptura acontece com o modal já aberto.
    setCapturing(true);
    const blob = await captureViewport();
    setCapturing(false);

    if (!blob) {
      toast.error('Não foi possível capturar a tela.');
      return;
    }
    setScreenshotBlob(blob);
    setScreenshotPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });
  };

  const removeScreenshot = () => {
    if (screenshotPreviewUrl) URL.revokeObjectURL(screenshotPreviewUrl);
    setScreenshotBlob(null);
    setScreenshotPreviewUrl(null);
  };

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
      screenshotBlob,
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
    <Modal onClose={onClose} ariaLabel={isBug ? 'Reportar um erro' : 'Enviar sugestão'} zIndexClassName="z-[95]" hidden={capturing}>
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

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Print da tela</span>
              <button
                type="button"
                onClick={retakeScreenshot}
                disabled={capturing}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-50"
              >
                {capturing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                {screenshotPreviewUrl ? 'Capturar novamente' : 'Anexar print'}
              </button>
            </div>

            {screenshotPreviewUrl ? (
              <div className="relative inline-block">
                <img src={screenshotPreviewUrl} alt="Print da tela" className="max-h-48 rounded-lg border border-slate-200 dark:border-slate-700" />
                <button
                  type="button"
                  onClick={removeScreenshot}
                  aria-label="Remover print"
                  className="absolute -top-2 -right-2 rounded-full bg-slate-900 text-white p-1 shadow-md hover:bg-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <p className="mt-1 text-[10px] text-slate-400">A imagem pode conter dados da tela atual.</p>
              </div>
            ) : capturing ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Capturando...
              </div>
            ) : (
              <p className="text-xs text-slate-400">Nenhum print anexado.</p>
            )}
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
