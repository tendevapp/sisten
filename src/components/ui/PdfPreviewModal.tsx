/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modal universal de pré-visualização de PDFs do SISTEN antes do download.
 * O PDF é gerado no navegador e renderizado em iframe a partir de Blob URL.
 * O usuário pode inspecionar o documento na íntegra, abrir em nova aba ou
 * realizar o download imediato com 1 clique.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Download, ExternalLink, FileText, Loader2, X } from 'lucide-react';

export interface PdfGerado {
  bytes: Uint8Array;
  nomeArquivo: string;
  titulo: string;
}

export interface PdfPreviewModalProps {
  gerar: () => Promise<PdfGerado>;
  onClose: () => void;
  tituloPadrao?: string;
}

export default function PdfPreviewModal({ gerar, onClose, tituloPadrao }: PdfPreviewModalProps) {
  const [pdf, setPdf] = useState<(PdfGerado & { url: string }) | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(true);

  useEffect(() => {
    let ativo = true;
    let url: string | null = null;
    setGerando(true);
    setErro(null);

    gerar()
      .then((gerado) => {
        if (!ativo) return;
        url = URL.createObjectURL(new Blob([gerado.bytes as BlobPart], { type: 'application/pdf' }));
        setPdf({ ...gerado, url });
      })
      .catch((e: any) => {
        console.error('Falha ao gerar o PDF para pré-visualização:', e);
        if (ativo) setErro(e?.message || 'Erro desconhecido ao montar o PDF.');
      })
      .finally(() => {
        if (ativo) setGerando(false);
      });

    return () => {
      ativo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [gerar]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [onClose]);

  const baixar = () => {
    if (!pdf) return;
    const link = document.createElement('a');
    link.href = pdf.url;
    link.download = pdf.nomeArquivo;
    link.click();
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-stretch justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-preview-pdf"
        className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
      >
        {/* Topo do Modal */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              <FileText className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <h2 id="titulo-preview-pdf" className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">
                {pdf?.titulo || tituloPadrao || 'Pré-visualização do Documento'}
              </h2>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {pdf ? pdf.nomeArquivo : gerando ? 'Gerando documento…' : 'Documento'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {pdf && (
              <a
                href={pdf.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ExternalLink className="h-4 w-4" /> Nova aba
              </a>
            )}
            <button
              type="button"
              disabled={!pdf || gerando}
              onClick={baixar}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700 transition disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Baixar PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Corpo do Modal com Visualização */}
        <div className="relative flex-1 bg-slate-100 dark:bg-slate-950">
          {erro ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Não foi possível gerar o PDF.</p>
              <p className="max-w-md text-xs text-slate-500 dark:text-slate-400">{erro}</p>
            </div>
          ) : (
            <>
              {pdf && (
                <iframe
                  key={pdf.url}
                  src={pdf.url}
                  title="Pré-visualização do PDF"
                  className="h-full min-h-[70vh] w-full border-0"
                />
              )}
              {gerando && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 backdrop-blur-xs dark:bg-slate-950/70">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Carregando visualização do PDF…</p>
                </div>
              )}
              {/* Dica para navegadores mobile que não suportam iframe de PDF */}
              <p className="absolute inset-x-0 bottom-0 bg-white/90 px-4 py-2 text-center text-[11px] text-slate-500 sm:hidden dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800">
                Se a visualização não carregar no aparelho, use o botão “Nova aba”.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
