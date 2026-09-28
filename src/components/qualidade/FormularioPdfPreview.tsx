/**
 * Pré-visualização dos PDFs de formulário da Qualidade. O PDF é gerado
 * no navegador e exibido como blob; o botão de download entrega o mesmo arquivo.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Download, ExternalLink, FileText, Loader2, X } from 'lucide-react';
import type { PdfGerado } from '../../lib/pdfExport/formularioPdf';

interface Props {
  gerar: () => Promise<PdfGerado>;
  onClose: () => void;
}

export default function FormularioPdfPreview({ gerar, onClose }: Props) {
  const [pdf, setPdf] = useState<(PdfGerado & { url: string }) | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    let url: string | null = null;
    gerar()
      .then(gerado => {
        if (!ativo) return;
        url = URL.createObjectURL(new Blob([gerado.bytes as BlobPart], { type: 'application/pdf' }));
        setPdf({ ...gerado, url });
      })
      .catch((e: any) => {
        console.error('Falha ao gerar o PDF do formulário:', e);
        if (ativo) setErro(e?.message || 'Erro desconhecido.');
      });
    return () => {
      ativo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [gerar]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
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
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-slate-950/65 p-0 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-preview-formulario" className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 id="titulo-preview-formulario" className="text-sm font-bold text-slate-900 dark:text-slate-50">PDF do checklist</h2>
              <p className="truncate text-xs text-slate-500">{pdf?.titulo ?? 'Gerando…'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pdf && (
              <a href={pdf.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                <ExternalLink className="h-4 w-4" /> Nova aba
              </a>
            )}
            <button type="button" disabled={!pdf} onClick={baixar} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60">
              <Download className="h-4 w-4" /> Baixar PDF
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="relative flex-1 bg-slate-100 dark:bg-slate-950">
          {erro ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Não foi possível gerar o PDF.</p>
              <p className="max-w-md text-xs text-slate-500">{erro}</p>
            </div>
          ) : (
            <>
              {pdf && <iframe key={pdf.url} src={pdf.url} title="Pré-visualização do checklist" className="h-full min-h-[70vh] w-full border-0" />}
              {!pdf && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
                </div>
              )}
              {/* Navegadores de celular (Chrome Android) não exibem PDF embutido. */}
              <p className="absolute inset-x-0 bottom-0 bg-white/90 px-4 py-2 text-center text-[11px] text-slate-500 sm:hidden dark:bg-slate-900/90">
                Se a visualização não aparecer, use “Nova aba”.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
