/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tela Início — visão pessoal e sensível a permissões.
 *
 * O SISTEN cresceu para vários módulos e nem todo usuário enxerga os mesmos.
 * Aqui nada é fixo: os indicadores, atalhos e módulos exibidos passam por
 * `canAccessPage` / `hasPermission`, então cada pessoa vê só o que lhe cabe.
 * A tela reúne notificações, o que a pessoa acessou recentemente, as páginas
 * que ela fixou como favoritas e os módulos que pode abrir.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Bell, BellOff, FileCheck, List, FileEdit, Database, Users, ArrowRight,
  Star, Clock, Info, CheckCircle2, AlertTriangle, ShieldAlert, Compass,
  ChevronRight, Plus, CheckCheck, Sparkles,
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { supabase } from '../db/supabaseClient';
import type { Notification, Profile, Request } from '../types';
import { PAGES, canAccessPage, pageIdForPath } from '../lib/pages';
import { getRecentPages, getFavoritePages, toggleFavoritePage } from '../lib/homePrefs';

interface DashboardProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

/* ---------------------------------------------------------------- helpers */

const CLOSED_STATUS = new Set(['rejeitada', 'resolvido', 'fechado', 'cancelada']);

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function tempoRelativo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'agora';
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

const NOTIF_STYLE: Record<Notification['type'], { icon: LucideIcon; klass: string }> = {
  info: { icon: Info, klass: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400' },
  success: { icon: CheckCircle2, klass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400' },
  alert: { icon: AlertTriangle, klass: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400' },
  critical: { icon: ShieldAlert, klass: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400' },
};

const CHIP_TONE: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

/** IDs de página (lib/pages.ts) que compõem o mapa de módulos da tela. */
const MODULE_IDS = [
  'solicitacoes_home', 'suprimentos_home', 'almoxarifado_home', 'facilities',
  'financeiro_home', 'helpdesk_home', 'admin_home',
  'formularios', 'materiais_busca', 'rastreio', 'relatorios',
];

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------- component */

export default function Dashboard({ user, onNavigate }: DashboardProps) {
  const [notifs, setNotifs] = useState<Notification[]>(() => localDb.getNotifications(user.id));
  const [favs, setFavs] = useState<string[]>(() => getFavoritePages(user.id));

  useEffect(() => {
    setFavs(getFavoritePages(user.id));
  }, [user.id]);

  useEffect(() => {
    localDb.refreshNotificationsFromSupabase().then(() => setNotifs(localDb.getNotifications(user.id)));
  }, [user.id]);

  const [materialsCount, setMaterialsCount] = useState(0);
  useEffect(() => {
    if (!user.roles.includes('admin') || !supabase) return;
    supabase
      .from('sap_zl0169_162_catalogo')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .then(({ count }) => setMaterialsCount(count || 0));
  }, [user.roles]);

  const requests = localDb.getRequests();
  const sector = localDb.getSectors().find(s => s.id === user.sector_id);

  const myRequests = useMemo(
    () => requests.filter(r => r.solicitante_id === user.id),
    [requests, user.id],
  );
  const myRecent = useMemo(
    () => [...myRequests].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 5),
    [myRequests],
  );
  const myOpen = myRequests.filter(r => !CLOSED_STATUS.has(r.status)).length;
  const myDrafts = myRequests.filter(r => r.status === 'rascunho').length;

  const pendingApprovals = useMemo(
    () => requests.filter(r =>
      r.type === 'compra' && r.status === 'pendente' && r.solicitante_sector_id === user.sector_id,
    ),
    [requests, user.sector_id],
  );
  const highCritApprovals = pendingApprovals.filter(r => r.criticality >= 4).length;

  const openSapCount = useMemo(
    () => localDb.getEnrichedSAPRequisicoes().filter(s => s.status_requisicao === 'Sem PO').length,
    [],
  );
  const pendingUsersCount = useMemo(
    () => localDb.getProfiles().filter(p => p.status === 'pendente').length,
    [],
  );

  const unread = notifs.filter(n => !n.is_read);
  const notifList = useMemo(
    () => [...notifs]
      .sort((a, b) => Number(a.is_read) - Number(b.is_read) || +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 6),
    [notifs],
  );

  const canApprove = canAccessPage(user, 'sol_aprovacoes');
  const canSapPanel = localDb.hasPermission(user, 'sap', 'visualizar_painel');
  const canUsers = canAccessPage(user, 'admin_usuarios');

  /* ---------------------------------------------------- indicadores (chips) */
  interface Chip {
    id: string;
    label: string;
    value: number;
    icon: LucideIcon;
    tone: string;
    show?: boolean;
    hideWhenZero?: boolean;
    hint?: string;
    onClick?: () => void;
  }
  const chips: Chip[] = ([
    { id: 'notif', label: 'Notificações', value: unread.length, icon: Bell, tone: 'blue', hideWhenZero: true },
    { id: 'aprov', label: 'Aguardando aprovação', value: pendingApprovals.length, icon: FileCheck, tone: 'amber', show: canApprove, onClick: () => onNavigate('/solicitacoes/aprovacoes'), hint: highCritApprovals ? `${highCritApprovals} crítica(s)` : 'no seu setor' },
    { id: 'minhas', label: 'Minhas em aberto', value: myOpen, icon: List, tone: 'indigo', onClick: () => onNavigate('/solicitacoes/minhas') },
    { id: 'rasc', label: 'Rascunhos', value: myDrafts, icon: FileEdit, tone: 'slate', hideWhenZero: true, onClick: () => onNavigate('/solicitacoes/minhas') },
    { id: 'sap', label: 'Painel SAP sem PO', value: openSapCount, icon: Database, tone: 'sky', show: canSapPanel, onClick: () => onNavigate('/suprimentos/painel') },
    { id: 'usr', label: 'Usuários pendentes', value: pendingUsersCount, icon: Users, tone: 'rose', show: canUsers, hideWhenZero: true, onClick: () => onNavigate('/admin/usuarios') },
  ] as Chip[]).filter(c => c.show !== false && !(c.hideWhenZero && !c.value));

  /* ------------------------------------------------------ páginas / módulos */
  const pageByPath = useMemo(() => {
    const m = new Map<string, (typeof PAGES)[number]>();
    for (const p of PAGES) if (p.path) m.set(p.path, p);
    return m;
  }, []);

  const resolvePage = (path: string) => {
    const def = pageByPath.get(path);
    if (!def) return null;
    const id = pageIdForPath(path);
    if (id && !canAccessPage(user, id)) return null;
    return def;
  };

  const favPages = favs.map(resolvePage).filter(Boolean) as (typeof PAGES)[number][];
  const recentPages = getRecentPages()
    .map(r => resolvePage(r.path))
    .filter((p): p is (typeof PAGES)[number] => Boolean(p) && !favs.includes(p!.path!))
    .slice(0, 6);

  const modules = MODULE_IDS
    .map(id => PAGES.find(p => p.id === id))
    .filter((p): p is (typeof PAGES)[number] => Boolean(p) && canAccessPage(user, p!.id));

  const toggleFav = (path: string) => setFavs(toggleFavoritePage(user.id, path));

  const handleNotif = (n: Notification) => {
    localDb.markNotificationAsRead(n.id);
    setNotifs(localDb.getNotifications(user.id));
    if (n.context_key?.startsWith('rastreio:')) {
      onNavigate(`/rastreio?ri=${encodeURIComponent(n.context_key.slice('rastreio:'.length))}`);
    } else if (n.request_id) {
      if (n.title.toLowerCase().includes('compra') && user.roles.includes('gestor')) {
        onNavigate('/solicitacoes/aprovacoes');
      } else {
        onNavigate(`/solicitacoes/minhas?id=${n.request_id}`);
      }
    }
  };

  const markAllRead = () => {
    unread.forEach(n => localDb.markNotificationAsRead(n.id));
    setNotifs(localDb.getNotifications(user.id));
  };

  const statusBadge = (status: string) => {
    const map: Record<string, [string, string]> = {
      rascunho: ['Rascunho', 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'],
      pendente: ['Pendente', 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'],
      aprovada: ['Aprovada', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'],
      rejeitada: ['Rejeitada', 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'],
      em_revisao: ['Em revisão', 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300'],
      aberto: ['Aberto', 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'],
      em_atendimento: ['Em atendimento', 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300'],
      aguardando_solicitante: ['Aguardando você', 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300'],
      resolvido: ['Resolvido', 'bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300'],
      fechado: ['Fechado', 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'],
      reaberto: ['Reaberto', 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300'],
      cancelada: ['Cancelado', 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'],
    };
    const [label, klass] = map[status] || [status, 'bg-slate-100 text-slate-700'];
    return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${klass}`}>{label}</span>;
  };

  const tituloSolicitacao = (r: Request) =>
    r.titulo || r.justificativa ||
    (r.type === 'compra' ? 'Solicitação de compra' : r.type === 'cadastro_sap' ? 'Cadastro SAP' : 'Chamado de helpdesk');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Saudação */}
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
          {saudacao()}, {user.name.split(' ')[0]}.
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-200">{sector?.name || 'Sem setor'}</span>
          {user.cargo ? <> · {user.cargo}</> : null}
          {' · '}
          <span className="capitalize">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </p>
      </header>

      {/* Indicadores relevantes ao usuário */}
      {chips.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {chips.map(c => {
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                type="button"
                onClick={c.onClick}
                aria-disabled={!c.onClick}
                className={`flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left dark:border-slate-800 dark:bg-slate-900 ${
                  c.onClick
                    ? 'transition-colors hover:border-slate-300 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/60'
                    : 'cursor-default'
                }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${CHIP_TONE[c.tone]}`}>
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-lg font-bold leading-none text-slate-900 dark:text-slate-50">{c.value}</span>
                  <span className="mt-1 block truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {c.hint || c.label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Alerta de aprovações críticas */}
      {canApprove && pendingApprovals.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              <AlertTriangle className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                {pendingApprovals.length} solicitação(ões) aguardando sua aprovação
              </p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300/80">
                {highCritApprovals > 0
                  ? `${highCritApprovals} com criticidade alta (grau 4 ou 5) para análise prioritária.`
                  : 'Nenhuma com criticidade alta no momento.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/solicitacoes/aprovacoes')}
            className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-amber-700"
          >
            Ir para aprovações
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Coluna principal */}
        <div className="space-y-6 lg:col-span-2">
          {/* Notificações */}
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-50">
                <Bell className="h-4 w-4 text-slate-400" />
                Notificações
                {unread.length > 0 && (
                  <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{unread.length}</span>
                )}
              </h2>
              {unread.length > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Marcar todas como lidas
                </button>
              )}
            </div>

            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {notifList.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <BellOff className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Nenhuma notificação no momento</p>
                </div>
              ) : (
                notifList.map(n => {
                  const { icon: NIcon, klass } = NOTIF_STYLE[n.type] || NOTIF_STYLE.info;
                  const clickable = Boolean(n.context_key || n.request_id);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => clickable && handleNotif(n)}
                      className={`flex w-full items-start gap-3 py-3 text-left transition-colors ${
                        clickable ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50' : 'cursor-default'
                      }`}
                    >
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${klass}`}>
                        <NIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`truncate text-xs font-bold ${n.is_read ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                            {n.title}
                          </span>
                          {!n.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />}
                        </span>
                        <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                          {n.description}
                        </span>
                        <span className="mt-1 block text-[10px] font-medium text-slate-400">{tempoRelativo(n.created_at)}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </Card>

          {/* Minhas solicitações recentes */}
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-50">
                <List className="h-4 w-4 text-slate-400" />
                Minhas solicitações recentes
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('/solicitacoes/minhas')}
                className="inline-flex items-center gap-0.5 text-[11px] font-bold text-blue-600 hover:underline dark:text-blue-400"
              >
                Ver todas <ChevronRight className="h-3 w-3" />
              </button>
            </div>

            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {myRecent.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Você ainda não abriu solicitações.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('/solicitacoes/nova')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Nova solicitação
                  </button>
                </div>
              ) : (
                myRecent.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onNavigate(`/solicitacoes/minhas?id=${r.id}`)}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="font-mono text-xs font-bold text-slate-400">#{r.number}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {tituloSolicitacao(r)}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-slate-400">
                          {new Date(r.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </span>
                    </span>
                    {statusBadge(r.status)}
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Coluna lateral */}
        <div className="space-y-6">
          {/* Acesso rápido: favoritos + recentes */}
          <Card>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-50">
              <Star className="h-4 w-4 text-slate-400" />
              Acesso rápido
            </h2>

            <div className="mt-3 space-y-4">
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Favoritos</p>
                {favPages.length === 0 ? (
                  <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Toque na estrela de uma página recente para fixá-la aqui.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {favPages.map(p => {
                      const PIcon = p.icon;
                      return (
                        <li key={p.id} className="group flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onNavigate(p.path!)}
                            className="flex flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
                          >
                            {PIcon && <PIcon className="h-4 w-4 shrink-0 text-slate-400" />}
                            <span className="truncate">{p.label}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleFav(p.path!)}
                            className="rounded-lg p-1.5 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                            aria-label={`Desafixar ${p.label}`}
                          >
                            <Star className="h-3.5 w-3.5 fill-current" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {recentPages.length > 0 && (
                <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    <Clock className="h-3 w-3" /> Recentes
                  </p>
                  <ul className="space-y-1">
                    {recentPages.map(p => {
                      const PIcon = p.icon;
                      return (
                        <li key={p.id} className="group flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onNavigate(p.path!)}
                            className="flex flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
                          >
                            {PIcon && <PIcon className="h-4 w-4 shrink-0 text-slate-400" />}
                            <span className="truncate">{p.label}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleFav(p.path!)}
                            className="rounded-lg p-1.5 text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-amber-500 group-hover:opacity-100 dark:text-slate-600 dark:hover:bg-slate-800"
                            aria-label={`Fixar ${p.label}`}
                          >
                            <Star className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {favPages.length === 0 && recentPages.length === 0 && (
                <p className="text-[11px] text-slate-400">Sua navegação recente aparecerá aqui.</p>
              )}
            </div>
          </Card>

          {/* Mapa de módulos liberados */}
          <Card>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-50">
              <Compass className="h-4 w-4 text-slate-400" />
              Explorar módulos
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {modules.map(p => {
                const PIcon = p.icon;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onNavigate(p.path!)}
                    className="group flex flex-col gap-2 rounded-xl border border-slate-200 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-blue-400/50 hover:shadow-sm dark:border-slate-800 dark:hover:border-blue-400/40"
                  >
                    <span className="flex items-center justify-between">
                      {PIcon && <PIcon className="h-4.5 w-4.5 text-slate-500 dark:text-slate-400" />}
                      <ArrowRight className="h-3.5 w-3.5 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500" />
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          {user.roles.includes('admin') && (
            <Card className="bg-slate-50/60 dark:bg-slate-900/60">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-50">
                <Sparkles className="h-4 w-4 text-slate-400" />
                Resumo administrativo
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Usuários ativos</dt>
                  <dd className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-50">
                    {localDb.getProfiles().filter(p => p.status === 'ativo').length}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Solicitações</dt>
                  <dd className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-50">{requests.length}</dd>
                </div>
                <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Materiais ativos no catálogo</dt>
                  <dd className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-50">
                    {materialsCount ? materialsCount.toLocaleString('pt-BR') : '—'}
                  </dd>
                </div>
              </dl>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
