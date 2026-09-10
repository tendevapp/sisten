/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, AlertTriangle, Bell, BellRing, Check, CheckCircle2, ChevronDown, Eye, Info,
  LogOut, Menu, Monitor, Moon, Search, Sun, Upload, User, Volume2, VolumeX, type LucideIcon,
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, Notification, Role } from '../types';
import { resolverRotaNotificacao } from '../lib/notificationRouting';
import AlertaNotificacoes, { type ItemAviso } from './notifications/AlertaNotificacoes';
import {
  atualizarTituloAba, avisarNoDesktop, filtrarNovas, gravarIdsAlertados, gravarPrefsAviso,
  lerIdsAlertados, lerPrefsAviso, pedirPermissaoDesktop, permissaoDesktop, tocarBipe,
  type AvisoPrefs, type PermissaoDesktop,
} from '../lib/avisosNotificacao';

interface HeaderProps {
  user: Profile;
  simulatedRole: Role | null;
  onSimulateRole: (role: Role | null) => void;
  onUserChange: () => void;
  onNavigate: (path: string) => void;
  onOpenMobileMenu: () => void;
}

export default function Header({ user, simulatedRole, onSimulateRole, onUserChange, onNavigate, onOpenMobileMenu }: HeaderProps) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // O sino abre em "não lidas": a caixa cheia de avisos já lidos é justamente
  // o que fazia o badge perder a força.
  const [somenteNaoLidas, setSomenteNaoLidas] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);

  /* Avisos visuais de movimentação — ver `lib/avisosNotificacao.ts`. */
  const [avisos, setAvisos] = useState<ItemAviso[]>([]);
  const [sinoTocando, setSinoTocando] = useState(false);
  const [prefsAviso, setPrefsAviso] = useState<AvisoPrefs>(() => lerPrefsAviso(user.id));
  const [permDesktop, setPermDesktop] = useState<PermissaoDesktop>(() => permissaoDesktop());
  const alertadosRef = useRef<Set<string>>(new Set());
  const montadoEmRef = useRef(Date.now());
  const timerSinoRef = useRef<number | undefined>(undefined);
  // A sincronização vive em intervalos: se ela dependesse de `onNavigate` (nova
  // a cada render do App) ou das preferências, os `setInterval` seriam
  // recriados a cada troca de tela. Os valores mutáveis entram por ref.
  const navegarRef = useRef(onNavigate);
  navegarRef.current = onNavigate;
  const prefsRef = useRef(prefsAviso);
  prefsRef.current = prefsAviso;
  const userRef = useRef(user);
  userRef.current = user;

  /**
   * Ponto único de entrada das notificações: guarda a lista, decide o que é
   * novidade e dispara os avisos. Toda origem (carga inicial, espelho do cache,
   * busca no servidor) passa por aqui — senão cada uma alertaria à sua maneira.
   */
  const sincronizarNotificacoes = useCallback(() => {
    const usuario = userRef.current;
    const prefs = prefsRef.current;
    const lista = localDb.getNotifications(usuario.id);
    setNotifications(lista);

    const novas = filtrarNovas(lista, alertadosRef.current);
    if (novas.length === 0) return;

    // Janela de abertura: o cache local e a primeira busca no servidor chegam
    // em momentos diferentes, e as duas trazem o acumulado de antes de a pessoa
    // abrir o app. Tudo que cair aqui vira um resumo só; depois disso é
    // movimentação ao vivo, e cada uma ganha o seu cartão.
    const naJanelaDeAbertura = Date.now() - montadoEmRef.current < 5000;

    novas.forEach(n => alertadosRef.current.add(n.id));
    gravarIdsAlertados(usuario.id, alertadosRef.current);

    if (naJanelaDeAbertura) {
      const pendentes = lista.filter(n => !n.is_read).length;
      setAvisos([{
        id: 'resumo',
        tipo: 'resumo',
        titulo: pendentes === 1 ? '1 aviso não lido' : `${pendentes} avisos não lidos`,
        descricao: pendentes === 1
          ? novas[novas.length - 1].title
          : 'Chamados com movimentação desde a sua última visita.',
        permanente: false,
        rotuloAcao: 'Ver avisos',
      }]);
      return;
    }

    // Movimentação com o app aberto: um cartão por aviso, o mais novo no topo.
    const cartoes: ItemAviso[] = [...novas].reverse().map(n => ({
      id: n.id,
      tipo: n.type,
      titulo: n.title,
      descricao: n.description || '',
      rodape: n.request_number ? `#${n.request_number}` : undefined,
      // Prazo e alerta ficam: sumir sozinho é justamente o que faz perder status.
      permanente: n.type === 'alert' || n.type === 'critical',
      rotuloAcao: 'Abrir',
    }));
    setAvisos(prev => [...cartoes, ...prev.filter(p => p.id !== 'resumo')]);

    // Três batidas de 1 s: o cabeçalho pisca, o selo aparece e o sino sacode.
    setSinoTocando(true);
    window.clearTimeout(timerSinoRef.current);
    timerSinoRef.current = window.setTimeout(() => setSinoTocando(false), 3200);
    if (prefs.som) tocarBipe();
    // Fora da aba, o cartão não é visto: aí sim vale o aviso do sistema.
    if (prefs.desktop) {
      novas.slice(-3).forEach(n => avisarNoDesktop(n, () => navegarRef.current(resolverRotaNotificacao(n, usuario))));
    }
  }, []);

  useEffect(() => {
    alertadosRef.current = lerIdsAlertados(user.id);
    montadoEmRef.current = Date.now();
    setAvisos([]);
    setPrefsAviso(lerPrefsAviso(user.id));
    setAllProfiles(localDb.getProfiles().filter(p => p.status === 'ativo'));
  }, [user.id]);

  useEffect(() => {
    sincronizarNotificacoes();

    // Atualiza o cache local de notificações (leve) para captar mensagens novas.
    localDb.refreshNotificationsFromSupabase().then(sincronizarNotificacoes);

    // Reflete no cache local a cada 4s (barato).
    const interval = setInterval(sincronizarNotificacoes, 4000);
    // Busca notificações novas do servidor periodicamente (mais espaçado, egress).
    const netInterval = setInterval(() => {
      localDb.refreshNotificationsFromSupabase().then(sincronizarNotificacoes);
    }, 30000);
    return () => { clearInterval(interval); clearInterval(netInterval); };
  }, [sincronizarNotificacoes]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Título da aba: o único aviso que atravessa a aba sem pedir permissão.
  useEffect(() => { atualizarTituloAba(unreadCount); }, [unreadCount]);
  useEffect(() => () => {
    atualizarTituloAba(0);
    window.clearTimeout(timerSinoRef.current);
  }, []);

  const abrirAviso = (item: ItemAviso) => {
    setAvisos(prev => prev.filter(a => a.id !== item.id));
    if (item.id === 'resumo') {
      setShowNotifications(true);
      setShowProfileMenu(false);
      return;
    }
    const notif = notifications.find(n => n.id === item.id);
    if (notif) handleNotificationClick(notif);
  };

  const alternarPref = (chave: keyof AvisoPrefs, valor: boolean) => {
    const novas = { ...prefsAviso, [chave]: valor };
    setPrefsAviso(novas);
    gravarPrefsAviso(user.id, novas);
  };

  const ativarDesktop = async () => {
    const p = await pedirPermissaoDesktop();
    setPermDesktop(p);
    alternarPref('desktop', p === 'granted');
  };

  /** Agrupa por dia: "hoje" e "ontem" respondem sozinhos o quão urgente é o aviso. */
  const notificacoesAgrupadas = useMemo(() => {
    const visiveis = [...notifications]
      .filter(n => !somenteNaoLidas || !n.is_read)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 50);

    const grupos: { rotulo: string; itens: Notification[] }[] = [];
    for (const n of visiveis) {
      const rotulo = rotuloDoDia(n.created_at);
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.rotulo === rotulo) ultimo.itens.push(n);
      else grupos.push({ rotulo, itens: [n] });
    }
    return grupos;
  }, [notifications, somenteNaoLidas]);

  // Aviso de algo que a pessoa já leu (aqui ou em outro dispositivo) sai da tela.
  useEffect(() => {
    const lidas = new Set(notifications.filter(n => n.is_read).map(n => n.id));
    setAvisos(prev => (prev.some(a => lidas.has(a.id)) ? prev.filter(a => !lidas.has(a.id)) : prev));
  }, [notifications]);

  const marcarTodasComoLidas = () => {
    localDb.markAllNotificationsAsRead(user.id);
    setNotifications(localDb.getNotifications(user.id));
  };

  const handleNotificationClick = (notif: Notification) => {
    localDb.markNotificationAsRead(notif.id);
    setNotifications(localDb.getNotifications(user.id));
    setShowNotifications(false);

    const rota = resolverRotaNotificacao(notif, user);
    if (rota) {
      onNavigate(rota);
    }
  };

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    if (query.length === 7 && /^\d+$/.test(query)) {
      // It is a 7-digit request number
      const reqs = localDb.getRequests();
      const match = reqs.find(r => r.number === query);
      if (match) {
        onNavigate(`/solicitacoes?id=${match.id}`);
        setSearchQuery('');
        return;
      }
    }

    // Otherwise redirect to catalog or my requests
    onNavigate(`/materiais/busca?q=${encodeURIComponent(query)}`);
    setSearchQuery('');
  };

  const switchImpersonation = (targetId: string) => {
    const updated = localDb.switchUser(targetId);
    if (updated) {
      onUserChange();
      setShowProfileMenu(false);
    }
  };

  const handleLogout = () => {
    localDb.logout();
    onUserChange();
  };

  const getRoleBadge = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Admin',
      visualizador: 'Visualizador',
      solicitante: 'Solicitante',
      requisitante: 'Requisitante',
      gestor: 'Gestor',
      comprador: 'Comprador',
      coordenador_suprimentos: 'Coord. Suprimentos',
      atendente: 'Atendente'
    };
    return labels[role] || role;
  };

  const sector = localDb.getSectors().find(s => s.id === user.sector_id);

  const rolesList = [
    { value: 'admin', label: 'Administrador (Padrão)' },
    { value: 'requisitante', label: 'Requisitante' },
    { value: 'solicitante', label: 'Solicitante' },
    { value: 'gestor', label: 'Gestor' },
    { value: 'comprador', label: 'Comprador' },
    { value: 'coordenador_suprimentos', label: 'Coordenador Suprimentos' },
    { value: 'atendente', label: 'Atendente' },
    { value: 'visualizador', label: 'Visualizador' },
  ];

  return (
    <>
    <AlertaNotificacoes
      itens={avisos}
      onAbrir={abrirAviso}
      onDispensar={id => setAvisos(prev => prev.filter(a => a.id !== id))}
      onDispensarTodos={() => setAvisos([])}
    />
    <header className={`sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b px-3 sm:px-6 shadow-sm transition-colors gap-2 ${
      sinoTocando
        ? 'border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/30 animate-cabecalho-pisca'
        : 'border-gray-100 dark:border-slate-850 bg-white dark:bg-slate-900'
    }`}>
      {/* Mobile menu trigger */}
      <button
        onClick={onOpenMobileMenu}
        className="lg:hidden shrink-0 rounded-lg p-2 -ml-1 text-slate-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 focus:outline-none transition-colors"
        aria-label="Abrir menu de navegação"
      >
        <Menu className="h-5.5 w-5.5" />
      </button>

      {/* Left side: Role Simulation (Only for Admins) */}
      <div className="flex-1 flex justify-start min-w-0 overflow-hidden">
        {user.roles.includes('admin') && (
          <div className="flex items-center space-x-2 bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-lg px-2 sm:px-3 py-1.5 shadow-sm transition-all max-w-full overflow-hidden">
            <div className="flex items-center text-amber-700 dark:text-amber-400 shrink-0">
              <Eye className="h-4 w-4 sm:mr-1.5 text-amber-600 dark:text-amber-500" />
              <span className="text-xs font-semibold uppercase tracking-wider hidden md:inline">Simular Visão:</span>
            </div>
            <select
              value={simulatedRole || 'admin'}
              onChange={(e) => {
                const val = e.target.value;
                onSimulateRole(val === 'admin' ? null : (val as Role));
              }}
              className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 border-none focus:ring-0 focus:outline-none cursor-pointer py-0 pl-1 pr-5 min-w-0 truncate"
            >
              {rolesList.map((r) => (
                <option
                  key={r.value}
                  value={r.value}
                  className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-normal"
                >
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right side Controls */}
      <div className="flex items-center space-x-2 sm:space-x-4 shrink-0">
        {/* Atalho de Importação de Planilhas — só admin, é onde ele mais precisa chegar rápido. */}
        {user.roles.includes('admin') && (
          <button
            onClick={() => onNavigate('/admin/importacao-materiais')}
            aria-label="Importação de Planilhas"
            title="Importação de Planilhas"
            className="rounded-full p-2 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 focus:outline-none transition-colors"
          >
            <Upload className="h-5.5 w-5.5" />
          </button>
        )}

        {/* Selo de chegada: enquanto o cabeçalho pisca, ele diz em palavras o
            que mudou e leva ao sino em um clique. */}
        {sinoTocando && (
          <button
            onClick={() => { setShowNotifications(true); setShowProfileMenu(false); }}
            className="animate-selo-pisca hidden sm:flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-amber-600 cursor-pointer"
          >
            <BellRing className="h-3.5 w-3.5" />
            Nova notificação
          </button>
        )}

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowProfileMenu(false);
            }}
            aria-label={unreadCount > 0 ? `Notificações (${unreadCount} não lidas)` : 'Notificações'}
            aria-expanded={showNotifications}
            className="relative rounded-full p-2 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 focus:outline-none transition-colors"
          >
            {unreadCount > 0
              ? <BellRing className={`h-6 w-6 text-slate-700 dark:text-slate-200 ${sinoTocando ? 'animate-sino-toca' : ''}`} />
              : <Bell className="h-6 w-6" />}
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 flex h-5 min-w-5 items-center justify-center px-1">
                {/* O halo pisca ENQUANTO houver não lida: parar no primeiro
                    segundo é justamente o que fazia o aviso passar batido. */}
                <span aria-hidden className="absolute inline-flex h-5 w-5 rounded-full bg-red-500 animate-sino-pulsa" />
                <span className="relative inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 mt-3 w-auto sm:w-96 rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl ring-1 ring-black/5 focus:outline-none z-50">
              <div className="border-b border-gray-100 dark:border-slate-800 px-4 py-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-gray-800 dark:text-slate-100 text-base">Notificações</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={marcarTodasComoLidas}
                      className="text-[13px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      Marcar todas como lidas
                    </button>
                  )}
                </div>

                {/* Não lidas primeiro, mas o histórico continua a um clique. */}
                <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-slate-800 p-0.5 text-[13px] font-bold">
                  <button
                    onClick={() => setSomenteNaoLidas(true)}
                    aria-pressed={somenteNaoLidas}
                    className={`flex-1 rounded-md py-1 cursor-pointer transition-colors ${somenteNaoLidas ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                  >
                    Não lidas{unreadCount > 0 ? ` (${unreadCount})` : ''}
                  </button>
                  <button
                    onClick={() => setSomenteNaoLidas(false)}
                    aria-pressed={!somenteNaoLidas}
                    className={`flex-1 rounded-md py-1 cursor-pointer transition-colors ${!somenteNaoLidas ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                  >
                    Todas
                  </button>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {notificacoesAgrupadas.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Check className="mx-auto h-6 w-6 text-emerald-500" />
                    <p className="mt-2 text-sm font-semibold text-gray-600 dark:text-slate-300">
                      {somenteNaoLidas ? 'Tudo em dia' : 'Nenhuma notificação'}
                    </p>
                    {somenteNaoLidas && notifications.length > 0 && (
                      <button
                        onClick={() => setSomenteNaoLidas(false)}
                        className="mt-1 text-[13px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        Ver as já lidas
                      </button>
                    )}
                  </div>
                ) : (
                  notificacoesAgrupadas.map(grupo => (
                    <div key={grupo.rotulo}>
                      <p className="sticky top-0 bg-gray-50 dark:bg-slate-850 px-4 py-1 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                        {grupo.rotulo}
                      </p>
                      {grupo.itens.map(n => {
                        const { Icone, cor } = ESTILO_NOTIFICACAO[n.type] ?? ESTILO_NOTIFICACAO.info;
                        return (
                          <button
                            key={n.id}
                            onClick={() => handleNotificationClick(n)}
                            className={`flex w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors border-b border-gray-50 dark:border-slate-850 ${!n.is_read ? 'bg-emerald-50/40 dark:bg-emerald-950/15' : ''}`}
                          >
                            <Icone className={`mr-3 mt-0.5 h-5 w-5 shrink-0 ${cor}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm ${!n.is_read ? 'font-bold text-gray-900 dark:text-slate-100' : 'text-gray-700 dark:text-slate-350'}`}>
                                {n.title}
                              </p>
                              <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400 line-clamp-2">{n.description}</p>
                              <span className="mt-1 block text-xs text-gray-400">
                                {haQuantoTempo(n.created_at)}
                                {n.request_number ? ` · #${n.request_number}` : ''}
                              </span>
                            </div>
                            {!n.is_read && (
                              <span aria-hidden className="ml-2 mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Como o aviso chega. Fica no rodapé do sino porque é aqui que a
                  pessoa vem quando percebe que perdeu alguma movimentação. */}
              <div className="flex items-center gap-1.5 border-t border-gray-100 dark:border-slate-800 px-3 py-2">
                {permDesktop !== 'indisponivel' && (
                  <button
                    onClick={() => { if (permDesktop === 'granted') alternarPref('desktop', !prefsAviso.desktop); else void ativarDesktop(); }}
                    disabled={permDesktop === 'denied'}
                    title={permDesktop === 'denied' ? 'Avisos bloqueados nas permissões do navegador' : 'Avisar na área de trabalho quando o SISTEN estiver em outra aba'}
                    className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                      prefsAviso.desktop && permDesktop === 'granted'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                        : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    Avisar fora da aba
                  </button>
                )}
                <button
                  onClick={() => { alternarPref('som', !prefsAviso.som); if (!prefsAviso.som) tocarBipe(); }}
                  title={prefsAviso.som ? 'Desligar o som dos avisos' : 'Tocar um bipe curto a cada aviso novo'}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold transition-colors cursor-pointer ${
                    prefsAviso.som
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {prefsAviso.som ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                  Som
                </button>
              </div>

              <button
                onClick={() => { setShowNotifications(false); onNavigate('/solicitacoes?escopo=acao'); }}
                className="w-full border-t border-gray-100 dark:border-slate-800 px-4 py-2.5 text-[13px] font-bold text-emerald-700 dark:text-emerald-400 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Ver o que precisa de mim
              </button>
            </div>
          )}
        </div>

        {/* User profile menu */}
        <div className="relative">
          <button
            onClick={() => {
              setShowProfileMenu(!showProfileMenu);
              setShowNotifications(false);
            }}
            aria-label="Menu do perfil"
            aria-expanded={showProfileMenu}
            className="flex items-center space-x-3 rounded-lg p-1.5 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors focus:outline-none"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white font-bold">
              {user.name.charAt(0)}
            </div>
            <div className="hidden text-left lg:block">
              <p className="text-sm font-semibold text-gray-700 dark:text-slate-200">{user.name}</p>
              <p className="text-[11px] text-gray-400 dark:text-slate-400 truncate max-w-[150px]">
                {sector?.name || 'Sem Setor'} • {simulatedRole ? `${getRoleBadge(simulatedRole)} (Simulado)` : getRoleBadge(user.roles[0])}
              </p>
            </div>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-3 w-56 rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 py-1 shadow-xl ring-1 ring-black/5 focus:outline-none z-50">
              <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-850 text-left">
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{user.name}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{user.email}</p>
                <p className="mt-1 text-[10px] bg-emerald-50 text-emerald-800 font-bold px-1.5 py-0.5 rounded inline-block">
                  {user.cargo}
                </p>
              </div>

              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  onNavigate('/perfil');
                }}
                className="flex w-full items-center px-4 py-2 text-sm text-gray-700 dark:text-slate-350 hover:bg-gray-50 dark:hover:bg-slate-800 text-left"
              >
                <User className="mr-3 h-4 w-4 text-gray-400" />
                Meu Perfil
              </button>

              <button
                onClick={handleLogout}
                className="flex w-full items-center px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-rose-950/20 text-left border-t border-gray-50 dark:border-slate-850"
              >
                <LogOut className="mr-3 h-4 w-4 text-red-500" />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
    </>
  );
}

/* Notificações — apoio ------------------------------------------------------ */

/** "Hoje", "Ontem" ou a data. Datar cada aviso é o que separa o urgente do velho. */
function rotuloDoDia(iso: string): string {
  const dia = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);

  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmoDia(dia, hoje)) return 'Hoje';
  if (mesmoDia(dia, ontem)) return 'Ontem';
  return dia.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

/**
 * Cada tipo de notificação com o seu ícone e a sua cor.
 *
 * O sino antigo desenhava um "check" verde para tudo que não fosse crítico —
 * um prazo estourado e uma solicitação aprovada chegavam com o mesmo rosto, e
 * a pessoa tinha de ler o texto inteiro para saber se importava.
 */
const ESTILO_NOTIFICACAO: Record<Notification['type'], { Icone: LucideIcon; cor: string }> = {
  info: { Icone: Info, cor: 'text-blue-500' },
  success: { Icone: CheckCircle2, cor: 'text-emerald-500' },
  alert: { Icone: AlertTriangle, cor: 'text-amber-500' },
  critical: { Icone: AlertCircle, cor: 'text-red-500' },
};

/** Distância no tempo em texto curto: "agora", "há 3 h", "há 2 d". */
function haQuantoTempo(iso: string): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  return `há ${Math.round(horas / 24)} d`;
}
