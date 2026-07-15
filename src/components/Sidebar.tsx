/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Home, Search, BarChart3, PlusCircle, List, FileCheck, 
  Database, LayoutDashboard, Upload, Users, Shield, 
  Map, Settings, HelpCircle, ChevronRight, Menu, KeyRound, Radio, Sun, Moon, Truck, PackageSearch, Building2, ArrowUpRight, History
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile } from '../types';
import SistenLogo from './SistenLogo';

interface SidebarProps {
  user: Profile;
  currentPath: string;
  onNavigate: (path: string) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export default function Sidebar({ user, currentPath, onNavigate, theme, toggleTheme }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const getSectorsWithHelpdesk = () => {
    return localDb.getSectors().filter(s => s.helpdesk_enabled);
  };

  const navItems = [
    {
      group: 'GERAL',
      items: [
        { label: 'Início', path: '/', icon: Home, perm: { module: 'solicitacoes', action: 'visualizar_proprias' } },
        { label: 'Catálogo SAP', path: '/materiais/busca', icon: Search, perm: { module: 'materiais', action: 'visualizar' } },
        { label: 'Relatórios', path: '/relatorios', icon: BarChart3, perm: { module: 'materiais', action: 'visualizar' } },
      ],
    },
    {
      group: 'SOLICITAÇÕES',
      items: [
        { label: 'Nova Solicitação', path: '/solicitacoes/nova', icon: PlusCircle, perm: { module: 'solicitacoes', action: 'criar' } },
        { label: 'Minhas Solicitações', path: '/solicitacoes/minhas', icon: List, perm: { module: 'solicitacoes', action: 'visualizar_proprias' } },
        { label: 'Aprovações', path: '/solicitacoes/aprovacoes', icon: FileCheck, perm: { module: 'compras', action: 'visualizar_setor' } },
      ],
    },
    {
      group: 'SUPRIMENTOS',
      items: [
        { label: 'Cadastros SAP', path: '/suprimentos/cadastros-sap', icon: KeyRound, perm: { module: 'cadastro_sap', action: 'atender' } },
        { label: 'Painel SAP', path: '/suprimentos/painel', icon: Database, perm: { module: 'sap', action: 'visualizar_painel' } },
        { label: 'Fornecedores', path: '/suprimentos/fornecedores', icon: Building2, perm: { module: 'sap', action: 'fornecedores' } },
        { label: 'Itens Sem PO', path: '/suprimentos/fornecedores-sem-po', icon: PackageSearch, perm: { module: 'sap', action: 'fornecedores' } },
        { label: 'Histórico', path: '/suprimentos/historico', icon: History, perm: { module: 'sap', action: 'fornecedores' } },
        { label: 'Dashboards', path: '/suprimentos/dashboards', icon: LayoutDashboard, perm: { module: 'sap', action: 'dashboards' } },
        { label: 'Importar SAP', path: '/suprimentos/importar', icon: Upload, perm: { module: 'sap', action: 'importar' } },
      ],
    },
    {
      group: 'HELPDESK',
      items: [
        { label: 'Atendimento', path: '/helpdesk', icon: Radio, perm: { module: 'chamados', action: 'atender_setor' } },
        { label: 'Relatórios Helpdesk', path: '/helpdesk/relatorios', icon: BarChart3, perm: { module: 'chamados', action: 'atender_setor' } },
      ],
    },
    {
      group: 'ADMINISTRAÇÃO',
      items: [
        { label: 'Usuários', path: '/admin/usuarios', icon: Users, perm: { module: 'admin', action: 'usuarios' } },
        { label: 'Setores', path: '/admin/setores', icon: Map, perm: { module: 'admin', action: 'setores' } },
        { label: 'Permissões', path: '/admin/permissoes', icon: Shield, perm: { module: 'admin', action: 'auditoria' } },
        { label: 'Import. Materiais', path: '/admin/importacao-materiais', icon: Upload, perm: { module: 'admin', action: 'importacao_materiais' } },
        { label: 'Log Importação SAP', path: '/suprimentos/importar/log', icon: List, perm: { module: 'sap', action: 'importar' } },
        { label: 'Grupos Comprador', path: '/suprimentos/grupos-comprador', icon: Settings, perm: { module: 'sap', action: 'gerenciar_grupos' } },
        { label: 'Config. Helpdesk', path: '/admin/helpdesk', icon: Settings, perm: { module: 'admin', action: 'usuarios' } },
      ],
    },
  ];

  const handleNavClick = (path: string) => {
    onNavigate(path);
  };

  return (
    <aside 
      className={`relative flex flex-col border-r border-gray-800 bg-slate-900 text-slate-300 transition-all duration-300 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand logo container */}
      <div className="flex h-16 items-center justify-between px-3 border-b border-gray-800 bg-slate-950">
        {!collapsed ? (
          <div className="flex items-center overflow-hidden flex-1 mr-2 select-none">
            <SistenLogo className="max-w-[155px] object-contain" />
          </div>
        ) : (
          <div className="flex w-full justify-center mr-1 select-none">
            <SistenLogo iconOnly />
          </div>
        )}
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="rounded p-1 hover:bg-slate-800 text-slate-400 hover:text-white shrink-0"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto py-4">
        {navItems.map((group, groupIdx) => {
          // Filter items based on user permission
          const visibleItems = group.items.filter(item => 
            localDb.hasPermission(user, item.perm.module, item.perm.action)
          );

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
                  const isActive = currentPath === item.path || (item.path !== '/' && currentPath.startsWith(item.path));
                  
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
                              className="opacity-0 group-hover/item:opacity-100 p-0.5 rounded hover:bg-slate-700 text-slate-500 hover:text-white transition-opacity ml-1 cursor-pointer shrink-0"
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
  );
}
