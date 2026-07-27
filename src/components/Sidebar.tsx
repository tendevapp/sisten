/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Menu, X, Sun, Moon, ArrowUpRight } from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile } from '../types';
import { PAGES, canAccessPage } from '../lib/pages';
import SistenLogo from './SistenLogo';

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

  const getSectorsWithHelpdesk = () => {
    return localDb.getSectors().filter(s => s.helpdesk_enabled);
  };

  const groupOrder = ['GERAL', 'SOLICITAÇÕES', 'SUPRIMENTOS', 'ALMOXARIFADO', 'HELPDESK', 'ADMINISTRAÇÃO'];
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

          return (
            <div key={groupIdx} className="mb-6">
              {!collapsed && (
                <h3 className="px-6 mb-2 text-[10px] font-bold text-slate-500 tracking-widest text-left">
                  {group.group}
                </h3>
              )}
              <ul className="space-y-1">
                {visibleItems.map((item, itemIdx) => {
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
