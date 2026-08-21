/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Acompanhamento de Contratos (ME3N): visão consolidada por documento de
 * contrato — não por item — com foco em vigência: o que está vigente, o que
 * vence em breve e o que já venceu e ainda aparece com saldo em aberto.
 *
 * Cada contrato combina os dados do SAP (ME3N, somente leitura) com campos
 * complementares editáveis por quem gerencia o contrato (Gestor, Escopo, PO,
 * Parcela, Modalidade, Vigência em texto livre, Status) — ver
 * `ContratoDetailModal`, aberto ao clicar na linha.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText, Search, FileSpreadsheet, AlertCircle, RefreshCw, Filter,
  Building2, Clock, CalendarClock, CalendarX2, CalendarCheck2, ListChecks,
  SlidersHorizontal, ChevronDown,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../../db/localDb';
import { ContratoDetalhes, ContratoStatus } from '../../types';
import { agruparContratos, mesclarDetalhes, ContratoComDetalhes, StatusVigencia, DIAS_ALERTA_VENCIMENTO } from '../../lib/contratos';
import { formatBRL, formatDateBR, formatDateTimeBR, formatInt } from '../../lib/format';
import { useChartConfig } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';
import KpiCard from '../charts/KpiCard';
import ContratoDetailModal from './ContratoDetailModal';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ResponsiveContainer } from 'recharts';
import {
  TableShell, TableHeadRow, TableBody, SortableTh, Tr, Td, TableSkeleton, TableEmpty, TableFooter,
} from '../ui/DataTable';

type SortDir = 'asc' | 'desc';

const VIGENCIA_OPTIONS: StatusVigencia[] = ['Vencido', 'Vencendo em breve', 'Vigente', 'Sem vigência informada'];
const STATUS_OPTIONS: ContratoStatus[] = ['Ativo', 'Inativo', 'Em Processamento'];

const PAGE_SIZE = 50;

interface ColumnDef {
  id: string;
  label: string;
  align?: 'left' | 'right';
}

const COLUMNS: ColumnDef[] = [
  { id: 'documento', label: 'N° Contrato' },
  { id: 'po', label: 'PO - Pedido de Compra' },
  { id: 'cod_forn', label: 'Código do Fornecedor' },
  { id: 'gestor', label: 'Gestor' },
  { id: 'vigencia_label', label: 'Vigência do Contrato' },
  { id: 'fornecedor', label: 'Fornecedor' },
  { id: 'escopo', label: 'Escopo do Serviço' },
  { id: 'inicio', label: 'Início do Contrato' },
  { id: 'fim', label: 'Final do Contrato' },
  { id: 'valor_global', label: 'Valor Global', align: 'right' },
  { id: 'parcela', label: 'Parcela', align: 'right' },
  { id: 'modalidade', label: 'Modalidade' },
  { id: 'status', label: 'Status' },
];

const STORAGE_COLS_KEY = 'sisten_contratos_visible_columns';

function useVigenciaColor() {
  const c = useChartConfig();
  return (status: StatusVigencia): string => {
    switch (status) {
      case 'Vigente': return c.tokens.status.good;
      case 'Vencendo em breve': return c.tokens.status.warning;
      case 'Vencido': return c.tokens.status.critical;
      default: return c.tokens.inkMuted;
    }
  };
}

function useStatusExibidoColor() {
  const c = useChartConfig();
  return (status: ContratoStatus): string => {
    switch (status) {
      case 'Ativo': return c.tokens.status.good;
      case 'Em Processamento': return c.tokens.status.warning;
      case 'Inativo': return c.tokens.status.critical;
      default: return c.tokens.inkMuted;
    }
  };
}

function Badge({ label, cor }: { label: string; cor: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
      style={{ color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor }} />
      {label}
    </span>
  );
}

export default function TabContratosLista() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contratosBase, setContratosBase] = useState<ReturnType<typeof agruparContratos>>([]);
  const [detalhesList, setDetalhesList] = useState<ContratoDetalhes[]>([]);
  const [selecionado, setSelecionado] = useState<ContratoComDetalhes | null>(null);

  const contratos = useMemo(() => mesclarDetalhes(contratosBase, detalhesList), [contratosBase, detalhesList]);

  // Data/hora da última importação SAP (planilha ME3N).
  const lastUpdated = useMemo(() => {
    const sapDate = localDb.getDatasetUpdatedAt('contratos');
    if (sapDate) return sapDate;
    let max = '';
    contratosBase.forEach(c => c.itens.forEach(it => { if (it.imported_at && it.imported_at > max) max = it.imported_at; }));
    return max || null;
  }, [contratosBase]);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [vigenciaFilter, setVigenciaFilter] = useState<'Todos' | StatusVigencia>('Todos');
  const [statusFilter, setStatusFilter] = useState<'Todos' | ContratoStatus>('Todos');
  const [fornecedorFilter, setFornecedorFilter] = useState('Todos');
  const [centroFilter, setCentroFilter] = useState('Todos');

  // Ordenação: por padrão, o mais urgente (menos dias para vencer) primeiro.
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Colunas visíveis (todas por padrão; mescla com preferências salvas).
  const [showColMenu, setShowColMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const defaults = COLUMNS.reduce((acc, col) => ({ ...acc, [col.id]: true }), {} as Record<string, boolean>);
    const saved = localStorage.getItem(STORAGE_COLS_KEY);
    if (saved) {
      try { return { ...defaults, ...JSON.parse(saved) }; } catch {}
    }
    return defaults;
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_COLS_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const vigenciaColor = useVigenciaColor();
  const statusExibidoColor = useStatusExibidoColor();

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      let linhas;
      try {
        linhas = await localDb.fetchContratos(force);
      } catch (netErr) {
        console.warn('Falha ao buscar contratos ao vivo; usando cache local.', netErr);
        linhas = localDb.getContratos();
      }
      let detalhes: ContratoDetalhes[];
      try {
        detalhes = await localDb.fetchContratosDetalhes(force);
      } catch (netErr) {
        console.warn('Falha ao buscar detalhes de contratos ao vivo; usando cache local.', netErr);
        detalhes = localDb.getContratosDetalhes();
      }
      setContratosBase(agruparContratos(linhas));
      setDetalhesList(detalhes);
    } catch (e) {
      console.error('Erro ao montar contratos:', e);
      setError('Falha ao carregar os contratos. Tente atualizar novamente.');
      setContratosBase([]);
      setDetalhesList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const fornecedorOptions = useMemo(() => {
    const s = new Set<string>();
    contratos.forEach(c => { if (c.fornecedor && c.fornecedor !== '—') s.add(c.fornecedor); });
    return Array.from(s).sort();
  }, [contratos]);

  const centroOptions = useMemo(() => {
    const s = new Set<string>();
    contratos.forEach(c => { if (c.centro && c.centro !== '—') s.add(c.centro); });
    return Array.from(s).sort();
  }, [contratos]);

  const filteredContratos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return contratos.filter(c => {
      if (vigenciaFilter !== 'Todos' && c.status_vigencia !== vigenciaFilter) return false;
      if (statusFilter !== 'Todos' && c.status_exibido !== statusFilter) return false;
      if (fornecedorFilter !== 'Todos' && c.fornecedor !== fornecedorFilter) return false;
      if (centroFilter !== 'Todos' && c.centro !== centroFilter) return false;
      if (q) {
        const hit =
          c.documento_compras.toLowerCase().includes(q) ||
          c.fornecedor.toLowerCase().includes(q) ||
          c.requisitante.toLowerCase().includes(q) ||
          (c.detalhes?.gestor || '').toLowerCase().includes(q) ||
          (c.detalhes?.escopo_servico || '').toLowerCase().includes(q) ||
          (c.detalhes?.po_pedido_compra || '').toLowerCase().includes(q) ||
          c.itens.some(i => (i.material || '').toLowerCase().includes(q) || (i.texto_breve || '').toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [contratos, searchQuery, vigenciaFilter, statusFilter, fornecedorFilter, centroFilter]);

  const sortedContratos = useMemo(() => {
    const arr = [...filteredContratos];
    if (sortColumn) {
      const getVal = (c: ContratoComDetalhes): string | number => {
        switch (sortColumn) {
          case 'documento': return c.documento_compras;
          case 'po': return c.detalhes?.po_pedido_compra || '';
          case 'cod_forn': return c.detalhes?.codigo_fornecedor || '';
          case 'gestor': return (c.detalhes?.gestor || '').toLowerCase();
          case 'vigencia_label': return (c.detalhes?.vigencia_label || '').toLowerCase();
          case 'fornecedor': return c.fornecedor.toLowerCase();
          case 'escopo': return (c.detalhes?.escopo_servico || '').toLowerCase();
          case 'inicio': return c.inicio_validade || '';
          case 'fim': return c.fim_validade || '';
          case 'valor_global': return c.valor_efetivo;
          case 'parcela': return c.detalhes?.valor_parcela ?? -Infinity;
          case 'modalidade': return c.detalhes?.modalidade || '';
          case 'status': return c.status_exibido;
          default: return '';
        }
      };
      const dir = sortDir === 'asc' ? 1 : -1;
      arr.sort((a, b) => {
        const va = getVal(a), vb = getVal(b);
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * dir;
      });
    } else {
      // Sem ordenação escolhida: urgência primeiro (vencidos e vencendo em
      // breve no topo), depois por dias para vencer crescente.
      const ordemStatus: Record<StatusVigencia, number> = {
        'Vencido': 0, 'Vencendo em breve': 1, 'Vigente': 2, 'Sem vigência informada': 3,
      };
      arr.sort((a, b) => {
        const s = ordemStatus[a.status_vigencia] - ordemStatus[b.status_vigencia];
        if (s !== 0) return s;
        return (a.dias_para_vencer ?? Infinity) - (b.dias_para_vencer ?? Infinity);
      });
    }
    return arr;
  }, [filteredContratos, sortColumn, sortDir]);

  const visibleContratos = useMemo(() => sortedContratos.slice(0, visibleCount), [sortedContratos, visibleCount]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchQuery, vigenciaFilter, statusFilter, fornecedorFilter, centroFilter, sortColumn, sortDir]);

  const toggleSort = (col: string) => {
    if (sortColumn === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(col); setSortDir('asc'); }
  };

  // KPIs — sobre o total (não o filtro), para o painel sempre mostrar a
  // situação geral da carteira de contratos; a lista abaixo é que reage ao filtro.
  const kpis = useMemo(() => {
    const vencidos = contratos.filter(c => c.status_vigencia === 'Vencido');
    const vencendo = contratos.filter(c => c.status_vigencia === 'Vencendo em breve');
    const vigentes = contratos.filter(c => c.status_vigencia === 'Vigente');
    return {
      total: contratos.length,
      vencidos: vencidos.length,
      vencendo: vencendo.length,
      vigentes: vigentes.length,
    };
  }, [contratos]);

  const statusChartData = useMemo(() => {
    return VIGENCIA_OPTIONS.map(status => ({
      status,
      quantidade: contratos.filter(c => c.status_vigencia === status).length,
      cor: vigenciaColor(status),
    })).filter(d => d.quantidade > 0);
  }, [contratos, vigenciaColor]);

  const handleExportExcel = () => {
    if (filteredContratos.length === 0) return;
    const data = filteredContratos.map(c => ({
      'N° Contrato': c.documento_compras,
      'PO - Pedido de Compra': c.detalhes?.po_pedido_compra || '—',
      'Código do Fornecedor': c.detalhes?.codigo_fornecedor || '—',
      'Gestor': c.detalhes?.gestor || '—',
      'Vigência do Contrato': c.detalhes?.vigencia_label || '—',
      'Fornecedor': c.fornecedor,
      'Escopo do Serviço': c.detalhes?.escopo_servico || '—',
      'Início do Contrato': formatDateBR(c.inicio_validade),
      'Final do Contrato': formatDateBR(c.fim_validade),
      'Valor Global': c.valor_efetivo,
      'Parcela': c.detalhes?.valor_parcela ?? '—',
      'Modalidade': c.detalhes?.modalidade || '—',
      'Status': c.status_exibido,
      'Vigência (calculada)': c.status_vigencia,
      'Itens': c.itens.length,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contratos');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    XLSX.writeFile(wb, `contratos_${timestamp}.xlsx`);
  };

  const handleSaved = (novosDetalhes: ContratoDetalhes) => {
    setDetalhesList(prev => [...prev.filter(d => d.documento_compras !== novosDetalhes.documento_compras), novosDetalhes]);
  };

  return (
    <div className="space-y-6 select-text">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-slate-555 dark:text-slate-400">
            Acompanhamento dos contratos de fornecimento (ME3N) e das respectivas vigências. Clique num contrato para editar Gestor, Escopo, Parcela, Modalidade, Vigência, Status e anexar documentos.
          </p>
          {lastUpdated && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 flex items-center gap-1 font-medium">
              <Clock className="h-3 w-3" /> {localDb.getDatasetUpdateBadge('contratos')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 lg:overflow-x-auto shrink-0">
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all disabled:opacity-50 h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          {filteredContratos.length > 0 && (
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm h-9 cursor-pointer active:scale-95"
            >
              <FileSpreadsheet className="h-4 w-4" /> Exportar
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      {!loading && !error && contratos.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <KpiCard
            label="Total de Contratos"
            value={kpis.total}
            format={formatInt}
            icon={ListChecks}
            accent="var(--brand)"
            onClick={() => { setVigenciaFilter('Todos'); }}
          />
          <KpiCard
            label="Vigentes"
            value={kpis.vigentes}
            format={formatInt}
            icon={CalendarCheck2}
            accent="var(--status-good)"
            share={kpis.total > 0 ? kpis.vigentes / kpis.total : undefined}
            onClick={() => setVigenciaFilter('Vigente')}
          />
          <KpiCard
            label={`Vencendo em ${DIAS_ALERTA_VENCIMENTO} dias`}
            value={kpis.vencendo}
            format={formatInt}
            icon={CalendarClock}
            accent="var(--status-warning)"
            share={kpis.total > 0 ? kpis.vencendo / kpis.total : undefined}
            onClick={() => setVigenciaFilter('Vencendo em breve')}
          />
          <KpiCard
            label="Vencidos"
            value={kpis.vencidos}
            format={formatInt}
            icon={CalendarX2}
            accent="var(--status-critical)"
            share={kpis.total > 0 ? kpis.vencidos / kpis.total : undefined}
            onClick={() => setVigenciaFilter('Vencido')}
          />
        </div>
      )}

      {/* Gráfico de distribuição por status de vigência */}
      {!loading && !error && contratos.length > 0 && (
        <StatusVigenciaChart data={statusChartData} onSelecionar={(s) => setVigenciaFilter(s as StatusVigencia)} />
      )}

      {/* Filtros */}
      <div className="rounded-xl border border-slate-250 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <div className="flex flex-col xl:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Busque por documento, fornecedor, gestor, escopo, PO ou material..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 focus:outline-none transition-all"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 xl:flex-wrap">
            <div className="relative shrink-0 w-[140px] xl:w-auto xl:min-w-[140px]">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-455 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none truncate"
              >
                <option value="Todos">Status: Todos</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="relative shrink-0 w-[170px] xl:w-auto xl:min-w-[170px]">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-455 pointer-events-none" />
              <select
                value={vigenciaFilter}
                onChange={(e) => setVigenciaFilter(e.target.value as any)}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none truncate"
              >
                <option value="Todos">Vigência: Todas</option>
                {VIGENCIA_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="relative shrink-0 w-[170px] xl:w-auto xl:min-w-[160px]">
              <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-450 pointer-events-none" />
              <select
                value={fornecedorFilter}
                onChange={(e) => setFornecedorFilter(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none truncate"
              >
                <option value="Todos">Fornecedor: Todos</option>
                {fornecedorOptions.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="relative shrink-0 w-[130px] xl:w-auto xl:min-w-[130px]">
              <select
                value={centroFilter}
                onChange={(e) => setCentroFilter(e.target.value)}
                className="w-full pl-3 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none truncate"
              >
                <option value="Todos">Centro: Todos</option>
                {centroOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Loading / erro / vazio */}
      {loading && <TableSkeleton columns={COLUMNS.filter(c => visibleColumns[c.id]).length || 8} />}

      {!loading && error && (
        <div
          className="flex items-center gap-3.5 p-5 border rounded-xl"
          style={{
            borderColor: 'var(--status-critical)',
            background: 'color-mix(in srgb, var(--status-critical) 8%, transparent)',
            color: 'var(--ink-primary)',
          }}
        >
          <AlertCircle className="h-6 w-6 shrink-0" style={{ color: 'var(--status-critical)' }} />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {!loading && !error && contratos.length === 0 && (
        <TableEmpty
          icon={FileText}
          title="Nenhum contrato encontrado"
          hint="Importe a base de contratos (ME3N) em Importar SAP para preencher esta página."
        />
      )}

      {/* Conteúdo */}
      {!loading && !error && contratos.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-550 dark:text-slate-455 px-1 font-bold">
            <span>Exibindo {Math.min(visibleCount, sortedContratos.length)} de {sortedContratos.length} contratos</span>

            {/* Personalizar colunas */}
            <div className="relative">
              {showColMenu && (
                <div className="fixed inset-0 z-20" onClick={() => setShowColMenu(false)} />
              )}
              <button
                onClick={() => setShowColMenu(!showColMenu)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-705 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-all z-30 relative cursor-pointer"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
                <span>Personalizar Colunas</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>
              {showColMenu && (
                <div className="absolute right-0 mt-1.5 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 z-30 p-3 text-left">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Colunas Ativas</span>
                    <button
                      onClick={() => setVisibleColumns(COLUMNS.reduce((acc, col) => ({ ...acc, [col.id]: true }), {}))}
                      className="text-[10px] text-blue-650 hover:underline font-semibold cursor-pointer"
                    >
                      Mostrar Todas
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                    {COLUMNS.map((col) => (
                      <label
                        key={col.id}
                        className="flex items-center space-x-2 px-1.5 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs text-slate-600 dark:text-slate-400 transition-colors"
                      >
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

          {sortedContratos.length === 0 && (
            <div className="flex items-center gap-3 p-6 border border-amber-200 dark:border-amber-900/50 rounded-xl bg-amber-50/50 dark:bg-amber-955/15 text-amber-800 dark:text-amber-300 text-sm font-semibold">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              Nenhum contrato coincide com os critérios e filtros aplicados atualmente.
            </div>
          )}

          {sortedContratos.length > 0 && (
            <>
              <TableShell>
                <table className="w-full text-xs">
                  <TableHeadRow>
                    {COLUMNS.map(col => visibleColumns[col.id] && (
                      <SortableTh key={col.id} col={col.id} label={col.label} align={col.align} sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                    ))}
                  </TableHeadRow>
                  <TableBody>
                    {visibleContratos.map(c => (
                      <Tr key={c.documento_compras} onClick={() => setSelecionado(c)}>
                        {visibleColumns.documento && <Td mono strong>{c.documento_compras}</Td>}
                        {visibleColumns.po && <Td mono>{c.detalhes?.po_pedido_compra || '—'}</Td>}
                        {visibleColumns.cod_forn && <Td mono>{c.detalhes?.codigo_fornecedor || '—'}</Td>}
                        {visibleColumns.gestor && <Td truncate title={c.detalhes?.gestor || ''} className="max-w-[140px]">{c.detalhes?.gestor || '—'}</Td>}
                        {visibleColumns.vigencia_label && <Td truncate title={c.detalhes?.vigencia_label || ''} className="max-w-[130px]">{c.detalhes?.vigencia_label || '—'}</Td>}
                        {visibleColumns.fornecedor && <Td strong truncate title={c.fornecedor} className="max-w-[200px]">{c.fornecedor}</Td>}
                        {visibleColumns.escopo && <Td truncate title={c.detalhes?.escopo_servico || ''} className="max-w-[200px]">{c.detalhes?.escopo_servico || '—'}</Td>}
                        {visibleColumns.inicio && <Td numeric className="whitespace-nowrap">{formatDateBR(c.inicio_validade)}</Td>}
                        {visibleColumns.fim && <Td numeric className="whitespace-nowrap">{formatDateBR(c.fim_validade)}</Td>}
                        {visibleColumns.valor_global && <Td align="right" numeric strong className="whitespace-nowrap">{formatBRL(c.valor_efetivo)}</Td>}
                        {visibleColumns.parcela && <Td align="right" numeric className="whitespace-nowrap">{c.detalhes?.valor_parcela != null ? formatBRL(c.detalhes.valor_parcela) : '—'}</Td>}
                        {visibleColumns.modalidade && <Td>{c.detalhes?.modalidade || '—'}</Td>}
                        {visibleColumns.status && <Td><Badge label={c.status_exibido} cor={statusExibidoColor(c.status_exibido)} /></Td>}
                      </Tr>
                    ))}
                  </TableBody>
                </table>
              </TableShell>

              <TableFooter
                shown={visibleContratos.length}
                total={sortedContratos.length}
                loadStep={PAGE_SIZE}
                onLoadMore={visibleCount < sortedContratos.length ? () => setVisibleCount(c => c + PAGE_SIZE) : undefined}
              />
            </>
          )}
        </div>
      )}

      {selecionado && (
        <ContratoDetailModal
          contrato={selecionado}
          onClose={() => setSelecionado(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

interface StatusVigenciaChartProps {
  data: { status: string; quantidade: number; cor: string }[];
  onSelecionar?: (status: string) => void;
}

function StatusVigenciaChart({ data, onSelecionar }: StatusVigenciaChartProps) {
  const c = useChartConfig();
  const total = data.reduce((s, d) => s + d.quantidade, 0);

  function TooltipConteudo({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <ChartTooltip
        title={row.status}
        rows={[{ color: row.cor, label: 'Contratos', value: formatInt(row.quantidade) }]}
        footer={onSelecionar ? 'Clique para filtrar a lista' : undefined}
      />
    );
  }

  return (
    <ChartCard
      title="Contratos por Vigência"
      icon={FileText}
      description="Distribuição da carteira de contratos entre vigentes, vencendo em breve e vencidos, pelas datas do SAP."
      height={220}
      empty={total === 0}
      emptyMessage="Nenhum contrato no filtro selecionado."
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 0, bottom: 4 }}>
          <CartesianGrid {...c.grid} vertical horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...c.yAxis} />
          <YAxis type="category" dataKey="status" {...c.xAxis} width={140} />
          <Tooltip content={<TooltipConteudo />} cursor={c.cursor} />
          <Bar
            dataKey="quantidade"
            radius={c.radius.right}
            maxBarSize={30}
            cursor={onSelecionar ? 'pointer' : undefined}
            onClick={(d: any) => onSelecionar?.(d?.status)}
            {...c.animation}
          >
            {data.map(d => <Cell key={d.status} fill={d.cor} />)}
            <LabelList
              dataKey="quantidade"
              position="right"
              formatter={(v: number) => (v > 0 ? formatInt(v) : '')}
              style={c.labelOnSurface}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
