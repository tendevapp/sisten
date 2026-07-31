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
}

type SortDir = 'asc' | 'desc';
type StatusFilter = 'Todos' | 'Em aberto' | 'Compensado';

const PAGE_SIZE = 50;

function statusDe(l: Fbl1nLancamento): 'Em aberto' | 'Compensado' {
  return l.doc_compensacao ? 'Compensado' : 'Em aberto';
}

export default function ContasPagar({ user: _user }: ContasPagarProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lancamentos, setLancamentos] = useState<Fbl1nLancamento[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState('Todas');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Todos');
  const [vencimentoDe, setVencimentoDe] = useState('');
  const [vencimentoAte, setVencimentoAte] = useState('');

  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // PostgREST limita cada select a um máximo de linhas (geralmente 1000)
      // mesmo sem filtro. Em volumes reais de FBL1N (milhares a dezenas de
      // milhares de linhas) é preciso paginar com .range() até esgotar os
      // resultados — sem isso os KPIs ficam silenciosamente errados.
      const pageSize = 1000;
      const allRows: Fbl1nLancamento[] = [];
      let from = 0;
      while (true) {
        const { data, error: fetchError } = await supabase
          .from('fbl1n_c_pagar')
          .select('id, numero_documento, empresa, razao_social_fornecedor, fornecedor, data_lancamento, vencimento_liquido, moeda_documento, montante_moeda_doc, doc_compensacao')
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

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return lancamentos.filter(l => {
      if (empresaFilter !== 'Todas' && l.empresa !== empresaFilter) return false;
      if (statusFilter !== 'Todos' && statusDe(l) !== statusFilter) return false;
      if (vencimentoDe && (!l.vencimento_liquido || l.vencimento_liquido < vencimentoDe)) return false;
      if (vencimentoAte && (!l.vencimento_liquido || l.vencimento_liquido > vencimentoAte)) return false;
      if (q) {
        const hit =
          (l.razao_social_fornecedor || '').toLowerCase().includes(q) ||
          (l.fornecedor || '').toLowerCase().includes(q) ||
          (l.numero_documento || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [lancamentos, searchQuery, empresaFilter, statusFilter, vencimentoDe, vencimentoAte]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortColumn) {
      const getVal = (l: Fbl1nLancamento): string | number => {
        switch (sortColumn) {
          case 'fornecedor': return (l.razao_social_fornecedor || '').toLowerCase();
          case 'documento': return l.numero_documento || '';
          case 'empresa': return l.empresa || '';
          case 'lancamento': return l.data_lancamento || '';
          case 'vencimento': return l.vencimento_liquido || '';
          case 'valor': return l.montante_moeda_doc ?? 0;
          case 'status': return statusDe(l);
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
      arr.sort((a, b) => (a.vencimento_liquido || '').localeCompare(b.vencimento_liquido || ''));
    }
    return arr;
  }, [filtered, sortColumn, sortDir]);

  const visible = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchQuery, empresaFilter, statusFilter, vencimentoDe, vencimentoAte, sortColumn, sortDir]);

  const toggleSort = (col: string) => {
    if (sortColumn === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(col); setSortDir('asc'); }
  };

  const hoje = new Date().toISOString().split('T')[0];

  const kpis = useMemo(() => {
    const abertos = lancamentos.filter(l => statusDe(l) === 'Em aberto');
    const vencidos = abertos.filter(l => l.vencimento_liquido && l.vencimento_liquido < hoje);
    // FBL1N traz partidas de fornecedor com sinal de crédito (negativo);
    // "em aberto"/"vencido" representam exposição, por isso o sinal é
    // invertido para somar positivo (mesmo racional de ContasPagarAnalise.tsx).
    const totalAberto = abertos.reduce((sum, l) => sum - (l.montante_moeda_doc || 0), 0);
    const totalVencido = vencidos.reduce((sum, l) => sum - (l.montante_moeda_doc || 0), 0);
    const totalFiltrado = filtered.reduce((sum, l) => sum + (l.montante_moeda_doc || 0), 0);
    return { totalAberto, totalVencido, totalFiltrado, qtdFiltrado: filtered.length };
  }, [lancamentos, filtered, hoje]);

  const handleExportExcel = () => {
    if (filtered.length === 0) return;
    const data = filtered.map(l => ({
      'Fornecedor': l.razao_social_fornecedor || '—',
      'Nº Documento': l.numero_documento || '—',
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

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
        <h2 className="text-2xl font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2.5">
          <Receipt className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
          Contas a Pagar
        </h2>
        <p className="text-sm text-slate-555 dark:text-slate-400 mt-1">
          Partidas de contas a pagar de fornecedores importadas do SAP (FBL1N).
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
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 border rounded-lg text-xs h-9"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          >
            <option value="Todos">Todos status</option>
            <option value="Em aberto">Em aberto</option>
            <option value="Compensado">Compensado</option>
          </select>
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
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5">
          <KpiCard label="Total em Aberto" value={kpis.totalAberto} format={formatBRL} icon={Wallet} accent="var(--brand)" />
          <KpiCard label="Total Vencido" value={kpis.totalVencido} format={formatBRL} icon={CalendarClock} accent="#dc2626" />
          <KpiCard label="Total do Filtro" value={kpis.totalFiltrado} format={formatBRL} detail={`${kpis.qtdFiltrado} lançamento(s)`} icon={ListChecks} accent="#0891b2" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold" style={{ background: 'color-mix(in srgb, #dc2626 10%, transparent)', color: '#dc2626' }}>
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <TableSkeleton columns={7} />
      ) : sorted.length === 0 ? (
        <TableEmpty icon={Receipt} title="Nenhum lançamento encontrado" hint="Ajuste os filtros ou importe uma planilha FBL1N em Importar SAP." />
      ) : (
        <>
          <TableShell>
            <table className="w-full text-xs">
              <TableHeadRow>
                <SortableTh col="fornecedor" label="Fornecedor" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="documento" label="Nº Documento" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="empresa" label="Empresa" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="lancamento" label="Data Lançamento" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="vencimento" label="Vencimento" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="valor" label="Valor" align="right" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="status" label="Status" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
              </TableHeadRow>
              <TableBody>
                {visible.map(l => (
                  <Tr key={l.id}>
                    <Td truncate title={l.razao_social_fornecedor || ''}>{l.razao_social_fornecedor || '—'}</Td>
                    <Td mono>{l.numero_documento || '—'}</Td>
                    <Td>{l.empresa || '—'}</Td>
                    <Td>{formatDateBR(l.data_lancamento)}</Td>
                    <Td>{formatDateBR(l.vencimento_liquido)}</Td>
                    <Td align="right" numeric strong>{formatBRL(l.montante_moeda_doc)}</Td>
                    <Td>
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
                        style={{
                          color: statusDe(l) === 'Em aberto' ? '#d97706' : '#059669',
                          background: statusDe(l) === 'Em aberto' ? 'color-mix(in srgb, #d97706 14%, transparent)' : 'color-mix(in srgb, #059669 14%, transparent)',
                        }}
                      >
                        {statusDe(l)}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </TableBody>
            </table>
          </TableShell>
          <TableFooter shown={visible.length} total={sorted.length} onLoadMore={() => setVisibleCount(v => v + PAGE_SIZE)} loadStep={PAGE_SIZE} />
        </>
      )}
    </div>
  );
}
