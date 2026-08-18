/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Textarea para colar o markdown da cotação + cronômetro/tokens durante a
 * extração — mesma UX já provada em src/views/TesteExtracaoIA.tsx, agora
 * chamando a Edge Function em vez da OpenRouter direto do browser.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ClipboardPaste, Sparkles, Loader2, Timer, Coins, AlertCircle } from 'lucide-react';
import type { ExtracaoUso } from '../../types';

interface ColarMarkdownPanelProps {
  processando: boolean;
  erro: string | null;
  uso: ExtracaoUso | null;
  onProcessar: (markdown: string, arquivoOrigem: string | null) => void;
}

export default function ColarMarkdownPanel({ processando, erro, uso, onProcessar }: ColarMarkdownPanelProps) {
  const [markdown, setMarkdown] = useState('');
  const [arquivoOrigem, setArquivoOrigem] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const inicioRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (processando) {
      inicioRef.current = Date.now();
      setElapsedMs(0);
      intervalRef.current = setInterval(() => setElapsedMs(Date.now() - (inicioRef.current ?? Date.now())), 100);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [processando]);

  const handleProcessar = () => {
    if (!markdown.trim() || processando) return;
    onProcessar(markdown, arquivoOrigem.trim() || null);
    setMarkdown('');
    setArquivoOrigem('');
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <ClipboardPaste className="h-3.5 w-3.5" />
          Colar proposta (markdown)
        </label>
        <input
          value={arquivoOrigem}
          onChange={e => setArquivoOrigem(e.target.value)}
          placeholder="Nome do arquivo (opcional)"
          className="w-56 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
        />
      </div>
      <textarea
        value={markdown}
        onChange={e => setMarkdown(e.target.value)}
        placeholder="Cole aqui o markdown de uma ou mais propostas..."
        rows={10}
        className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span>{markdown.length.toLocaleString('pt-BR')} caracteres</span>
          {processando && (
            <>
              <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3" /> {(elapsedMs / 1000).toFixed(1)}s</span>
              {uso && <span className="inline-flex items-center gap-1"><Coins className="h-3 w-3" /> {uso.total_tokens.toLocaleString('pt-BR')} tokens</span>}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={handleProcessar}
          disabled={!markdown.trim() || processando}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-40"
        >
          {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {processando ? 'Processando...' : 'Processar com IA'}
        </button>
      </div>

      {erro && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{erro}</span>
        </div>
      )}
    </div>
  );
}
