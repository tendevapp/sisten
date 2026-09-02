/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Radio, BarChart3, Inbox } from 'lucide-react';
import { Profile } from '../types';
import HelpdeskAtendimento from './helpdesk/HelpdeskAtendimento';
import HelpdeskRelatorios from './helpdesk/HelpdeskRelatorios';

interface HelpdeskProps {
  user: Profile;
  onNavigate: (path: string) => void;
  initialView?: 'atendimento' | 'dashboard';
}

export default function Helpdesk({ user, onNavigate, initialView }: HelpdeskProps) {
  const [viewMode, setViewMode] = useState<'atendimento' | 'dashboard'>(initialView || 'atendimento');

  useEffect(() => {
    if (initialView) {
      setViewMode(initialView);
    }
  }, [initialView]);

  const handleTabChange = (mode: 'atendimento' | 'dashboard') => {
    setViewMode(mode);
    if (onNavigate) {
      onNavigate(mode === 'atendimento' ? '/helpdesk' : '/helpdesk/relatorios');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50/20">
      
      {/* Top Header com Seletor de Módulo (Fila de Atendimento vs Relatórios) */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-6 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0 shadow-sm z-10">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 shrink-0">
            <Radio className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-sm text-slate-800 leading-tight truncate">Helpdesk & Atendimento</h1>
            <p className="hidden sm:block text-[10px] text-slate-400">Central unificada de chamados e gestão operacional</p>
          </div>
        </div>

        <div className="flex w-full sm:w-auto space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold shrink-0">
          <button
            onClick={() => handleTabChange('atendimento')}
            className={`flex flex-1 sm:flex-none items-center justify-center space-x-1.5 px-3 sm:px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === 'atendimento'
                ? 'bg-white text-emerald-800 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Inbox className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Fila de Atendimento</span>
            <span className="sm:hidden">Fila</span>
          </button>
          <button
            onClick={() => handleTabChange('dashboard')}
            className={`flex flex-1 sm:flex-none items-center justify-center space-x-1.5 px-3 sm:px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === 'dashboard'
                ? 'bg-white text-emerald-800 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Relatórios & Dashboards</span>
            <span className="sm:hidden">Relatórios</span>
          </button>
        </div>
      </div>

      {/* Conteúdo Ativo */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {viewMode === 'atendimento' ? (
          <HelpdeskAtendimento user={user} onNavigate={onNavigate} />
        ) : (
          <HelpdeskRelatorios user={user} onNavigate={onNavigate} />
        )}
      </div>

    </div>
  );
}
