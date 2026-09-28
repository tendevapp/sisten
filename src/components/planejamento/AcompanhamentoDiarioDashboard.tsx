import { useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type DotItemDotProps, type LabelProps } from 'recharts';
import { Table2 } from 'lucide-react';
import { fmtNumber } from '../../lib/planejamentoAcompanhamento';
import type { DailyAreaModel } from '../../lib/planejamentoAcompanhamentoDiario';
import Modal, { ModalBody, ModalHeader } from '../ui/Modal';

const NAVY = '#0b2d67';
const GOLD = '#f5b400';
const RED = '#ff1717';
const PEACH = '#f3a27f';

type DetailState = { area: DailyAreaModel; kind: 'weekly' | 'monthly' };

export function shouldShowChartBarLabel(value: unknown): boolean {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric !== 0;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function chartData(area: DailyAreaModel) {
  return area.weeklyDaily.map(point => ({
    ...point,
    realSemanal: point.kind === 'week' ? point.real : 0,
    realDiario: point.kind === 'day' ? point.real : 0,
    mediaDiaria: point.kind === 'day' ? point.media : null,
    mediaAcumuladaDiaria: point.kind === 'day' ? point.mediaAcumulada : null,
  }));
}

function pointLabel(value: unknown): string {
  return value === null || value === undefined || value === '' ? '' : fmtNumber(value, typeof value === 'number' && !Number.isInteger(value) ? 1 : 0);
}

function barLabel(value: unknown): string {
  return shouldShowChartBarLabel(value) ? pointLabel(value) : '';
}

function pendingBarLabel({ value, viewBox }: LabelProps) {
  if (!shouldShowChartBarLabel(value) || !viewBox || !('x' in viewBox) || !('y' in viewBox)) return null;
  const numeric = Number(value);
  const x = (viewBox.x ?? 0) + (viewBox.width ?? 0) / 2;
  const y = numeric < 0
    ? (viewBox.y ?? 0) + (viewBox.height ?? 0) - 6
    : (viewBox.y ?? 0) - 7;
  return <text x={x} y={y} textAnchor="middle" fill={numeric < 0 ? '#9a3412' : '#334155'} fontSize={10} fontWeight={700}>{pointLabel(value)}</text>;
}

function programadoMarker({ cx, cy, points, index }: DotItemDotProps) {
  if (cx == null || cy == null) return null;
  const gaps = [points[index - 1]?.x, points[index + 1]?.x]
    .filter((x): x is number => x != null)
    .map(x => Math.abs(x - cx));
  const width = gaps.length ? Math.min(...gaps) * 0.76 : 16;
  return <rect x={cx - width / 2} y={cy - 6} width={width} height={12} fill={RED} />;
}

function Panel({ title, hint, children, onOpen }: { title: string; hint: string; children: React.ReactNode; onOpen: () => void }) {
  return <section
    className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-[#9bafca] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#f5b400]"
    role="button"
    tabIndex={0}
    aria-label={`${title}. ${hint}`}
    onClick={onOpen}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }}
  >
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <h3 className="text-sm font-extrabold tracking-wide text-[#0b2d67] sm:text-base">{title}</h3>
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 transition group-hover:text-[#0b2d67]"><Table2 className="h-3.5 w-3.5" /> Dados</span>
    </div>
    <div className="px-2 pb-2">{children}</div>
  </section>;
}

function WeeklyDailyChart({ area, onOpen, tvMode = false }: { area: DailyAreaModel; onOpen: () => void; tvMode?: boolean }) {
  const data = chartData(area);
  return <Panel title="ENTREGA SEMANAL E DIÁRIA" hint="clique para abrir os dados do gráfico" onOpen={onOpen}>
    <div className={tvMode ? 'h-[235px]' : 'h-[320px]'}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 28, right: 18, left: -10, bottom: 24 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#475569' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value: unknown, name: string) => [pointLabel(value), name === 'realSemanal' ? 'Real semanal' : name === 'realDiario' ? 'Real diário' : name === 'mediaDiaria' ? 'Média diária' : 'Média acumulada']} />
          <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: 10 }} formatter={value => value === 'realSemanal' ? 'Real semanal' : value === 'realDiario' ? 'Real diário' : value === 'mediaDiaria' ? 'Média' : 'Média acumulada'} />
          <Bar dataKey="realSemanal" name="realSemanal" fill={NAVY} radius={[3, 3, 0, 0]}>
            <LabelList dataKey="realSemanal" position="top" fill={NAVY} fontSize={10} fontWeight={700} formatter={barLabel} />
          </Bar>
          <Bar dataKey="realDiario" name="realDiario" fill={RED} radius={[3, 3, 0, 0]}>
            <LabelList dataKey="realDiario" position="top" fill="#991b1b" fontSize={10} fontWeight={700} formatter={barLabel} />
          </Bar>
          <Line type="monotone" dataKey="mediaDiaria" name="mediaDiaria" stroke={RED} strokeWidth={2.5} dot={{ r: 2 }} connectNulls={false}>
            <LabelList dataKey="mediaDiaria" position="top" offset={8} fill="#991b1b" fontSize={10} fontWeight={700} formatter={pointLabel} />
          </Line>
          <Line type="monotone" dataKey="mediaAcumuladaDiaria" name="mediaAcumuladaDiaria" stroke={GOLD} strokeWidth={3} dot={{ r: 3, fill: GOLD, stroke: '#fff', strokeWidth: 1 }} connectNulls={false}>
            <LabelList dataKey="mediaAcumuladaDiaria" position="top" offset={8} fill="#8a6100" fontSize={10} fontWeight={700} formatter={pointLabel} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  </Panel>;
}

function MonthlyChart({ area, onOpen, tvMode = false }: { area: DailyAreaModel; onOpen: () => void; tvMode?: boolean }) {
  const data = area.monthly.map(month => ({
    ...month,
    pendenciaExibida: month.pendencia,
    programadoExibido: month.programado > 0 ? month.programado : null,
  }));
  return <Panel title="ENTREGA MENSAL" hint="clique para abrir os dados do gráfico" onOpen={onOpen}>
    <div className={tvMode ? 'h-[235px]' : 'h-[320px]'}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 28, right: 18, left: -10, bottom: 24 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#475569' }} interval={0} tickFormatter={value => String(value).slice(0, 3)} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value: unknown, name: string) => [pointLabel(value), name === 'real' ? 'Real' : name === 'pendenciaExibida' ? 'Entrega pendência' : 'Programado']} />
          <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: 10 }} formatter={value => value === 'real' ? 'Real' : value === 'pendenciaExibida' ? 'Entrega pendência' : 'Programado'} />
          <Bar dataKey="real" name="real" fill={NAVY} stackId="month" radius={[3, 3, 0, 0]}>
            <LabelList dataKey="real" position="insideTop" fill="#fff" fontSize={10} fontWeight={700} formatter={barLabel} />
          </Bar>
          <Bar dataKey="pendenciaExibida" name="pendenciaExibida" fill={PEACH} stackId="month">
            <LabelList dataKey="pendenciaExibida" content={pendingBarLabel} />
          </Bar>
          <Line type="linear" dataKey="programadoExibido" name="programadoExibido" stroke={RED} strokeWidth={4} shape={tvMode ? () => null : undefined} dot={tvMode ? programadoMarker : { r: 2, fill: RED }} connectNulls={false}>
            <LabelList dataKey="programadoExibido" position="top" offset={16} fill="#991b1b" fontSize={10} fontWeight={700} formatter={pointLabel} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  </Panel>;
}

function AreaSection({ area, onOpen, tvMode = false }: { area: DailyAreaModel; onOpen: (kind: DetailState['kind']) => void; tvMode?: boolean }) {
  return <section className={`grid gap-2 rounded-2xl border border-[#173d69] bg-[#061a3d] shadow-lg ${tvMode ? 'grid-cols-[34px_minmax(0,1.7fr)_minmax(245px,1fr)] gap-1 p-1' : 'p-2 xl:grid-cols-[44px_minmax(0,1.7fr)_minmax(330px,1fr)]'}`}>
    <div className={`flex items-center justify-center rounded-xl bg-[#0b2d67] px-2 py-3 text-center text-sm font-black tracking-wide text-white ${tvMode ? '[writing-mode:vertical-rl] rotate-180' : 'xl:[writing-mode:vertical-rl] xl:rotate-180'}`}>{area.label}</div>
    <WeeklyDailyChart area={area} tvMode={tvMode} onOpen={() => onOpen('weekly')} />
    <MonthlyChart area={area} tvMode={tvMode} onOpen={() => onOpen('monthly')} />
  </section>;
}

function DetailTable({ detail }: { detail: DetailState }) {
  if (detail.kind === 'weekly') {
    return <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Período</th><th className="px-3 py-3">Tipo</th><th className="px-3 py-3">Data</th><th className="px-3 py-3 text-right">Real</th><th className="px-3 py-3 text-right">Média</th><th className="px-3 py-3 text-right">Média acumulada</th></tr></thead><tbody className="divide-y divide-slate-100">{detail.area.weeklyDaily.map(point => <tr key={`${point.kind}-${point.label}`} className="text-slate-700"><td className="px-3 py-3 font-bold text-[#0b2d67]">{point.label}</td><td className="px-3 py-3">{point.kind === 'week' ? 'Semana' : 'Dia'}</td><td className="px-3 py-3">{formatDate(point.date)}</td><td className="px-3 py-3 text-right font-bold">{fmtNumber(point.real)}</td><td className="px-3 py-3 text-right">{point.media === null ? '—' : fmtNumber(point.media, 1)}</td><td className="px-3 py-3 text-right">{point.mediaAcumulada === null ? '—' : fmtNumber(point.mediaAcumulada, 1)}</td></tr>)}</tbody></table></div>;
  }
  return <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Mês</th><th className="px-3 py-3 text-right">Real</th><th className="px-3 py-3 text-right">Programado</th><th className="px-3 py-3 text-right">Pendência</th><th className="px-3 py-3 text-right">Dias úteis</th></tr></thead><tbody className="divide-y divide-slate-100">{detail.area.monthly.map(month => <tr key={month.month} className="text-slate-700"><td className="px-3 py-3 font-bold text-[#0b2d67]">{month.month}</td><td className="px-3 py-3 text-right font-bold">{fmtNumber(month.real)}</td><td className="px-3 py-3 text-right">{fmtNumber(month.programado)}</td><td className={`px-3 py-3 text-right font-bold ${month.pendencia !== null && month.pendencia < 0 ? 'text-emerald-700' : 'text-orange-700'}`}>{month.pendencia === null ? '—' : fmtNumber(month.pendencia)}</td><td className="px-3 py-3 text-right">{fmtNumber(month.diasUteis)}</td></tr>)}</tbody></table></div>;
}

function DetailModal({ detail, onClose }: { detail: DetailState; onClose: () => void }) {
  const title = detail.kind === 'weekly' ? 'Dados da entrega semanal e diária' : 'Dados da entrega mensal';
  return <Modal onClose={onClose} maxWidth="max-w-6xl" ariaLabel={title}>
    <ModalHeader onClose={onClose}><h2 className="text-lg font-bold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{detail.area.label} · clique no X ou pressione Esc para fechar</p></ModalHeader>
    <ModalBody><DetailTable detail={detail} /></ModalBody>
  </Modal>;
}

export default function AcompanhamentoDiarioDashboard({ areas, referenceMonth, tvMode = false }: { areas: DailyAreaModel[]; referenceMonth: string; tvMode?: boolean }) {
  const [detail, setDetail] = useState<DetailState | null>(null);
  const fallback = areas.some(area => area.fallbackFaturamento);
  return <div className={tvMode ? 'grid grid-cols-2 gap-2 rounded-2xl bg-slate-950 p-2 text-slate-900' : 'space-y-3 rounded-2xl bg-slate-950 p-2 text-slate-900 sm:p-3'}>
    <header className={`overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm ${tvMode ? 'col-span-2' : ''}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_150px]">
        <div className="bg-[#173d69] px-4 py-4 text-center text-lg font-bold text-white sm:text-xl">Dashboard Avanço de Produção</div>
        <div className="flex items-center justify-center bg-[#fffbd1] px-3 py-4 text-base font-black text-[#173d69] sm:text-lg">{referenceMonth}</div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-xs text-slate-500"><span>Rótulos exibidos nos valores reais, médias, metas e pendências.</span><span className="font-semibold text-[#0b2d67]">Clique em qualquer gráfico para ver os dados</span></div>
    </header>
    {fallback && <div className={`rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 ${tvMode ? 'col-span-2' : ''}`}>A base importada não possui uma data de faturamento separada. FATURAMENTO está usando a data disponível de EXPEDIÇÃO.</div>}
    {areas.map(area => <AreaSection key={area.id} area={area} tvMode={tvMode} onOpen={kind => setDetail({ area, kind })} />)}
    {detail && <DetailModal detail={detail} onClose={() => setDetail(null)} />}
  </div>;
}
