/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Activity, Users, MousePointerClick, Clock, RefreshCw, AlertTriangle,
  LogIn, FileText, Calendar, ChevronRight, ChevronDown
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
type Preset = 'today' | '7' | '30' | '90' | 'custom';


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
interface PageUserRow { user_id: string; user_name: string | null; email: string | null; visits: number; last_visit: string | null; }
interface ActiveUserRow {
  user_id: string;
  user_name: string | null;
  email: string | null;
  sessions: number;
  page_views: number;
  first_event: string | null;
  last_event: string | null;
}
interface UserPageVisit {
  id: string;
  path: string;
  page_label: string | null;
  created_at: string;
  session_id: string | null;
  dwell_seconds: number | null;
}

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

/**
 * Distância até agora, em linguagem corrida.
 *
 * A data absoluta responde "quando"; esta responde "faz muito tempo?" — que é
 * a pergunta de quem varre a lista atrás de quem parou de usar o app. As duas
 * aparecem juntas na tabela justamente porque respondem coisas diferentes.
 */
function fmtDesde(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'agora';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
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
  // Lista de usuários ativos: fica no fim da página, fechada, e só é buscada
  // quando alguém abre. É a consulta mais pesada da tela (varre todos os
  // eventos do período sem agrupar por página) e a menos consultada — não
  // faz sentido pagá-la em toda visita ao dashboard.
  const [showActiveUsers, setShowActiveUsers] = useState(false);
  const [activeUserList, setActiveUserList] = useState<ActiveUserRow[] | null>(null);
  const [activeListLoading, setActiveListLoading] = useState(false);

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [pageUsers, setPageUsers] = useState<Map<string, PageUserRow[]>>(new Map());
  const [pageUsersLoading, setPageUsersLoading] = useState<Set<string>>(new Set());

  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set());
  const [userPageHistory, setUserPageHistory] = useState<Map<string, UserPageVisit[]>>(new Map());
  const [userHistoryLoading, setUserHistoryLoading] = useState<Set<string>>(new Set());

  const { fromISO, toISO } = useMemo(() => {
    const to = new Date();
    let from = new Date();
    if (preset === 'today') {
      from.setHours(0, 0, 0, 0);
      return { fromISO: from.toISOString(), toISO: to.toISOString() };
    }
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

  useEffect(() => {
    setExpandedPaths(new Set());
    setPageUsers(new Map());
    setPageUsersLoading(new Set());
    setExpandedUserIds(new Set());
    setUserPageHistory(new Map());
    setUserHistoryLoading(new Set());
  }, [fromISO, toISO, selectedUser]);

  // Trocar o período invalida a lista, mas não a fecha: quem abriu o painel
  // quer continuar vendo-o ao comparar períodos. O null dispara a recarga
  // abaixo apenas enquanto estiver aberto.
  useEffect(() => { setActiveUserList(null); }, [fromISO, toISO]);

  useEffect(() => {
    if (!supabase || !showActiveUsers || activeUserList !== null || activeListLoading) return;
    setActiveListLoading(true);
    supabase.rpc('usage_active_user_list', { p_from: fromISO, p_to: toISO })
      .then(({ data, error }) => {
        if (error) throw error;
        setActiveUserList((data as ActiveUserRow[]) || []);
      })
      .catch(err => {
        console.error('Falha ao carregar usuários ativos:', err);
        setActiveUserList([]);
      })
      .finally(() => setActiveListLoading(false));
  }, [showActiveUsers, activeUserList, activeListLoading, fromISO, toISO]);

  const togglePageUsers = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
        return next;
      }
      next.add(path);
      return next;
    });
  }, []);

  const toggleUserExpand = useCallback((userId: string) => {
    setExpandedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    expandedUserIds.forEach(userId => {
      if (userPageHistory.has(userId) || userHistoryLoading.has(userId)) return;
      setUserHistoryLoading(prev => new Set(prev).add(userId));

      supabase
        .from('usage_events')
        .select('id, event_type, path, page_label, session_id, created_at')
        .eq('user_id', userId)
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
          if (error || !data) {
            setUserPageHistory(prev => new Map(prev).set(userId, []));
            return;
          }

          const visits: UserPageVisit[] = [];
          for (let i = 0; i < data.length; i++) {
            const current = data[i];
            if (current.event_type !== 'page_view' || !current.path) continue;

            const next = data[i + 1];
            let dwell: number | null = null;
            if (next) {
              const diffSec = (new Date(next.created_at).getTime() - new Date(current.created_at).getTime()) / 1000;
              if (diffSec > 0 && diffSec <= 1800 && (!current.session_id || !next.session_id || current.session_id === next.session_id)) {
                dwell = diffSec;
              }
            }

            visits.push({
              id: current.id || `${current.created_at}-${i}`,
              path: current.path,
              page_label: current.page_label || labelForPath(current.path),
              created_at: current.created_at,
              session_id: current.session_id,
              dwell_seconds: dwell,
            });
          }

          setUserPageHistory(prev => new Map(prev).set(userId, visits));
        })
        .catch(err => {
          console.error('Falha ao carregar histórico de navegação do usuário:', err);
          setUserPageHistory(prev => new Map(prev).set(userId, []));
        })
        .finally(() => {
          setUserHistoryLoading(prev => {
            const next = new Set(prev);
            next.delete(userId);
            return next;
          });
        });
    });
  }, [expandedUserIds, fromISO, toISO, userPageHistory, userHistoryLoading]);

  useEffect(() => {
    if (!supabase) return;
    expandedPaths.forEach(path => {
      if (pageUsers.has(path) || pageUsersLoading.has(path)) return;
      setPageUsersLoading(prev => new Set(prev).add(path));
      supabase.rpc('usage_page_users', { p_path: path, p_from: fromISO, p_to: toISO })
        .then(({ data, error }) => {
          setPageUsers(prev => new Map(prev).set(path, error ? [] : (data as PageUserRow[]) || []));
        })
        .finally(() => {
          setPageUsersLoading(prev => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
        });
    });
  }, [expandedPaths, fromISO, toISO, pageUsers, pageUsersLoading]);

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

  const selectedProfile = useMemo(
    () => profiles.find(p => p.id === selectedUser),
    [profiles, selectedUser]
  );

  return (
    <div className="p-4 sm:p-6 w-full space-y-6">
      {/* Top Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Uso do Sistema</h1>
            <p className="text-xs text-slate-500">Métricas de engajamento, navegação e comportamento de usuários</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Preset range buttons */}
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-50 dark:bg-slate-800/50">
            {(['today', '7', '30', '90'] as Preset[]).map(p => (
              <button
                key={p}
                onClick={() => { setPreset(p); }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  preset === p
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {p === 'today' ? 'Hoje' : `${p}d`}
              </button>
            ))}
          </div>

          {/* User selector */}
          <div className="relative">
            <select
              value={selectedUser}
              onChange={e => setSelectedUser(e.target.value)}
              className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="todos">Todos os usuários</option>
              {filteredProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.name || p.email || p.id}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => loadAll()}
            disabled={loading}
            className="p-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Atualizar dados"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-4 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Users} label="Ativos hoje" value={kpis ? kpis.active_today : '—'} accent="emerald" />
        <KpiCard icon={LogIn} label="Sessões" value={kpis ? kpis.sessions : '—'} accent="blue" />
        <KpiCard icon={FileText} label="Visualizações" value={kpis ? kpis.page_views : '—'} accent="indigo" />
        <KpiCard icon={Clock} label="Tempo médio/sessão" value={kpis ? fmtDwell(kpis.avg_session_minutes * 60) : '—'} accent="amber" />
      </div>

      {/* Active Users Chart */}
      <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Usuários ativos por dia</h3>
            <p className="text-xs text-slate-400">Total de usuários únicos que acessaram o app no período</p>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-50 dark:bg-slate-800/50">
            {(['day', 'week', 'month'] as Granularity[]).map(g => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                  granularity === g
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {g === 'day' ? 'Dia' : g === 'week' ? 'Semana' : 'Mês'}
              </button>
            ))}
          </div>
        </div>

        <div className="h-64 w-full">
          {loading && !activeUsers.length ? (
            <EmptyState loading={loading} />
          ) : activeUsers.length === 0 ? (
            <EmptyState loading={false} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="activeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  labelStyle={{ color: '#94a3b8' }}
                  formatter={(val: any) => [`${val} usuários`, 'Ativos']}
                />
                <Area type="monotone" dataKey="active_users" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#activeGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Grid Page Ranking & Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Page Ranking */}
        <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Páginas mais visitadas</h3>
            <p className="text-xs text-slate-400">Ranking por acessos e tempo médio de permanência</p>
          </div>

          {loading && !pageRanking.length ? (
            <EmptyState loading={loading} />
          ) : pageRanking.length === 0 ? (
            <EmptyState loading={false} />
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {pageRanking.map(r => {
                const isExpanded = expandedPaths.has(r.path);
                const usersList = pageUsers.get(r.path);
                const isUsersLoading = pageUsersLoading.has(r.path);

                return (
                  <div key={r.path} className="border border-slate-100 dark:border-slate-800 rounded-lg overflow-hidden">
                    <div
                      onClick={() => togglePageUsers(r.path)}
                      className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                            {r.page_label || labelForPath(r.path)}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono truncate">{r.path}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right shrink-0">
                        <div>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono">{r.visits}</span>
                          <span className="text-[10px] text-slate-400 block">visitas</span>
                        </div>
                        <div className="w-16">
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                            {fmtDwell(r.avg_dwell_seconds)}
                          </span>
                          <span className="text-[10px] text-slate-400 block">médio</span>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="bg-slate-50 dark:bg-slate-800/40 p-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                        <p className="font-semibold text-slate-600 dark:text-slate-400 mb-2">
                          Usuários que visitaram esta página ({usersList?.length ?? 0}):
                        </p>
                        {isUsersLoading ? (
                          <div className="flex items-center gap-2 text-slate-400 py-2">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            <span>Carregando usuários...</span>
                          </div>
                        ) : !usersList?.length ? (
                          <p className="text-slate-400 py-1">Nenhum usuário encontrado.</p>
                        ) : (
                          <ul className="space-y-1 max-h-40 overflow-y-auto">
                            {usersList.map(u => (
                              <li key={u.user_id} className="flex items-center justify-between py-1 px-2 rounded bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                                  {u.user_name || u.email || u.user_id}
                                </span>
                                <div className="text-right flex items-center gap-3 font-mono text-[11px]">
                                  <span className="text-slate-600 dark:text-slate-400">{u.visits}x</span>
                                  <span className="text-slate-400 text-[10px]">{fmtDateTime(u.last_visit)}</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Heatmap / Usage by Hour */}
        <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Horários de maior uso</h3>
            <p className="text-xs text-slate-400">Distribuição por dia da semana e hora</p>
          </div>

          {loading && !byHour.length ? (
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

      {/* Active Users Table */}
      <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowActiveUsers(v => !v)}
          aria-expanded={showActiveUsers}
          className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
        >
          {showActiveUsers
            ? <ChevronDown className="h-4 w-4 text-emerald-600 shrink-0" />
            : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
          <Users className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Usuários ativos no período</span>
          <span className="ml-auto text-[11px] text-slate-400">
            {showActiveUsers && activeUserList?.length
              ? `${activeUserList.length} usuário${activeUserList.length === 1 ? '' : 's'} · ordenado pelo último uso`
              : 'Ver quem usou o app e quando'}
          </span>
        </button>

        {showActiveUsers && (
          <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-800 pt-4">
            {activeListLoading || activeUserList === null ? (
              <EmptyState loading />
            ) : activeUserList.length === 0 ? (
              <EmptyState loading={false} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                      <th className="py-2 pl-2 w-8"></th>
                      <th className="py-2">Usuário</th>
                      <th className="py-2 text-right">Sessões</th>
                      <th className="py-2 text-right">Páginas</th>
                      <th className="py-2 text-right">Primeiro acesso</th>
                      <th className="py-2 text-right pr-2">Último uso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeUserList.map(u => {
                      const isUserExpanded = expandedUserIds.has(u.user_id);
                      const history = userPageHistory.get(u.user_id);
                      const isHistLoading = userHistoryLoading.has(u.user_id);

                      return (
                        <React.Fragment key={u.user_id}>
                          <tr
                            onClick={() => toggleUserExpand(u.user_id)}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                          >
                            <td className="py-2 pl-2 text-slate-400">
                              {isUserExpanded ? (
                                <ChevronDown className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </td>
                            <td className="py-2 pr-3">
                              <div className="font-medium text-slate-700 dark:text-slate-300 truncate">
                                {u.user_name || u.email || u.user_id}
                              </div>
                              {u.user_name && u.email && (
                                <div className="text-[10px] text-slate-400 truncate">{u.email}</div>
                              )}
                            </td>
                            <td className="py-2 text-right font-mono text-slate-600 dark:text-slate-400">{u.sessions}</td>
                            <td className="py-2 text-right font-mono text-slate-600 dark:text-slate-400">{u.page_views}</td>
                            <td className="py-2 text-right text-slate-500 whitespace-nowrap">{fmtDateTime(u.first_event)}</td>
                            <td className="py-2 text-right whitespace-nowrap pr-2">
                              <div className="font-medium text-slate-700 dark:text-slate-300">{fmtDateTime(u.last_event)}</div>
                              <div className="text-[10px] text-slate-400">{fmtDesde(u.last_event)}</div>
                            </td>
                          </tr>

                          {isUserExpanded && (
                            <tr className="bg-slate-50/70 dark:bg-slate-800/40">
                              <td colSpan={6} className="p-4 pl-8">
                                {isHistLoading ? (
                                  <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                                    <span>Carregando histórico de navegação...</span>
                                  </div>
                                ) : !history || history.length === 0 ? (
                                  <p className="text-xs text-slate-400 py-2">
                                    Nenhuma navegação de página registrada para este usuário no período.
                                  </p>
                                ) : (
                                  <div className="space-y-3">
                                    <div className="flex flex-wrap items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700/60 pb-2 gap-2">
                                      <span>
                                        Páginas visitadas ({history.length}) · Ordem da hora
                                      </span>
                                      <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                                        Tempo total aproximado em tela:{' '}
                                        <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                                          {fmtDwell(history.reduce((acc, curr) => acc + (curr.dwell_seconds || 0), 0))}
                                        </strong>
                                      </span>
                                    </div>

                                    <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                                      {history.map((visit, idx) => (
                                        <div
                                          key={visit.id}
                                          className="flex items-center justify-between gap-3 text-xs bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-2xs"
                                        >
                                          <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <span className="font-mono text-[10px] text-slate-400 w-6 text-right shrink-0">
                                              #{idx + 1}
                                            </span>
                                            <div className="min-w-0">
                                              <div className="font-medium text-slate-700 dark:text-slate-200 truncate">
                                                {visit.page_label}
                                              </div>
                                              <div className="font-mono text-[10px] text-slate-400 truncate">
                                                {visit.path}
                                              </div>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-4 text-right shrink-0">
                                            <div>
                                              <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                                                {new Date(visit.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                              </div>
                                              <div className="text-[9px] text-slate-400">
                                                {new Date(visit.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                              </div>
                                            </div>

                                            <div className="w-24 text-right">
                                              {visit.dwell_seconds !== null ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-mono">
                                                  <Clock className="h-3 w-3" />
                                                  {fmtDwell(visit.dwell_seconds)}
                                                </span>
                                              ) : (
                                                <span className="text-[10px] text-slate-400 italic">
                                                  Última tela
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
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
