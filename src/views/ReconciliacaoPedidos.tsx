/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Painel de Reconciliação de Pedidos (PO x MIRO x Contas a Pagar FBL1N).
 * Permite acompanhar de ponta a ponta se as notas fiscais faturadas de cada
 * pedido já foram pagas/compensadas ou se possuem pendências financeiras,
 * com identificação completa dos materiais adquiridos.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileSpreadsheet, Search, Building2, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronRight, ChevronsUpDown, RefreshCw, Wallet, CalendarClock,
  ListChecks, Percent, FileCheck, X, AlertCircle, FileText, Check, Package
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../db/supabaseClient';
import { localDb } from '../db/localDb';
import { Profile } from '../types';
import { formatBRL, formatDateBR, formatPct } from '../lib/format';
import KpiCard from '../components/charts/KpiCard';
import MultiSelectFilter from '../components/ui/MultiSelectFilter';
import {
  TableShell, TableHeadRow, TableBody, Th, SortableTh, Td, TableSkeleton, TableFooter,
} from '../components/ui/DataTable';

interface ReconciliacaoPedidosProps {
  user: Profile;
}

export interface PedidoConciliacao {
  numero_pedido: string;
  empresa: string | null;
  centro: string | null;
  fornecedor: string | null;
  razao_social_fornecedor: string;
  data_criacao_pedido: string | null;
  data_aprovacao_pedido: string | null;
  qtd_nfs: number;
  qtd_miros: number;
  qtd_itens: number;
  qtd_materiais: number;
  materiais_nomes: string | null;
  valor_pedido: number;
  total_faturado_miro: number;
  total_pago: number;
  total_em_aberto: number;
  qtd_nfs_pagas: number;
  qtd_nfs_abertas: number;
  status_pagamento: 'TOTALMENTE PAGO' | 'PARCIALMENTE PAGO' | 'EM ABERTO' | 'PENDENTE FATURAMENTO';
}

export interface PedidoConciliacaoItem {
  id: number;
  numero_pedido: string;
  item: string | null;
  material: string | null;
  material_codigo: string | null;
  material_descricao: string | null;
  empresa: string | null;
  centro: string | null;
  fornecedor: string | null;
  razao_social_fornecedor: string | null;
  doc_migo: string | null;
  data_lancamento_migo: string | null;
  qtd_migo: number | null;
  montante_migo: number | null;
  doc_miro: string | null;
  ano_miro: string | null;
  data_lancamento_miro: string | null;
  data_documento_miro: string | null;
  nf_referencia: string | null;
  qtd_miro: number | null;
  montante_miro: number | null;
  numero_doc_contabil: string | null;
  doc_fbl1n: string | null;
  tipo_documento: string | null;
  data_lancamento_fbl1n: string | null;
  vencimento_liquido: string | null;
  doc_compensacao: string | null;
  data_compensacao: string | null;
  data_pagamento: string | null;
  doc_pagamento: string | null;
  status_nf: 'PAGO' | 'EM ABERTO' | 'VENCIDO' | 'PENDENTE FATURAMENTO';
}

type StatusFilter = 'Todos' | 'TOTALMENTE PAGO' | 'PARCIALMENTE PAGO' | 'EM ABERTO' | 'PENDENTE FATURAMENTO' | 'PENDENCIAS';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

export default function ReconciliacaoPedidos({ user: _user }: ReconciliacaoPedidosProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<PedidoConciliacao[]>([]);
  const [detalhesPorPedido, setDetalhesPorPedido] = useState<Record<string, PedidoConciliacaoItem[]>>({});
  const [loadingDetalhes, setLoadingDetalhes] = useState<Record<string, boolean>>({});

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [fornecedorSel, setFornecedorSel] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Todos');

  // Expansão de linhas
  const [expandedPedidos, setExpandedPedidos] = useState<Record<string, boolean>>({});

  // Paginação e Ordenação
  const [sortColumn, setSortColumn] = useState<string>('numero_pedido');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allRows: PedidoConciliacao[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error: fetchError } = await (supabase as any)
          .from('vw_pedidos_conciliacao_pagamentos')
          .select('*')
          .order('numero_pedido', { ascending: false })
          .range(from, from + pageSize - 1);

        if (fetchError) throw fetchError;
        if (!data || data.length === 0) break;
        allRows.push(...(data as PedidoConciliacao[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }

      setPedidos(allRows);
    } catch (e) {
      console.error('Erro ao carregar reconciliação de pedidos:', e);
      setError('Falha ao carregar a conciliação de pedidos. Tente atualizar novamente.');
      setPedidos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Carrega os detalhes de um pedido sob demanda ao expandir
  const fetchDetalhesPedido = useCallback(async (numPedido: string) => {
    if (detalhesPorPedido[numPedido] || loadingDetalhes[numPedido]) return;

    setLoadingDetalhes(prev => ({ ...prev, [numPedido]: true }));
    try {
      const { data, error: fetchError } = await (supabase as any)
        .from('vw_pedidos_conciliacao_detalhes')
        .select('*')
        .eq('numero_pedido', numPedido)
        .order('id', { ascending: true });

      if (fetchError) throw fetchError;
      setDetalhesPorPedido(prev => ({
        ...prev,
        [numPedido]: ((data as unknown) as PedidoConciliacaoItem[]) || [],
      }));
    } catch (err) {
      console.error(`Erro ao carregar detalhes do pedido ${numPedido}:`, err);
    } finally {
      setLoadingDetalhes(prev => ({ ...prev, [numPedido]: false }));
    }
  }, [detalhesPorPedido, loadingDetalhes]);

  const togglePedido = (numPedido: string) => {
    const isExpanding = !expandedPedidos[numPedido];
    setExpandedPedidos(prev => ({
      ...prev,
      [numPedido]: isExpanding,
    }));

    if (isExpanding) {
      fetchDetalhesPedido(numPedido);
    }
  };

  const expandAll = async () => {
    const next: Record<string, boolean> = {};
    filtered.slice(0, visibleCount).forEach(p => {
      next[p.numero_pedido] = true;
      fetchDetalhesPedido(p.numero_pedido);
    });
    setExpandedPedidos(next);
  };

  const collapseAll = () => {
    setExpandedPedidos({});
  };

  // Opções de Fornecedores para o MultiSelectFilter
  const fornecedorOptions = useMemo(() => {
    const s = new Set<string>();
    pedidos.forEach(p => {
      if (p.razao_social_fornecedor) s.add(p.razao_social_fornecedor.trim());
      else if (p.fornecedor) s.add(p.fornecedor.trim());
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [pedidos]);

  const fornecedorCodigoMap = useMemo(() => {
    const map = new Map<string, string>();
    pedidos.forEach(p => {
      const nome = p.razao_social_fornecedor?.trim();
      if (nome && p.fornecedor && p.fornecedor !== nome) {
        map.set(nome, p.fornecedor);
      }
    });
    return map;
  }, [pedidos]);

  const renderFornecedorOption = useCallback((name: string) => {
    const cod = fornecedorCodigoMap.get(name);
    return cod ? `${name} (${cod})` : name;
  }, [fornecedorCodigoMap]);

  // Filtragem com suporte a Material
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return pedidos.filter(p => {
      // Filtro de Fornecedor
      if (fornecedorSel.size > 0) {
        const nome = p.razao_social_fornecedor?.trim() || p.fornecedor?.trim() || '';
        if (!fornecedorSel.has(nome)) return false;
      }

      // Filtro de Status
      if (statusFilter === 'PENDENCIAS') {
        if (p.status_pagamento === 'TOTALMENTE PAGO') return false;
      } else if (statusFilter !== 'Todos') {
        if (p.status_pagamento !== statusFilter) return false;
      }

      // Busca por texto (Nº Pedido, Razão Social, Cód Fornecedor, Nome de Material)
      if (q) {
        const matchPedido = p.numero_pedido?.toLowerCase().includes(q);
        const matchRazao = (p.razao_social_fornecedor || '').toLowerCase().includes(q);
        const matchForn = (p.fornecedor || '').toLowerCase().includes(q);
        const matchMaterial = (p.materiais_nomes || '').toLowerCase().includes(q);
        if (!matchPedido && !matchRazao && !matchForn && !matchMaterial) return false;
      }

      return true;
    });
  }, [pedidos, fornecedorSel, statusFilter, searchQuery]);

  // Ordenação
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let valA = a[sortColumn as keyof PedidoConciliacao];
      let valB = b[sortColumn as keyof PedidoConciliacao];

      if (valA === null || valA === undefined) valA = '';
      if (valB === null || valB === undefined) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDir === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortDir === 'asc' ? strA.localeCompare(strB, 'pt-BR') : strB.localeCompare(strA, 'pt-BR');
    });
  }, [filtered, sortColumn, sortDir]);

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDir('asc');
    }
  };

  // KPIs
  const kpis = useMemo(() => {
    const totalPedidos = filtered.length;
    const totalFaturado = filtered.reduce((acc, p) => acc + (Number(p.total_faturado_miro) || 0), 0);
    const totalPago = filtered.reduce((acc, p) => acc + (Number(p.total_pago) || 0), 0);
    const totalAberto = filtered.reduce((acc, p) => acc + (Number(p.total_em_aberto) || 0), 0);
    const taxaLiquidada = totalFaturado > 0 ? (totalPago / totalFaturado) * 100 : 0;

    const totalTotalmentePagos = filtered.filter(p => p.status_pagamento === 'TOTALMENTE PAGO').length;
    const totalParcialmentePagos = filtered.filter(p => p.status_pagamento === 'PARCIALMENTE PAGO').length;
    const totalEmAberto = filtered.filter(p => p.status_pagamento === 'EM ABERTO').length;
    const totalPendencias = totalParcialmentePagos + totalEmAberto;

    return {
      totalPedidos,
      totalFaturado,
      totalPago,
      totalAberto,
      taxaLiquidada,
      totalTotalmentePagos,
      totalParcialmentePagos,
      totalEmAberto,
      totalPendencias,
    };
  }, [filtered]);

  // Exportação Excel
  const handleExportExcel = async () => {
    if (filtered.length === 0) return;

    // Aba Consolidada por Pedido com Materiais
    const rowsConsolidado = filtered.map(p => ({
      'Nº Pedido (PO)': p.numero_pedido,
      'Fornecedor': p.razao_social_fornecedor,
      'Cód. Fornecedor': p.fornecedor || '—',
      'Empresa': p.empresa || '—',
      'Centro': p.centro || '—',
      'Materiais': p.materiais_nomes || '—',
      'Qtd. NFs Faturadas': p.qtd_nfs,
      'Total Faturado (R$)': Number(p.total_faturado_miro) || 0,
      'Total Já Pago (R$)': Number(p.total_pago) || 0,
      'Total em Aberto (R$)': Number(p.total_em_aberto) || 0,
      'NFs Pagas': p.qtd_nfs_pagas,
      'NFs em Aberto': p.qtd_nfs_abertas,
      'Status do Pedido': p.status_pagamento,
    }));

    const wb = XLSX.utils.book_new();
    const wsConsolidado = XLSX.utils.json_to_sheet(rowsConsolidado);
    XLSX.utils.book_append_sheet(wb, wsConsolidado, 'Pedidos_Consolidado');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    XLSX.writeFile(wb, `reconciliacao_pedidos_${timestamp}.xlsx`);
  };

  const getStatusBadge = (status: PedidoConciliacao['status_pagamento'], p?: PedidoConciliacao) => {
    switch (status) {
      case 'TOTALMENTE PAGO':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/80 shadow-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            Totalmente Pago
          </span>
        );
      case 'PARCIALMENTE PAGO':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800/80 shadow-xs">
            <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            Parcialmente Pago {p ? `(${p.qtd_nfs_pagas}/${p.qtd_nfs})` : ''}
          </span>
        );
      case 'EM ABERTO':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-800/80 shadow-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
            Em Aberto
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            Pendente Faturamento
          </span>
        );
    }
  };

  const getNfStatusBadge = (status: PedidoConciliacaoItem['status_nf']) => {
    switch (status) {
      case 'PAGO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <Check className="h-3 w-3" /> Paga
          </span>
        );
      case 'VENCIDO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            <AlertTriangle className="h-3 w-3" /> Vencida
          </span>
        );
      case 'EM ABERTO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <Clock className="h-3 w-3" /> A Vencer
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            Pendente
          </span>
        );
    }
  };

  const allExpanded = useMemo(() => {
    if (filtered.length === 0) return false;
    return filtered.slice(0, visibleCount).every(p => expandedPedidos[p.numero_pedido]);
  }, [filtered, expandedPedidos, visibleCount]);

  const lastUpdated = useMemo(() => localDb.getDatasetUpdatedAt('zl0170_miro') || localDb.getDatasetUpdatedAt('fbl1n_c_pagar'), [pedidos]);

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      {/* Cabeçalho */}
      <div className="border-b border-slate-200/80 dark:border-slate-800 pb-5 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-slate-50 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80">
              <FileCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            Reconciliação de Pedidos (PO x MIRO x Pgto)
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
            Rastreamento de liquidação financeira de pedidos: acompanhe se todas as notas fiscais faturadas (MIRO) já foram pagas/compensadas (FBL1N) com detalhamento dos materiais.
          </p>
        </div>
        {lastUpdated && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-100/80 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>Atualizado: {localDb.getDatasetUpdateBadge('zl0170_miro')}</span>
          </div>
        )}
      </div>

      {/* Cards de KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <KpiCard
          label="Pedidos Analisados"
          value={kpis.totalPedidos}
          format={(v) => `${Math.round(v)} pedido(s)`}
          icon={ListChecks}
          accent="var(--brand)"
        />
        <KpiCard
          label="Total Faturado (MIRO)"
          value={kpis.totalFaturado}
          format={formatBRL}
          icon={Wallet}
          accent="#0284c7"
        />
        <KpiCard
          label="Total Já Pago"
          value={kpis.totalPago}
          format={formatBRL}
          icon={CheckCircle2}
          accent="#10b981"
        />
        <KpiCard
          label="Total em Aberto"
          value={kpis.totalAberto}
          format={formatBRL}
          icon={CalendarClock}
          accent="#f43f5e"
        />
        <KpiCard
          label="Taxa Geral Liquidada"
          value={kpis.taxaLiquidada}
          format={(v) => formatPct(v)}
          icon={Percent}
          accent="#8b5cf6"
        />
      </div>

      {/* Barra de Filtros e Ações */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/70 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar -mx-2 px-2 sm:mx-0 sm:px-0 flex-wrap">
          {/* Busca Rápida (Nº PO, Fornecedor ou Material) */}
          <div className="relative shrink-0 w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar Nº PO, Fornecedor ou Material..."
              className="pl-9 pr-8 py-2 border rounded-lg text-xs h-9 w-full bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 transition-all shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                title="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* MultiSelect de Fornecedor */}
          <MultiSelectFilter
            label="Fornecedor"
            icon={Building2}
            allLabel="Todos"
            searchable
            options={fornecedorOptions}
            selected={fornecedorSel}
            onChange={setFornecedorSel}
            renderOption={renderFornecedorOption}
            className="shrink-0 w-64 sm:w-auto sm:min-w-[220px]"
            panelClassName="w-80 sm:w-96 max-h-80"
          />

          {/* Seletor de Status */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 border rounded-lg text-xs h-9 shrink-0 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 transition-all shadow-xs font-medium cursor-pointer"
          >
            <option value="Todos">Todos os Status ({kpis.totalPedidos})</option>
            <option value="TOTALMENTE PAGO">Totalmente Pago ({kpis.totalTotalmentePagos})</option>
            <option value="PARCIALMENTE PAGO">Parcialmente Pago ({kpis.totalParcialmentePagos})</option>
            <option value="EM ABERTO">Totalmente em Aberto ({kpis.totalEmAberto})</option>
            <option value="PENDENCIAS">Com Pendências ({kpis.totalPendencias})</option>
          </select>

          {/* Botão de Atalho "Com Pendências" */}
          <button
            onClick={() => setStatusFilter(prev => prev === 'PENDENCIAS' ? 'Todos' : 'PENDENCIAS')}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-bold transition-all cursor-pointer h-9 shrink-0 whitespace-nowrap shadow-xs ${
              statusFilter === 'PENDENCIAS'
                ? 'bg-amber-500 text-white border-amber-500 shadow-amber-500/20'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800/80 hover:bg-amber-100 dark:hover:bg-amber-900/40'
            }`}
            title="Filtrar pedidos com pendências de pagamento"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Pendentes de Pgto ({kpis.totalPendencias})
          </button>
        </div>

        {/* Ações à Direita */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={allExpanded ? collapseAll : expandAll}
            className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-all shadow-xs h-9 cursor-pointer"
            title={allExpanded ? 'Recolher todos os pedidos' : 'Expandir todos os pedidos'}
          >
            <ChevronsUpDown className="h-3.5 w-3.5 text-slate-500" />
            {allExpanded ? 'Recolher Tudo' : 'Expandir Tudo'}
          </button>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm h-9 cursor-pointer"
            title="Exportar dados para planilha Excel"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar Excel
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-600 border border-rose-200 dark:border-rose-900/60">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Tabela Principal */}
      <TableShell maxHeight="72vh">
        <table className="w-full text-xs border-collapse">
          <TableHeadRow>
            <SortableTh col="numero_pedido" label="Nº Pedido (PO)" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} width="w-44 min-w-[170px]" />
            <SortableTh col="razao_social_fornecedor" label="Fornecedor / Material" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} width="min-w-[320px]" />
            <Th label="Qtd. NFs" align="center" width="w-28" />
            <SortableTh col="total_faturado_miro" label="Total Faturado" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} align="right" width="w-36 min-w-[130px]" />
            <SortableTh col="total_pago" label="Total Já Pago" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} align="right" width="w-36 min-w-[130px]" />
            <SortableTh col="total_em_aberto" label="Em Aberto" sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} align="right" width="w-36 min-w-[130px]" />
            <Th label="Status de Liquidação" align="center" width="w-48 min-w-[180px]" />
          </TableHeadRow>

          <TableBody>
            {loading ? (
              <TableSkeleton columns={7} rows={12} />
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-slate-400 font-medium">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <FileCheck className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                    <span>Nenhum pedido encontrado com os filtros aplicados.</span>
                  </div>
                </td>
              </tr>
            ) : (
              sorted.slice(0, visibleCount).map(p => {
                const isExpanded = !!expandedPedidos[p.numero_pedido];
                const detalhes = detalhesPorPedido[p.numero_pedido];
                const isLoadingDet = loadingDetalhes[p.numero_pedido];
                const pctPago = p.total_faturado_miro > 0 ? (p.total_pago / p.total_faturado_miro) * 100 : 0;

                return (
                  <React.Fragment key={p.numero_pedido}>
                    {/* Linha Mãe do Pedido */}
                    <tr
                      onClick={() => togglePedido(p.numero_pedido)}
                      className={`cursor-pointer border-b transition-colors select-none ${
                        isExpanded
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60'
                          : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 border-slate-200/80 dark:border-slate-800'
                      }`}
                    >
                      {/* Coluna 1: Toggle + Nº do Pedido */}
                      <td className="px-3 py-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-2">
                          <span
                            className={`p-1 rounded-md transition-colors shrink-0 ${
                              isExpanded
                                ? 'bg-emerald-200/70 text-emerald-800 dark:bg-emerald-800/60 dark:text-emerald-200'
                                : 'text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                            }`}
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </span>
                          <span className="text-emerald-700 dark:text-emerald-400 font-extrabold text-sm tracking-tight">
                            {p.numero_pedido}
                          </span>
                        </div>
                      </td>

                      {/* Coluna 2: Fornecedor e Resumo dos Materiais */}
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-slate-900 dark:text-slate-100 leading-tight truncate max-w-[420px] text-xs" title={p.razao_social_fornecedor}>
                            {p.razao_social_fornecedor}
                          </span>
                          
                          {/* Resumo de Materiais */}
                          {p.qtd_materiais > 0 && (
                            <div className="flex items-center gap-1 text-[10.5px] text-slate-500 dark:text-slate-400">
                              <Package className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{p.qtd_materiais} material(is) / item(ns)</span>
                            </div>
                          )}

                          <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                            {p.fornecedor && <span>Cód. SAP: {p.fornecedor}</span>}
                            {p.empresa && <span>• Empr: {p.empresa}</span>}
                            {p.centro && <span>• Cen: {p.centro}</span>}
                          </div>
                        </div>
                      </td>

                      {/* Coluna 3: Qtd. NFs */}
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {p.qtd_nfs} NF(s)
                        </span>
                      </td>

                      {/* Coluna 4: Total Faturado */}
                      <td className="px-3 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatBRL(p.total_faturado_miro)}
                      </td>

                      {/* Coluna 5: Total Já Pago */}
                      <td className="px-3 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {Number(p.total_pago) > 0 ? (
                          formatBRL(p.total_pago)
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600 font-normal">—</span>
                        )}
                      </td>

                      {/* Coluna 6: Total em Aberto */}
                      <td className="px-3 py-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                        {Number(p.total_em_aberto) > 0 ? (
                          formatBRL(p.total_em_aberto)
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600 font-normal">—</span>
                        )}
                      </td>

                      {/* Coluna 7: Status de Liquidação */}
                      <td className="px-3 py-3 text-center">
                        {getStatusBadge(p.status_pagamento, p)}
                      </td>
                    </tr>

                    {/* Linha Filha Expansível: Detalhes das Notas Fiscais com Materiais */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="p-0 bg-slate-100/70 dark:bg-slate-950/80 border-b-2 border-emerald-500/60">
                          <div className="py-4 px-4 sm:px-8 border-l-4 border-emerald-500 space-y-3">
                            {/* Barra de Resumo do Pedido Expandido */}
                            <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 px-4 py-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-xs text-xs">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                  <FileText className="h-4 w-4 text-emerald-600" />
                                  Notas Fiscais e Materiais do Pedido {p.numero_pedido}
                                </span>
                                {p.data_criacao_pedido && (
                                  <span className="text-slate-500 text-[11px]">
                                    Criado em: <strong>{formatDateBR(p.data_criacao_pedido)}</strong>
                                  </span>
                                )}
                                {p.data_aprovacao_pedido && (
                                  <span className="text-slate-500 text-[11px]">
                                    Aprovado em: <strong>{formatDateBR(p.data_aprovacao_pedido)}</strong>
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                  {p.qtd_nfs_pagas} de {p.qtd_nfs} NFs pagas ({pctPago.toFixed(0)}%)
                                </span>
                                <div className="w-28 bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden shrink-0">
                                  <div
                                    className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                                    style={{ width: `${Math.min(100, Math.max(0, pctPago))}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Subtabela de NFs e Materiais */}
                            {isLoadingDet ? (
                              <div className="py-8 text-center text-xs text-slate-400 font-semibold flex items-center justify-center gap-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                                <RefreshCw className="h-4 w-4 animate-spin text-emerald-600" />
                                Carregando notas fiscais e materiais...
                              </div>
                            ) : !detalhes || detalhes.length === 0 ? (
                              <div className="py-6 text-center text-xs text-slate-400 font-medium bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                                Nenhuma fatura fiscal (MIRO) detalhada encontrada para este pedido.
                              </div>
                            ) : (
                              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                                <table className="w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-slate-100/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 text-[11px] border-b border-slate-200 dark:border-slate-700">
                                      <th className="px-3.5 py-2.5 text-left font-bold">Nº NF (Referência)</th>
                                      <th className="px-3.5 py-2.5 text-left font-bold min-w-[220px]">Material / Descrição</th>
                                      <th className="px-3.5 py-2.5 text-left font-bold">Doc. MIRO</th>
                                      <th className="px-3.5 py-2.5 text-left font-bold">Doc. Contábil FI</th>
                                      <th className="px-3.5 py-2.5 text-left font-bold">Doc. MIGO</th>
                                      <th className="px-3.5 py-2.5 text-right font-bold">Valor MIRO</th>
                                      <th className="px-3.5 py-2.5 text-left font-bold">Vencimento</th>
                                      <th className="px-3.5 py-2.5 text-left font-bold">Data Compensação</th>
                                      <th className="px-3.5 py-2.5 text-left font-bold">Doc. Compensação</th>
                                      <th className="px-3.5 py-2.5 text-center font-bold">Status NF</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {detalhes.map((item, idx) => (
                                      <tr
                                        key={item.id || `${item.doc_miro}-${idx}`}
                                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                      >
                                        {/* Nº NF */}
                                        <td className="px-3.5 py-2.5 font-mono font-bold text-slate-900 dark:text-slate-100">
                                          {item.nf_referencia || '—'}
                                        </td>

                                        {/* Material: Descrição + Código SAP */}
                                        <td className="px-3.5 py-2.5">
                                          <div className="flex flex-col">
                                            <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                                              {item.material_descricao || item.material || 'Material s/ descrição'}
                                            </span>
                                            {item.material_codigo && (
                                              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                                                Cód: {item.material_codigo} {item.item ? `(Item ${item.item})` : ''}
                                              </span>
                                            )}
                                          </div>
                                        </td>

                                        {/* Doc MIRO */}
                                        <td className="px-3.5 py-2.5 font-mono text-slate-600 dark:text-slate-400">
                                          {item.doc_miro ? (
                                            <span>
                                              {item.doc_miro}
                                              {item.ano_miro ? <span className="text-[10px] text-slate-400">/{item.ano_miro}</span> : ''}
                                            </span>
                                          ) : (
                                            '—'
                                          )}
                                        </td>

                                        {/* Doc Contábil */}
                                        <td className="px-3.5 py-2.5 font-mono font-semibold text-slate-700 dark:text-slate-300">
                                          {item.numero_doc_contabil || '—'}
                                        </td>

                                        {/* Doc MIGO */}
                                        <td className="px-3.5 py-2.5 font-mono text-slate-500 dark:text-slate-500">
                                          {item.doc_migo || '—'}
                                        </td>

                                        {/* Valor MIRO */}
                                        <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                                          {formatBRL(item.montante_miro)}
                                        </td>

                                        {/* Vencimento */}
                                        <td className="px-3.5 py-2.5 text-slate-700 dark:text-slate-300 font-medium">
                                          {formatDateBR(item.vencimento_liquido)}
                                        </td>

                                        {/* Data Compensação */}
                                        <td className="px-3.5 py-2.5 text-slate-700 dark:text-slate-300 font-medium">
                                          {formatDateBR(item.data_compensacao || item.data_pagamento)}
                                        </td>

                                        {/* Doc Compensação */}
                                        <td className="px-3.5 py-2.5 font-mono text-slate-600 dark:text-slate-400">
                                          {item.doc_compensacao || item.doc_pagamento || '—'}
                                        </td>

                                        {/* Status NF */}
                                        <td className="px-3.5 py-2.5 text-center">
                                          {getNfStatusBadge(item.status_nf)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </table>

        {sorted.length > visibleCount && (
          <TableFooter
            total={sorted.length}
            shown={visibleCount}
            loadStep={PAGE_SIZE}
            onLoadMore={() => setVisibleCount(c => c + PAGE_SIZE)}
          />
        )}
      </TableShell>
    </div>
  );
}
