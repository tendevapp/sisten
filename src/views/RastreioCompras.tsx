/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Route, Search, FileSpreadsheet, FileText, AlertCircle, RefreshCw, Filter,
  Building2, Calendar, Clock, ChevronDown, SlidersHorizontal, Table as TableIcon,
  CalendarRange, Package, Truck, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../db/localDb';
import { Profile } from '../types';
import {
  RastreioRow, DeliveryScope, buildRastreioRows, filterRegistros, deriveDeliveryStatus,
  statusOptions, setorOptions, anoOptions, formatDateBR, formatDateTimeBR, parseDate, defaultSort,
} from '../lib/rastreio';
import RastreioTable, { RASTREIO_COLUMNS, SortDir } from '../components/rastreio/RastreioTable';
import RastreioCronograma from '../components/rastreio/RastreioCronograma';
import RastreioDetailModal from '../components/rastreio/RastreioDetailModal';

interface RastreioComprasProps {
  user: Profile;
  onNavigate?: (path: string) => void;
}

type Tab = 'tabela' | 'cronograma';

const STORAGE_COLS_KEY = 'sisten_rastreio_visible_columns';
const PAGE_SIZE = 50;

export default function RastreioCompras({ user }: RastreioComprasProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RastreioRow[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('tabela');

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [setorFilter, setSetorFilter] = useState('Todos');
  const [anoFilter, setAnoFilter] = useState('Todos');
  const [scope, setScope] = useState<DeliveryScope>('todos');

  // Modal de detalhes + conversa
  const [selectedRow, setSelectedRow] = useState<RastreioRow | null>(null);
  const [unreadRis, setUnreadRis] = useState<Set<string>>(() => localDb.getUnreadRastreioRis(user.id));
  const refreshUnread = useCallback(() => setUnreadRis(localDb.getUnreadRastreioRis(user.id)), [user.id]);

  // Ordenação
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Paginação incremental
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Colunas visíveis
  const [showColMenu, setShowColMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const defaults = RASTREIO_COLUMNS.reduce((acc, col) => ({ ...acc, [col.id]: true }), {} as Record<string, boolean>);
    const saved = localStorage.getItem(STORAGE_COLS_KEY);
    if (saved) {
      try { return { ...defaults, ...JSON.parse(saved) }; } catch {}
    }
    return defaults;
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_COLS_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // "Hoje" de referência para o status de prazo (data real do usuário).
  const hoje = useMemo(() => new Date(), []);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      if (force) {
        // Roda o sync completo (gated por dataset_versions) para pegar POs/status
        // novos de uma importação SAP recente sem depender de um novo login — sem
        // isso, "Atualizar" só puxava os campos do comprador e uma PO recém-
        // importada continuava "Sem PO" até o usuário deslogar/logar de novo.
        try { await localDb.syncFromSupabase(); } catch (e) { console.warn('Falha ao sincronizar dataset completo:', e); }
        // Reflete edições de obs/status/previsão feitas no Painel SAP por outros
        // usuários (que não disparam um sync completo do dataset).
        try { await localDb.refreshBuyerFieldsFromSupabase(); } catch (e) { console.warn('Falha ao atualizar campos do comprador:', e); }
      }
      const records = localDb.getEnrichedSAPRequisicoes();
      setRows(buildRastreioRows(records));
      setLastUpdated(localDb.getDatasetUpdatedAt('requisicoes'));
    } catch (e: any) {
      console.error('Erro ao montar rastreio de compras:', e);
      setError('Falha ao carregar os dados. Tente atualizar novamente.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  // Opções de filtro derivadas dos dados.
  const statusOpts = useMemo(() => statusOptions(rows), [rows]);
  const setorOpts = useMemo(() => setorOptions(rows), [rows]);
  const anoOpts = useMemo(() => anoOptions(rows), [rows]);

  const filteredRows = useMemo(
    () => filterRegistros(rows, { query: searchQuery, status: statusFilter, setor: setorFilter, ano: anoFilter, scope }),
    [rows, searchQuery, statusFilter, setorFilter, anoFilter, scope]
  );

  // Ordenação da tabela. Sem coluna ativa, usa o padrão (MIGO ↑, descrição ↑).
  const sortedRows = useMemo(() => {
    if (!sortColumn) return defaultSort(filteredRows);
    const dir = sortDir === 'asc' ? 1 : -1;
    const getVal = (r: RastreioRow): string | number => {
      switch (sortColumn) {
        case 'rm': return r.rm;
        case 'po': return r.po;
        case 'descricao': return r.descricao.toLowerCase();
        case 'fornecedor': return r.fornecedor.toLowerCase();
        case 'setor': return r.setor.toLowerCase();
        case 'qtd': return r.qtd ?? -Infinity;
        case 'dataCriacao': return parseDate(r.dataCriacao)?.getTime() ?? 0;
        case 'dataPrevista': return parseDate(r.dataPrevista)?.getTime() ?? 0;
        case 'dataEntrega': return parseDate(r.dataEntrega)?.getTime() ?? 0;
        case 'status': return r.status.toLowerCase();
        default: return '';
      }
    };
    return [...filteredRows].sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * dir;
    });
  }, [filteredRows, sortColumn, sortDir]);

  const visibleRows = useMemo(() => sortedRows.slice(0, visibleCount), [sortedRows, visibleCount]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchQuery, statusFilter, setorFilter, anoFilter, scope, sortColumn, sortDir]);

  // Deep-link: notificação de mensagem abre a conversa do item (#/rastreio?ri=...).
  useEffect(() => {
    if (rows.length === 0) return;
    const hash = window.location.hash || '';
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return;
    const ri = new URLSearchParams(hash.slice(qIndex + 1)).get('ri');
    if (ri) {
      const match = rows.find(r => r.ri === ri);
      if (match) setSelectedRow(match);
    }
  }, [rows]);

  // Reavalia indicadores de não-lido periodicamente (o Header sincroniza notifs).
  useEffect(() => {
    const t = setInterval(refreshUnread, 5000);
    return () => clearInterval(t);
  }, [refreshUnread]);

  const toggleSort = (col: string) => {
    if (sortColumn === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(col); setSortDir('asc'); }
  };

  // KPIs sobre o conjunto filtrado.
  const kpis = useMemo(() => {
    let entregues = 0, atrasados = 0, noPrazo = 0, semPo = 0;
    filteredRows.forEach(r => {
      const d = deriveDeliveryStatus(r, hoje);
      if (d === 'entregue') entregues++;
      else if (d === 'atrasado') atrasados++;
      else if (d === 'no_prazo') noPrazo++;
      if (r.statusReq === 'Sem PO') semPo++;
    });
    return { total: filteredRows.length, entregues, atrasados, noPrazo, semPo };
  }, [filteredRows, hoje]);

  const handleExportExcel = () => {
    if (filteredRows.length === 0) return;
    const data = filteredRows.map(r => ({
      'RM': r.rm,
      'PO': r.po,
      'Material': r.material,
      'Descrição': r.descricao,
      'Fornecedor': r.fornecedor,
      'Setor': r.setor,
      'Quantidade': r.qtd ?? '—',
      'Unidade': r.unidade,
      'Data Criação': formatDateBR(r.dataCriacao),
      'Prev. Entrega': formatDateBR(r.dataPrevista),
      'Entrega (MIGO)': formatDateBR(r.dataEntrega),
      'Status': r.status,
      'Observações': r.observacoes,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rastreio Compras');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    XLSX.writeFile(wb, `rastreio_compras_${timestamp}.xlsx`);
  };

  // PDF via impressão do navegador (sem dependência nova).
  const handleExportPDF = () => {
    if (filteredRows.length === 0) return;
    const esc = (s: string) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    const bodyRows = filteredRows.map(r => `
      <tr>
        <td>${esc(r.rm)}</td><td>${esc(r.po)}</td>
        <td>${esc(r.material)} — ${esc(r.descricao)}</td>
        <td>${esc(r.fornecedor)}</td><td>${esc(r.setor)}</td>
        <td class="r">${r.qtd !== undefined ? r.qtd.toLocaleString('pt-BR') : '—'}</td>
        <td>${formatDateBR(r.dataCriacao)}</td><td>${formatDateBR(r.dataPrevista)}</td><td>${formatDateBR(r.dataEntrega)}</td>
        <td>${esc(r.status)}</td>
      </tr>`).join('');
    const win = window.open('', '_blank');
    if (!win) { alert('Permita pop-ups para exportar em PDF.'); return; }
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Rastreio Compras</title>
      <style>
        * { font-family: Arial, Helvetica, sans-serif; }
        body { margin: 16px; color: #0f172a; }
        h1 { font-size: 16px; margin: 0 0 4px; }
        .meta { font-size: 10px; color: #64748b; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 9px; }
        th, td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: left; vertical-align: top; }
        th { background: #f1f5f9; text-transform: uppercase; font-size: 8px; letter-spacing: .04em; }
        td.r { text-align: right; }
        tr { page-break-inside: avoid; }
      </style></head><body>
      <h1>Rastreio Compras</h1>
      <div class="meta">${filteredRows.length} registro(s) · Gerado em ${new Date().toLocaleString('pt-BR')}</div>
      <table><thead><tr>
        <th>RM</th><th>PO</th><th>Item / Descrição</th><th>Fornecedor</th><th>Setor</th>
        <th>Qtd</th><th>Criação</th><th>Prev. Entrega</th><th>Entrega</th><th>Status</th>
      </tr></thead><tbody>${bodyRows}</tbody></table>
      </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  };

  const kpiCards = [
    { label: 'Registros', value: kpis.total, icon: Package, color: 'bg-slate-400 dark:bg-slate-700', text: 'text-slate-800 dark:text-slate-100' },
    { label: 'No prazo', value: kpis.noPrazo, icon: Truck, color: 'bg-blue-500 dark:bg-blue-600', text: 'text-blue-600 dark:text-blue-400' },
    { label: 'Atrasados', value: kpis.atrasados, icon: AlertTriangle, color: 'bg-rose-500 dark:bg-rose-600', text: 'text-rose-600 dark:text-rose-400' },
    { label: 'Entregues', value: kpis.entregues, icon: CheckCircle2, color: 'bg-emerald-500 dark:bg-emerald-600', text: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Sem PO', value: kpis.semPo, icon: AlertCircle, color: 'bg-amber-500 dark:bg-amber-600', text: 'text-amber-600 dark:text-amber-400' },
  ];

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold text-slate-800 dark:text-slate-50 flex items-center gap-2.5">
            <Route className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
            Rastreio Compras
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Acompanhe o ciclo de vida das compras — da requisição à entrega. Busque por RM, PO, item, fornecedor ou setor, e veja a programação de entregas no cronograma.
          </p>
          {lastUpdated && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 flex items-center gap-1 font-medium">
              <Clock className="h-3 w-3" /> Dados atualizados em: {formatDateTimeBR(lastUpdated)}
            </p>
          )}
        </div>
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto shrink-0">
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all disabled:opacity-50 h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          {filteredRows.length > 0 && tab === 'tabela' && (
            <>
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all h-9 cursor-pointer active:scale-95"
              >
                <FileText className="h-4 w-4" /> PDF
              </button>
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm h-9 cursor-pointer active:scale-95"
              >
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPIs */}
      {!loading && !error && rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          {kpiCards.map(k => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1.5 h-full ${k.color}`} />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1"><Icon className="h-3 w-3" /> {k.label}</span>
                <p className={`text-3xl font-black mt-1 ${k.text}`}>{k.value.toLocaleString('pt-BR')}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabs + escopo de entrega */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-50 dark:bg-slate-950">
          <button
            onClick={() => setTab('tabela')}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${tab === 'tabela' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            <TableIcon className="h-4 w-4" /> Tabela
          </button>
          <button
            onClick={() => setTab('cronograma')}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${tab === 'cronograma' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            <CalendarRange className="h-4 w-4" /> Cronograma
          </button>
        </div>

        {/* Todos / Em aberto (sem MIGO) */}
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-50 dark:bg-slate-950">
          {([['todos', 'Todos'], ['aberto', 'Em aberto']] as [DeliveryScope, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setScope(val)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${scope === val ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              title={val === 'aberto' ? 'Somente itens ainda não entregues (sem MIGO)' : 'Todos os registros'}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <div className="flex flex-col xl:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Busque por RM, PO, item, material, fornecedor ou setor..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 focus:outline-none transition-all"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[160px]">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none"
              >
                <option value="Todos">Status: Todos</option>
                {statusOpts.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="relative min-w-[150px]">
              <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                value={setorFilter}
                onChange={(e) => setSetorFilter(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none"
              >
                <option value="Todos">Setor: Todos</option>
                {setorOpts.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="relative min-w-[120px]">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                value={anoFilter}
                onChange={(e) => setAnoFilter(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none"
              >
                <option value="Todos">Ano: Todos</option>
                {anoOpts.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Loading / erro / vazio */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-20 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl space-y-4">
          <RefreshCw className="h-8 w-8 text-emerald-600 animate-spin" />
          <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Carregando rastreio de compras...</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-3.5 p-5 border border-rose-200 dark:border-rose-900/50 rounded-xl bg-rose-50/50 dark:bg-rose-950/15 text-rose-800 dark:text-rose-300">
          <AlertCircle className="h-6 w-6 text-rose-500 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center p-16 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-center">
          <Route className="h-12 w-12 text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-950/30 p-2.5 rounded-full mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Nenhum registro de compra encontrado</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">
            Os dados de rastreio vêm das requisições SAP importadas. Verifique se a base foi importada em Cadastros SAP.
          </p>
        </div>
      )}

      {/* Conteúdo */}
      {!loading && !error && rows.length > 0 && (
        <>
          {tab === 'tabela' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-550 dark:text-slate-400 px-1 font-bold gap-3">
                <span className="min-w-0 truncate">Exibindo {Math.min(visibleCount, sortedRows.length)} de {sortedRows.length.toLocaleString('pt-BR')} registros</span>
                <div className="relative shrink-0">
                  {showColMenu && <div className="fixed inset-0 z-20" onClick={() => setShowColMenu(false)} />}
                  <button
                    onClick={() => setShowColMenu(!showColMenu)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-all z-30 relative cursor-pointer"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
                    <span className="hidden sm:inline">Personalizar Colunas</span>
                    <ChevronDown className="h-3 w-3 text-slate-400" />
                  </button>
                  {showColMenu && (
                    <div className="absolute right-0 mt-1.5 w-60 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 z-30 p-3 text-left">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Colunas Ativas</span>
                        <button
                          onClick={() => setVisibleColumns(RASTREIO_COLUMNS.reduce((acc, col) => ({ ...acc, [col.id]: true }), {}))}
                          className="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer"
                        >
                          Mostrar Todas
                        </button>
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                        {RASTREIO_COLUMNS.map(col => (
                          <label key={col.id} className="flex items-center space-x-2 px-1.5 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs text-slate-600 dark:text-slate-400 transition-colors">
                            <input
                              type="checkbox"
                              checked={!!visibleColumns[col.id]}
                              onChange={(e) => setVisibleColumns(prev => ({ ...prev, [col.id]: e.target.checked }))}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                            />
                            <span className="font-medium">{col.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {sortedRows.length === 0 ? (
                <div className="flex items-center gap-3 p-6 border border-amber-200 dark:border-amber-900/50 rounded-xl bg-amber-50/50 dark:bg-amber-950/15 text-amber-800 dark:text-amber-300 text-sm font-semibold">
                  <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                  Nenhum registro coincide com os critérios e filtros aplicados.
                </div>
              ) : (
                <>
                  <RastreioTable
                    rows={visibleRows}
                    hoje={hoje}
                    visibleColumns={visibleColumns}
                    sortColumn={sortColumn}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    onOpenRow={setSelectedRow}
                    unreadRis={unreadRis}
                  />
                  {visibleCount < sortedRows.length && (
                    <div className="flex justify-center pt-2">
                      <button
                        onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                        className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all"
                      >
                        <ChevronDown className="h-4 w-4" /> Carregar mais {Math.min(PAGE_SIZE, sortedRows.length - visibleCount)} registros
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'cronograma' && <RastreioCronograma rows={filteredRows} hoje={hoje} onOpenRow={setSelectedRow} unreadRis={unreadRis} />}
        </>
      )}

      {/* Modal de detalhes + conversa */}
      {selectedRow && (
        <RastreioDetailModal
          row={selectedRow}
          user={user}
          hoje={hoje}
          onClose={() => setSelectedRow(null)}
          onThreadRead={refreshUnread}
        />
      )}
    </div>
  );
}
