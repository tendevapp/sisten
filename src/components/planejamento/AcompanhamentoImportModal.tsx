import { useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { importarAcompanhamento } from '../../lib/planejamentoAcompanhamentoApi';

interface Props {
  onClose: () => void;
  onDone: () => Promise<void>;
}

export default function AcompanhamentoImportModal({ onClose, onDone }: Props) {
  const [bdFile, setBdFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ value: 0, label: '' });
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!bdFile) {
      setError('Selecione a planilha BD.xlsx.');
      return;
    }
    setBusy(true);
    setProgress({ value: 5, label: 'Preparando importação...' });
    setError(null);
    try {
      await importarAcompanhamento({ arquivoBd: bdFile, onProgress: setProgress });
      setProgress({ value: 90, label: 'Atualizando indicadores...' });
      await onDone();
      setProgress({ value: 100, label: 'Importação concluída.' });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível importar a planilha.');
      setProgress(current => ({ ...current, label: 'Falha na importação.' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Importar Acompanhamento Geral">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Importar Acompanhamento Geral</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A carga atualiza a base importada e mantém o histórico da importação. Os dashboards são recalculados no SISTEN.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-5">
          <label htmlFor="acompanhamento-bd-file" className="block w-full min-w-0 cursor-pointer rounded-xl border border-dashed border-slate-300 p-4 text-sm transition-colors hover:border-violet-400 hover:bg-violet-50/40 dark:border-slate-600 dark:hover:bg-violet-950/20">
            <span className="block font-semibold text-slate-700 dark:text-slate-200">BD.xlsx</span>
            <input id="acompanhamento-bd-file" className="sr-only" type="file" accept=".xlsx,.xls,.xlsm" disabled={busy} onChange={e => setBdFile(e.target.files?.[0] ?? null)} />
            <span className="mt-3 inline-flex max-w-full items-center rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Escolher arquivo</span>
            <span className="mt-2 block max-w-full truncate text-xs text-slate-500" title={bdFile?.name}>{bdFile?.name ?? 'Aba BD_ACOMPANHAMENTO_GERAL obrigatória'}</span>
          </label>
        </div>

        {(busy || progress.value > 0) && <div className="mt-5" role="status" aria-live="polite"><div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300"><span className="truncate">{progress.label}</span><span className="shrink-0 tabular-nums">{progress.value}%</span></div><div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.value} aria-label="Progresso da importação"><div className={`h-full rounded-full transition-all duration-300 ${error ? 'bg-rose-500' : 'bg-violet-600'}`} style={{ width: `${progress.value}%` }} /></div></div>}
        {error && <p className="mt-4 break-words rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
          <button type="button" onClick={() => void submit()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Importar base e recriar dashboards
          </button>
        </div>
      </div>
    </div>
  );
}
