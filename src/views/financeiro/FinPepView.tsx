/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Financeiro > Estrutura PEP (WBS Element) — Consulta, Filtros e Importação.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FolderTree, Search, FileSpreadsheet, RefreshCw, Upload,
  Filter, Layers, Building2, CheckCircle2, Hash, ArrowUpDown, Clock,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { listarPep } from '../../lib/finPepApi';
import type { FinPep, Profile } from '../../types';
import ImportarPepModal from '../../components/financeiro/ImportarPepModal';
import KpiCard from '../../components/charts/KpiCard';
import {
  TableShell, TableHeadRow, TableBody, SortableTh, Tr, Td,
  TableSkeleton, TableEmpty, TableFooter,
} from '../../components/ui/DataTable';
import { formatDateBR } from '../../lib/format';

interface Props {
  user: Profile;
}

type SortDir = 'asc' | 'desc';
const PAGE_SIZE = 50;

export default function FinPepView({ user }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState<FinPep[]>([]);
  const [modalImportar, setModalImportar] = useState(false);

  // Filtros
  const [busca, setBusca] = useState('');
  const [nivelFilter, setNivelFilter] = useState<'Todos' | string>('Todos');
  const [projetoFilter, setProjetoFilter] = useState('Todos');
  const [centroLucroFilter, setCentroLucroFilter] = useState('Todos');
  const [statusFilter, setStatusFilter] = useState('Todos');

  // Ordenação e paginação
  const [sortColumn, setSortColumn] = useState<string | null>('wbs_element');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listarPep();
      setLista(data);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar a estrutura PEP.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Opções dinâmicas para filtros
  const niveisDisponiveis = useMemo(() => {
    const s = new Set<number>();
    lista.forEach(p => { if (p.nivel != null) s.add(p.nivel); });
    return Array.from(s).sort((a, b) => a - b);
  }, [lista]);

  const projetosDisponiveis = useMemo(() => {
    const s = new Set<string>();
    lista.forEach(p => { if (p.definicao_projeto) s.add(p.definicao_projeto); });
    return Array.from(s).sort();
  }, [lista]);

  const centrosLucroDisponiveis = useMemo(() => {
    const s = new Set<string>();
    lista.forEach(p => { if (p.centro_lucro) s.add(p.centro_lucro); });
    return Array.from(s).sort();
  }, [lista]);

  const statusDisponiveis = useMemo(() => {
    const s = new Set<string>();
    lista.forEach(p => { if (p.status) s.add(p.status); });
    return Array.from(s).sort();
  }, [lista]);

  // Data da última importação
  const ultimaImportacao = useMemo(() => {
    if (!lista.length) return null;
    let max = '';
    lista.forEach(p => {
      if (p.importado_em && p.importado_em > max) max = p.importado_em;
    });
    return max || null;
  }, [lista]);

  // KPIs
  const kpis = useMemo(() => {
    const comClassif = lista.filter(p => p.classificacao_contabil).length;
    const comFaturam = lista.filter(p => p.elemento_faturamento).length;
    return {
      total: lista.length,
      projetos: projetosDisponiveis.length,
      centrosLucro: centrosLucroDisponiveis.length,
      comClassif,
      comFaturam,
    };
  }, [lista, projetosDisponiveis, centrosLucroDisponiveis]);

  // Filtragem
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter(item => {
      if (nivelFilter !== 'Todos' && item.nivel !== parseInt(nivelFilter, 10)) return false;
      if (projetoFilter !== 'Todos' && item.definicao_projeto !== projetoFilter) return false;
      if (centroLucroFilter !== 'Todos' && item.centro_lucro !== centroLucroFilter) return false;
      if (statusFilter !== 'Todos' && item.status !== statusFilter) return false;

      if (q) {
        const hit =
          item.wbs_element.toLowerCase().includes(q) ||
          (item.nome || '').toLowerCase().includes(q) ||
          (item.definicao_projeto || '').toLowerCase().includes(q) ||
          (item.centro_lucro || '').toLowerCase().includes(q) ||
          (item.ifrs15_od || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [lista, busca, nivelFilter, projetoFilter, centroLucroFilter, statusFilter]);

  // Ordenação
  const ordenados = useMemo(() => {
    const arr = [...filtrados];
    if (sortColumn) {
      const dir = sortDir === 'asc' ? 1 : -1;
      arr.sort((a, b) => {
        const va = (a as any)[sortColumn];
        const vb = (b as any)[sortColumn];
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va || '').localeCompare(String(vb || ''), 'pt-BR', { numeric: true }) * dir;
      });
    }
    return arr;
  }, [filtrados, sortColumn, sortDir]);

  const visiveis = useMemo(() => ordenados.slice(0, visibleCount), [ordenados, visibleCount]);

  const toggleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDir('asc');
    }
  };

  const handleExportExcel = () => {
    if (!filtrados.length) return;
    const data = filtrados.map(p => ({
      'Centro de lucro': p.centro_lucro || '',
      'Definição do projeto': p.definicao_projeto || '',
      'WBS element': p.wbs_element,
      'Name': p.nome || '',
      'Level': p.nivel != null ? p.nivel : '',
      'Usuário unidade de medida 1': p.unidade_medida || '',
      'Moeda': p.moeda || '',
      'Empresa': p.empresa || '',
      'Código elemento classificação contábil': p.classificacao_contabil || '',
      'Código elemento de faturamento': p.elemento_faturamento || '',
      'Status': p.status || '',
      'IFRS15 - OD': p.ifrs15_od || '',
      'Importado Em': p.importado_em ? formatDateBR(p.importado_em) : '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estrutura PEP');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    XLSX.writeFile(wb, `estrutura_pep_${timestamp}.xlsx`);
  };

  return (
    <div className="space-y-6 select-text">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <FolderTree className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50 font-display">
              Estrutura PEP (WBS Element)
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Mapeamento da Estrutura Analítica do Projeto (WBS) importada do SAP para apropriação contábil, financeira e de faturamento.
          </p>
          {ultimaImportacao && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 flex items-center gap-1 font-medium">
              <Clock className="h-3 w-3" /> Última importação: {formatDateBR(ultimaImportacao)}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={carregarDados}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all disabled:opacity-50 h-9 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button
            onClick={() => setModalImportar(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs h-9 cursor-pointer active:scale-95"
          >
            <Upload className="h-4 w-4" /> Importar Planilha PEP
          </button>
          {filtrados.length > 0 && (
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all shadow-2xs h-9 cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Exportar
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      {!loading && !error && lista.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <KpiCard
            label="Total de Elementos PEP"
            value={kpis.total}
            detail="Nós da estrutura cadastrados"
            icon={FolderTree}
          />
          <KpiCard
            label="Projetos Mapeados"
            value={kpis.projetos}
            detail="Definições de projetos distintos"
            icon={Layers}
          />
          <KpiCard
            label="Centros de Lucro"
            value={kpis.centrosLucro}
            detail="Centros vinculados aos PEPs"
            icon={Building2}
          />
          <KpiCard
            label="Classificação Contábil"
            value={kpis.comClassif}
            detail={`${kpis.comFaturam} com flag faturamento`}
            icon={CheckCircle2}
          />
        </div>
      )}

      {/* Filtros */}
      <div className="rounded-xl border border-slate-250 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Busque por WBS element, nome, projeto, centro de lucro ou IFRS15..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 xl:flex-wrap">
          <div className="relative shrink-0 w-[130px]">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <select
              value={nivelFilter}
              onChange={(e) => setNivelFilter(e.target.value)}
              className="w-full pl-8 pr-6 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none truncate"
            >
              <option value="Todos">Nível: Todos</option>
              {niveisDisponiveis.map(n => <option key={n} value={String(n)}>Nível {n}</option>)}
            </select>
          </div>

          <div className="relative shrink-0 w-[160px]">
            <Layers className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <select
              value={projetoFilter}
              onChange={(e) => setProjetoFilter(e.target.value)}
              className="w-full pl-8 pr-6 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none truncate"
            >
              <option value="Todos">Projeto: Todos</option>
              {projetosDisponiveis.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="relative shrink-0 w-[160px]">
            <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <select
              value={centroLucroFilter}
              onChange={(e) => setCentroLucroFilter(e.target.value)}
              className="w-full pl-8 pr-6 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none truncate"
            >
              <option value="Todos">C. Lucro: Todos</option>
              {centrosLucroDisponiveis.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {statusDisponiveis.length > 0 && (
            <div className="relative shrink-0 w-[130px]">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none truncate"
              >
                <option value="Todos">Status: Todos</option>
                {statusDisponiveis.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Estados de carregamento e vazio */}
      {loading && <TableSkeleton columns={8} />}

      {!loading && error && (
        <div className="flex items-center gap-3.5 p-5 border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-200 rounded-xl text-sm font-semibold">
          <FolderTree className="h-5 w-5 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && lista.length === 0 && (
        <TableEmpty
          icon={FolderTree}
          title="Nenhum elemento PEP cadastrado"
          hint="Importe a planilha exportada do SAP clicando no botão 'Importar Planilha PEP' acima."
        />
      )}

      {/* Tabela de Dados */}
      {!loading && !error && lista.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold px-1">
            <span>Exibindo {Math.min(visibleCount, ordenados.length)} de {ordenados.length} elementos PEP</span>
          </div>

          <TableShell>
            <table className="w-full text-xs">
              <TableHeadRow>
                <SortableTh col="wbs_element" label="WBS Element" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="nome" label="Nome / Descrição" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="nivel" label="Nível" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="definicao_projeto" label="Projeto" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="centro_lucro" label="Centro de Lucro" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="empresa" label="Empresa" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="moeda" label="Moeda" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="unidade_medida" label="UM" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="classificacao_contabil" label="Classif. Contábil" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="elemento_faturamento" label="Elem. Faturamento" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="status" label="Status" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                <SortableTh col="ifrs15_od" label="IFRS15 - OD" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
              </TableHeadRow>
              <TableBody>
                {visiveis.map(item => {
                  const nivelIndent = item.nivel != null ? Math.max(0, item.nivel - 1) * 14 : 0;
                  return (
                    <Tr key={item.id || item.wbs_element}>
                      <Td mono strong className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5" style={{ paddingLeft: `${nivelIndent}px` }}>
                          {item.nivel != null && item.nivel > 1 && (
                            <span className="text-slate-300 dark:text-slate-600 font-normal select-none">↳</span>
                          )}
                          <span>{item.wbs_element}</span>
                        </div>
                      </Td>
                      <Td truncate title={item.nome || ''} className="max-w-[220px]">
                        {item.nome || '—'}
                      </Td>
                      <Td>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.nivel === 1
                            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                            : item.nivel === 2
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}>
                          Nível {item.nivel ?? '—'}
                        </span>
                      </Td>
                      <Td mono>{item.definicao_projeto || '—'}</Td>
                      <Td mono>{item.centro_lucro || '—'}</Td>
                      <Td mono>{item.empresa || '—'}</Td>
                      <Td>{item.moeda || '—'}</Td>
                      <Td>{item.unidade_medida || '—'}</Td>
                      <Td>
                        {item.classificacao_contabil ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 font-mono text-[10px] font-bold">
                            {item.classificacao_contabil}
                          </span>
                        ) : '—'}
                      </Td>
                      <Td>
                        {item.elemento_faturamento ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 font-mono text-[10px] font-bold">
                            {item.elemento_faturamento}
                          </span>
                        ) : '—'}
                      </Td>
                      <Td>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[10px] font-bold">
                          {item.status || '—'}
                        </span>
                      </Td>
                      <Td mono>{item.ifrs15_od || '—'}</Td>
                    </Tr>
                  );
                })}
              </TableBody>
            </table>
          </TableShell>

          <TableFooter
            shown={visiveis.length}
            total={ordenados.length}
            loadStep={PAGE_SIZE}
            onLoadMore={visibleCount < ordenados.length ? () => setVisibleCount(c => c + PAGE_SIZE) : undefined}
          />
        </div>
      )}

      {/* Modal de Importação */}
      {modalImportar && (
        <ImportarPepModal
          user={user}
          onClose={() => setModalImportar(false)}
          onImportado={carregarDados}
        />
      )}
    </div>
  );
}
