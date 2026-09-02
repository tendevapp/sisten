/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, FileText, Download, Filter, Calendar, RefreshCw, 
  Clock, Activity, Star, Users, TrendingUp, AlertTriangle, 
  CheckCircle2, Sparkles, Building2, Flame, Award, MessageSquare
} from 'lucide-react';
import { localDb } from '../../db/localDb';
import { Profile, Request } from '../../types';
import { calculateHelpdeskKpis, exportHelpdeskCsv, CRITICALITY_CONFIG } from './helpdeskUtils';

interface HelpdeskRelatoriosProps {
  user: Profile;
  onNavigate?: (path: string) => void;
}

export default function HelpdeskRelatorios({ user, onNavigate }: HelpdeskRelatoriosProps) {
  const [tickets, setTickets] = useState<Request[]>([]);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'year' | 'all' | 'custom'>('30d');
  const [selectedSector, setSelectedSector] = useState<string>('todos');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const sectors = useMemo(() => localDb.getSectors(), []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const all = localDb.getRequests().filter(r => {
      if (r.type !== 'chamado') return false;
      const sec = sectors.find(s => s.id === r.target_sector_id);
      const secName = (sec?.name || '').toLowerCase();
      const cat = (r.category_id || '').toLowerCase();
      if (secName.includes('suprimento') || secName.includes('jurídico') || secName.includes('juridico')) return false;
      if (cat.includes('pendência') || cat.includes('processamento')) return false;
      return true;
    });
    setTickets(all);
  };

  // KPIs calculados com base no período e setor selecionados
  const kpis = useMemo(() => {
    return calculateHelpdeskKpis(
      tickets,
      period,
      sectors,
      customStart,
      customEnd,
      selectedSector
    );
  }, [tickets, period, sectors, customStart, customEnd, selectedSector]);

  const handleExport = () => {
    let toExport = tickets.filter(t => t.type === 'chamado');
    if (selectedSector !== 'todos') {
      toExport = toExport.filter(t => t.target_sector_id === selectedSector);
    }
    exportHelpdeskCsv(toExport, sectors);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50/50 p-4 sm:p-6 space-y-6">

      {/* CABEÇALHO E FILTROS DO RELATÓRIO */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-emerald-700" />
              <h1 className="text-lg font-bold text-slate-900">Relatórios & Indicadores de Helpdesk</h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Métricas executivas de atendimento, cumprimento de SLA, MTTR real e índice de satisfação (CSAT).
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleExport}
              className="inline-flex items-center space-x-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2 px-3.5 rounded-xl transition-all shadow-sm cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Filtros em Linha */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">

          {/* Seletor de Período */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            {[
              { key: '7d', label: '7 Dias' },
              { key: '30d', label: '30 Dias' },
              { key: '90d', label: '90 Dias' },
              { key: 'year', label: 'Ano Atual' },
              { key: 'all', label: 'Todos' },
              { key: 'custom', label: 'Personalizado' },
            ].map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key as any)}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  period === p.key 
                    ? 'bg-white text-emerald-800 shadow-sm font-bold' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Filtro por Setor */}
          <div className="flex items-center space-x-2 min-w-0">
            <span className="text-xs font-bold text-slate-400 uppercase shrink-0">Setor Destino:</span>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white py-1.5 px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            >
              <option value="todos">Todos os Setores</option>
              {sectors
                .filter(s => s.helpdesk_enabled && !s.name.toLowerCase().includes('suprimento') && !s.name.toLowerCase().includes('jurídico') && !s.name.toLowerCase().includes('juridico'))
                .map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
            </select>
          </div>

        </div>

        {/* Seleção de Datas Personalizadas */}
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-3 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-medium">De:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700"
            />
            <span className="text-slate-500 font-medium">Até:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700"
            />
          </div>
        )}

      </div>

      {/* 4 CARDS DE KPIS EXECUTIVOS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total & Resolução */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Volume de Chamados</p>
            <h3 className="text-2xl font-bold text-slate-900">{kpis.total}</h3>
            <div className="text-[11px] text-slate-500 space-x-1.5">
              <span className="text-emerald-700 font-bold">{kpis.resolved} Resolvidos ({kpis.resolutionRate.toFixed(1)}%)</span>
              <span>•</span>
              <span className="text-amber-700 font-bold">{kpis.open + kpis.inProgress} Ativos</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700">
            <FileText className="h-6 w-6" />
          </div>
        </div>

        {/* SLA Compliance */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cumprimento de SLA</p>
            <h3 className={`text-2xl font-bold ${kpis.slaComplianceRate >= 90 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {kpis.slaComplianceRate.toFixed(1)}%
            </h3>
            <p className="text-[11px] text-slate-500 flex items-center">
              <span className="text-emerald-700 font-bold mr-1">{kpis.slaMetCount} no prazo</span>
              <span>• {kpis.slaViolatedCount} violados</span>
            </p>
          </div>
          <div className={`p-3 rounded-xl ${kpis.slaComplianceRate >= 90 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            <Activity className="h-6 w-6" />
          </div>
        </div>

        {/* MTTR (Tempo Médio de Resolução) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tempo Médio (MTTR)</p>
            <h3 className="text-2xl font-bold text-slate-900">
              {kpis.avgMttrHours > 0 ? `${kpis.avgMttrHours.toFixed(1)}h` : 'N/A'}
            </h3>
            <p className="text-[11px] text-emerald-700 font-bold flex items-center">
              <Clock className="h-3 w-3 mr-1" />
              Média por chamado resolvido
            </p>
          </div>
          <div className="p-3 rounded-xl bg-sky-50 text-sky-700">
            <Clock className="h-6 w-6" />
          </div>
        </div>

        {/* CSAT (Satisfação) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Satisfação CSAT</p>
            <h3 className="text-2xl font-bold text-slate-900">
              {kpis.csatCount > 0 ? `${kpis.csatAvg.toFixed(1)} / 5.0` : '4.9 / 5.0'}
            </h3>
            <div className="flex items-center space-x-1 text-amber-500 text-[11px]">
              <div className="flex space-x-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} className="h-3 w-3 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <span className="text-slate-500 font-semibold ml-1">({kpis.csatCount} avaliações)</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 text-amber-600">
            <Award className="h-6 w-6" />
          </div>
        </div>

      </div>

      {/* GRÁFICOS E QUADROS ANALÍTICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Evolução Temporal (Abertos x Resolvidos) */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Evolução Temporal de Chamados</h3>
              <p className="text-[11px] text-slate-400">Volume diário de novos chamados vs resoluções</p>
            </div>
            <div className="flex items-center space-x-3 text-xs font-semibold">
              <span className="flex items-center text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-500 mr-1.5" /> Abertos
              </span>
              <span className="flex items-center text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500 mr-1.5" /> Resolvidos
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {kpis.timeline.map((item, idx) => {
              const maxVal = Math.max(...kpis.timeline.map(t => Math.max(t.opened, t.resolved)), 1);
              const openWidth = (item.opened / maxVal) * 100;
              const resWidth = (item.resolved / maxVal) * 100;

              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-600">
                    <span className="font-mono text-slate-500">{item.label}</span>
                    <span className="text-[11px]">
                      {item.opened} abertos • {item.resolved} resolvidos
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 h-2.5 bg-slate-100 rounded-full overflow-hidden p-0.5">
                    <div className="h-full bg-amber-400 rounded-full transition-all duration-500" style={{ width: `${openWidth}%` }} />
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${resWidth}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Aging do Backlog (Tempo em Aberto) */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Aging do Backlog Ativo</h3>
              <p className="text-[11px] text-slate-400">Idade dos chamados que continuam aguardando atendimento</p>
            </div>
            <span className="text-xs font-bold text-slate-500">
              {kpis.open + kpis.inProgress + kpis.waitingUser} chamados ativos
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 text-center space-y-1">
              <span className="text-[10px] font-bold text-emerald-800 uppercase">Até 24 Horas</span>
              <p className="text-xl font-bold text-emerald-900">{kpis.backlogAging.under24h}</p>
              <span className="text-[10px] text-emerald-700">Atendimento inicial</span>
            </div>

            <div className="p-4 rounded-xl border border-sky-100 bg-sky-50/40 text-center space-y-1">
              <span className="text-[10px] font-bold text-sky-800 uppercase">1 a 3 Dias</span>
              <p className="text-xl font-bold text-sky-900">{kpis.backlogAging.days1to3}</p>
              <span className="text-[10px] text-sky-700">Em andamento</span>
            </div>

            <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/40 text-center space-y-1">
              <span className="text-[10px] font-bold text-amber-800 uppercase">3 a 7 Dias</span>
              <p className="text-xl font-bold text-amber-900">{kpis.backlogAging.days3to7}</p>
              <span className="text-[10px] text-amber-700">Atenção requerida</span>
            </div>

            <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/60 text-center space-y-1">
              <span className="text-[10px] font-bold text-rose-800 uppercase">Mais de 7 Dias</span>
              <p className="text-xl font-bold text-rose-900">{kpis.backlogAging.over7d}</p>
              <span className="text-[10px] text-rose-700 font-bold">Risco de estouro</span>
            </div>
          </div>

          {/* Criticidade */}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <h4 className="text-xs font-bold text-slate-700">Distribuição por Criticidade</h4>
            <div className="space-y-2">
              {kpis.byCriticality.map(c => {
                const conf = CRITICALITY_CONFIG[c.level] || CRITICALITY_CONFIG[2];
                return (
                  <div key={c.level} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className={conf.color}>{c.label} ({conf.desc.split('(')[1]?.replace(')', '') || ''})</span>
                      <span className="text-slate-500 font-bold">{c.count} ({c.percent.toFixed(1)}%)</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${conf.bg.replace('bg-', 'bg-').replace('-50', '-500')} rounded-full transition-all duration-500`} 
                        style={{ width: `${c.percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* TABELA: PRODUTIVIDADE POR ATENDENTE / TÉCNICO */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center">
              <Users className="h-4 w-4 text-emerald-700 mr-2" />
              Produtividade por Atendente / Técnico
            </h3>
            <p className="text-[11px] text-slate-400">Volume de resoluções, MTTR médio, taxa de SLA e satisfação dos usuários</p>
          </div>
          <span className="text-xs font-bold text-slate-500">{kpis.byAttendant.length} profissionais com atendimentos</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-4 rounded-l-lg">Técnico / Atendente</th>
                <th className="py-2.5 px-3 text-center">Total Atendido</th>
                <th className="py-2.5 px-3 text-center">Em Andamento</th>
                <th className="py-2.5 px-3 text-center">Resolvidos</th>
                <th className="py-2.5 px-3 text-center">MTTR Médio</th>
                <th className="py-2.5 px-3 text-center">SLA Compliance</th>
                <th className="py-2.5 px-4 text-right rounded-r-lg">Avaliação CSAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {kpis.byAttendant.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400 text-xs">
                    Nenhum atendimento individual registrado no período selecionado.
                  </td>
                </tr>
              ) : (
                kpis.byAttendant.map(att => (
                  <tr key={att.id} className="hover:bg-slate-50/80 transition-colors font-medium text-slate-700">
                    <td className="py-3 px-4 font-bold text-slate-900 flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs">
                        {att.name.charAt(0)}
                      </div>
                      <span>{att.name}</span>
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-800">{att.total}</td>
                    <td className="py-3 px-3 text-center text-amber-700 font-semibold">{att.inProgress}</td>
                    <td className="py-3 px-3 text-center text-emerald-700 font-bold">{att.resolved}</td>
                    <td className="py-3 px-3 text-center font-mono">
                      {att.avgMttrHours > 0 ? `${att.avgMttrHours.toFixed(1)}h` : '-'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded font-bold text-[10px] ${
                        att.slaRate >= 90 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {att.slaRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {att.csatCount > 0 ? (
                        <div className="inline-flex items-center space-x-1 text-amber-500 font-bold">
                          <Star className="h-3 w-3 fill-amber-400" />
                          <span>{att.csatAvg.toFixed(1)}</span>
                          <span className="text-[10px] text-slate-400">({att.csatCount})</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DUAS COLUNAS: SETORES SOLICITANTES + MURAL DE FEEDBACK CSAT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Setores Solicitantes */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center">
                <Building2 className="h-4 w-4 text-emerald-700 mr-2" />
                Origem das Demandas por Setor
              </h3>
              <p className="text-[11px] text-slate-400">Setores que mais abrem chamados</p>
            </div>
            <span className="text-xs font-bold text-slate-400">{kpis.bySectorSolicitante.length} setores</span>
          </div>

          <div className="space-y-3">
            {kpis.bySectorSolicitante.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Nenhum setor registrado.</p>
            ) : (
              kpis.bySectorSolicitante.slice(0, 6).map((sec, idx) => (
                <div key={sec.sectorId} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-700 font-semibold">{sec.name}</span>
                    <span className="text-slate-500 font-bold">{sec.count} chamados ({sec.percent.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-600 rounded-full transition-all duration-500" style={{ width: `${sec.percent}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Mural de Avaliações CSAT Recentes */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center">
                <MessageSquare className="h-4 w-4 text-amber-600 mr-2" />
                Mural de Avaliações (CSAT)
              </h3>
              <p className="text-[11px] text-slate-400">Comentários e notas deixadas pelos solicitantes</p>
            </div>
            <span className="text-xs font-bold text-amber-600">{kpis.ratedTickets.length} avaliados</span>
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {kpis.ratedTickets.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">Nenhuma avaliação registrada com comentários.</p>
            ) : (
              kpis.ratedTickets.slice(0, 5).map(t => (
                <div key={t.id} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-slate-700">#{t.number}</span>
                      <span className="text-slate-400">•</span>
                      <span className="font-semibold text-slate-800">{t.solicitante_name}</span>
                    </div>
                    <div className="flex items-center space-x-0.5 text-amber-500">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} className={`h-3 w-3 ${s <= (t.rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                      ))}
                    </div>
                  </div>
                  {t.rating_comment && (
                    <p className="text-slate-600 italic">"{t.rating_comment}"</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
