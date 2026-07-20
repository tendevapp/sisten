/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Bell, Search, User, LogOut, ChevronDown, Check, AlertCircle, Sun, Moon, Eye, Menu } from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, Notification, Role } from '../types';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    setNotifications(localDb.getNotifications(user.id));
    setAllProfiles(localDb.getProfiles().filter(p => p.status === 'ativo'));

    // Atualiza o cache local de notificações (leve) para captar mensagens novas.
    localDb.refreshNotificationsFromSupabase().then(() => setNotifications(localDb.getNotifications(user.id)));

    // Reflete no cache local a cada 4s (barato).
    const interval = setInterval(() => {
      setNotifications(localDb.getNotifications(user.id));
    }, 4000);
    // Busca notificações novas do servidor periodicamente (mais espaçado, egress).
    const netInterval = setInterval(() => {
      localDb.refreshNotificationsFromSupabase().then(() => setNotifications(localDb.getNotifications(user.id)));
    }, 30000);
    return () => { clearInterval(interval); clearInterval(netInterval); };
  }, [user]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleNotificationClick = (notif: Notification) => {
    localDb.markNotificationAsRead(notif.id);
    setNotifications(localDb.getNotifications(user.id));
    setShowNotifications(false);
    // Notificações de mensagens do Rastreio Compras: abrem a conversa do item.
    // Usa context_key (sem FK) em vez de request_id (tem FK para requests).
    if (notif.context_key?.startsWith('rastreio:')) {
      const ri = notif.context_key.slice('rastreio:'.length);
      onNavigate(`/rastreio?ri=${encodeURIComponent(ri)}`);
    } else if (notif.request_id) {
      if (notif.title.toLowerCase().includes('compra') && user.roles.includes('gestor')) {
        onNavigate('/solicitacoes/aprovacoes');
      } else {
        onNavigate(`/solicitacoes/minhas?id=${notif.request_id}`);
      }
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
        if (match.type === 'compra' && user.roles.includes('gestor') && match.status === 'pendente') {
          onNavigate('/solicitacoes/aprovacoes');
        } else {
          onNavigate(`/solicitacoes/minhas?id=${match.id}`);
        }
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
    { value: 'gestor', label: 'Gestor' },
    { value: 'comprador', label: 'Comprador' },
    { value: 'coordenador_suprimentos', label: 'Coordenador Suprimentos' },
    { value: 'atendente', label: 'Atendente' },
    { value: 'solicitante', label: 'Solicitante' },
    { value: 'visualizador', label: 'Visualizador' },
  ];

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-gray-100 dark:border-slate-850 bg-white dark:bg-slate-900 px-3 sm:px-6 shadow-sm transition-colors gap-2">
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
            <Bell className="h-6 w-6" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white ring-2 ring-white">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 mt-3 w-auto sm:w-80 rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl ring-1 ring-black/5 focus:outline-none z-50">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 px-4 py-3">
                <h3 className="font-semibold text-gray-800 dark:text-slate-100 text-sm">Notificações</h3>
                <span className="rounded-full bg-gray-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-gray-500 dark:text-slate-400">
                  {unreadCount} não lidas
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-6 text-center text-xs text-gray-400">Nenhuma notificação no momento</div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`flex w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors border-b border-gray-50 dark:border-slate-850 ${!n.is_read ? 'bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50/80' : ''}`}
                    >
                      <div className="mr-3 mt-0.5">
                        {n.type === 'critical' ? (
                          <AlertCircle className="h-5 w-5 text-red-500" />
                        ) : (
                          <Check className="h-5 w-5 text-emerald-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs ${!n.is_read ? 'font-semibold text-gray-900 dark:text-slate-100' : 'text-gray-700 dark:text-slate-350'}`}>
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400 truncate">{n.description}</p>
                        <span className="mt-1 block text-[10px] text-gray-400">
                          {new Date(n.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
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
  );
}
