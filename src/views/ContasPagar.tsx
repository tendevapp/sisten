/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Consulta dos lançamentos de Contas a Pagar (FBL1N) — dados brutos importados
 * na aba Importar SAP, sem cache local (tabela grande e volátil, atualizada por
 * substituição total a cada carga).
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Receipt, RefreshCw, FileSpreadsheet, Search, AlertCircle, Wallet, CalendarClock, ListChecks,
  ChevronRight, ChevronDown, ChevronsUpDown, Building2, Layers,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../db/supabaseClient';
import { Profile } from '../types';
import { formatBRL, formatDateBR } from '../lib/format';
import KpiCard from '../components/charts/KpiCard';
import {
  TableShell, TableHeadRow, TableBody, SortableTh, Tr, Td, TableSkeleton, TableEmpty, TableFooter,
} from '../components/ui/DataTable';

interface ContasPagarProps {
  user: Profile;
}

interface Fbl1nLancamento {
  id: number;
  numero_documento: string | null;
  empresa: string | null;
  razao_social_fornecedor: string | null;
  fornecedor: string | null;
  data_lancamento: string | null;
  vencimento_liquido: string | null;
  moeda_documento: string | null;
  montante_moeda_doc: number | null;
  doc_compensacao: string | null;
  data_compensacao: string | null;
  tipo_documento: string | null;
  tipo_documento_descricao: string | null;
}

interface SupplierGroup {
  supplierName: string;
  fornecedorCodigo: string | null;
  items: Fbl1nLancamento[];
  totalValor: number;
  totalExposicaoAberto: number;
  qtdLancamentos: number;
  qtdAbertos: number;
  qtdCompensados: number;
  qtdVencidos: number;
}

type SortDir = 'asc' | 'desc';
type StatusFilter = 'Todos' | 'Em aberto' | 'Compensado' | 'Vencido';

const PAGE_SIZE = 50;

function statusDe(l: Fbl1nLancamento): 'Em aberto' | 'Compensado' {
  return l.data_compensacao ? 'Compensado' : 'Em aberto';
}

function formatTipoDocLabel(l: Fbl1nLancamento): string {
  const code = l.tipo_documento?.trim();
  const desc = l.tipo_documento_descricao?.trim();
  if (code && desc) return `${code} - ${desc}`;
  return code || desc || '—';
}

export default function ContasPagar({ user: _user }: ContasPagarProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lancamentos, setLancamentos] = useState<Fbl1nLancamento[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState('Todas');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Todos');
  const [tipoDocFilter, setTipoDocFilter] = useState('Todos');
  const [vencimentoDe, setVencimentoDe] = useState('');
  const [vencimentoAte, setVencimentoAte] = useState('');

  const [expandedSuppliers, setExpandedSuppliers] = useState<Record<string, boolean>>({});

  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const hoje = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pageSize = 1000;
      const allRows: Fbl1nLancamento[] = [];
      let from = 0;
      while (true) {
        const { data, error: fetchError } = await supabase
          .from('vw_fbl1n_c_pagar_analise')
          .select('id, numero_documento, empresa, razao_social_fornecedor, fornecedor, data_lancamento, vencimento_liquido, moeda_documento, montante_moeda_doc, doc_compensacao, data_compensacao, tipo_documento, tipo_documento_descricao')
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1);
        if (fetchError) throw fetchError;
        if (!data || data.length === 0) break;
        allRows.push(...(data as Fbl1nLancamento[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setLancamentos(allRows);
    } catch (e) {
      console.error('Erro ao carregar contas a pagar (FBL1N):', e);
      setError('Falha ao carregar os lançamentos. Tente atualizar novamente.');
      setLancamentos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const empresaOptions = useMemo(() => {
    const s = new Set<string>();
    lancamentos.forEach(l => { if (l.empresa) s.add(l.empresa); });
    return Array.from(s).sort();
  }, [lancamentos]);

  const tipoDocOptions = useMemo(() => {
    const map = new Map<string, string>();
    lancamentos.forEach(l => {
      const code = l.tipo_documento?.trim();
      const desc = l.tipo_documento_descricao?.trim();
      if (code || desc) {
        const key = code || desc || '';
        const label = code && desc ? `${code} - ${desc}` : (code || desc || '');
        map.set(key, label);
      }
    });
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [lancamentos]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return lancamentos.filter(l => {
      if (empresaFilter !== 'Todas' && l.empresa !== empresaFilter) return false;
      if (statusFilter === 'Em aberto' && l.data_compensacao) return false;
      if (statusFilter === 'Compensado' && !l.data_compensacao) return false;
      if (statusFilter === 'Vencido') {
        if (l.data_compensacao) return false;
        if (!l.vencimento_liquido || l.vencimento_liquido >= hoje) return false;
      }
      if (tipoDocFilter !== 'Todos') {
        const itemKey = l.tipo_documento?.trim() || l.tipo_documento_descricao?.trim() || '';
        if (itemKey !== tipoDocFilter) return false;
      }
      if (vencimentoDe && (!l.vencimento_liquido || l.vencimento_liquido < vencimentoDe)) return false;
      if (vencimentoAte && (!l.vencimento_liquido || l.vencimento_liquido > vencimentoAte)) return false;
      if (q) {
        const hit =
          (l.razao_social_fornecedor || '').toLowerCase().includes(q) ||
          (l.fornecedor || '').toLowerCase().includes(q) ||
          (l.numero_documento || '').toLowerCase().includes(q) ||
          (l.tipo_documento || '').toLowerCase().includes(q) ||
          (l.tipo_documento_descricao || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [lancamentos, searchQuery, empresaFilter, statusFilter, tipoDocFilter, vencimentoDe, vencimentoAte, hoje]);

  const groupedSuppliers = useMemo(() => {
    const map = new Map<string, SupplierGroup>();

    filtered.forEach(l => {
      const supplierName = l.razao_social_fornecedor?.trim() || l.fornecedor?.trim() || 'Sem Fornecedor';
      let group = map.get(supplierName);
      if (!group) {
        group = {
          supplierName,
          fornecedorCodigo: l.fornecedor,
          items: [],
          totalValor: 0,
          totalExposicaoAberto: 0,
          qtdLancamentos: 0,
          qtdAbertos: 0,
          qtdCompensados: 0,
          qtdVencidos: 0,
        };
        map.set(supplierName, group);
      }
      group.items.push(l);

      const rawVal = l.montante_moeda_doc || 0;
      const isCompensado = Boolean(
        l.data_compensacao ||
        (l.doc_compensacao && l.doc_compensacao.trim() !== '' && l.doc_compensacao.trim() !== '—')
      );

      if (isCompensado) {
        group.qtdCompensados += 1;
        // Some apenas os compensados de valor positivo (> 0)
        if (rawVal > 0) {
          group.totalValor += rawVal;
        }
      } else {
        group.qtdAbertos += 1;
        group.totalExposicaoAberto += Math.abs(rawVal);
        if (l.vencimento_liquido && l.vencimento_liquido < hoje) {
          group.qtdVencidos += 1;
        }
      }
      group.qtdLancamentos += 1;
    });

    const list = Array.from(map.values());

    if (sortColumn) {
      const dir = sortDir === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        let va: string | number = '';
        let vb: string | number = '';
        switch (sortColumn) {
          case 'fornecedor':
            va = a.supplierName.toLowerCase();
            vb = b.supplierName.toLowerCase();
            break;
          case 'lancamentos':
            va = a.qtdLancamentos;
            vb = b.qtdLancamentos;
            break;
          case 'aberto':
            va = a.totalExposicaoAberto;
            vb = b.totalExposicaoAberto;
            break;
          case 'valor':
            va = a.totalValor;
            vb = b.totalValor;
            break;
          default:
            va = a.supplierName.toLowerCase();
            vb = b.supplierName.toLowerCase();
        }
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * dir;
      });
    } else {
      list.sort((a, b) => b.totalExposicaoAberto - a.totalExposicaoAberto);
    }

    return list;
  }, [filtered, sortColumn, sortDir, hoje]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const next: Record<string, boolean> = {};
      groupedSuppliers.forEach(g => { next[g.supplierName] = true; });
      setExpandedSuppliers(next);
    }
  }, [searchQuery, groupedSuppliers]);

  const visibleGroups = useMemo(() => groupedSuppliers.slice(0, visibleCount), [groupedSuppliers, visibleCount]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchQuery, empresaFilter, statusFilter, tipoDocFilter, vencimentoDe, vencimentoAte, sortColumn, sortDir]);

  const toggleSort = (col: string) => {
    if (sortColumn === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(col); setSortDir('asc'); }
  };

  const toggleSupplier = (supplierName: string) => {
    setExpandedSuppliers(prev => ({
      ...prev,
      [supplierName]: !prev[supplierName],
    }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    groupedSuppliers.forEach(g => { next[g.supplierName] = true; });
    setExpandedSuppliers(next);
  };

  const collapseAll = () => {
    setExpandedSuppliers({});
  };

  const kpis = useMemo(() => {
    const abertos = lancamentos.filter(l => !l.data_compensacao);
    const vencidos = abertos.filter(l => l.vencimento_liquido && l.vencimento_liquido < hoje);
    const totalAberto = abertos.reduce((sum, l) => sum - (l.montante_moeda_doc || 0), 0);
    const totalVencido = vencidos.reduce((sum, l) => sum - (l.montante_moeda_doc || 0), 0);
    const totalFiltrado = filtered.reduce((sum, l) => sum + (l.montante_moeda_doc || 0), 0);
    return { totalAberto, totalVencido, totalFiltrado, qtdFiltrado: filtered.length, qtdFornecedores: groupedSuppliers.length };
  }, [lancamentos, filtered, groupedSuppliers, hoje]);

  const handleExportExcel = () => {
    if (filtered.length === 0) return;
    const data = filtered.map(l => ({
      'Fornecedor': l.razao_social_fornecedor || '—',
      'Cód. Fornecedor': l.fornecedor || '—',
      'Nº Documento': l.numero_documento || '—',
      'Tipo Documento - Descrição': formatTipoDocLabel(l),
      'Empresa': l.empresa || '—',
      'Data Lançamento': formatDateBR(l.data_lancamento),
      'Vencimento Líquido': formatDateBR(l.vencimento_liquido),
      'Moeda': l.moeda_documento || '—',
      'Valor': l.montante_moeda_doc ?? 0,
      'Status': statusDe(l),
      'Doc. Compensação': l.doc_compensacao || '—',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ContasPagar');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    XLSX.writeFile(wb, `contas_a_pagar_${timestamp}.xlsx`);
  };

  const allExpanded = useMemo(() => {
    if (groupedSuppliers.length === 0) return false;
    return groupedSuppliers.every(g => expandedSuppliers[g.supplierName]);
  }, [groupedSuppliers, expandedSuppliers]);

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
        <h2 className="text-2xl font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2.5">
          <Receipt className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
          Contas a Pagar
        </h2>
        <p className="text-sm text-slate-555 dark:text-slate-400 mt-1">
          Tabela dinâmica de contas a pagar agrupada por fornecedor com detalhamento expansível (FBL1N).
        </p>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--ink-muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Fornecedor ou nº documento..."
              className="pl-8 pr-3 py-2 border rounded-lg text-xs h-9 w-56"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
            />
          </div>
          <select
            value={empresaFilter}
            onChange={e => setEmpresaFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg text-xs h-9"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          >
            <option value="Todas">Todas empresas</option>
            {empresaOptions.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select
            value={tipoDocFilter}
            onChange={e => setTipoDocFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg text-xs h-9 max-w-[240px] truncate"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
            title="Filtrar por Tipo de Documento - Descrição"
          >
            <option value="Todos">Todos tipos de doc.</option>
            {tipoDocOptions.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 border rounded-lg text-xs h-9"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          >
            <option value="Todos">Todos status</option>
            <option value="Em aberto">Em aberto</option>
            <option value="Vencido">Partidas Vencidas</option>
            <option value="Compensado">Compensado</option>
          </select>
          <button
            onClick={() => setStatusFilter(prev => prev === 'Vencido' ? 'Todos' : 'Vencido')}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-bold transition-all cursor-pointer h-9 shrink-0 ${
              statusFilter === 'Vencido'
                ? 'bg-red-600 text-white border-red-600 shadow-sm'
                : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/60 hover:bg-red-100 dark:hover:bg-red-900/60'
            }`}
            title="Filtrar apenas lançamentos em aberto vencidos"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Vencidos
          </button>
          <input
            type="date"
            value={vencimentoDe}
            onChange={e => setVencimentoDe(e.target.value)}
            className="px-3 py-2 border rounded-lg text-xs h-9"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
            title="Vencimento a partir de"
          />
          <input
            type="date"
            value={vencimentoAte}
            onChange={e => setVencimentoAte(e.target.value)}
            className="px-3 py-2 border rounded-lg text-xs h-9"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
            title="Vencimento até"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all disabled:opacity-50 h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          {filtered.length > 0 && (
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm h-9 cursor-pointer active:scale-95"
            >
              <FileSpreadsheet className="h-4 w-4" /> Exportar
            </button>
          )}
        </div>
      </div>

      {!loading && !error && lancamentos.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <KpiCard label="Total em Aberto" value={kpis.totalAberto} format={formatBRL} icon={Wallet} accent="var(--brand)" />
          <div
            onClick={() => setStatusFilter(prev => prev === 'Vencido' ? 'Todos' : 'Vencido')}
            className="cursor-pointer transition-transform hover:scale-[1.01]"
            title="Clique para filtrar apenas os lançamentos vencidos"
          >
            <KpiCard
              label="Total Vencido"
              value={kpis.totalVencido}
              format={formatBRL}
              icon={CalendarClock}
              accent="#dc2626"
            />
          </div>
          <KpiCard label="Total do Filtro" value={kpis.totalFiltrado} format={formatBRL} detail={`${kpis.qtdFiltrado} lançamento(s)`} icon={ListChecks} accent="#0891b2" />
          <KpiCard label="Fornecedores Filtrados" display={String(kpis.qtdFornecedores)} detail="fornecedores agrupados" icon={Building2} accent="#7c3aed" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold" style={{ background: 'color-mix(in srgb, #dc2626 10%, transparent)', color: '#dc2626' }}>
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <TableSkeleton columns={5} />
      ) : groupedSuppliers.length === 0 ? (
        <TableEmpty icon={Receipt} title="Nenhum lançamento encontrado" hint="Ajuste os filtros ou importe uma planilha FBL1N em Importar SAP." />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
              Exibindo {visibleGroups.length} de {groupedSuppliers.length} fornecedor(es) ({kpis.qtdFiltrado} lançamentos)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={allExpanded ? collapseAll : expandAll}
                className="flex items-center gap-1 px-2.5 py-1 border border-slate-200 dark:border-slate-800 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium transition-colors text-xs"
              >
                <ChevronsUpDown className="h-3.5 w-3.5 text-slate-500" />
                {allExpanded ? 'Recolher Todos' : 'Expandir Todos'}
              </button>
            </div>
          </div>

          <TableShell>
            <table className="w-full text-xs border-collapse">
              <TableHeadRow>
                <SortableTh col="fornecedor" label="Fornecedor (Razão Social)" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="lancamentos" label="Qtd. Lançamentos" align="center" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="aberto" label="Total em Aberto" align="right" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="valor" label="Montante Pago" align="right" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <th className="px-4 py-3 text-left font-bold text-slate-600 dark:text-slate-400">Status Geral</th>
              </TableHeadRow>
              <TableBody>
                {visibleGroups.map(group => {
                  const isExpanded = !!expandedSuppliers[group.supplierName];
                  return (
                    <React.Fragment key={group.supplierName}>
                      {/* Linha Mãe: Totalizador por Fornecedor */}
                      <tr
                        onClick={() => toggleSupplier(group.supplierName)}
                        className={`transition-colors cursor-pointer select-none border-b border-slate-200/80 dark:border-slate-800 ${
                          isExpanded
                            ? 'bg-emerald-50/60 dark:bg-emerald-950/20 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/30'
                            : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <Td>
                          <div className="flex items-center gap-2.5 py-0.5">
                            <span className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors shrink-0">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-emerald-600 dark:text-emerald-400 font-bold" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-slate-400" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <span className="font-bold text-slate-900 dark:text-slate-100 text-sm block truncate" title={group.supplierName}>
                                {group.supplierName}
                              </span>
                              {group.fornecedorCodigo && (
                                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                                  Cód. SAP: {group.fornecedorCodigo}
                                </span>
                              )}
                            </div>
                          </div>
                        </Td>
                        <Td className="text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {group.qtdLancamentos} doc(s)
                          </span>
                        </Td>
                        <Td align="right" numeric strong>
                          {group.totalExposicaoAberto > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400 font-extrabold">
                              {formatBRL(group.totalExposicaoAberto)}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">—</span>
                          )}
                        </Td>
                        <Td align="right" numeric strong className="text-emerald-700 dark:text-emerald-400 font-extrabold">
                          {group.totalValor > 0 ? formatBRL(group.totalValor) : <span className="text-slate-400 font-normal">—</span>}
                        </Td>
                        <Td>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {group.qtdVencidos > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/50">
                                {group.qtdVencidos} vencido(s)
                              </span>
                            )}
                            {group.qtdAbertos > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50">
                                {group.qtdAbertos} em aberto
                              </span>
                            )}
                            {group.qtdCompensados > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
                                {group.qtdCompensados} compensado(s)
                              </span>
                            )}
                          </div>
                        </Td>
                      </tr>

                      {/* Linhas Filhas: Detalhes dos Lançamentos do Fornecedor quando Expandido */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="p-0 border-b-2 border-emerald-500/40 bg-slate-50/70 dark:bg-slate-950/60">
                            <div className="py-2.5 px-4 sm:px-8 border-l-4 border-emerald-500">
                              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider flex items-center justify-between">
                                <span>Detalhes das Partidas — {group.supplierName} ({group.items.length} lançamento(s))</span>
                              </div>
                              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-inner">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 text-[11px]">
                                      <th className="px-3 py-2 text-left font-bold">Nº Documento</th>
                                      <th className="px-3 py-2 text-left font-bold">Tipo Doc. - Descrição</th>
                                      <th className="px-3 py-2 text-left font-bold">Empresa</th>
                                      <th className="px-3 py-2 text-left font-bold">Data Lançamento</th>
                                      <th className="px-3 py-2 text-left font-bold">Vencimento Líquido</th>
                                      <th className="px-3 py-2 text-right font-bold">Valor Moeda Doc.</th>
                                      <th className="px-3 py-2 text-left font-bold">Doc. Compensação</th>
                                      <th className="px-3 py-2 text-center font-bold">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {group.items.map(l => {
                                      const tipoLabel = formatTipoDocLabel(l);
                                      const st = statusDe(l);
                                      const isVencido = st === 'Em aberto' && l.vencimento_liquido && l.vencimento_liquido < hoje;
                                      return (
                                        <tr key={l.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                          <td className="px-3 py-2 font-mono font-medium text-slate-800 dark:text-slate-200">
                                            {l.numero_documento || '—'}
                                          </td>
                                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300 truncate max-w-[200px]" title={tipoLabel}>
                                            {tipoLabel}
                                          </td>
                                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{l.empresa || '—'}</td>
                                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{formatDateBR(l.data_lancamento)}</td>
                                          <td className={`px-3 py-2 font-medium ${isVencido ? 'text-red-600 dark:text-red-400 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                                            {formatDateBR(l.vencimento_liquido)}
                                            {isVencido && <span className="ml-1 text-[10px] font-extrabold text-red-600 dark:text-red-400">(Vencido)</span>}
                                          </td>
                                          <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                                            {formatBRL(l.montante_moeda_doc)}
                                          </td>
                                          <td className="px-3 py-2 font-mono text-slate-500 dark:text-slate-400">{l.doc_compensacao || '—'}</td>
                                          <td className="px-3 py-2 text-center">
                                            <span
                                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                                              style={{
                                                color: st === 'Em aberto' ? (isVencido ? '#dc2626' : '#d97706') : '#059669',
                                                background: st === 'Em aberto'
                                                  ? (isVencido ? 'color-mix(in srgb, #dc2626 14%, transparent)' : 'color-mix(in srgb, #d97706 14%, transparent)')
                                                  : 'color-mix(in srgb, #059669 14%, transparent)',
                                              }}
                                            >
                                              {st}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </table>
          </TableShell>
          <TableFooter shown={visibleGroups.length} total={groupedSuppliers.length} onLoadMore={() => setVisibleCount(v => v + PAGE_SIZE)} loadStep={PAGE_SIZE} />
        </div>
      )}
    </div>
  );
}


