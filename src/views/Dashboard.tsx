/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  FileEdit, ShoppingCart, Database, List, Users, CheckSquare, 
  Layers, ChevronRight, ArrowUpRight, AlertTriangle, Plus, Search, Radio, ShieldAlert
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile } from '../types';

interface DashboardProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function Dashboard({ user, onNavigate }: DashboardProps) {
  const requests = localDb.getRequests();
  const materialsCount = localDb.getMaterials().length;
  const profiles = localDb.getProfiles();
  const sapEnriched = localDb.getEnrichedSAPRequisicoes();

  const sector = localDb.getSectors().find(s => s.id === user.sector_id);

  // Counts for user
  const myRequests = requests.filter(r => r.solicitante_id === user.id);
  const myRecent = [...myRequests]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  // Pending Approvals count for current manager's sector
  const pendingApprovals = requests.filter(r => 
    r.type === 'compra' && 
    r.status === 'pendente' && 
    r.solicitante_sector_id === user.sector_id
  );

  const highCriticalityPendingApprovals = pendingApprovals.filter(r => r.criticality >= 4);

  // Compras aprovadas atribuídas (assigned to buyer or supervisor)
  const approvedAssignedCount = requests.filter(r => 
    r.type === 'compra' && 
    r.status === 'aprovada' && 
    (r.comprador_id === user.id || user.roles.includes('coordenador_suprimentos') || user.roles.includes('admin'))
  ).length;

  // Open SAP items
  const openSapCount = sapEnriched.filter(s => s.status_requisicao === 'Sem PO').length;

  // Admin stats
  const pendingUsersCount = profiles.filter(p => p.status === 'pendente').length;
  const activeUsersCount = profiles.filter(p => p.status === 'ativo').length;
  const totalRequestsCount = requests.length;

  const getCriticalityBadge = (level: number) => {
    const colors: Record<number, string> = {
      1: 'bg-gray-100 text-gray-800 border-gray-200',
      2: 'bg-emerald-50 text-emerald-800 border-emerald-100',
      3: 'bg-amber-50 text-amber-800 border-amber-100',
      4: 'bg-orange-50 text-orange-800 border-orange-100',
      5: 'bg-red-50 text-red-800 border-red-100'
    };
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${colors[level] || 'bg-gray-100'}`}>
        CRIT. {level}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const labels: Record<string, string> = {
      rascunho: 'Rascunho',
      pendente: 'Pendente',
      aprovada: 'Aprovada',
      rejeitada: 'Rejeitada',
      em_revisao: 'Em Revisão',
      aberto: 'Aberto',
      em_atendimento: 'Em Atendimento',
      aguardando_solicitante: 'Aguardando Solicitante',
      resolvido: 'Resolvido',
      fechado: 'Fechado',
      reaberto: 'Reaberto',
      cancelada: 'Cancelado'
    };
    const colors: Record<string, string> = {
      rascunho: 'bg-gray-100 text-gray-500 border-gray-200',
      pendente: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      aprovada: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      rejeitada: 'bg-red-100 text-red-800 border-red-200',
      em_revisao: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      aberto: 'bg-blue-100 text-blue-800 border-blue-200',
      em_atendimento: 'bg-sky-100 text-sky-800 border-sky-200',
      aguardando_solicitante: 'bg-purple-100 text-purple-800 border-purple-200',
      resolvido: 'bg-teal-100 text-teal-800 border-teal-200',
      fechado: 'bg-slate-100 text-slate-800 border-slate-200',
      reaberto: 'bg-orange-100 text-orange-800 border-orange-200',
      cancelada: 'bg-rose-100 text-rose-800 border-rose-200'
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-6 text-left">
      {/* Salutation Bar */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Bom dia, {user.name}!</h2>
        <p className="mt-1 text-sm text-slate-500">
          Setor: <span className="font-semibold text-slate-800">{sector?.name || 'Sem Setor'}</span> • <span className="text-slate-600 font-medium">{user.cargo}</span>
        </p>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1 - Aguardando Aprovação (Only managers and admins can see sector counts, others see general reference) */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Aguardando Aprovação</span>
            <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
              <FileEdit className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline">
            <span className="text-3xl font-extrabold text-slate-900">{pendingApprovals.length}</span>
            <span className="ml-2 text-xs font-medium text-slate-400">no seu setor</span>
          </div>
          <p className="mt-2 text-[10px] font-bold text-amber-600">{highCriticalityPendingApprovals.length} com criticidade alta</p>
        </div>

        {/* KPI 2 - Compras Aprovadas */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Compras Aprovadas (Atribuídas)</span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <ShoppingCart className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline">
            <span className="text-3xl font-extrabold text-slate-900">{approvedAssignedCount}</span>
            <span className="ml-2 text-xs font-medium text-slate-400">atribuições</span>
          </div>
          <p className="mt-2 text-[10px] text-slate-400">Para seu grupo de compras</p>
        </div>

        {/* KPI 3 - Painel SAP Em Aberto */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Painel SAP — Em Aberto</span>
            <div className="rounded-lg bg-sky-50 p-2 text-sky-600">
              <Database className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline">
            <span className="text-3xl font-extrabold text-slate-900">{openSapCount}</span>
            <span className="ml-2 text-xs font-medium text-slate-400">sem PO</span>
          </div>
          <p className="mt-2 text-[10px] text-slate-400">Pendente de atribuição de pedido</p>
        </div>

        {/* KPI 4 - Minhas Solicitações */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Minhas Solicitações</span>
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              <List className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline">
            <span className="text-3xl font-extrabold text-slate-900">{myRequests.length}</span>
            <span className="ml-2 text-xs font-medium text-slate-400">atendimentos</span>
          </div>
          <p className="mt-2 text-[10px] text-slate-400">Criadas e acompanhadas</p>
        </div>
      </div>

      {/* Admin specific extra KPIs */}
      {user.roles.includes('admin') && (
        <div className="grid gap-5 grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-dashed border-gray-200 bg-slate-50/50 p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Usuários Pendentes</span>
              <p className="text-2xl font-extrabold text-slate-800 mt-1">{pendingUsersCount}</p>
            </div>
            <Users className="h-6 w-6 text-yellow-500" />
          </div>
          <div className="rounded-xl border border-dashed border-gray-200 bg-slate-50/50 p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Usuários Ativos</span>
              <p className="text-2xl font-extrabold text-slate-800 mt-1">{activeUsersCount}</p>
            </div>
            <CheckSquare className="h-6 w-6 text-emerald-500" />
          </div>
          <div className="rounded-xl border border-dashed border-gray-200 bg-slate-50/50 p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Materiais Cadastrados</span>
              <p className="text-2xl font-extrabold text-slate-800 mt-1">{materialsCount}</p>
            </div>
            <Layers className="h-6 w-6 text-indigo-500" />
          </div>
          <div className="rounded-xl border border-dashed border-gray-200 bg-slate-50/50 p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Solicitações (Total)</span>
              <p className="text-2xl font-extrabold text-slate-800 mt-1">{totalRequestsCount}</p>
            </div>
            <ArrowUpRight className="h-6 w-6 text-sky-500" />
          </div>
        </div>
      )}

      {/* High Criticality Pending Approvals Alert Banner */}
      {user.roles.includes('gestor') && pendingApprovals.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-amber-100 bg-amber-50 p-4">
          <div className="flex items-start">
            <div className="rounded-lg bg-amber-100 p-1.5 text-amber-800 mr-3 mt-0.5 sm:mt-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">
                {pendingApprovals.length} solicitação(ões) aguardando sua aprovação
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Existem {highCriticalityPendingApprovals.length} compras com criticidade alta (Grau 4 ou 5) que demandam análise prioritária.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('/solicitacoes/aprovacoes')}
            className="rounded-lg bg-amber-800 px-4 py-2 text-xs font-bold text-white hover:bg-amber-900 transition-colors shrink-0 cursor-pointer"
          >
            Ir para aprovações
          </button>
        </div>
      )}

      {/* Main split row layout */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Left 2/3 Content: Recent My Requests */}
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800">Minhas solicitações recentes</h3>
            <button
              onClick={() => onNavigate('/solicitacoes/minhas')}
              className="text-xs font-bold text-emerald-600 hover:underline inline-flex items-center cursor-pointer"
            >
              Ver todas <ChevronRight className="ml-0.5 h-3 w-3" />
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {myRecent.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                Nenhuma solicitação aberta recentemente. Crie uma para começar!
              </div>
            ) : (
              myRecent.map((r) => (
                <div 
                  key={r.id} 
                  onClick={() => onNavigate(`/solicitacoes/minhas?id=${r.id}`)}
                  className="group flex items-center justify-between py-3.5 hover:bg-slate-50/50 px-2 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center space-x-3.5 min-w-0">
                    <span className="text-sm font-bold text-slate-500 group-hover:text-emerald-600 transition-colors">
                      #{r.number}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate max-w-sm">
                        {r.justificativa || (r.type === 'compra' ? 'Solicitação de Compra' : (r.type === 'cadastro_sap' ? 'Cadastro SAP' : 'Suporte Helpdesk'))}
                      </p>
                      <span className="text-[11px] text-slate-400 mt-0.5">
                        {r.type === 'compra' ? 'Compra' : (r.type === 'cadastro_sap' ? 'Cadastro SAP' : 'Helpdesk')} • {new Date(r.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {getCriticalityBadge(r.criticality)}
                    {getStatusBadge(r.status)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right 1/3 Side Actions panel */}
        <div className="space-y-5">
          {/* Action Hub */}
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider text-left">Ações rápidas</h3>
            <div className="space-y-2">
              <button
                onClick={() => onNavigate('/solicitacoes/nova')}
                className="flex w-full items-center justify-between rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs py-2.5 px-4 transition-colors text-left cursor-pointer"
              >
                <span className="flex items-center"><Plus className="mr-2 h-4.5 w-4.5" /> Nova solicitação</span>
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => onNavigate('/materiais/busca')}
                className="flex w-full items-center justify-between rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs py-2.5 px-4 transition-colors text-left border border-slate-200 cursor-pointer"
              >
                <span className="flex items-center"><Search className="mr-2 h-4.5 w-4.5 text-slate-400" /> Buscar material</span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
              {user.roles.includes('gestor') && (
                <button
                  onClick={() => onNavigate('/solicitacoes/aprovacoes')}
                  className="flex w-full items-center justify-between rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs py-2.5 px-4 transition-colors text-left border border-slate-200 cursor-pointer"
                >
                  <span className="flex items-center"><CheckSquare className="mr-2 h-4.5 w-4.5 text-slate-400" /> Aprovações</span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              )}
              {localDb.hasPermission(user, 'sap', 'visualizar_painel') && (
                <button
                  onClick={() => onNavigate('/suprimentos/painel')}
                  className="flex w-full items-center justify-between rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs py-2.5 px-4 transition-colors text-left border border-slate-200 cursor-pointer"
                >
                  <span className="flex items-center"><Database className="mr-2 h-4.5 w-4.5 text-slate-400" /> Painel SAP</span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              )}
              {localDb.hasPermission(user, 'sap', 'dashboards') && (
                <button
                  onClick={() => onNavigate('/suprimentos/dashboards')}
                  className="flex w-full items-center justify-between rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs py-2.5 px-4 transition-colors text-left border border-slate-200 cursor-pointer"
                >
                  <span className="flex items-center"><Layers className="mr-2 h-4.5 w-4.5 text-slate-400" /> Dashboards SAP</span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              )}
            </div>
          </div>

          {/* Status SAP Database Carga card */}
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm text-left">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status Painel SAP</h4>
            <div className="mt-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Base ME5A:</span>
                <span className="text-xs font-semibold text-slate-800">há cerca de 13 horas</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Base ZL0132:</span>
                <span className="text-xs font-semibold text-slate-800">há cerca de 13 horas</span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full w-full bg-emerald-500"></div>
              </div>
              <p className="text-[10px] text-slate-400">Base consolidada e sincronizada com as extrações oficiais.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
