import { AlertTriangle, CalendarClock, CheckCircle2, Factory, Gauge, Layers3, TimerReset, TrendingUp, type LucideIcon } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildDashboardModel, date, fmtNumber, number, percent, type PlanejamentoRow } from '../../lib/planejamentoAcompanhamento';

interface Props { engine: PlanejamentoRow[]; weekly: PlanejamentoRow[]; }

const NAVY = '#203b69';
const BLUE = '#4676c4';
const ORANGE = '#f0782b';

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={`overflow-hidden border border-slate-300 bg-white ${className}`}><div className="bg-[#203b69] px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white">{title}</div><div className="p-3">{children}</div></section>;
}

function Kpi({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return <div className="overflow-hidden border border-slate-300 bg-white"><div className="bg-[#203b69] px-2 py-1 text-center text-[10px] font-bold uppercase text-white">{label}</div><div className="flex min-h-[54px] items-center justify-center gap-2 px-2 py-1.5 text-2xl font-bold tabular-nums text-[#203b69]"><Icon className="hidden h-4 w-4 text-[#4676c4] sm:block" />{value}</div></div>;
}

function fmtDate(value: string | null): string {
  return value ? date(value) : '—';
}

function heatColor(value: number | null): string {
  if (value === null) return '#e2e8f0';
  if (value >= 1) return '#5ac878';
  if (value >= 0.75) return '#a8d477';
  if (value >= 0.5) return '#ffe680';
  if (value >= 0.25) return '#f8ae6e';
  return '#ff686d';
}

function deadlineColor(value: number | null): string {
  if (value === null) return '#e2e8f0';
  if (value < 0) return '#ff686d';
  if (value < 10) return '#f8f3df';
  return '#5ac878';
}

function stageDataLabel(value: unknown): string {
  return fmtNumber(value);
}

export default function AcompanhamentoDashboard({ engine, weekly }: Props) {
  const model = buildDashboardModel(engine, weekly);
  const { kpis } = model;
  const bottleneck = model.stages.slice().sort((a, b) => b.media - a.media)[0];
  const maxPosto = model.postos[0];
  const stale = engine.filter(row => row.status === 'EM PRODUCAO' && number(row.dias_sem_movto) > 30).length;
  const overdue = engine.filter(row => number(row.saldo_prazo, 0) < 0).length;
  const weeklyData = model.weekly.map(row => ({
    semana: fmtDate(String(row.semana_inicio ?? '')).slice(0, 5),
    NAV01: number(row.nav01_sem),
    SAW3: number(row.saw3_sem),
    INTERNOS: number(row.internos_sem),
    WHITE: number(row.white_sem),
  }));
  const funnelData = model.stages.map(stage => ({ etapa: stage.etapa, concluidos: stage.concluidos }));
  const towerData = model.towers.map(row => ({ torre: row.torre.replace(/^TORRE\s*/i, 'T'), avanco: row.avanco * 100 }));
  const postData = model.postos.map(row => ({ posto: row.posto, tramos: row.tramos }));
  const stageProgressData = model.stages.slice().reverse();
  const leadData = model.stages.map(row => ({ etapa: row.etapa, media: Number(row.media.toFixed(1)) }));
  const projectedDate = fmtDate(model.dataProjetada);
  return <div className="space-y-3 bg-slate-950 p-1 text-slate-900 sm:p-2">
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      <Kpi label="Avanço físico geral" value={percent(kpis.avancoFisico)} icon={Gauge} />
      <Kpi label="Etapas concluídas" value={`${kpis.etapasConcluidas} / ${kpis.totalEtapas}`} icon={CheckCircle2} />
      <Kpi label="Tramos concluídos (WHITE)" value={`${kpis.whiteConcluidos} / ${kpis.totalTramos}`} icon={Layers3} />
      <Kpi label="Torres concluídas" value={`${kpis.torresConcluidas} / ${kpis.totalTorres}`} icon={Factory} />
      <Kpi label="Tramos em produção (WIP)" value={String(kpis.wip)} icon={TrendingUp} />
      <Kpi label="Tramos não iniciados" value={String(kpis.naoIniciados)} icon={TimerReset} />
      <Kpi label="Lead time acum. médio (dias)" value={fmtNumber(kpis.leadTimeAcumuladoMedio, 1)} icon={CalendarClock} />
      <Kpi label="Aging médio do WIP (dias)" value={fmtNumber(kpis.agingMedioWip, 1)} icon={AlertTriangle} />
    </div>

    <Panel title="Leitura executiva">
      <div className="space-y-1 text-[11px] leading-5 text-slate-700">
        <p><strong>AVANÇO:</strong> {percent(kpis.avancoFisico)} do escopo físico | {kpis.etapasConcluidas} de {kpis.totalEtapas} etapas concluídas | {kpis.whiteConcluidos} tramos e {kpis.torresConcluidas} torres finalizados em WHITE</p>
        <p><strong>GARGALO:</strong> {bottleneck?.etapa ?? '—'} com lead time médio de {fmtNumber(bottleneck?.media, 1)} dias | maior fila no posto {maxPosto?.posto ?? '—'} com {maxPosto?.tramos ?? 0} tramos</p>
        <p><strong>RITMO:</strong> {fmtNumber(model.ritmoSemanal, 1)} etapas/semana nas últimas 4 semanas | término projetado do escopo atual: {projectedDate}</p>
        <p className="-mx-3 mb-[-12px] mt-1 bg-[#fde2d3] px-3 py-1 font-bold text-[#a34716]">ATENÇÃO: WHITE com {kpis.whiteConcluidos} entregas | {stale} tramos parados há mais de 30 dias | {overdue} tramos com prazo planejado já estourado</p>
      </div>
    </Panel>

    <div className="grid gap-3 xl:grid-cols-2">
      <Panel title="Esteira de produção — entregas por semana e por etapa">
        <div className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={weeklyData} margin={{ top: 8, right: 8, left: -20, bottom: 22 }}><CartesianGrid strokeDasharray="3 3" stroke="#dbe2ec" /><XAxis dataKey="semana" angle={-35} textAnchor="end" height={46} tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Area type="monotone" dataKey="NAV01" stackId="1" stroke={BLUE} fill={BLUE} /><Area type="monotone" dataKey="SAW3" stackId="1" stroke={ORANGE} fill={ORANGE} /><Area type="monotone" dataKey="INTERNOS" stackId="1" stroke="#a4a4a4" fill="#a4a4a4" /><Area type="monotone" dataKey="WHITE" stackId="1" stroke="#fbb515" fill="#fbb515" /></AreaChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="Funil de produção — tramos que já passaram por cada etapa">
        <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={funnelData} layout="vertical" margin={{ top: 8, right: 18, left: 15, bottom: 8 }}><CartesianGrid horizontal={false} stroke="#e2e8f0" /><XAxis type="number" hide /><YAxis type="category" dataKey="etapa" width={68} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="concluidos" fill={BLUE} radius={[0, 2, 2, 0]}>{<LabelList dataKey="concluidos" position="inside" fill="#fff" fontSize={11} formatter={stageDataLabel} />}</Bar></BarChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="% de avanço físico por torre">
        <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={towerData} margin={{ top: 12, right: 8, left: -20, bottom: 22 }}><CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="torre" tick={{ fontSize: 9 }} /><YAxis domain={[0, 100]} tickFormatter={value => `${value}%`} tick={{ fontSize: 9 }} /><Tooltip formatter={value => [`${number(value).toFixed(1)}%`, 'Avanço']} /><Bar dataKey="avanco" fill={BLUE} radius={[2, 2, 0, 0]}>{<LabelList dataKey="avanco" position="top" fill="#475569" fontSize={9} formatter={(value: unknown) => `${number(value).toFixed(0)}%`} />}</Bar></BarChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="Carteira ao longo do fluxo produtivo (tramos por posto)">
        <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={postData} margin={{ top: 12, right: 8, left: 0, bottom: 48 }}><CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="posto" angle={-35} textAnchor="end" height={65} tick={{ fontSize: 9 }} /><YAxis allowDecimals={false} tick={{ fontSize: 9 }} /><Tooltip /><Bar dataKey="tramos" fill={BLUE} radius={[2, 2, 0, 0]}>{<LabelList dataKey="tramos" position="top" fill="#475569" fontSize={9} />}</Bar></BarChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="Avanço por etapa — concluído vs. pendente">
        <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={stageProgressData} layout="vertical" margin={{ top: 8, right: 12, left: 0, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" domain={[0, kpis.totalTramos]} tick={{ fontSize: 9 }} /><YAxis type="category" dataKey="etapa" width={65} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="concluidos" stackId="a" fill={BLUE} name="Concluído" /><Bar dataKey="pendentes" stackId="a" fill={ORANGE} name="Pendente" /></BarChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="Lead time médio por etapa (dias)">
        <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={leadData} margin={{ top: 12, right: 8, left: -20, bottom: 22 }}><CartesianGrid vertical={false} stroke="#e2e8f0" /><XAxis dataKey="etapa" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 9 }} /><Tooltip /><Bar dataKey="media" fill={BLUE} radius={[2, 2, 0, 0]}>{<LabelList dataKey="media" position="top" fill="#475569" fontSize={10} formatter={(value: unknown) => number(value).toFixed(1).replace('.', ',')} />}</Bar></BarChart></ResponsiveContainer></div>
      </Panel>
    </div>

    <div className="grid gap-3 xl:grid-cols-2">
      <Panel title="Mapa de calor — % de avanço por tramo (visão completa das torres)">
        <div className="overflow-x-auto"><table className="min-w-[590px] w-full border-collapse text-center text-[10px]"><thead><tr className="bg-[#203b69] text-white"><th className="border border-white/30 px-2 py-1 text-left">Torre</th>{['T1', 'T2', 'T3', 'T4', 'T5'].map(tramo => <th key={tramo} className="border border-white/30 px-2 py-1">{tramo}</th>)}<th className="border border-white/30 px-2 py-1">% torre</th></tr></thead><tbody>{model.towers.map(row => <tr key={row.torre}><th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold">{row.torre.replace(/^TORRE\s*/i, 'T')}</th>{['T1', 'T2', 'T3', 'T4', 'T5'].map(tramo => { const value = row.porTramo[tramo]; return <td key={tramo} className="border border-slate-300 px-2 py-1 tabular-nums" style={{ backgroundColor: heatColor(value === undefined ? null : value) }}>{value === undefined ? '—' : percent(value)}</td>; })}<td className="border border-slate-300 bg-slate-100 px-2 py-1 font-bold tabular-nums">{percent(row.avanco)}</td></tr>)}</tbody></table></div>
        <div className="mt-2 text-[10px] text-slate-500">Vermelho: sem avanço · amarelo: em andamento · verde: concluído.</div>
      </Panel>
      <Panel title="Mapa de prazo — saldo em dias úteis (negativo = prazo estourado)">
        <div className="overflow-x-auto"><table className="min-w-[590px] w-full border-collapse text-center text-[10px]"><thead><tr className="bg-[#203b69] text-white"><th className="border border-white/30 px-2 py-1 text-left">Torre</th>{['T1 · 45 du', 'T2 · 28 du', 'T3 · 28 du', 'T4 · 28 du', 'T5 · 30 du'].map(header => <th key={header} className="border border-white/30 px-2 py-1">{header}</th>)}<th className="border border-white/30 px-2 py-1">Saldo torre</th></tr></thead><tbody>{model.prazoPorTorre.map(row => <tr key={row.torre}><th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold">{row.torre.replace(/^TORRE\s*/i, 'T')}</th>{['T1', 'T2', 'T3', 'T4', 'T5'].map(tramo => { const value = row.saldos[tramo] ?? null; return <td key={tramo} className="border border-slate-300 px-2 py-1 font-semibold tabular-nums" style={{ backgroundColor: deadlineColor(value) }}>{value === null ? '—' : fmtNumber(value)}</td>; })}<td className="border border-slate-300 px-2 py-1 font-bold tabular-nums" style={{ backgroundColor: deadlineColor(row.saldo_total) }}>{fmtNumber(row.saldo_total)}</td></tr>)}</tbody></table></div>
        <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500"><span><i className="mr-1 inline-block h-2.5 w-2.5 bg-[#ff686d]" />estourado</span><span><i className="mr-1 inline-block h-2.5 w-2.5 bg-[#f8f3df]" />atenção</span><span><i className="mr-1 inline-block h-2.5 w-2.5 bg-[#5ac878]" />saldo positivo</span></div>
      </Panel>
    </div>
  </div>;
}
