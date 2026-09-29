import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Database, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import type { Profile } from '../../types';
import { canAccessPage } from '../../lib/pages';
import { carregarAcompanhamentoDiarioDados, carregarAcompanhamentoSnapshot, type AcompanhamentoDiarioDados, type AcompanhamentoSnapshot } from '../../lib/planejamentoAcompanhamentoApi';
import { buildAcompanhamentoDiarioModel, DAILY_MONTHS } from '../../lib/planejamentoAcompanhamentoDiario';
import AcompanhamentoDiarioDashboard from '../../components/planejamento/AcompanhamentoDiarioDashboard';

interface Props { user: Profile; onNavigate: (path: string) => void; }

const TV_WIDTH = 1920;

function formatDateTime(value: unknown): string {
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatDate(value: string | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

export default function AcompanhamentoDiarioTvView({ user, onNavigate }: Props) {
  const [snapshot, setSnapshot] = useState<AcompanhamentoSnapshot | null>(null);
  const [dados, setDados] = useState<AcompanhamentoDiarioDados | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(new Date().getUTCMonth());
  const [fullscreen, setFullscreen] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ scale: 1, height: 0 });

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [novoSnapshot, novosDados] = await Promise.all([
        carregarAcompanhamentoSnapshot(),
        carregarAcompanhamentoDiarioDados(new Date().getUTCFullYear()),
      ]);
      setSnapshot(novoSnapshot);
      setDados(novosDados);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar o Acomp Diário TV.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const interval = setInterval(() => { void load(); }, 120_000);
    return () => clearInterval(interval);
  }, [load]);

  useLayoutEffect(() => {
    const recalculate = () => {
      const area = areaRef.current;
      const content = contentRef.current;
      if (!area || !content) return;
      const bounds = area.getBoundingClientRect();
      const contentHeight = content.offsetHeight;
      if (!bounds.width || !bounds.height || !contentHeight) return;
      setLayout({ scale: Math.min(bounds.width / TV_WIDTH, bounds.height / contentHeight), height: contentHeight });
    };
    recalculate();
    const observer = new ResizeObserver(recalculate);
    if (areaRef.current) observer.observe(areaRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [snapshot, selectedMonthIndex]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void areaRef.current?.requestFullscreen?.();
  };

  const rows = snapshot?.base ?? [];
  const model = useMemo(() => buildAcompanhamentoDiarioModel(rows, new Date(), selectedMonthIndex, dados ?? undefined), [dados, rows, selectedMonthIndex]);
  const last = snapshot?.ultimaImportacao;
  const latestData = rows.flatMap(row => ['termino_nav01', 'data_termino_saw3', 'data_termino_internos', 'termino_final', 'data_expedicao'].map(key => String(row[key] ?? '').slice(0, 10))).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort().at(-1);

  if (loading && !snapshot) return <div className="flex h-full items-center justify-center bg-[#020b1e] text-lg font-semibold text-white"><RefreshCw className="mr-3 h-6 w-6 animate-spin" /> Carregando painel de TV...</div>;
  if (error && !snapshot) return <div className="flex h-full items-center justify-center bg-[#020b1e] p-8 text-white"><div className="max-w-xl rounded-2xl border border-red-400/40 bg-red-950/60 p-6"><div className="flex items-center gap-2 text-lg font-bold"><AlertCircle className="h-5 w-5" /> Não foi possível carregar o painel</div><p className="mt-2 text-sm text-red-100">{error}</p><button type="button" onClick={() => void load()} className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-bold text-[#0b2d67]">Tentar novamente</button></div></div>;
  if (!rows.length) return <div className="flex h-full items-center justify-center bg-[#020b1e] p-8 text-white"><div className="text-center"><h2 className="text-2xl font-bold">Nenhuma base importada</h2><p className="mt-2 text-slate-300">Importe o BD.xlsx em Acompanhamento Geral para alimentar este painel.</p><button type="button" onClick={() => onNavigate('/planejamento/acompanhamento-geral')} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-[#0b2d67]"><ArrowLeft className="h-4 w-4" /> Ir para a importação</button></div></div>;

  return <div ref={areaRef} className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#020b1e] p-2 sm:p-3">
    <div className="overflow-hidden" style={{ width: layout.height ? TV_WIDTH * layout.scale : '100%', height: layout.height ? layout.height * layout.scale : 'auto' }}>
      <div ref={contentRef} style={{ width: TV_WIDTH, transform: `scale(${layout.scale})`, transformOrigin: 'top left' }}>
        <div className="mb-2 flex items-center justify-between gap-4 rounded-xl border border-[#31547f] bg-[#0b2347] px-5 py-3 text-white">
          <div><p className="text-lg font-black tracking-wide">ACOMP DIÁRIO · PAINEL TV</p><p className="mt-0.5 text-sm text-slate-300">Atualização automática a cada 2 minutos · fonte: {String(last?.arquivo_bd ?? 'BD_ACOMPANHAMENTO_GERAL')}</p></div>
          <div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm font-bold">Mês<select value={selectedMonthIndex} onChange={event => setSelectedMonthIndex(Number(event.target.value))} className="rounded-lg border border-white/20 bg-[#173d69] px-3 py-2 text-sm text-white outline-none">{DAILY_MONTHS.map((month, index) => <option key={month} value={index}>{month} / {model.referenceYear}</option>)}</select></label><span className="text-right text-xs text-slate-300">Dados até<br /><strong className="text-sm text-white">{formatDate(latestData)}</strong></span><span className="text-right text-xs text-slate-300">Atualizado<br /><strong className="text-sm text-white">{formatDateTime(last?.concluido_em ?? last?.iniciado_em)}</strong></span><button type="button" onClick={() => void load()} title="Atualizar agora" className="rounded-lg border border-white/20 p-2 hover:bg-white/10"><RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} /></button><button type="button" onClick={toggleFullscreen} title={fullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'} className="rounded-lg border border-white/20 p-2 hover:bg-white/10">{fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}</button></div>
        </div>
        {canAccessPage(user, 'planejamento_acompanhamento_diario_editar') && <div className="mb-2 flex justify-end"><button type="button" onClick={() => onNavigate('/planejamento/acompanhamento-diario-dados')} className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-[#0b2347] px-3 py-2 text-sm font-bold text-white hover:bg-[#173d69]"><Database className="h-4 w-4" /> Dados</button></div>}
        <AcompanhamentoDiarioDashboard areas={model.areas} referenceMonth={`${model.referenceMonth} / ${model.referenceYear}`} tvMode />
      </div>
    </div>
  </div>;
}
