/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, LayoutDashboard, PieChart, TrendingUp, AlertTriangle, 
  Clock, CheckCircle, HelpCircle, ChevronRight 
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { EnrichedSAPRecord } from '../types';

interface SapDashboardsProps {
  onNavigate: (path: string) => void;
}

export default function SapDashboards({ onNavigate }: SapDashboardsProps) {
  const [records, setRecords] = useState<EnrichedSAPRecord[]>([]);

  useEffect(() => {
    setRecords(localDb.getEnrichedSAPRequisicoes());
  }, []);

  // Compute metrics
  const total = records.length;
  const withPO = records.filter(r => r.status_requisicao === 'Processado').length;
  const withoutPO = records.filter(r => r.status_requisicao === 'Sem PO').length;

  const critical = records.filter(r => r.alerta === '⚠️ ESCALAR IMEDIATAMENTE' || r.alerta === '⚠️ AÇÃO URGENTE').length;
  const attention = records.filter(r => r.alerta === '⚡ ACOMPANHAR').length;
  const ok = records.filter(r => r.alerta === '✅ OK' || r.alerta === '📋 MONITORAR').length;

  // Average delay
  const totalOpenDays = records.reduce((acc, r) => acc + (r.dias_em_aberto || 0), 0);
  const avgOpenDays = total > 0 ? Math.round(totalOpenDays / total) : 0;

  // Buyer leaderboards
  const groupCounts: Record<string, number> = {};
  records.forEach(r => {
    groupCounts[r.grupo_comprador] = (groupCounts[r.grupo_comprador] || 0) + 1;
  });

  const sortedGroups = Object.entries(groupCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const handleDrilldown = (filterType: string, value: string) => {
    // Navigate with query parameters
    let q = '';
    if (filterType === 'status') {
      q = `status=${value}`;
    } else if (filterType === 'alert') {
      q = `alert=${value}`;
    } else if (filterType === 'buyer') {
      q = `buyer=${value}`;
    }
    onNavigate(`/suprimentos/painel?${q}`);
  };

  return (
    <div className="space-y-6 text-left">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Analytics & Dashboards SAP</h2>
        <p className="mt-1 text-sm text-slate-500">Indicadores consolidados de eficiência, criticidade, gargalos de atendimento e lead time.</p>
      </div>

      {/* KPI Cards row */}
      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Eficiência */}
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Índice de Conversão</span>
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 mt-3">
            {total > 0 ? Math.round((withPO / total) * 100) : 0}%
          </p>
          <p className="text-[10px] text-slate-400 mt-1">{withPO} de {total} requisições convertidas em pedido</p>
        </div>

        {/* KPI 2: Críticos */}
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Atrasos Críticos</span>
            <AlertTriangle className="h-5 w-5 text-red-600 animate-pulse" />
          </div>
          <p className="text-3xl font-extrabold text-red-600 mt-3">{critical}</p>
          <p className="text-[10px] text-red-400 mt-1">Acima de 30 dias abertos sem PO</p>
        </div>

        {/* KPI 3: Tempo Médio */}
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tempo Médio em Aberto</span>
            <Clock className="h-5 w-5 text-blue-600" />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 mt-3">{avgOpenDays} dias</p>
          <p className="text-[10px] text-slate-400 mt-1">Média de processamento total</p>
        </div>

        {/* KPI 4: Concluídos */}
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Atendidos</span>
            <CheckCircle className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 mt-3">{withPO}</p>
          <p className="text-[10px] text-slate-400 mt-1">Pedidos concluídos na base SAP</p>
        </div>
      </div>

      {/* Visual Analytics Charts Section */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Chart 1: Convertion Funnel */}
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Fluxo de Conversão (Funil)</h3>
          
          <div className="relative flex flex-col items-center justify-center py-6 space-y-3">
            {/* Stage 1: Sem PO */}
            <button 
              onClick={() => handleDrilldown('status', 'Sem PO')}
              className="w-full max-w-sm rounded-lg bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 p-4 transition-colors text-center relative group"
            >
              <span className="absolute top-1.5 left-2.5 bg-yellow-200 text-yellow-800 text-[9px] font-bold px-1.5 py-0.5 rounded">PASSO 1</span>
              <p className="text-xs font-bold text-yellow-900">Aguardando Cotação / Pedido (Sem PO)</p>
              <p className="text-xl font-extrabold text-yellow-800 mt-1">{withoutPO} RIs</p>
              <p className="text-[10px] text-yellow-600 mt-0.5 font-medium group-hover:underline">Clique para filtrar no painel →</p>
            </button>

            {/* Connecting arrow */}
            <div className="h-6 w-0.5 bg-slate-200 relative">
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 h-1.5 w-1.5 border-r border-b border-slate-300 rotate-45" />
            </div>

            {/* Stage 2: Com PO */}
            <button 
              onClick={() => handleDrilldown('status', 'Com PO')}
              className="w-full max-w-sm rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 p-4 transition-colors text-center relative group"
            >
              <span className="absolute top-1.5 left-2.5 bg-emerald-200 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5 rounded">PASSO 2</span>
              <p className="text-xs font-bold text-emerald-900">Convertido em Pedido SAP (Processado)</p>
              <p className="text-xl font-extrabold text-emerald-800 mt-1">{withPO} RIs</p>
              <p className="text-[10px] text-emerald-600 mt-0.5 font-medium group-hover:underline">Clique para filtrar no painel →</p>
            </button>
          </div>
        </div>

        {/* Chart 2: Alerts Level Distribution */}
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Níveis de Alerta</h3>

          <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-4">
            {/* SVG Donut */}
            <div className="relative h-44 w-44">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f1f5f9" strokeWidth="12" />
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#10b981" strokeWidth="12" strokeDasharray="251" strokeDashoffset={0} /> {/* OK */}
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f59e0b" strokeWidth="12" strokeDasharray="251" strokeDashoffset={251 - (attention / (total || 1) * 251)} /> {/* Atenção */}
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#ef4444" strokeWidth="12" strokeDasharray="251" strokeDashoffset={251 - (critical / (total || 1) * 251)} /> {/* Crítico */}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black text-slate-800">{total}</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase">Itens Totais</span>
              </div>
            </div>

            {/* Drilldown Legend */}
            <div className="space-y-3.5 text-xs text-left">
              <button 
                onClick={() => handleDrilldown('alert', '⚠️ AÇÃO URGENTE')}
                className="flex items-center space-x-3 hover:bg-slate-50 p-2 rounded transition-colors cursor-pointer w-full"
              >
                <span className="h-3 w-3 rounded-full bg-red-500" />
                <div>
                  <p className="font-bold text-slate-800">Crítico: {critical} itens</p>
                  <p className="text-[10px] text-slate-400">Escalação pendente</p>
                </div>
              </button>

              <button 
                onClick={() => handleDrilldown('alert', '⚡ ACOMPANHAR')}
                className="flex items-center space-x-3 hover:bg-slate-50 p-2 rounded transition-colors cursor-pointer w-full"
              >
                <span className="h-3 w-3 rounded-full bg-amber-500" />
                <div>
                  <p className="font-bold text-slate-800">Atenção: {attention} itens</p>
                  <p className="text-[10px] text-slate-400">Em acompanhamento</p>
                </div>
              </button>

              <button 
                onClick={() => handleDrilldown('alert', '✅ OK')}
                className="flex items-center space-x-3 hover:bg-slate-50 p-2 rounded transition-colors cursor-pointer w-full"
              >
                <span className="h-3 w-3 rounded-full bg-emerald-500" />
                <div>
                  <p className="font-bold text-slate-800">OK/Monitoramento: {ok} itens</p>
                  <p className="text-[10px] text-slate-400">Dentro da meta</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboards row */}
      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Top Grupos de Compras por Volume</h3>
        
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-5">
          {sortedGroups.map(([group, val], idx) => {
            const percentage = Math.round((val / (total || 1)) * 100);
            return (
              <button
                key={group}
                onClick={() => handleDrilldown('buyer', group)}
                className="rounded-xl border border-slate-100 p-4 hover:border-emerald-300 hover:bg-slate-50/50 transition-colors text-left space-y-2 cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded">#{idx + 1}</span>
                  <span className="text-xs font-extrabold text-emerald-800">{group}</span>
                </div>
                <p className="text-lg font-black text-slate-800 mt-2">{val} itens</p>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${percentage}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 group-hover:underline">Visualizar itens →</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
