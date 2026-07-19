/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, FileText, Download, Filter, Calendar, RefreshCw, Layers, Key, Headphones, CheckSquare, Star
} from 'lucide-react';
import { localDb } from '../db/localDb';
import { supabase } from '../db/supabaseClient';
import { Request } from '../types';

interface ReportsProps {
  user: any;
}

export default function Reports({ user }: ReportsProps) {
  // Agregados de materiais vêm da view vw_materials_stats (poucas linhas, uma por
  // combinação empresa/categoria) em vez do catálogo inteiro (~172k linhas).
  const [materialsByCompany, setMaterialsByCompany] = useState<Record<string, number>>({});
  const [materialsByCategory, setMaterialsByCategory] = useState<Record<string, number>>({});
  const [activeMaterialsCount, setActiveMaterialsCount] = useState(0);
  const [requests, setRequests] = useState<Request[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [dateRange, setDateRange] = useState<'all' | '30' | '90'>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = () => {
    setLoading(true);
    setRequests(localDb.getRequests());

    supabase
      ?.from('vw_materials_stats')
      .select('company, category, total')
      .then(({ data, error }) => {
        if (error || !data) {
          console.warn('Falha ao carregar vw_materials_stats:', error);
          setLoading(false);
          return;
        }
        const byCompany: Record<string, number> = {};
        const byCategory: Record<string, number> = {};
        let total = 0;
        data.forEach((row: any) => {
          byCompany[row.company] = (byCompany[row.company] || 0) + row.total;
          byCategory[row.category] = (byCategory[row.category] || 0) + row.total;
          total += row.total;
        });
        setMaterialsByCompany(byCompany);
        setMaterialsByCategory(byCategory);
        setActiveMaterialsCount(total);
        setLoading(false);
      });
  };

  // 2. Request stats
  const totalRequests = requests.length;
  const requestsByType = requests.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const requestsByStatus = requests.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Helpdesk Rating Stats
  const helpdeskTickets = requests.filter(r => r.type === 'chamado');
  const ratedTickets = helpdeskTickets.filter(r => r.rating && r.rating > 0);
  const avgRating = ratedTickets.length > 0 
    ? (ratedTickets.reduce((sum, r) => sum + (r.rating || 0), 0) / ratedTickets.length).toFixed(1)
    : 'N/A';

  const slaMetCount = helpdeskTickets.filter(r => {
    if (r.status !== 'resolvido' && r.status !== 'fechado') return false;
    const limitMap: Record<number, number> = { 1: 120, 2: 72, 3: 24, 4: 8, 5: 2 };
    const allowedHours = limitMap[r.criticality] || 24;
    const start = new Date(r.created_at).getTime();
    const resolved = r.resolved_at ? new Date(r.resolved_at).getTime() : Date.now();
    const elapsedHours = (resolved - start) / (3600 * 1000);
    return elapsedHours <= allowedHours;
  }).length;

  const slaComplianceRate = helpdeskTickets.length > 0
    ? ((slaMetCount / helpdeskTickets.length) * 10000 / 100).toFixed(1)
    : '100';

  const downloadCsv = (headers: string[], rows: string[][], filename: string) => {
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF"
      + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // O cat\u00E1logo completo s\u00F3 \u00E9 buscado no Supabase no momento do export (a\u00E7\u00E3o
  // pontual do usu\u00E1rio), n\u00E3o a cada carregamento da tela.
  const exportMaterialsCSV = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('materials')
      .select('material_code, description, category, company, unit')
      .eq('is_active', true)
      .order('material_code');
    setLoading(false);
    if (error || !data) {
      console.warn('Falha ao exportar cat\u00E1logo de materiais:', error);
      return;
    }
    const headers = ['Codigo_SAP', 'Descricao', 'Categoria', 'Empresa', 'Unidade', 'Ativo'];
    const rows = data.map((m: any) => [
      m.material_code,
      `"${String(m.description).replace(/"/g, '""')}"`,
      m.category,
      m.company,
      m.unit,
      'Sim'
    ]);
    downloadCsv(headers, rows, 'SISTEN_Relatorio_Catalogo_Materiais.csv');
  };

  const exportRequestsCSV = () => {
    const headers = ['Numero', 'Tipo_Solicitacao', 'Solicitante', 'Setor_ID', 'Criticidade', 'Status', 'Data_Criacao'];
    const rows = requests.map(r => [
      r.number,
      r.type,
      `"${r.solicitante_name.replace(/"/g, '""')}"`,
      r.solicitante_sector_id,
      String(r.criticality),
      r.status,
      r.created_at
    ]);
    downloadCsv(headers, rows, 'SISTEN_Relatorio_Solicitacoes.csv');
  };

  return (
    <div className="space-y-6 text-left py-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-emerald-700" /> Relatórios do Sistema
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Acompanhe consolidados de materiais do SAP, fluxos de solicitações internas e desempenho operacional do helpdesk.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="rounded-lg border border-slate-200 text-xs px-3 py-2 bg-white focus:outline-none focus:border-emerald-500 font-medium"
          >
            <option value="all">Todo o histórico</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>

          <button 
            onClick={loadData}
            className="p-2 border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer"
            title="Atualizar dados"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-center space-y-2">
            <div className="h-8 w-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-semibold tracking-wider">PROCESSANDO RELATÓRIOS...</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Section 1: SAP Catalogue Summary */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-emerald-600" /> Catálogo SAP
              </h3>
              <button
                onClick={exportMaterialsCSV}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
              >
                <Download className="h-3 w-3" /> Exportar CSV
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Itens Ativos</span>
                <p className="text-xl font-black text-slate-800 mt-1">{activeMaterialsCount}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Categorias</span>
                <p className="text-xl font-black text-slate-800 mt-1">{Object.keys(materialsByCategory).length}</p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Distribuição por Empresa:</p>
              <div className="space-y-1.5 text-xs font-semibold">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Torres Eólicas (TEN2)</span>
                  <span className="text-slate-800 font-bold">{materialsByCompany['TEN2'] || 0} itens</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div
                    className="bg-emerald-600 h-1.5 rounded-full"
                    style={{ width: `${activeMaterialsCount ? ((materialsByCompany['TEN2'] || 0) / activeMaterialsCount * 100) : 0}%` }}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-600">Alstom Grid (AG)</span>
                  <span className="text-slate-800 font-bold">{materialsByCompany['AG'] || 0} itens</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full"
                    style={{ width: `${activeMaterialsCount ? ((materialsByCompany['AG'] || 0) / activeMaterialsCount * 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Principais Categorias:</p>
              <div className="divide-y divide-slate-100 max-h-36 overflow-y-auto pr-1">
                {(Object.entries(materialsByCategory) as [string, number][])
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([cat, count]) => (
                    <div key={cat} className="flex justify-between py-1.5 font-semibold text-slate-700">
                      <span>{cat}</span>
                      <span>{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Section 2: Request Flow Stats */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <CheckSquare className="h-4 w-4 text-emerald-600" /> Fluxo de Solicitações
              </h3>
              <button 
                onClick={exportRequestsCSV}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
              >
                <Download className="h-3 w-3" /> Exportar CSV
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-50 p-2 text-center rounded-lg border border-slate-100">
                <span className="text-[9px] font-semibold text-slate-400 uppercase block">Total</span>
                <span className="text-lg font-black text-slate-800">{totalRequests}</span>
              </div>
              <div className="bg-slate-50 p-2 text-center rounded-lg border border-slate-100">
                <span className="text-[9px] font-semibold text-slate-400 uppercase block">Compras</span>
                <span className="text-lg font-black text-slate-800">{requestsByType['compra'] || 0}</span>
              </div>
              <div className="bg-slate-50 p-2 text-center rounded-lg border border-slate-100">
                <span className="text-[9px] font-semibold text-slate-400 uppercase block">Cadastro SAP</span>
                <span className="text-lg font-black text-slate-800">{requestsByType['cadastro_sap'] || 0}</span>
              </div>
            </div>

            <div className="space-y-2.5 pt-1 text-xs font-semibold">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Solicitações por Status:</p>
              
              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500" /> Aberto / Pendente
                </span>
                <span className="font-bold text-slate-800">
                  {(requestsByStatus['aberto'] || 0) + (requestsByStatus['pendente'] || 0)}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Em Atendimento
                </span>
                <span className="font-bold text-slate-800">{requestsByStatus['em_atendimento'] || 0}</span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Resolvido / Fechado
                </span>
                <span className="font-bold text-slate-800">
                  {(requestsByStatus['resolvido'] || 0) + (requestsByStatus['fechado'] || 0)}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500" /> Devolvido / Rejeitado
                </span>
                <span className="font-bold text-slate-800">
                  {(requestsByStatus['em_revisao'] || 0) + (requestsByStatus['rejeitada'] || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Support Helpdesk Desempenho */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Headphones className="h-4 w-4 text-emerald-600" /> Desempenho do Helpdesk
            </h3>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-100">
                <span className="text-[9px] font-bold text-emerald-700 uppercase block">Atendimento SLA</span>
                <span className="text-2xl font-black text-emerald-800 mt-1 block">{slaComplianceRate}%</span>
              </div>

              <div className="bg-indigo-50 p-3.5 rounded-xl border border-indigo-100">
                <span className="text-[9px] font-bold text-indigo-700 uppercase block">Avaliação Média</span>
                <span className="text-2xl font-black text-indigo-800 mt-1 block flex items-center justify-center gap-1">
                  {avgRating} <Star className="h-4.5 w-4.5 text-amber-500 fill-amber-500 shrink-0" />
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs pt-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Resumo de Chamados:</p>
              
              <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600 font-semibold">
                <span>Total de Chamados Abertos</span>
                <span className="text-slate-800 font-bold">{helpdeskTickets.length}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600 font-semibold">
                <span>Chamados Resolvidos</span>
                <span className="text-slate-800 font-bold">
                  {helpdeskTickets.filter(r => r.status === 'resolvido' || r.status === 'fechado').length}
                </span>
              </div>
              <div className="flex justify-between py-1 text-slate-600 font-semibold">
                <span>Avaliações Recebidas</span>
                <span className="text-slate-800 font-bold">{ratedTickets.length}</span>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
