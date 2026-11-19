/**
 * Sub-pagina exclusiva do usuario Andre (andre.araujo@ten.ind.br) dentro de
 * Uso do Sistema (/admin/uso), aberta ao clicar no card "Ativos hoje".
 * Exibe o uso individual detalhado de qualquer usuario escolhido na lista de selecao.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Calendar,
  Clock,
  FileText,
  LogIn,
  RefreshCw,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '../../db/supabaseClient';
import { localDb } from '../../db/localDb';
import type { Profile } from '../../types';
import { isUserAndre } from '../../lib/pages';
import { consolidarUsoIndividual, type EventoUsoBruto } from '../../lib/usoIndividual';

type PeriodoIndividual = 'today' | '7' | '30' | '90' | 'custom';
type FiltroListaUsuarios = 'ativos' | 'todos';

interface ActiveUserRow {
  user_id: string;
  user_name: string | null;
  email: string | null;
  sessions: number;
  page_views: number;
  first_event: string | null;
  last_event: string | null;
}

interface UsoIndividualUsuarioViewProps {
  currentUser: Profile | null | undefined;
  onVoltar: () => void;
  initialUserId?: string | null;
}

function fmtDwell(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return m ? `${h}h ${m}min` : `${h}h`;
  return s ? `${m}min ${s}s` : `${m}min`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

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

export default function UsoIndividualUsuarioView({
  currentUser,
  onVoltar,
  initialUserId = null,
}: UsoIndividualUsuarioViewProps) {
  const autorizado = isUserAndre(currentUser);

  const [periodo, setPeriodo] = useState<PeriodoIndividual>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [profiles] = useState<Profile[]>(() => localDb.getProfiles());
  const [ativosNoPeriodo, setAtivosNoPeriodo] = useState<ActiveUserRow[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(false);

  const [filtroLista, setFiltroLista] = useState<FiltroListaUsuarios>('ativos');
  const [buscaUsuario, setBuscaUsuario] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>(initialUserId || '');

  const [eventosBrutos, setEventosBrutos] = useState<EventoUsoBruto[]>([]);
  const [carregandoUsuario, setCarregandoUsuario] = useState(false);
  const [erro, setErro] = useState('');

  const [buscaTimeline, setBuscaTimeline] = useState('');
  const [ordemRecente, setOrdemRecente] = useState(true);

  const { fromISO, toISO } = useMemo(() => {
    const to = new Date();
    let from = new Date();
    if (periodo === 'today') {
      from.setHours(0, 0, 0, 0);
      return { fromISO: from.toISOString(), toISO: to.toISOString() };
    }
    if (periodo === 'custom') {
      const f = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(Date.now() - 7 * 864e5);
      const t = customTo ? new Date(`${customTo}T23:59:59`) : new Date();
      return { fromISO: f.toISOString(), toISO: t.toISOString() };
    }
    from = new Date(Date.now() - parseInt(periodo, 10) * 864e5);
    from.setHours(0, 0, 0, 0);
    return { fromISO: from.toISOString(), toISO: to.toISOString() };
  }, [periodo, customFrom, customTo]);

  const carregarListaAtivos = useCallback(async () => {
    if (!supabase || !autorizado) return;
    setCarregandoLista(true);
    try {
      const { data, error } = await supabase.rpc('usage_active_user_list', {
        p_from: fromISO,
        p_to: toISO,
      });
      if (error) throw error;
      const lista = (data as ActiveUserRow[]) || [];
      setAtivosNoPeriodo(lista);
      setSelectedUserId(prev => {
        if (prev) return prev;
        return lista[0]?.user_id || '';
      });
    } catch (err: any) {
      console.error('Falha ao carregar lista de ativos:', err);
      setAtivosNoPeriodo([]);
    } finally {
      setCarregandoLista(false);
    }
  }, [fromISO, toISO, autorizado]);

  useEffect(() => {
    void carregarListaAtivos();
  }, [carregarListaAtivos]);

  const carregarDadosUsuario = useCallback(async () => {
    if (!supabase || !autorizado || !selectedUserId) {
      setEventosBrutos([]);
      return;
    }
    setCarregandoUsuario(true);
    setErro('');
    try {
      const { data, error } = await supabase
        .from('ops_eventos_uso')
        .select('id, event_type, path, page_label, session_id, created_at')
        .eq('user_id', selectedUserId)
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .order('created_at', { ascending: true })
        .limit(5000);
      if (error) throw error;
      setEventosBrutos((data as EventoUsoBruto[]) || []);
    } catch (err: any) {
      console.error('Falha ao carregar uso individual:', err);
      setErro(err?.message || 'Falha ao carregar eventos do usuário selecionado.');
      setEventosBrutos([]);
    } finally {
      setCarregandoUsuario(false);
    }
  }, [selectedUserId, fromISO, toISO, autorizado]);

  useEffect(() => {
    void carregarDadosUsuario();
  }, [carregarDadosUsuario]);

  const mapaAtivos = useMemo(() => {
    const mapa = new Map<string, ActiveUserRow>();
    ativosNoPeriodo.forEach(a => mapa.set(a.user_id, a));
    return mapa;
  }, [ativosNoPeriodo]);

  const mapaPerfis = useMemo(() => {
    const mapa = new Map<string, Profile>();
    profiles.forEach(p => mapa.set(p.id, p));
    return mapa;
  }, [profiles]);

  /** Lista unificada para o dropdown de selecao (ativos no periodo primeiro, depois demais cadastrados). */
  const opcoesSelect = useMemo(() => {
    const idsVistos = new Set<string>();
    const lista: { id: string; nome: string; email: string; ativo: boolean; pageViews: number; lastEvent: string | null }[] = [];

    for (const a of ativosNoPeriodo) {
      idsVistos.add(a.user_id);
      const perfil = mapaPerfis.get(a.user_id);
      lista.push({
        id: a.user_id,
        nome: a.user_name || perfil?.name || a.email || a.user_id,
        email: a.email || perfil?.email || '',
        ativo: true,
        pageViews: a.page_views,
        lastEvent: a.last_event,
      });
    }

    const demais = profiles
      .filter(p => !idsVistos.has(p.id))
      .sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || ''));

    for (const p of demais) {
      lista.push({
        id: p.id,
        nome: p.name || p.email || p.id,
        email: p.email || '',
        ativo: false,
        pageViews: 0,
        lastEvent: null,
      });
    }
    return lista;
  }, [ativosNoPeriodo, profiles, mapaPerfis]);

  const listaLateralFiltrada = useMemo(() => {
    const q = buscaUsuario.trim().toLowerCase();
    return opcoesSelect.filter(item => {
      if (filtroLista === 'ativos' && !item.ativo) return false;
      if (!q) return true;
      return item.nome.toLowerCase().includes(q) || item.email.toLowerCase().includes(q);
    });
  }, [opcoesSelect, filtroLista, buscaUsuario]);

  const usuarioSelecionado = useMemo(() => {
    if (!selectedUserId) return null;
    const perfil = mapaPerfis.get(selectedUserId);
    const ativo = mapaAtivos.get(selectedUserId);
    return {
      id: selectedUserId,
      nome: perfil?.name || ativo?.user_name || ativo?.email || selectedUserId,
      email: perfil?.email || ativo?.email || '',
      cargo: perfil?.cargo || '',
      status: perfil?.status || '',
    };
  }, [selectedUserId, mapaPerfis, mapaAtivos]);

  const resumo = useMemo(() => consolidarUsoIndividual(eventosBrutos), [eventosBrutos]);

  const eventosTimelineFiltrados = useMemo(() => {
    const q = buscaTimeline.trim().toLowerCase();
    const filtrados = q
      ? resumo.eventos.filter(e =>
          e.page_label.toLowerCase().includes(q) || (e.path || '').toLowerCase().includes(q),
        )
      : resumo.eventos;
    return ordemRecente ? [...filtrados].reverse() : filtrados;
  }, [resumo.eventos, buscaTimeline, ordemRecente]);

  const maxVisitasPagina = resumo.rankingPaginas[0]?.visitas || 1;

  const atualizarTudo = () => {
    void carregarListaAtivos();
    void carregarDadosUsuario();
  };

  // Defesa em profundidade: bloqueia renderizacao para qualquer outro usuario ou admin.
  if (!autorizado) return null;

  return (
    <div className="p-4 sm:p-6 w-full space-y-5">
      {/* Cabecalho */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-start sm:items-center gap-3">
          <button
            type="button"
            onClick={onVoltar}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Uso Individual por Usuário</h1>
              <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                Ativos hoje: {ativosNoPeriodo.length}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Selecione um usuário na lista para inspecionar sessões, telas visitadas, horários e permanência
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Seletor rapido (select) para mobile/desktop */}
          <select
            aria-label="Selecionar usuário"
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 max-w-[260px]"
          >
            <option value="">Selecione um usuário…</option>
            {opcoesSelect.map(u => (
              <option key={u.id} value={u.id}>
                {u.ativo ? `● ${u.nome} (${u.pageViews} telas)` : u.nome}
              </option>
            ))}
          </select>

          {/* Periodo */}
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-50 dark:bg-slate-800/50">
            {(['today', '7', '30', '90', 'custom'] as PeriodoIndividual[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodo(p)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  periodo === p
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {p === 'today' ? 'Hoje' : p === 'custom' ? 'Período' : `${p}d`}
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-label="Atualizar dados"
            onClick={atualizarTudo}
            disabled={carregandoLista || carregandoUsuario}
            className="p-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
            title="Atualizar dados"
          >
            <RefreshCw className={`h-4 w-4 ${carregandoLista || carregandoUsuario ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {periodo === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900 px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
          <Calendar className="h-4 w-4 text-emerald-600" />
          <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            De:
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-slate-800 dark:text-slate-200"
            />
          </label>
          <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            Até:
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-slate-800 dark:text-slate-200"
            />
          </label>
        </div>
      )}

      {erro && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-3 text-xs text-rose-700 dark:text-rose-300">
          {erro}
        </div>
      )}

      {/* Grid principal: Lista de selecao a esquerda + Detalhe individual a direita */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Lista de selecao de usuarios */}
        <aside className="lg:col-span-4 xl:col-span-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-emerald-600" />
                Lista de Usuários
              </span>
              <span className="text-[11px] text-slate-500 font-mono">{listaLateralFiltrada.length}</span>
            </div>

            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={buscaUsuario}
                onChange={e => setBuscaUsuario(e.target.value)}
                placeholder="Filtrar nome ou e-mail…"
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              {buscaUsuario && (
                <button
                  type="button"
                  aria-label="Limpar busca"
                  onClick={() => setBuscaUsuario('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setFiltroLista('ativos')}
                className={`rounded-md py-1 transition-colors cursor-pointer ${
                  filtroLista === 'ativos'
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Ativos ({ativosNoPeriodo.length})
              </button>
              <button
                type="button"
                onClick={() => setFiltroLista('todos')}
                className={`rounded-md py-1 transition-colors cursor-pointer ${
                  filtroLista === 'todos'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Todos ({opcoesSelect.length})
              </button>
            </div>
          </div>

          <div className="max-h-[65vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {carregandoLista && ativosNoPeriodo.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Carregando…
              </div>
            ) : listaLateralFiltrada.length === 0 ? (
              <div className="py-10 px-4 text-center text-xs text-slate-500">
                Nenhum usuário encontrado para o filtro atual.
              </div>
            ) : (
              listaLateralFiltrada.map(u => {
                const selecionado = u.id === selectedUserId;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUserId(u.id)}
                    className={`w-full text-left px-3.5 py-2.5 transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                      selecionado
                        ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-l-2 border-l-emerald-600'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                            u.ativo ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                        />
                        <p className={`text-xs font-semibold truncate ${selecionado ? 'text-emerald-900 dark:text-emerald-200' : 'text-slate-800 dark:text-slate-200'}`}>
                          {u.nome}
                        </p>
                      </div>
                      {u.email && <p className="text-[10px] text-slate-500 truncate pl-3">{u.email}</p>}
                    </div>
                    {u.ativo && (
                      <div className="text-right shrink-0">
                        <p className="text-[11px] font-bold font-mono text-emerald-700 dark:text-emerald-400">
                          {u.pageViews}
                        </p>
                        <p className="text-[10px] text-slate-400">{fmtDesde(u.lastEvent)}</p>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Raio-X individual do usuario selecionado */}
        <section className="lg:col-span-8 xl:col-span-9 space-y-5">
          {!usuarioSelecionado ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-20 px-6 text-center">
              <User className="h-8 w-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Selecione um usuário</p>
              <p className="text-xs text-slate-500 mt-1">
                Escolha um colaborador na lista ao lado ou no seletor superior para visualizar o uso detalhado.
              </p>
            </div>
          ) : (
            <>
              {/* Identificacao do usuario */}
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-sm shrink-0">
                    {(usuarioSelecionado.nome || 'U').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {usuarioSelecionado.nome}
                    </h2>
                    <p className="text-xs text-slate-500 truncate">
                      {[usuarioSelecionado.email, usuarioSelecionado.cargo].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>Primeiro evento: <strong className="text-slate-700 dark:text-slate-300">{fmtDateTime(resumo.primeiroEvento)}</strong></p>
                  <p>Último evento: <strong className="text-slate-700 dark:text-slate-300">{fmtDateTime(resumo.ultimoEvento)}</strong> {resumo.ultimoEvento ? `(${fmtDesde(resumo.ultimoEvento)})` : ''}</p>
                </div>
              </div>

              {/* KPIs individuais */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex items-center gap-3">
                  <div className="rounded-lg p-2.5 bg-sky-50 dark:bg-sky-950/40 text-sky-600">
                    <LogIn className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sessões</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{resumo.sessoesDistintas}</p>
                    <p className="text-[10px] text-slate-400">{resumo.totalLogins} login(s)</p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex items-center gap-3">
                  <div className="rounded-lg p-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Telas visitadas</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{resumo.totalVisualizacoes}</p>
                    <p className="text-[10px] text-slate-400">{resumo.paginasDistintas} distinta(s)</p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex items-center gap-3">
                  <div className="rounded-lg p-2.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tempo em tela</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{fmtDwell(resumo.tempoTotalSeg)}</p>
                    <p className="text-[10px] text-slate-400">estimado no período</p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex items-center gap-3">
                  <div className="rounded-lg p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Eventos totais</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{resumo.totalEventos}</p>
                    <p className="text-[10px] text-slate-400">{fmtDesde(resumo.ultimoEvento) || 'sem uso'}</p>
                  </div>
                </div>
              </div>

              {carregandoUsuario ? (
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 py-16 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" />
                  Carregando dados de {usuarioSelecionado.nome}…
                </div>
              ) : resumo.totalEventos === 0 ? (
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 py-14 text-center text-xs text-slate-500">
                  Nenhum evento registrado para <strong>{usuarioSelecionado.nome}</strong> neste período.
                </div>
              ) : (
                <>
                  {/* Ranking de paginas + Grafico por hora */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Páginas mais acessadas</h3>
                        <p className="text-xs text-slate-500">Acessos e tempo acumulado por tela</p>
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {resumo.rankingPaginas.map(p => (
                          <div key={p.path} className="rounded-lg border border-slate-100 dark:border-slate-800 p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{p.page_label}</p>
                                <p className="font-mono text-[10px] text-slate-400 truncate">{p.path}</p>
                              </div>
                              <div className="text-right shrink-0 font-mono">
                                <span className="font-bold text-slate-800 dark:text-slate-200">{p.visitas}x</span>
                                <span className="block text-[10px] text-emerald-600 dark:text-emerald-400">
                                  {fmtDwell(p.tempoTotalSeg)}
                                </span>
                              </div>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-500"
                                style={{ width: `${Math.max(6, Math.round((p.visitas / maxVisitasPagina) * 100))}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Atividade por horário</h3>
                        <p className="text-xs text-slate-500">Distribuição de eventos ao longo das 24h</p>
                      </div>
                      <div className="h-60 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={resumo.porHora} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="hora" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={h => `${h}h`} />
                            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                              labelFormatter={h => `${h}:00 – ${h}:59`}
                              formatter={(val: any) => [`${val} evento(s)`, 'Atividade']}
                            />
                            <Bar dataKey="eventos" fill="#10b981" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Linha do tempo completa */}
                  <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                          Linha do tempo de navegação ({eventosTimelineFiltrados.length})
                        </h3>
                        <p className="text-xs text-slate-500">Logins e páginas acessadas em sequência com tempo de permanência</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={buscaTimeline}
                            onChange={e => setBuscaTimeline(e.target.value)}
                            placeholder="Filtrar tela…"
                            className="pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setOrdemRecente(v => !v)}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          {ordemRecente ? 'Mais recentes' : 'Cronológica'}
                        </button>
                      </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1">
                      {eventosTimelineFiltrados.map(ev => (
                        <div
                          key={ev.id}
                          className="flex items-center justify-between gap-3 text-xs bg-slate-50/70 dark:bg-slate-950/60 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span
                              className={`flex h-6 w-6 items-center justify-center rounded-md shrink-0 ${
                                ev.event_type === 'login'
                                  ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              }`}
                            >
                              {ev.event_type === 'login' ? <LogIn className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{ev.page_label}</p>
                              {ev.path && <p className="font-mono text-[10px] text-slate-500 truncate">{ev.path}</p>}
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-right shrink-0">
                            <div>
                              <div className="text-[11px] text-slate-700 dark:text-slate-300 font-mono">
                                {new Date(ev.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {new Date(ev.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                              </div>
                            </div>
                            <div className="w-20 text-right">
                              {ev.event_type === 'login' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                                  Login
                                </span>
                              ) : ev.dwell_seconds !== null ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-mono">
                                  <Clock className="h-3 w-3" />
                                  {fmtDwell(ev.dwell_seconds)}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">Última tela</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
