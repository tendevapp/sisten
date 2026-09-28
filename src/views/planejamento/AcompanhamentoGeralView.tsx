import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Database, Gauge, RefreshCw, Upload } from 'lucide-react';
import type { Profile } from '../../types';
import { carregarAcompanhamentoSnapshot, type AcompanhamentoSnapshot } from '../../lib/planejamentoAcompanhamentoApi';
import { filterEngine, postosFromEngine, uniqueValues, weeklyFromEngine, type AcompanhamentoFilters } from '../../lib/planejamentoAcompanhamento';
import AcompanhamentoImportModal from '../../components/planejamento/AcompanhamentoImportModal';
import AcompanhamentoDashboard from '../../components/planejamento/AcompanhamentoDashboard';
import AcompanhamentoPcp from '../../components/planejamento/AcompanhamentoPcp';
import AcompanhamentoEngine from '../../components/planejamento/AcompanhamentoEngine';
import AcompanhamentoAux from '../../components/planejamento/AcompanhamentoAux';
import AcompanhamentoBase from '../../components/planejamento/AcompanhamentoBase';

interface Props { user: Profile; onNavigate: (path: string) => void; }
type Tab = 'dashboard' | 'pcp' | 'engine' | 'aux' | 'base';

const tabs: Array<{ id: Tab; label: string; description: string }> = [
  { id: 'dashboard', label: 'Dashboard', description: 'Indicadores e curva S' },
  { id: 'pcp', label: 'PCP', description: 'Lead time, fila e reparos' },
  { id: 'engine', label: 'Engine', description: 'Motor de cálculo por tramo' },
  { id: 'aux', label: 'AUX', description: 'Tabelas auxiliares e controles' },
  { id: 'base', label: 'Base', description: 'Dados de origem importados' },
];

const empty: AcompanhamentoSnapshot = { base: [], engine: [], pcp: [], weekly: [], torres: [], postos: [], reparos: [], divergencias: [], ultimaImportacao: null };

export default function AcompanhamentoGeralView({ user: _user, onNavigate: _onNavigate }: Props) {
  const [snapshot, setSnapshot] = useState<AcompanhamentoSnapshot>(empty);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [modal, setModal] = useState(false);
  const [filters, setFilters] = useState<AcompanhamentoFilters>({ torre: 'TODAS', tramo: 'TODOS', posto: 'TODOS' });

  const load = async () => {
    setRefreshing(true);
    setError(null);
    try { setSnapshot(await carregarAcompanhamentoSnapshot()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Falha ao carregar o Acompanhamento Geral.'); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { void load(); }, []);

  const engine = useMemo(() => filterEngine(snapshot.engine, filters), [snapshot.engine, filters]);
  const postos = useMemo(() => postosFromEngine(engine), [engine]);
  const weekly = useMemo(() => weeklyFromEngine(engine), [engine]);
  const towers = useMemo(() => {
    const map = new Map<string, { torre: string; avanco_medio: number; etapas_concl: number; tramos_white: number; tramos: number }>();
    engine.forEach(row => { const key = String(row.torre ?? '—'); const item = map.get(key) ?? { torre: key, avanco_medio: 0, etapas_concl: 0, tramos_white: 0, tramos: 0 }; item.avanco_medio += Number(row.avanco_tramo) || 0; item.etapas_concl += Number(row.etapas_concl) || 0; item.tramos_white += Number(row.fim_white ? 1 : 0); item.tramos += 1; map.set(key, item); });
    return [...map.values()].map(row => ({ ...row, avanco_medio: row.tramos ? row.avanco_medio / row.tramos : 0 }));
  }, [engine]);

  const last = snapshot.ultimaImportacao;
  return <div className="mx-auto max-w-[1600px] space-y-5">
    <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-start gap-3"><span className="rounded-xl bg-violet-100 p-3 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"><Gauge className="h-6 w-6" /></span><div><h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Acompanhamento Geral</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Base operacional importada de `BD_ACOMPANHAMENTO_GERAL`; os dashboards são recalculados no SISTEN.</p>{last && <p className="mt-2 text-xs text-slate-400">Última carga: {String(last.arquivo_bd)} · {String(last.linhas_bd)} linhas · {String(last.concluido_em ?? last.iniciado_em).slice(0, 16).replace('T', ' ')}</p>}</div></div><div className="flex gap-2"><button type="button" onClick={() => void load()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar</button><button type="button" onClick={() => setModal(true)} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-700"><Upload className="h-4 w-4" /> Importar base</button></div></header>
    <div className="flex gap-2 overflow-x-auto border-b border-slate-200 dark:border-slate-800">{tabs.map(item => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`min-w-max border-b-2 px-3 py-3 text-left ${tab === item.id ? 'border-violet-600 text-violet-700 dark:text-violet-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}><span className="block text-sm font-bold">{item.label}</span><span className="block text-[11px]">{item.description}</span></button>)}</div>
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-3"><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Torre<select value={filters.torre} onChange={e => setFilters(current => ({ ...current, torre: e.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"><option>TODAS</option>{uniqueValues(snapshot.engine, 'torre').map(value => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Tramo<select value={filters.tramo} onChange={e => setFilters(current => ({ ...current, tramo: e.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"><option>TODOS</option>{uniqueValues(snapshot.engine, 'tramo').map(value => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Posto<select value={filters.posto} onChange={e => setFilters(current => ({ ...current, posto: e.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"><option>TODOS</option>{uniqueValues(snapshot.engine, 'posto_atual').map(value => <option key={value}>{value}</option>)}</select></label></div>
    {error && <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-4 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Não foi possível carregar os dados.</strong><p className="mt-1">{error}. Se a migration ainda não foi aplicada, aplique-a antes da primeira carga.</p></div></div>}
    {loading ? <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 py-20 text-sm text-slate-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Carregando snapshot...</div> : snapshot.engine.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-20 text-center dark:border-slate-700"><Database className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 font-bold text-slate-800 dark:text-slate-100">Nenhum snapshot importado</h2><p className="mt-1 text-sm text-slate-500">Importe a base BD_ACOMPANHAMENTO_GERAL para habilitar as análises.</p></div> : tab === 'dashboard' ? <AcompanhamentoDashboard engine={engine} weekly={weekly} /> : tab === 'pcp' ? <AcompanhamentoPcp engine={engine} postos={postos} /> : tab === 'engine' ? <AcompanhamentoEngine rows={engine} /> : tab === 'aux' ? <AcompanhamentoAux weekly={weekly} torres={towers} postos={postos} divergencias={snapshot.divergencias.filter(row => filters.torre === 'TODAS' || row.torre === filters.torre)} /> : <AcompanhamentoBase rows={snapshot.base} />}
    {modal && <AcompanhamentoImportModal onClose={() => setModal(false)} onDone={load} />}
  </div>;
}
