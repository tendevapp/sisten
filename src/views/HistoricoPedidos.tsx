/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  History, Search, FileSpreadsheet, AlertCircle, Phone, Mail, Calendar,
  RefreshCw, Filter, MapPin, Package, DollarSign, Layers,
  Copy, Check, ChevronDown, Users, SlidersHorizontal,
  ArrowUp, ArrowDown, ArrowUpDown, Clock
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../db/localDb';
import { Profile, ContatoFornecedor, HistoricoPedidoView } from '../types';

interface HistoricoPedidosProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

// Uma linha da tabela = um pedido já consolidado pela view (fornecedor + Nº Pedido, CRF = 'x'),
// enriquecido com os dados de contato do fornecedor.
interface Row {
  material: string;
  txt_breve: string;
  cod_forn: string;
  cnpj: string;
  fornecedor: string;
  nome_fantasia: string;
  regiao_uf: string;
  telefone: string;
  email: string;
  classificacao: string;
  doc_compra: string;
  rm: string;
  data_doc: string;
  qtd?: number;
  preco_unit?: number;
  valor_total?: number;
}

type SortDir = 'asc' | 'desc';

interface ColumnOption {
  id: string;
  label: string;
  align?: 'left' | 'right';
  sortable?: boolean;
}

const COLUMNS: ColumnOption[] = [
  { id: 'material', label: 'Material', sortable: true },
  { id: 'descricao', label: 'Descrição', sortable: true },
  { id: 'fornecedor', label: 'Fornecedor', sortable: true },
  { id: 'uf', label: 'UF', sortable: true },
  { id: 'contato', label: 'Contato' },
  { id: 'qtd', label: 'Qtd', align: 'right', sortable: true },
  { id: 'preco', label: 'Preço Unit', align: 'right', sortable: true },
  { id: 'total', label: 'Valor Total', align: 'right', sortable: true },
  { id: 'rm', label: 'RM', sortable: true },
  { id: 'doc_compra', label: 'Nº Pedido', sortable: true },
  { id: 'data_doc', label: 'Data Pedido', sortable: true },
];

const STORAGE_COLS_KEY = 'sisten_historico_visible_columns';
const PAGE_SIZE = 50;

// Normaliza códigos de material para casar registros com diferença de zeros à esquerda.
const normalizeCode = (c: any): string => {
  const s = String(c ?? '').trim();
  const stripped = s.replace(/^0+/, '');
  return stripped.length > 0 ? stripped : (s.length > 0 ? '0' : '');
};

const formatPreco = (v?: number | null): string =>
  v === undefined || v === null || isNaN(v)
    ? '—'
    : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDateBR = (d?: string): string => {
  if (!d || d === '—') return '—';
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString('pt-BR');
};

// Data + hora para o rótulo "Dados atualizados em".
const formatDateTimeBR = (d?: string | null): string => {
  if (!d) return '—';
  const parsed = new Date(d);
  return isNaN(parsed.getTime())
    ? String(d)
    : parsed.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const dateVal = (d?: string): number => {
  if (!d || d === '—') return 0;
  const t = new Date(d).getTime();
  return isNaN(t) ? 0 : t;
};

const yearOf = (d?: string): string => {
  if (!d || d === '—') return '';
  const t = new Date(d);
  return isNaN(t.getTime()) ? '' : String(t.getFullYear());
};

// Botão de cópia rápida reutilizável.
const ClipboardCopyButton = ({ text, label }: { text: string; label: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Falha ao copiar:', err);
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded-md bg-slate-50 hover:bg-slate-150 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors relative group cursor-pointer inline-flex items-center justify-center shrink-0 border border-slate-200/50 dark:border-slate-700 h-5 w-5"
      title={`Copiar ${label}`}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-655 dark:text-emerald-455" />
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-850 dark:bg-slate-700 text-white text-[9px] py-1 px-1.5 rounded shadow-md whitespace-nowrap z-50">
            Copiado!
          </span>
        </>
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
};

// Cabeçalho de coluna com ordenação por clique.
const SortableTh = ({
  col, label, align = 'left', sortColumn, sortDir, onSort,
}: {
  col: string;
  label: string;
  align?: 'left' | 'right';
  sortColumn: string | null;
  sortDir: SortDir;
  onSort: (col: string) => void;
}) => {
  const active = sortColumn === col;
  return (
    <th className={`px-3 py-2.5 font-black ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-emerald-600 dark:text-emerald-500' : ''}`}
        title={`Ordenar por ${label}`}
      >
        <span>{label}</span>
        {active
          ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />}
      </button>
    </th>
  );
};

export default function HistoricoPedidos({ user }: HistoricoPedidosProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [ufFilter, setUfFilter] = useState('Todos');
  const [classFilter, setClassFilter] = useState('Todos');
  const [yearFilter, setYearFilter] = useState('Todos');

  // Ordenação
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

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

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Monta as linhas a partir das linhas da view + contatos.
  const buildRows = useCallback((linhas: HistoricoPedidoView[]): Row[] => {
    const contatos = localDb.getContatosForn();
    const contatosMap = new Map<string, ContatoFornecedor>();
    contatos.forEach(c => { if (c.cod_vendor) contatosMap.set(String(c.cod_vendor).trim(), c); });

    return linhas.map(l => {
      const contato = l.cod_forn ? contatosMap.get(String(l.cod_forn).trim()) : undefined;
      return {
        material: l.material || '—',
        txt_breve: l.txt_breve || '—',
        cod_forn: l.cod_forn || '—',
        cnpj: l.cnpj || '—',
        fornecedor: l.fornecedor || contato?.fornecedor || '—',
        nome_fantasia: contato?.nome_fantasia || '—',
        regiao_uf: l.regiao_uf || '—',
        telefone: contato?.telefone || '—',
        email: contato?.email || '—',
        classificacao: contato?.classificacao || '—',
        doc_compra: l.doc_compra || '—',
        rm: l.reqc || '—',
        data_doc: l.data_doc || '—',
        qtd: l.qtd_pedido ?? undefined,
        preco_unit: l.preco_liquido_unit ?? undefined,
        valor_total: l.valor_liquido ?? undefined,
      };
    });
  }, []);

  // Data/hora da última atualização dos dados (última importação/refresh).
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Carrega a view via cache versionado. Só rebaixa do Supabase quando a versão
  // mudou (nova importação) ou quando forçado pelo botão "Atualizar".
  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      let linhas: HistoricoPedidoView[];
      try {
        linhas = await localDb.fetchHistoricoPedidos(force);
      } catch (netErr) {
        console.warn('Falha ao buscar a view ao vivo; usando cache local.', netErr);
        linhas = localDb.getHistoricoPedidos();
      }
      setRows(buildRows(linhas));
      setLastUpdated(localDb.getDatasetUpdatedAt('historico_pedidos'));
    } catch (e: any) {
      console.error('Erro ao montar histórico de pedidos:', e);
      setError('Falha ao carregar o histórico. Tente atualizar novamente.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [buildRows]);

  useEffect(() => { load(false); }, [load]);

  // Opções de filtro derivadas dos dados.
  const ufOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.regiao_uf && r.regiao_uf !== '—') s.add(r.regiao_uf); });
    return Array.from(s).sort();
  }, [rows]);

  const classOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.classificacao && r.classificacao !== '—') s.add(r.classificacao); });
    return Array.from(s).sort();
  }, [rows]);

  const yearOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { const y = yearOf(r.data_doc); if (y) s.add(y); });
    return Array.from(s).sort((a, b) => Number(b) - Number(a));
  }, [rows]);

  // Filtragem por busca, UF, classificação e ano.
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter(r => {
      if (ufFilter !== 'Todos' && r.regiao_uf !== ufFilter) return false;
      if (classFilter !== 'Todos' && r.classificacao !== classFilter) return false;
      if (yearFilter !== 'Todos' && yearOf(r.data_doc) !== yearFilter) return false;
      if (q) {
        const hit =
          r.material.toLowerCase().includes(q) ||
          r.txt_breve.toLowerCase().includes(q) ||
          r.fornecedor.toLowerCase().includes(q) ||
          r.nome_fantasia.toLowerCase().includes(q) ||
          r.cnpj.toLowerCase().includes(q) ||
          r.cod_forn.toLowerCase().includes(q) ||
          r.rm.toLowerCase().includes(q) ||
          r.doc_compra.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, searchQuery, ufFilter, classFilter, yearFilter]);

  // Ordenação: por coluna quando ativa; caso contrário material asc + data desc.
  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    if (sortColumn) {
      const getVal = (r: Row): string | number => {
        switch (sortColumn) {
          case 'material': return normalizeCode(r.material);
          case 'descricao': return r.txt_breve.toLowerCase();
          case 'fornecedor': return r.fornecedor.toLowerCase();
          case 'uf': return r.regiao_uf.toLowerCase();
          case 'qtd': return r.qtd ?? -Infinity;
          case 'preco': return r.preco_unit ?? -Infinity;
          case 'total': return r.valor_total ?? -Infinity;
          case 'rm': return r.rm;
          case 'doc_compra': return r.doc_compra;
          case 'data_doc': return dateVal(r.data_doc);
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
      arr.sort((a, b) => {
        const m = normalizeCode(a.material).localeCompare(normalizeCode(b.material), 'pt-BR', { numeric: true });
        if (m !== 0) return m;
        return dateVal(b.data_doc) - dateVal(a.data_doc);
      });
    }
    return arr;
  }, [filteredRows, sortColumn, sortDir]);

  const visibleRows = useMemo(() => sortedRows.slice(0, visibleCount), [sortedRows, visibleCount]);

  // Reinicia a paginação quando filtros/ordenação mudam.
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchQuery, ufFilter, classFilter, yearFilter, sortColumn, sortDir]);

  const toggleSort = (col: string) => {
    if (sortColumn === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(col); setSortDir('asc'); }
  };

  // KPIs.
  const kpis = useMemo(() => {
    const materiais = new Set<string>();
    const fornecedores = new Set<string>();
    let valor = 0;
    let qtd = 0;
    filteredRows.forEach(r => {
      materiais.add(normalizeCode(r.material));
      const fk = r.cnpj && r.cnpj !== '—' ? r.cnpj : r.cod_forn;
      if (fk && fk !== '—') fornecedores.add(fk);
      valor += r.valor_total || 0;
      qtd += r.qtd || 0;
    });
    return {
      materiais: materiais.size,
      pedidos: filteredRows.length,
      fornecedores: fornecedores.size,
      valor,
      precoMedio: qtd > 0 ? valor / qtd : 0,
    };
  }, [filteredRows]);

  const totalMateriais = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => s.add(normalizeCode(r.material)));
    return s.size;
  }, [rows]);

  const handleExportExcel = () => {
    if (filteredRows.length === 0) return;
    const data = filteredRows.map(r => ({
      'Código do Material': r.material,
      'Descrição': r.txt_breve,
      'Cód. Fornecedor': r.cod_forn,
      'CNPJ': r.cnpj,
      'Fornecedor': r.fornecedor,
      'Nome Fantasia': r.nome_fantasia,
      'UF': r.regiao_uf,
      'Telefone': r.telefone,
      'E-mail': r.email,
      'Classificação': r.classificacao,
      'Quantidade': r.qtd ?? '—',
      'Preço Unitário': r.preco_unit ?? '—',
      'Valor Total': r.valor_total ?? '—',
      'RM': r.rm,
      'Nº Pedido': r.doc_compra,
      'Data Pedido': formatDateBR(r.data_doc),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Histórico de Pedidos');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    XLSX.writeFile(wb, `historico_pedidos_${timestamp}.xlsx`);
  };

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2.5">
            <History className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
            Histórico de Pedidos
          </h2>
          <p className="text-sm text-slate-555 dark:text-slate-400 mt-1">
            Consulte todo o histórico de compras por material. Cada linha é um pedido consolidado por fornecedor. Identifique fornecedores já utilizados e obtenha contato para agilizar cotações.
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-400 dark:bg-slate-700" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1"><Package className="h-3 w-3" /> Materiais</span>
            <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1">{kpis.materiais.toLocaleString('pt-BR')}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500 dark:bg-blue-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1"><Layers className="h-3 w-3" /> Pedidos</span>
            <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1">{kpis.pedidos.toLocaleString('pt-BR')}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500 dark:bg-emerald-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1"><Users className="h-3 w-3" /> Fornecedores</span>
            <p className="text-3xl font-black text-emerald-600 dark:text-emerald-500 mt-1">{kpis.fornecedores.toLocaleString('pt-BR')}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500 dark:bg-amber-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1"><DollarSign className="h-3 w-3" /> Valor Total</span>
            <p className="text-xl font-black text-slate-800 dark:text-slate-100 mt-2 leading-tight">{formatPreco(kpis.valor)}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs relative overflow-hidden col-span-2 lg:col-span-1">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-violet-500 dark:bg-violet-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1"><DollarSign className="h-3 w-3" /> Preço Médio</span>
            <p className="text-xl font-black text-slate-800 dark:text-slate-100 mt-2 leading-tight">{formatPreco(kpis.precoMedio)}</p>
          </div>
        </div>
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
              placeholder="Busque por material, descrição, fornecedor, CNPJ, RM ou Nº do pedido..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 focus:outline-none transition-all"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[130px]">
              <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-450 pointer-events-none" />
              <select
                value={ufFilter}
                onChange={(e) => setUfFilter(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none"
              >
                <option value="Todos">UF: Todas</option>
                {ufOptions.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="relative min-w-[150px]">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-455 pointer-events-none" />
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none"
              >
                <option value="Todos">Classificação: Todas</option>
                {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="relative min-w-[120px]">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-455 pointer-events-none" />
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none"
              >
                <option value="Todos">Ano: Todos</option>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Loading / erro / vazio */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-20 border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 rounded-xl space-y-4">
          <RefreshCw className="h-8 w-8 text-emerald-600 animate-spin" />
          <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Carregando histórico de pedidos...</span>
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-3.5 p-5 border border-rose-200 dark:border-rose-900/50 rounded-xl bg-rose-50/50 dark:bg-rose-955/15 text-rose-800 dark:text-rose-300">
          <AlertCircle className="h-6 w-6 text-rose-550 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center p-16 border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 rounded-xl text-center">
          <History className="h-12 w-12 text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-955/30 p-2.5 rounded-full mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Nenhum pedido histórico encontrado</h3>
          <p className="text-sm text-slate-555 dark:text-slate-455 mt-1 max-w-md">
            Importe a base de pedidos (PEDIDOSFORN) em Cadastros SAP e garanta que a view <span className="font-mono">vw_historico_pedidos</span> existe no banco.
          </p>
        </div>
      )}

      {/* Conteúdo */}
      {!loading && !error && rows.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-550 dark:text-slate-455 px-1 font-bold">
            <span>Exibindo {Math.min(visibleCount, sortedRows.length)} de {sortedRows.length} pedidos · {kpis.materiais} materiais ({totalMateriais} no total)</span>

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
                  <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
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
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-955/50 text-slate-500 dark:text-slate-400 text-left uppercase tracking-wider text-[10px]">
                      {COLUMNS.map(col => (
                        visibleColumns[col.id] && (
                          col.sortable
                            ? <SortableTh key={col.id} col={col.id} label={col.label} align={col.align} sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                            : <th key={col.id} className="px-3 py-2.5 font-black">{col.label}</th>
                        )
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {visibleRows.map((r, idx) => {
                      // Material/descrição aparecem só quando mudam em relação à linha anterior.
                      const isNewMaterial = idx === 0 || normalizeCode(visibleRows[idx - 1].material) !== normalizeCode(r.material);
                      return (
                        <tr key={`${r.material}-${r.doc_compra}-${r.cod_forn}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-850/30 transition-colors">
                          {visibleColumns.material && (
                            <td className="px-3 py-2 font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              {isNewMaterial ? r.material : ''}
                            </td>
                          )}
                          {visibleColumns.descricao && (
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[220px] truncate" title={r.txt_breve}>
                              {isNewMaterial ? r.txt_breve : ''}
                            </td>
                          )}
                          {visibleColumns.fornecedor && (
                            <td className="px-3 py-2 text-slate-800 dark:text-slate-200 font-semibold max-w-[200px] truncate" title={r.fornecedor}>
                              {r.fornecedor}
                            </td>
                          )}
                          {visibleColumns.uf && <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.regiao_uf}</td>}
                          {visibleColumns.contato && (
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-1.5">
                                {r.telefone !== '—' && (
                                  <div className="flex items-center gap-1.5">
                                    <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                                    <a href={`tel:${r.telefone.split(';')[0].trim()}`} className="font-mono text-slate-700 dark:text-slate-350 hover:text-emerald-600 font-bold hover:underline">
                                      {r.telefone.split(';')[0].trim()}
                                    </a>
                                    <ClipboardCopyButton text={r.telefone.split(';')[0].trim()} label="telefone" />
                                  </div>
                                )}
                                {r.email !== '—' && (
                                  <div className="flex items-center gap-1.5">
                                    <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                                    <a href={`mailto:${r.email}`} className="text-slate-650 dark:text-slate-355 hover:text-blue-600 font-bold hover:underline break-all">
                                      {r.email}
                                    </a>
                                    <ClipboardCopyButton text={r.email} label="e-mail" />
                                  </div>
                                )}
                                {r.telefone === '—' && r.email === '—' && <span className="text-slate-400">—</span>}
                              </div>
                            </td>
                          )}
                          {visibleColumns.qtd && (
                            <td className="px-3 py-2 text-right font-medium text-slate-700 dark:text-slate-350">
                              {r.qtd !== undefined ? r.qtd.toLocaleString('pt-BR') : '—'}
                            </td>
                          )}
                          {visibleColumns.preco && (
                            <td className="px-3 py-2 text-right font-medium text-slate-700 dark:text-slate-350">
                              {formatPreco(r.preco_unit)}
                            </td>
                          )}
                          {visibleColumns.total && (
                            <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-450 whitespace-nowrap">
                              {formatPreco(r.valor_total)}
                            </td>
                          )}
                          {visibleColumns.rm && (
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-mono" title={r.rm}>
                              {r.rm}
                            </td>
                          )}
                          {visibleColumns.doc_compra && (
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-mono" title={r.doc_compra}>
                              {r.doc_compra}
                            </td>
                          )}
                          {visibleColumns.data_doc && (
                            <td className="px-3 py-2 text-slate-550 dark:text-slate-400 whitespace-nowrap">
                              {formatDateBR(r.data_doc)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Load more */}
          {visibleCount < sortedRows.length && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all"
              >
                <ChevronDown className="h-4 w-4" /> Carregar mais {Math.min(PAGE_SIZE, sortedRows.length - visibleCount)} pedidos
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
