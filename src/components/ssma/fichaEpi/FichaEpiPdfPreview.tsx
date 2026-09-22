/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pré-visualização do PDF da Ficha de EPI antes do download. O PDF é gerado
 * no navegador e exibido como blob; o seletor de assinatura regera o arquivo
 * na hora, então o que se baixa é exatamente o que está na tela.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Download, ExternalLink, FileText, Loader2, PenTool, X } from 'lucide-react';
import { gerarFichaEpiPdf, type PdfGerado } from '../../../lib/pdfExport/exportSsmaFichaEpiPdf';
import { mensagemErroFichaEpi, type SsmaFichaEpi } from '../../../lib/ssmaFichaEpiApi';

interface Props {
  fichas: SsmaFichaEpi[];
  mostrarAssinaturaInicial?: boolean;
  onClose: () => void;
}

export default function FichaEpiPdfPreview({ fichas, mostrarAssinaturaInicial = true, onClose }: Props) {
  const [mostrarAssinatura, setMostrarAssinatura] = useState(mostrarAssinaturaInicial);
  const [pdf, setPdf] = useState<(PdfGerado & { url: string }) | null>(null);
  const [gerando, setGerando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    let url: string | null = null;
    setGerando(true);
    setErro(null);
    gerarFichaEpiPdf({ fichas, mostrarAssinatura })
      .then(gerado => {
        if (!ativo) return;
        url = URL.createObjectURL(new Blob([gerado.bytes], { type: 'application/pdf' }));
        setPdf({ ...gerado, url });
      })
      .catch(e => {
        console.error('Falha ao gerar o PDF da ficha de EPI:', e);
        if (ativo) setErro(mensagemErroFichaEpi(e));
      })
      .finally(() => { if (ativo) setGerando(false); });
    return () => {
      ativo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fichas, mostrarAssinatura]);

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
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-preview-ficha-epi" className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
              <FileText className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <h2 id="titulo-preview-ficha-epi" className="text-sm font-bold text-slate-900 dark:text-slate-50">Pré-visualização do PDF</h2>
              <p className="truncate text-xs text-slate-500">{pdf?.titulo ?? 'Gerando…'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
              <input type="checkbox" role="switch" checked={mostrarAssinatura} onChange={e => setMostrarAssinatura(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
              <PenTool className="h-3.5 w-3.5" /> Exibir assinatura
            </label>
            {pdf && (
              <a href={pdf.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                <ExternalLink className="h-4 w-4" /> Nova aba
              </a>
            )}
            <button type="button" disabled={!pdf || gerando} onClick={baixar} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
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
              {pdf && <iframe key={pdf.url} src={pdf.url} title="Pré-visualização da ficha de EPI" className="h-full min-h-[70vh] w-full border-0" />}
              {gerando && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-slate-950/60">
                  <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
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
