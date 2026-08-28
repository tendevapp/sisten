/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Menu, X, Sun, Moon, ArrowUpRight, ChevronDown } from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile } from '../types';
import { PAGES, canAccessPage } from '../lib/pages';
import SistenLogo from './SistenLogo';

const COLLAPSED_GROUPS_KEY = 'sisten:sidebar-collapsed-groups';

/**
 * Grupos que são, na verdade, um módulo com tela inicial própria: o cabeçalho
 * do grupo deixa de ser só um rótulo e vira um botão que navega para o hub do
 * módulo (`path`), mantendo ao lado a seta para expandir/recolher as subpáginas.
 * `base` é o prefixo de rota do módulo — usado só para acender o cabeçalho
 * enquanto o usuário navega por qualquer subpágina.
 */
const GROUP_HOME: Record<string, { path: string; base: string }> = {
  'SOLICITAÇÕES': { path: '/solicitacoes', base: '/solicitacoes' },
  'SUPRIMENTOS': { path: '/suprimentos', base: '/suprimentos' },
  'ALMOXARIFADO': { path: '/almoxarifado', base: '/almoxarifado' },
  'FACILITIES': { path: '/facilities', base: '/facilities' },
  'FINANCEIRO': { path: '/financeiro', base: '/financeiro' },
  'HELPDESK': { path: '/helpdesk/inicio', base: '/helpdesk' },
  'ADMINISTRAÇÃO': { path: '/admin', base: '/admin' },
};

function loadCollapsedGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

interface SidebarProps {
  user: Profile;
  currentPath: string;
  onNavigate: (path: string) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({ user, currentPath, onNavigate, theme, toggleTheme, mobileOpen, onCloseMobile }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(loadCollapsedGroups);

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = { ...prev, [group]: !prev[group] };
      localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const getSectorsWithHelpdesk = () => {
    return localDb.getSectors().filter(s => s.helpdesk_enabled);
  };

  const groupOrder = ['GERAL', 'SOLICITAÇÕES', 'SUPRIMENTOS', 'ALMOXARIFADO', 'FACILITIES', 'FINANCEIRO', 'HELPDESK', 'ADMINISTRAÇÃO'];
  const navItems = groupOrder.map(group => ({
    group,
    items: PAGES.filter(p => p.group === group),
  }));

  const handleNavClick = (path: string) => {
    onNavigate(path);
    onCloseMobile();
  };

  /**
   * Rota do menu que corresponde à página atual.
   *
   * Marcar como ativo todo item cujo caminho é prefixo do atual acendia dois
   * itens ao mesmo tempo quando um deles é sub-rota do outro — "Importar SAP"
   * junto com "Log Importação SAP", e agora "Histórico" junto com "Análise de
   * Compras". Aqui vence o prefixo mais longo, que é sempre o item mais
   * específico, e o casamento exige limite de segmento (`/`) para que
   * `/suprimentos/historico` não case com `/suprimentos/historicoX`.
   */
  const activePath = navItems
    .flatMap(g => g.items.map(i => i.path))
    .filter(p => currentPath === p || (p !== '/' && currentPath.startsWith(`${p}/`)))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs lg:hidden animate-fade-in"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-gray-800 bg-slate-900 text-slate-300 transition-transform duration-300 ease-out w-72 shadow-2xl
          lg:static lg:z-auto lg:shadow-none lg:transition-[width] lg:duration-300
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
          ${collapsed ? 'lg:w-20' : 'lg:w-64'}`}
      >
        {/* Brand logo container */}
        <div className="flex h-16 items-center justify-between px-3 border-b border-gray-800 bg-slate-950 shrink-0">
          {/* Full logo: always on mobile drawer, only when expanded on desktop */}
          <div className={`items-center overflow-hidden flex-1 mr-2 select-none flex ${collapsed ? 'lg:hidden' : ''}`}>
            <SistenLogo className="max-w-[155px] object-contain" />
          </div>
          {/* Icon-only logo: desktop collapsed state only */}
          {collapsed && (
            <div className="hidden lg:flex w-full justify-center mr-1 select-none">
              <SistenLogo iconOnly />
            </div>
          )}
          {/* Mobile: close drawer. Desktop: collapse/expand rail. */}
          <button
            onClick={onCloseMobile}
            className="rounded p-1 hover:bg-slate-800 text-slate-400 hover:text-white shrink-0 lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:block rounded p-1 hover:bg-slate-800 text-slate-400 hover:text-white shrink-0"
            aria-label="Recolher menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto py-4">
        {navItems.map((group, groupIdx) => {
          // Filter items based on user permission
          const visibleItems = group.items.filter(item => canAccessPage(user, item.id));

          if (visibleItems.length === 0) return null;

          // Módulo com hub próprio (ex.: Facilities, Suprimentos): o cabeçalho do
          // grupo navega para a tela inicial e o item do hub sai da lista quando
          // expandido, para não aparecer duplicado logo abaixo do nome do módulo.
          const home = GROUP_HOME[group.group];
          const homePath = home?.path;
          const homeItem = homePath ? visibleItems.find(i => i.path === homePath) : undefined;
          const listItems = homePath && !collapsed
            ? visibleItems.filter(i => i.path !== homePath)
            : visibleItems;

          // Só mostra o cabeçalho do módulo quando há alguma subpágina real
          // liberada para o usuário — o hub sozinho não abre um módulo vazio.
          if (home && visibleItems.every(i => i.path === homePath)) return null;

          const homeActive = !!home && (
            currentPath === home.path
            || currentPath === home.base
            || currentPath.startsWith(`${home.base}/`)
          );
          const HomeIcon = homeItem?.icon;

          // Grupo que contém a rota ativa nunca deve renderizar recolhido,
          // senão o usuário perde de vista onde está ao navegar.
          const hasActiveItem = visibleItems.some(item => item.path === activePath);
          const isGroupCollapsed = !collapsed && !hasActiveItem && !!collapsedGroups[group.group];

          return (
            <div key={groupIdx} className="mb-2">
              {!collapsed && homePath && (
                <div
                  className={`mx-3 flex items-center rounded-lg pr-1 transition-colors ${
                    homeActive ? 'bg-slate-800' : 'hover:bg-slate-800/50'
                  }`}
                >
                  <a
                    href={`#${homePath}`}
                    onClick={(e) => {
                      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
                      e.preventDefault();
                      handleNavClick(homePath!);
                    }}
                    className={`flex flex-1 items-center gap-2.5 px-3 py-2 text-sm font-bold tracking-wide transition-colors ${
                      homeActive ? 'text-emerald-400' : 'text-slate-200 hover:text-white'
                    }`}
                    title={`Abrir ${group.group}`}
                  >
                    {HomeIcon && <HomeIcon className="h-4 w-4 shrink-0" />}
                    <span className="truncate">{group.group}</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.group)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-white transition-colors"
                    aria-label={isGroupCollapsed ? `Expandir subpáginas de ${group.group}` : `Recolher subpáginas de ${group.group}`}
                    aria-expanded={!isGroupCollapsed}
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform duration-200 ${isGroupCollapsed ? '-rotate-90' : ''}`}
                    />
                  </button>
                </div>
              )}
              {!collapsed && !homePath && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.group)}
                  className="flex w-full items-center justify-between px-6 py-1.5 text-left group/heading"
                  aria-expanded={!isGroupCollapsed}
                >
                  <h3 className="text-[10px] font-bold text-slate-500 tracking-widest group-hover/heading:text-slate-300 transition-colors">
                    {group.group}
                  </h3>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-slate-600 group-hover/heading:text-slate-400 transition-transform duration-200 ${
                      isGroupCollapsed ? '-rotate-90' : ''
                    }`}
                  />
                </button>
              )}
              <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: isGroupCollapsed ? '0fr' : '1fr' }}
              >
                <ul className="space-y-1 overflow-hidden mt-1">
                {listItems.map((item, itemIdx) => {
                  const Icon = item.icon;
                  // If path is helpdesk or specific sub-path, check exact or partial matches
                  const isActive = item.path === activePath;
                  
                  return (
                    <li key={itemIdx} className="group/item relative">
                      <a
                        href={`#${item.path}`}
                        onClick={(e) => {
                          // Se o usuário clicar com Ctrl, Command ou Shift, deixa o comportamento padrão do navegador (abrir em nova aba/janela)
                          if (e.ctrlKey || e.metaKey || e.shiftKey) {
                            return;
                          }
                          e.preventDefault();
                          handleNavClick(item.path);
                        }}
                        className={`flex w-full items-center px-6 py-2 text-sm font-medium transition-all duration-150 ${
                          isActive 
                            ? 'border-l-4 border-emerald-500 bg-slate-800 text-emerald-400' 
                            : 'border-l-4 border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-white'
                        }`}
                        title={item.label}
                      >
                        <Icon className={`h-5 w-5 shrink-0 ${collapsed ? 'mr-0' : 'mr-3'}`} />
                        {!collapsed && (
                          <div className="flex flex-1 items-center justify-between min-w-0">
                            <span className="truncate text-left">{item.label}</span>
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                window.open(`#${item.path}`, '_blank');
                              }}
                              className="opacity-100 lg:opacity-0 lg:group-hover/item:opacity-100 p-2 -m-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition-opacity ml-1 cursor-pointer shrink-0"
                              title="Abrir em nova aba"
                            >
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        )}
                      </a>
                    </li>
                  );
                })}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* Profile Footer */}
      {!collapsed && (
        <div className="border-t border-gray-800 bg-slate-950 p-4 flex items-center justify-between text-left">
          <div className="min-w-0 flex-1 mr-2">
            <p className="text-xs font-semibold text-white truncate">{user.name}</p>
            <p className="text-[10px] text-slate-400 truncate mt-0.5">{user.email}</p>
          </div>
          {/* Dark Mode Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white focus:outline-none transition-colors shrink-0"
            title={theme === 'dark' ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}
          >
            {theme === 'dark' ? (
              <Sun className="h-4.5 w-4.5 text-amber-400" />
            ) : (
              <Moon className="h-4.5 w-4.5 text-slate-400" />
            )}
          </button>
        </div>
      )}
      </aside>
    </>
  );
}
