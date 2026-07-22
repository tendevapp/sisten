/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Activity, Users, MousePointerClick, Clock, RefreshCw, AlertTriangle,
  LogIn, FileText, Calendar
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import { supabase } from '../db/supabaseClient';
import { localDb } from '../db/localDb';
import { Profile } from '../types';
import { labelForPath } from '../lib/usageTracker';

type Granularity = 'day' | 'week' | 'month';
type Preset = '7' | '30' | '90' | 'custom';

interface Kpis {
  active_today: number;
  sessions: number;
  page_views: number;
  avg_session_minutes: number;
}
interface ActivePoint { bucket: string; active_users: number; }
interface PageRow { path: string; page_label: string | null; visits: number; avg_dwell_seconds: number | null; }
interface HourRow { dow: number; hour: number; cnt: number; }
interface UserSummary {
  last_login: string | null;
  sessions: number;
  total_events: number;
  favorite_pages: { path: string; page_label: string | null; visits: number }[];
}
interface TimelineRow { event_type: string; path: string | null; page_label: string | null; created_at: string; }

const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function fmtDwell(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m}min ${s}s` : `${m}min`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function UsageDashboard() {
  const [preset, setPreset] = useState<Preset>('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [selectedUser, setSelectedUser] = useState<string>('todos');
  const [userSearch, setUserSearch] = useState('');

  const [profiles] = useState<Profile[]>(() => localDb.getProfiles());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [activeUsers, setActiveUsers] = useState<ActivePoint[]>([]);
  const [pageRanking, setPageRanking] = useState<PageRow[]>([]);
  const [byHour, setByHour] = useState<HourRow[]>([]);
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);

  const { fromISO, toISO } = useMemo(() => {
    const to = new Date();
    let from = new Date();
    if (preset === 'custom') {
      const f = customFrom ? new Date(customFrom + 'T00:00:00') : new Date(Date.now() - 30 * 864e5);
      const t = customTo ? new Date(customTo + 'T23:59:59') : new Date();
      return { fromISO: f.toISOString(), toISO: t.toISOString() };
    }
    from = new Date(Date.now() - parseInt(preset, 10) * 864e5);
    from.setHours(0, 0, 0, 0);
    return { fromISO: from.toISOString(), toISO: to.toISOString() };
  }, [preset, customFrom, customTo]);

  const filteredProfiles = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const list = q
      ? profiles.filter(p => p.name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q))
      : profiles;
    return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [profiles, userSearch]);

  const loadAll = useCallback(async () => {
    if (!supabase) {
      setError('Supabase não configurado.');
      return;
    }
    setLoading(true);
    setError('');
    const pUser = selectedUser === 'todos' ? null : selectedUser;
    try {
      const [kpiRes, activeRes, pagesRes, hourRes] = await Promise.all([
        supabase.rpc('usage_kpis', { p_from: fromISO, p_to: toISO }),
        supabase.rpc('usage_active_users', { p_from: fromISO, p_to: toISO, p_granularity: granularity }),
        supabase.rpc('usage_page_ranking', { p_from: fromISO, p_to: toISO, p_user_id: pUser }),
        supabase.rpc('usage_by_hour', { p_from: fromISO, p_to: toISO, p_user_id: pUser }),
      ]);

      const firstErr = kpiRes.error || activeRes.error || pagesRes.error || hourRes.error;
      if (firstErr) throw firstErr;

      setKpis(kpiRes.data as Kpis);
      setActiveUsers((activeRes.data as ActivePoint[]) || []);
      setPageRanking((pagesRes.data as PageRow[]) || []);
      setByHour((hourRes.data as HourRow[]) || []);

      if (pUser) {
        const [sumRes, tlRes] = await Promise.all([
          supabase.rpc('usage_user_summary', { p_user_id: pUser }),
          supabase.rpc('usage_user_timeline', { p_user_id: pUser, p_limit: 40 }),
        ]);
        if (sumRes.error) throw sumRes.error;
        if (tlRes.error) throw tlRes.error;
        setUserSummary(sumRes.data as UserSummary);
        setTimeline((tlRes.data as TimelineRow[]) || []);
      } else {
        setUserSummary(null);
        setTimeline([]);
      }
    } catch (err: any) {
      console.error('Falha ao carregar analytics de uso:', err);
      setError(err?.message || 'Falha ao carregar os dados de uso.');
    } finally {
      setLoading(false);
    }
  }, [fromISO, toISO, granularity, selectedUser]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const hourMap = useMemo(() => {
    const m = new Map<string, number>();
    let max = 0;
    byHour.forEach(r => {
      m.set(`${r.dow}-${r.hour}`, r.cnt);
      if (r.cnt > max) max = r.cnt;
    });
    return { m, max };
  }, [byHour]);

  const activeChartData = useMemo(
    () => activeUsers.map(p => ({
      ...p,
      label: new Date(p.bucket + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    })),
    [activeUsers]
  );

  const pageChartData = useMemo(
    () => pageRanking.slice(0, 12).map(r => ({
      ...r,
      name: r.page_label || labelForPath(r.path),
    })),
    [pageRanking]
  );

  const selectedProfile = profiles.find(p => p.id === selectedUser);
  const selectClass = 'rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 px-3 text-xs focus:outline-none focus:border-emerald-600 cursor-pointer';

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Activity className="h-6 w-6 text-emerald-600" /> Uso do Aplicativo
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Indicadores de uso a partir de logins e navegação: usuários ativos, páginas mais acessadas, horários e atividade por usuário.
          </p>
        </div>
        <button
          onClick={loadAll}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Período</label>
          <div className="flex items-center gap-1">
            {(['7', '30', '90'] as Preset[]).map(p => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors ${preset === p ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
              >
                {p} dias
              </button>
            ))}
            <button
              onClick={() => setPreset('custom')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors flex items-center gap-1 ${preset === 'custom' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
            >
              <Calendar className="h-3.5 w-3.5" /> Custom
            </button>
          </div>
        </div>

        {preset === 'custom' && (
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">De</label>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={selectClass} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Até</label>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={selectClass} />
            </div>
          </div>
        )}

        <div className="flex-1 min-w-[220px]">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Usuário</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Buscar por nome ou e-mail..."
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              className={`${selectClass} flex-1 cursor-text`}
            />
            <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} className={`${selectClass} max-w-[240px]`}>
              <option value="todos">Todos os usuários</option>
              {filteredProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.email})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 p-3 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900 flex items-center">
          <AlertTriangle className="mr-2 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Users} label="Ativos hoje" value={kpis?.active_today ?? 0} accent="emerald" />
        <KpiCard icon={LogIn} label="Sessões (período)" value={kpis?.sessions ?? 0} accent="blue" />
        <KpiCard icon={Clock} label="Tempo médio/sessão" value={`${kpis?.avg_session_minutes ?? 0} min`} accent="amber" />
        <KpiCard icon={MousePointerClick} label="Visualizações de página" value={kpis?.page_views ?? 0} accent="indigo" />
      </div>

      {/* Active users chart */}
      <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Usuários ativos ao longo do tempo</h3>
          <div className="flex items-center gap-1">
            {(['day', 'week', 'month'] as Granularity[]).map(g => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`rounded px-2.5 py-1 text-[11px] font-semibold border transition-colors ${granularity === g ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-800 dark:border-slate-200' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-gray-200 dark:border-slate-700'}`}
              >
                {g === 'day' ? 'Diário' : g === 'week' ? 'Semanal' : 'Mensal'}
              </button>
            ))}
          </div>
        </div>
        {activeChartData.length === 0 ? (
          <EmptyState loading={loading} />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={activeChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="activeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                labelFormatter={(l) => `Período: ${l}`}
                formatter={(v: any) => [v, 'Usuários ativos']}
              />
              <Area type="monotone" dataKey="active_users" stroke="#059669" strokeWidth={2} fill="url(#activeGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Page ranking + heatmap */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Páginas mais acessadas</h3>
          {pageChartData.length === 0 ? (
            <EmptyState loading={loading} />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(220, pageChartData.length * 30)}>
                <BarChart data={pageChartData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" strokeOpacity={0.4} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    formatter={(v: any) => [v, 'Visitas']}
                  />
                  <Bar dataKey="visits" fill="#059669" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                      <th className="py-2">Página</th>
                      <th className="py-2 text-right">Visitas</th>
                      <th className="py-2 text-right">Tempo médio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {pageRanking.slice(0, 12).map(r => (
                      <tr key={r.path}>
                        <td className="py-2 font-medium text-slate-700 dark:text-slate-300">{r.page_label || labelForPath(r.path)}</td>
                        <td className="py-2 text-right font-mono text-slate-600 dark:text-slate-400">{r.visits}</td>
                        <td className="py-2 text-right text-slate-500">{fmtDwell(r.avg_dwell_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Heatmap */}
        <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Acessos por horário</h3>
          <p className="text-[11px] text-slate-400">Concentração de eventos por hora do dia e dia da semana.</p>
          {byHour.length === 0 ? (
            <EmptyState loading={loading} />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                {/* Hour axis */}
                <div className="flex pl-9">
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div key={h} className="flex-1 text-center text-[8px] text-slate-400">{h % 3 === 0 ? h : ''}</div>
                  ))}
                </div>
                {DOW_LABELS.map((dow, dIdx) => (
                  <div key={dIdx} className="flex items-center">
                    <div className="w-9 text-[10px] font-semibold text-slate-400 shrink-0">{dow}</div>
                    {Array.from({ length: 24 }).map((_, h) => {
                      const cnt = hourMap.m.get(`${dIdx}-${h}`) || 0;
                      const intensity = hourMap.max > 0 ? cnt / hourMap.max : 0;
                      const bg = cnt === 0
                        ? 'rgba(148,163,184,0.08)'
                        : `rgba(5,150,105,${0.15 + intensity * 0.85})`;
                      return (
                        <div
                          key={h}
                          className="flex-1 aspect-square m-[1px] rounded-[2px]"
                          style={{ backgroundColor: bg }}
                          title={`${dow} ${h}h — ${cnt} evento(s)`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Per-user panel */}
      {selectedUser !== 'todos' && (
        <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Atividade de {selectedProfile?.name || 'usuário'}
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MiniStat label="Último login" value={fmtDateTime(userSummary?.last_login ?? null)} />
            <MiniStat label="Sessões" value={String(userSummary?.sessions ?? 0)} />
            <MiniStat label="Total de eventos" value={String(userSummary?.total_events ?? 0)} />
            <MiniStat label="Páginas favoritas" value={String(userSummary?.favorite_pages?.length ?? 0)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Páginas favoritas</h4>
              {userSummary?.favorite_pages?.length ? (
                <ul className="space-y-1.5">
                  {userSummary.favorite_pages.map(fp => (
                    <li key={fp.path} className="flex items-center justify-between text-xs bg-white dark:bg-slate-900 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-800">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{fp.page_label || labelForPath(fp.path)}</span>
                      <span className="font-mono text-slate-500">{fp.visits}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-slate-400">Sem dados no período.</p>}
            </div>

            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Linha do tempo recente</h4>
              {timeline.length ? (
                <ul className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  {timeline.map((t, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs bg-white dark:bg-slate-900 rounded-lg px-3 py-1.5 border border-slate-100 dark:border-slate-800">
                      {t.event_type === 'login'
                        ? <LogIn className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        : <FileText className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                      <span className="flex-1 truncate text-slate-700 dark:text-slate-300">
                        {t.event_type === 'login' ? 'Login' : (t.page_label || labelForPath(t.path || ''))}
                      </span>
                      <span className="text-slate-400 shrink-0">{fmtDateTime(t.created_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-slate-400">Sem atividade registrada.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ACCENTS: Record<string, string> = {
  emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40',
  blue: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40',
  amber: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40',
  indigo: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40',
};

function KpiCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: React.ReactNode; accent: string }) {
  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex items-center gap-3">
      <div className={`rounded-lg p-2.5 ${ACCENTS[accent] || ACCENTS.emerald}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{label}</p>
        <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-3 py-2">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{label}</p>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{value}</p>
    </div>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex items-center justify-center h-40 text-xs text-slate-400">
      {loading ? (
        <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Carregando...</span>
      ) : (
        'Sem dados no período selecionado.'
      )}
    </div>
  );
}
