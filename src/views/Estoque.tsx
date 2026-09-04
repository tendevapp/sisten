/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Boxes, Search, FileSpreadsheet, AlertCircle, RefreshCw, Filter,
  Package, DollarSign, Layers, Warehouse, ChevronDown, SlidersHorizontal,
  Clock, PackageCheck, X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../db/localDb';
import { Profile, EstoqueItem } from '../types';
import { classifyABC, ClasseAbc, CLASSE_ABC_COR, normalizeCode, descricaoDeposito, formatDeposito } from '../lib/almoxarifado';
import { formatBRL, formatQtd, formatDateTimeBR, formatInt } from '../lib/format';
import {
  TableShell, TableHeadRow, TableBody, SortableTh, Tr, Td, TableSkeleton, TableEmpty, TableFooter,
} from '../components/ui/DataTable';
import MultiSelectFilter from '../components/ui/MultiSelectFilter';

interface EstoqueProps {
  user: Profile;
}

type SortDir = 'asc' | 'desc';

type ColumnId = keyof EstoqueItem | 'classe_abc';

interface ColumnOption {
  id: ColumnId;
  label: string;
  align?: 'left' | 'right';
  sortable?: boolean;
  numeric?: boolean;
}

// Ordem de exibição das colunas na tabela. `defaultVisible` controla o subconjunto
// essencial mostrado por padrão; as demais ficam disponíveis em "Personalizar Colunas".
const COLUMNS: (ColumnOption & { defaultVisible: boolean })[] = [
  { id: 'material', label: 'Material', sortable: true, defaultVisible: true },
  { id: 'txt_breve_material', label: 'Descrição', sortable: true, defaultVisible: true },
  { id: 'classe_abc', label: 'ABC', sortable: true, defaultVisible: true },
  { id: 'deposito', label: 'Depósito', sortable: true, defaultVisible: true },
  { id: 'quantidade', label: 'Quantidade', align: 'right', sortable: true, numeric: true, defaultVisible: true },
  { id: 'umb', label: 'UMB', sortable: true, defaultVisible: true },
  { id: 'preco_medio', label: 'Preço Médio', align: 'right', sortable: true, numeric: true, defaultVisible: true },
  { id: 'valor_total', label: 'Valor Total', align: 'right', sortable: true, numeric: true, defaultVisible: true },
  { id: 'centro', label: 'Centro', sortable: true, defaultVisible: false },
  { id: 'tipo_material', label: 'Tipo Material', sortable: true, defaultVisible: false },
  { id: 'referencia_fabricante', label: 'Ref. Fabricante', sortable: true, defaultVisible: false },
  { id: 'grp_mercad', label: 'GrpMercad', sortable: true, defaultVisible: false },
  { id: 'class_item', label: 'Class. Item', sortable: true, defaultVisible: false },
  { id: 'grupo_mercadorias', label: 'Grupo Mercadorias', sortable: true, defaultVisible: false },
  { id: 'aplicacao', label: 'Aplicação', sortable: true, defaultVisible: false },
  { id: 'texto_pedido_compra', label: 'Texto Pedido Compra', sortable: true, defaultVisible: false },
  { id: 'empresa', label: 'Empresa', sortable: true, defaultVisible: false },
];

const STORAGE_COLS_KEY = 'sisten_estoque_visible_columns';
const PAGE_SIZE = 50;

// Formatação vem de lib/format.ts. Este arquivo mantinha cópias próprias de
// formatBRL/formatQtd/formatDateTimeBR que criavam um Intl novo por célula —
// caro numa tabela de milhares de linhas.
const formatPreco = formatBRL;

export default function Estoque({ user }: EstoqueProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EstoqueItem[]>([]);

  // Filtros
  // `searchInput` é o texto digitado; `searchQuery` é o termo efetivamente
  // aplicado — a busca só filtra ao pressionar Enter ou clicar em "Pesquisar".
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // Depósito aceita seleção múltipla: vazio = todos.
  const [depositoFilter, setDepositoFilter] = useState<Set<string>>(new Set());
  const [tipoFilter, setTipoFilter] = useState('Todos');
  const [classFilter, setClassFilter] = useState('Todos');
  const [abcFilter, setAbcFilter] = useState<'Todos' | ClasseAbc>('Todos');
  const [grupoFilter, setGrupoFilter] = useState('Todos');
  const [apenasComSaldo, setApenasComSaldo] = useState(false);

  // Ordenação
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Colunas visíveis (subconjunto essencial por padrão; mescla com preferências salvas).
  const [showColMenu, setShowColMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const defaults = COLUMNS.reduce((acc, col) => ({ ...acc, [col.id]: col.defaultVisible }), {} as Record<string, boolean>);
    const saved = localStorage.getItem(STORAGE_COLS_KEY);
    if (saved) {
      try { return { ...defaults, ...JSON.parse(saved) }; } catch {}
    }
    return defaults;
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_COLS_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await localDb.fetchEstoque(force);
      setRows(data);
    } catch (e: any) {
      console.error('Erro ao carregar a posição de estoque:', e);
      setError('Falha ao carregar o estoque. Tente atualizar novamente.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  // Deep link vindo dos dashboards do almoxarifado: pré-aplica o recorte que o
  // usuário clicou no gráfico.
  useEffect(() => {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex === -1) return;
    const params = new URLSearchParams(hash.slice(qIndex + 1));

    const deposito = params.get('deposito');
    if (deposito) setDepositoFilter(new Set(deposito.split(',').map(d => d.trim()).filter(Boolean)));

    const tipo = params.get('tipo');
    if (tipo) setTipoFilter(tipo);

    const classe = params.get('classe');
    if (classe) setClassFilter(classe);

    const grupo = params.get('grupo');
    if (grupo) setGrupoFilter(grupo);

    const abc = params.get('abc');
    if (abc === 'A' || abc === 'B' || abc === 'C') setAbcFilter(abc);

    // Material entra na busca já aplicada, para que o campo mostre o termo e o
    // botão "Limpar" apareça — senão o usuário não tem como sair do recorte.
    const material = params.get('material');
    if (material) {
      setSearchInput(material);
      setSearchQuery(material);
    }
  }, []);

  // Data/hora da última importação SAP (planilha ZL0024).
  const lastUpdated = useMemo(() => {
    const sapDate = localDb.getDatasetUpdatedAt('estoque');
    if (sapDate) return sapDate;
    let max = '';
    rows.forEach(r => { if (r.imported_at && r.imported_at > max) max = r.imported_at; });
    return max || null;
  }, [rows]);

  // Classificação sobre a posição inteira, não sobre `filteredRows`: a classe de
  // um material não pode mudar conforme o filtro da tela.
  const mapaAbc = useMemo(() => classifyABC(rows), [rows]);

  // Opções de filtro derivadas dos dados.
  const depositoOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.deposito) s.add(r.deposito); });
    return Array.from(s).sort();
  }, [rows]);

  const tipoOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.tipo_material) s.add(r.tipo_material); });
    return Array.from(s).sort();
  }, [rows]);

  const classOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.class_item) s.add(r.class_item); });
    return Array.from(s).sort();
  }, [rows]);

  const grupoOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.grupo_mercadorias) s.add(r.grupo_mercadorias); });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [rows]);

  // Filtragem por busca, depósito, tipo, classificação, ABC, grupo e saldo.
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter(r => {
      if (depositoFilter.size > 0 && !depositoFilter.has(r.deposito)) return false;
      if (tipoFilter !== 'Todos' && r.tipo_material !== tipoFilter) return false;
      if (classFilter !== 'Todos' && r.class_item !== classFilter) return false;
      if (abcFilter !== 'Todos' && mapaAbc.get(normalizeCode(r.material)) !== abcFilter) return false;
      if (grupoFilter !== 'Todos' && r.grupo_mercadorias !== grupoFilter) return false;
      if (apenasComSaldo && !((r.quantidade ?? 0) > 0)) return false;
      if (q) {
        const hit =
          (r.material || '').toLowerCase().includes(q) ||
          (r.txt_breve_material || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, searchQuery, depositoFilter, tipoFilter, classFilter, abcFilter, grupoFilter, apenasComSaldo, mapaAbc]);

  // Ordenação: por coluna quando ativa; caso contrário material asc.
  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    const colDef = COLUMNS.find(c => c.id === sortColumn);
    if (sortColumn && colDef) {
      const dir = sortDir === 'asc' ? 1 : -1;
      arr.sort((a, b) => {
        if (colDef.numeric) {
          const va = (a[sortColumn as keyof EstoqueItem] as number) ?? -Infinity;
          const vb = (b[sortColumn as keyof EstoqueItem] as number) ?? -Infinity;
          return (va - vb) * dir;
        }
        if (sortColumn === 'classe_abc') {
          const va = mapaAbc.get(normalizeCode(a.material)) || 'C';
          const vb = mapaAbc.get(normalizeCode(b.material)) || 'C';
          return va.localeCompare(vb) * dir;
        }
        if (sortColumn === 'material') {
          return normalizeCode(a.material).localeCompare(normalizeCode(b.material), 'pt-BR', { numeric: true }) * dir;
        }
        const va = String(a[sortColumn as keyof EstoqueItem] ?? '').toLowerCase();
        const vb = String(b[sortColumn as keyof EstoqueItem] ?? '').toLowerCase();
        return va.localeCompare(vb, 'pt-BR', { numeric: true }) * dir;
      });
    } else {
      arr.sort((a, b) => normalizeCode(a.material).localeCompare(normalizeCode(b.material), 'pt-BR', { numeric: true }));
    }
    return arr;
  }, [filteredRows, sortColumn, sortDir, mapaAbc]);

  const visibleRows = useMemo(() => sortedRows.slice(0, visibleCount), [sortedRows, visibleCount]);

  // Reinicia a paginação quando filtros/ordenação mudam.
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchQuery, depositoFilter, tipoFilter, classFilter, abcFilter, grupoFilter, apenasComSaldo, sortColumn, sortDir]);

  const handleSearch = () => setSearchQuery(searchInput.trim());
  const handleClearSearch = () => { setSearchInput(''); setSearchQuery(''); };

  const toggleSort = (col: string) => {
    if (sortColumn === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(col); setSortDir('asc'); }
  };

  // KPIs.
  const kpis = useMemo(() => {
    const materiais = new Set<string>();
    let qtd = 0;
    let valor = 0;
    filteredRows.forEach(r => {
      if (r.material) materiais.add(normalizeCode(r.material));
      qtd += r.quantidade || 0;
      valor += r.valor_total || 0;
    });
    return {
      itens: filteredRows.length,
      materiais: materiais.size,
      quantidade: qtd,
      valor,
    };
  }, [filteredRows]);

  const handleExportExcel = () => {
    if (filteredRows.length === 0) return;
    const data = filteredRows.map(r => ({
      'Classe ABC': mapaAbc.get(normalizeCode(r.material)) || 'C',
      'Centro': r.centro ?? '',
      'Depósito': r.deposito ?? '',
      'Descrição do Depósito': descricaoDeposito(r.deposito),
      'Tipo de Material': r.tipo_material ?? '',
      'Material': r.material ?? '',
      'Referência Fabricante': r.referencia_fabricante ?? '',
      'Descrição': r.txt_breve_material ?? '',
      'Quantidade': r.quantidade ?? '',
      'UMB': r.umb ?? '',
      'Preço Médio': r.preco_medio ?? '',
      'Valor Total': r.valor_total ?? '',
      'GrpMercad': r.grp_mercad ?? '',
      'Class. Item': r.class_item ?? '',
      'Grupo de Mercadorias': r.grupo_mercadorias ?? '',
      'Aplicação': r.aplicacao ?? '',
      'Texto Pedido Compra': r.texto_pedido_compra ?? '',
      'Empresa': r.empresa ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    XLSX.writeFile(wb, `estoque_${timestamp}.xlsx`);
  };

  const renderCell = (r: EstoqueItem, colId: ColumnId) => {
    switch (colId) {
      case 'material':
        return <span className="font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">{r.material || '—'}</span>;
      case 'classe_abc': {
        const classe = mapaAbc.get(normalizeCode(r.material)) || 'C';
        return (
          // Contornado, não preenchido: a rampa ABC tem passos claros (C no
          // tema claro, A no escuro) que não sustentam texto branco em cima.
          <span
            className="inline-block rounded border px-1.5 py-0.5 text-[10px] font-black"
            style={{ borderColor: CLASSE_ABC_COR[classe], color: 'var(--ink-primary)' }}
            title={`Classe ${classe} da curva ABC`}
          >
            {classe}
          </span>
        );
      }
      case 'deposito': {
        // Código e descrição em linhas separadas: a coluna é estreita e o
        // código é o que o usuário procura ao varrer a tabela.
        const desc = descricaoDeposito(r.deposito);
        if (!r.deposito) return '—';
        return (
          <div className="min-w-0" title={formatDeposito(r.deposito)}>
            <span className="font-mono font-bold whitespace-nowrap" style={{ color: 'var(--ink-primary)' }}>{r.deposito}</span>
            {desc && <p className="text-[10px] leading-tight truncate" style={{ color: 'var(--ink-muted)' }}>{desc}</p>}
          </div>
        );
      }
      case 'quantidade':
        return formatQtd(r.quantidade);
      case 'preco_medio':
        return formatPreco(r.preco_medio);
      case 'valor_total':
        return <span className="font-bold text-emerald-600 dark:text-emerald-450 whitespace-nowrap">{formatPreco(r.valor_total)}</span>;
      default:
        return (r[colId as keyof EstoqueItem] as string) || '—';
    }
  };

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2.5">
            <Boxes className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
            Estoque
          </h2>
          <p className="text-sm text-slate-555 dark:text-slate-400 mt-1">
            Posição atual de estoque por material e depósito, importada da transação ZL0024. Use os filtros, a busca e as colunas personalizáveis para encontrar itens rapidamente.
          </p>
          {lastUpdated && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 flex items-center gap-1 font-medium">
              <Clock className="h-3 w-3" /> {localDb.getDatasetUpdateBadge('estoque')}
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
          {filteredRows.length > 0 && (
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
      {!loading && !error && rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-3.5">
          <div className="min-w-0 rounded-xl border border-slate-200/80 dark:border-slate-850 bg-white dark:bg-slate-900 p-3.5 lg:p-4 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500 dark:bg-blue-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1 truncate"><Layers className="h-3 w-3 shrink-0" /> <span className="truncate">Itens em Estoque</span></span>
            <p className="tabular text-xl lg:text-3xl font-black text-slate-800 dark:text-slate-100 mt-1 leading-tight truncate" title={kpis.itens.toLocaleString('pt-BR')}>{kpis.itens.toLocaleString('pt-BR')}</p>
          </div>
          <div className="min-w-0 rounded-xl border border-slate-200/80 dark:border-slate-850 bg-white dark:bg-slate-900 p-3.5 lg:p-4 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-400 dark:bg-slate-700" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1 truncate"><Package className="h-3 w-3 shrink-0" /> <span className="truncate">Materiais</span></span>
            <p className="tabular text-xl lg:text-3xl font-black text-slate-800 dark:text-slate-100 mt-1 leading-tight truncate" title={kpis.materiais.toLocaleString('pt-BR')}>{kpis.materiais.toLocaleString('pt-BR')}</p>
          </div>
          <div className="min-w-0 rounded-xl border border-slate-200/80 dark:border-slate-850 bg-white dark:bg-slate-900 p-3.5 lg:p-4 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-violet-500 dark:bg-violet-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1 truncate"><PackageCheck className="h-3 w-3 shrink-0" /> <span className="truncate">Quantidade Total</span></span>
            <p className="tabular text-base sm:text-lg lg:text-xl font-black text-slate-800 dark:text-slate-100 mt-1.5 lg:mt-2 leading-tight truncate" title={formatQtd(kpis.quantidade)}>{formatQtd(kpis.quantidade)}</p>
          </div>
          <div className="min-w-0 rounded-xl border border-slate-200/80 dark:border-slate-850 bg-white dark:bg-slate-900 p-3.5 lg:p-4 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500 dark:bg-emerald-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1 truncate"><DollarSign className="h-3 w-3 shrink-0" /> <span className="truncate">Valor Total</span></span>
            <p className="tabular text-base sm:text-lg lg:text-xl font-black text-emerald-600 dark:text-emerald-500 mt-1.5 lg:mt-2 leading-tight truncate" title={formatPreco(kpis.valor)}>{formatPreco(kpis.valor)}</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3.5">
        {/* Busca: sempre em sua própria linha, para não disputar espaço com os
            filtros e acabar espremida a um quadrado só com o ícone. */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="Busque por material ou descrição..."
              className="w-full h-10 pl-10 pr-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 focus:outline-none transition-all"
            />
            {searchInput && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-150 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            className="h-10 shrink-0 flex items-center gap-1.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95 whitespace-nowrap"
          >
            <Search className="h-3.5 w-3.5" /> Pesquisar
          </button>
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="h-10 shrink-0 flex items-center gap-1.5 px-4 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
            >
              <X className="h-3.5 w-3.5" /> Limpar
            </button>
          )}
        </div>

        {/* Filtros de categoria: no mobile viram uma trilha com rolagem
            horizontal (evita empurrar a lista para muito longe do topo);
            a partir de `lg` quebram em linha normalmente. */}
        <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800">
          <span className="hidden lg:flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
            <Filter className="h-3 w-3" /> Filtros
          </span>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible">
            <MultiSelectFilter
              label="Depósito"
              icon={Warehouse}
              options={depositoOptions}
              selected={depositoFilter}
              onChange={setDepositoFilter}
              renderOption={formatDeposito}
              searchable
              className="shrink-0 w-[168px] lg:w-auto lg:min-w-[140px]"
              panelClassName="w-80 sm:w-96"
            />
            <div className="relative shrink-0 w-[140px] lg:w-auto lg:min-w-[140px]">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-455 pointer-events-none" />
              <select
                value={tipoFilter}
                onChange={(e) => setTipoFilter(e.target.value)}
                className="w-full h-9 pl-8 pr-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none truncate"
              >
                <option value="Todos">Tipo: Todos</option>
                {tipoOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="relative shrink-0 w-[168px] lg:w-auto lg:min-w-[140px]">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-455 pointer-events-none" />
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="w-full h-9 pl-8 pr-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none truncate"
              >
                <option value="Todos">Class. Item: Todos</option>
                {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="relative shrink-0 w-[152px] lg:w-auto lg:min-w-[140px]">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                value={abcFilter}
                onChange={(e) => setAbcFilter(e.target.value as 'Todos' | ClasseAbc)}
                className="w-full h-9 pl-8 pr-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none truncate"
              >
                <option value="Todos">Curva ABC: Todas</option>
                <option value="A">Classe A</option>
                <option value="B">Classe B</option>
                <option value="C">Classe C</option>
              </select>
            </div>
            <div className="relative shrink-0 w-[152px] lg:w-auto lg:min-w-[160px]">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                value={grupoFilter}
                onChange={(e) => setGrupoFilter(e.target.value)}
                className="w-full h-9 pl-8 pr-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none truncate"
              >
                <option value="Todos">Grupo: Todos</option>
                {grupoOptions.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <label className="h-9 shrink-0 flex items-center gap-2 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={apenasComSaldo}
                onChange={(e) => setApenasComSaldo(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
              />
              Apenas com saldo
            </label>
          </div>
        </div>
      </div>

      {/* Loading / erro / vazio */}
      {/* Esqueleto com o número real de colunas visíveis: o spinner centralizado
          que existia aqui trocava de tamanho ao virar tabela e a página saltava. */}
      {loading && (
        <TableSkeleton columns={COLUMNS.filter(c => visibleColumns[c.id]).length || 8} />
      )}

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

      {!loading && !error && rows.length === 0 && (
        <TableEmpty
          icon={Boxes}
          title="Nenhum item de estoque encontrado"
          hint={'Importe a posição de estoque (transação ZL0024) na aba "Importar SAP" do painel administrativo.'}
        />
      )}

      {/* Conteúdo */}
      {!loading && !error && rows.length > 0 && (
        <div className="space-y-4">
          {/* A contagem "exibindo X de Y" ficava aqui e no rodapé; agora só no
              rodapé, junto do controle que muda esse número. */}
          <div className="flex items-center justify-end text-xs px-1 font-bold" style={{ color: 'var(--ink-muted)' }}>
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
                <div className="absolute right-0 mt-1.5 w-60 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 z-30 p-3 text-left">
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

          {sortedRows.length === 0 && (
            <div className="flex items-center gap-3 p-6 border border-amber-200 dark:border-amber-900/50 rounded-xl bg-amber-50/50 dark:bg-amber-955/15 text-amber-800 dark:text-amber-300 text-sm font-semibold">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              Nenhum registro coincide com os critérios e filtros aplicados atualmente.
            </div>
          )}

          {sortedRows.length > 0 && (
            <>
              {/* Mobile: cards (evita scroll horizontal na tabela densa) */}
              <div
                className="lg:hidden rounded-xl border overflow-hidden divide-y"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
              >
                {visibleRows.map((r, idx) => {
                  const classe = mapaAbc.get(normalizeCode(r.material)) || 'C';
                  return (
                    <div
                      key={`m-${r.id}-${idx}`}
                      className="p-4 space-y-2.5 active:bg-slate-50 dark:active:bg-slate-800/60 transition-colors"
                      style={{ borderColor: 'var(--hairline)' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="shrink-0 inline-flex items-center justify-center rounded border w-4 h-4 text-[9px] font-black leading-none"
                          style={{ borderColor: CLASSE_ABC_COR[classe], color: 'var(--ink-primary)' }}
                          title={`Classe ${classe} da curva ABC`}
                        >
                          {classe}
                        </span>
                        <p className="font-mono text-[11px] font-bold truncate" style={{ color: 'var(--ink-muted)' }}>{r.material || '—'}</p>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold leading-snug line-clamp-2 min-w-0" style={{ color: 'var(--ink-primary)' }}>
                          {r.txt_breve_material || '—'}
                        </p>
                        {r.valor_total !== undefined && (
                          <span className="shrink-0 text-sm font-bold whitespace-nowrap tabular" style={{ color: 'var(--ink-primary)' }}>
                            {formatPreco(r.valor_total)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] pt-0.5" style={{ color: 'var(--ink-muted)' }}>
                        <span>Qtd <strong className="tabular" style={{ color: 'var(--ink-secondary)' }}>{formatQtd(r.quantidade)}</strong> {r.umb || ''}</span>
                        {r.preco_medio !== undefined && <span>PMM <strong className="tabular" style={{ color: 'var(--ink-secondary)' }}>{formatPreco(r.preco_medio)}</strong></span>}
                        {r.deposito && (
                          <span
                            className="font-mono font-semibold px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--surface-raised)', color: 'var(--ink-secondary)' }}
                          >
                            Dep {r.deposito}
                          </span>
                        )}
                        {descricaoDeposito(r.deposito) && (
                          <span className="truncate">{descricaoDeposito(r.deposito)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: tabela com cabeçalho fixo — a lista chega a milhares
                  de linhas e o cabeçalho rolava para fora da tela. */}
              <div className="hidden lg:block">
                <TableShell>
                  <table className="w-full text-xs">
                    <TableHeadRow>
                      {COLUMNS.map(col => (
                        visibleColumns[col.id] ? (
                          <SortableTh
                            key={col.id}
                            col={col.id}
                            label={col.label}
                            align={col.align}
                            sortColumn={sortColumn}
                            sortDir={sortDir}
                            onSort={toggleSort}
                          />
                        ) : null
                      ))}
                    </TableHeadRow>
                    <TableBody>
                      {visibleRows.map((r, idx) => {
                        const longa = (id: ColumnId) =>
                          id === 'txt_breve_material' || id === 'texto_pedido_compra' || id === 'aplicacao';
                        return (
                          <Tr key={`${r.id}-${idx}`}>
                            {COLUMNS.map(col => (
                              visibleColumns[col.id] ? (
                                <Td
                                  key={col.id}
                                  align={col.align}
                                  numeric={col.numeric}
                                  truncate={longa(col.id)}
                                  title={longa(col.id) ? String(r[col.id as keyof EstoqueItem] ?? '') : undefined}
                                >
                                  {renderCell(r, col.id)}
                                </Td>
                              ) : null
                            ))}
                          </Tr>
                        );
                      })}
                    </TableBody>
                  </table>
                </TableShell>
              </div>
            </>
          )}

          {sortedRows.length > 0 && (
            <TableFooter
              shown={visibleRows.length}
              total={sortedRows.length}
              loadStep={PAGE_SIZE}
              onLoadMore={visibleCount < sortedRows.length ? () => setVisibleCount(c => c + PAGE_SIZE) : undefined}
            />
          )}
        </div>
      )}
    </div>
  );
}
