import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Database, RefreshCw } from 'lucide-react';
import type { Profile } from '../../types';
import { carregarAcompanhamentoSnapshot, type AcompanhamentoSnapshot } from '../../lib/planejamentoAcompanhamentoApi';
import { buildAcompanhamentoDiarioModel, DAILY_MONTHS } from '../../lib/planejamentoAcompanhamentoDiario';
import AcompanhamentoDiarioDashboard from '../../components/planejamento/AcompanhamentoDiarioDashboard';

interface Props { user: Profile; onNavigate: (path: string) => void; }

export default function AcompanhamentoDiarioView({ user: _user, onNavigate }: Props) {
  const [snapshot, setSnapshot] = useState<AcompanhamentoSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(new Date().getUTCMonth());

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await carregarAcompanhamentoSnapshot();
      setSnapshot(snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar o Acompanhamento Diário.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  const rows = snapshot?.base ?? [];
  const model = useMemo(() => buildAcompanhamentoDiarioModel(rows, new Date(), selectedMonthIndex), [rows, selectedMonthIndex]);
  const last = snapshot?.ultimaImportacao;
  const importedAt = last?.concluido_em ?? last?.iniciado_em;
  const latestData = rows.flatMap(row => ['termino_nav01', 'data_termino_saw3', 'data_termino_internos', 'termino_final', 'data_expedicao'].map(key => String(row[key] ?? '').slice(0, 10))).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort().at(-1);
  const formatDateTime = (value: unknown) => {
    const date = new Date(String(value ?? ''));
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  };
  const formatDate = (value: string | undefined) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : '—';

  if (loading) return <div className="flex min-h-[360px] items-center justify-center text-sm text-slate-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Carregando Acompanhamento Diário...</div>;
  if (error) return <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800"><div className="flex items-center gap-2 font-semibold"><AlertCircle className="h-5 w-5" /> {error}</div><button type="button" onClick={() => void load()} className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white">Tentar novamente</button></div>;
  if (!rows.length) return <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-20 text-center dark:border-slate-700"><Database className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 font-bold text-slate-800 dark:text-slate-100">Nenhuma base importada</h2><p className="mt-1 text-sm text-slate-500">Importe o BD.xlsx em Acompanhamento Geral para alimentar este dashboard.</p><button type="button" onClick={() => onNavigate('/planejamento/acompanhamento-geral')} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white"><ArrowLeft className="h-4 w-4" /> Ir para Acompanhamento Geral</button></div>;

  return <div className="mx-auto max-w-[1600px] space-y-4">
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Acomp Diário</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Entregas reais, metas programadas e média residual recalculadas sobre a base importada.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar dados</button>
      </div>
      <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 md:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Mês da análise<select value={selectedMonthIndex} onChange={event => setSelectedMonthIndex(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-[#0b2d67] focus:ring-2 focus:ring-[#0b2d67]/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">{DAILY_MONTHS.map((month, index) => <option key={month} value={index}>{month} / {model.referenceYear}</option>)}</select></label>
        <div className="grid gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300 sm:grid-cols-3"><div><span className="block font-semibold uppercase tracking-wide text-slate-400">Fonte</span><strong className="mt-0.5 block text-slate-700 dark:text-slate-200">{String(last?.arquivo_bd ?? 'BD_ACOMPANHAMENTO_GERAL')}</strong></div><div><span className="block font-semibold uppercase tracking-wide text-slate-400">Linhas importadas</span><strong className="mt-0.5 block text-slate-700 dark:text-slate-200">{String(last?.linhas_bd ?? rows.length)}</strong></div><div><span className="block font-semibold uppercase tracking-wide text-slate-400">Dados até</span><strong className="mt-0.5 block text-slate-700 dark:text-slate-200">{formatDate(latestData)}</strong></div></div>
      </div>
      <p className="mt-3 text-xs text-slate-400">Última atualização da importação: <span className="font-semibold text-slate-500 dark:text-slate-300">{formatDateTime(importedAt)}</span>. O filtro recalcula os gráficos para o mês selecionado.</p>
    </header>
    <AcompanhamentoDiarioDashboard areas={model.areas} referenceMonth={`${model.referenceMonth} / ${model.referenceYear}`} />
  </div>;
}
