/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  History, Search, FileSpreadsheet, AlertCircle, Phone, Mail, Calendar,
  RefreshCw, Filter, MapPin, Package, DollarSign, Layers,
  Table, Copy, Check, ChevronDown, Users, SlidersHorizontal
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../db/localDb';
import { Profile, PedidoForn, ContatoFornecedor } from '../types';

interface HistoricoPedidosProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

// Fornecedor consolidado no histórico de um material.
interface SupplierHist {
  cod_forn: string;
  cnpj: string;
  fornecedor: string;
  nome_fantasia: string;
  regiao_uf: string;
  telefone: string;
  email: string;
  classificacao: string;
  ultima_data: string;
  preco_liquido?: number;
  qtd_pedido?: number;
  valor_liquido?: number;
  num_pedidos: number;
  rm: string;
  doc_compra: string;
  data_doc: string;
  item: string;
}

// Agrupamento de todos os pedidos históricos por material (item).
interface MaterialHistGroup {
  material: string;
  txt_breve: string;
  fornecedores: SupplierHist[];
  total_pedidos: number;
  valor_total: number;
  ultima_data: string;
}

interface ColumnOption {
  id: string;
  label: string;
  defaultVisible: boolean;
}

const AVAILABLE_COLUMNS: ColumnOption[] = [
  { id: 'material', label: 'Material', defaultVisible: true },
  { id: 'descricao', label: 'Descrição', defaultVisible: true },
  { id: 'fornecedor', label: 'Fornecedor', defaultVisible: true },
  { id: 'uf', label: 'UF', defaultVisible: true },
  { id: 'contato', label: 'Contato', defaultVisible: true },
  { id: 'qtd', label: 'Quantidade', defaultVisible: true },
  { id: 'preco', label: 'Preço Unit', defaultVisible: true },
  { id: 'total', label: 'Valor Total', defaultVisible: true },
  { id: 'rm', label: 'RM', defaultVisible: true },
  { id: 'doc_compra', label: 'Nº Pedido', defaultVisible: true },
  { id: 'data_doc', label: 'Data Pedido', defaultVisible: true },
  { id: 'item', label: 'Item', defaultVisible: true },
  { id: 'ultima_compra', label: 'Última Compra', defaultVisible: true },
];

// Normaliza códigos de material para casar registros mesmo com diferença de zeros à esquerda.
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

const dateVal = (d?: string): number => {
  if (!d || d === '—') return 0;
  const t = new Date(d).getTime();
  return isNaN(t) ? 0 : t;
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

const PAGE_SIZE = 30;

export default function HistoricoPedidos({ user }: HistoricoPedidosProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<MaterialHistGroup[]>([]);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [ufFilter, setUfFilter] = useState('Todos');
  const [classFilter, setClassFilter] = useState('Todos');

  // Customização de colunas
  const [showColMenu, setShowColMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('sisten_historico_visible_columns');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return AVAILABLE_COLUMNS.reduce((acc, col) => ({ ...acc, [col.id]: col.defaultVisible }), {});
  });

  useEffect(() => {
    localStorage.setItem('sisten_historico_visible_columns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const buildHistorico = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      const pedidos = localDb.getPedidosForn();
      const contatos = localDb.getContatosForn();

      // Indexa contatos por código de vendor para trazer telefone/e-mail.
      const contatosMap = new Map<string, ContatoFornecedor>();
      contatos.forEach(c => { if (c.cod_vendor) contatosMap.set(String(c.cod_vendor).trim(), c); });

      // Agrupa pedidos por material (item do histórico).
      const matMap = new Map<string, PedidoForn[]>();
      pedidos.forEach(p => {
        const key = normalizeCode(p.material);
        if (!key) return;
        const arr = matMap.get(key);
        if (arr) arr.push(p);
        else matMap.set(key, [p]);
      });

      const built: MaterialHistGroup[] = [];
      matMap.forEach((lista) => {
        // Deduplica por fornecedor mantendo o pedido mais recente, contando ocorrências.
        const fornMap = new Map<string, { pedido: PedidoForn; count: number }>();
        let valorTotal = 0;
        let ultimaData = '';
        lista.forEach(p => {
          const itemVal = p.valor_liquido !== undefined && p.valor_liquido !== null ? Number(p.valor_liquido) : Number(p.preco_liquido || 0);
          valorTotal += itemVal;
          if (dateVal(p.data_pedido) > dateVal(ultimaData)) ultimaData = p.data_pedido || '';
          const key = p.cnpj ? p.cnpj.trim() : (p.cod_forn || p.fornecedor || '');
          if (!key) return;
          const existing = fornMap.get(key);
          if (!existing) {
            fornMap.set(key, { pedido: p, count: 1 });
          } else {
            existing.count += 1;
            if (dateVal(p.data_pedido) > dateVal(existing.pedido.data_pedido)) existing.pedido = p;
          }
        });

        const fornecedores: SupplierHist[] = Array.from(fornMap.values()).map(({ pedido: p, count }) => {
          const contato = p.cod_forn ? contatosMap.get(String(p.cod_forn).trim()) : undefined;
          
          // Preço unitário líquido. Fallback para preco_liquido
          const precoUnit = p.preco_liquido_unit !== undefined && p.preco_liquido_unit !== null && p.preco_liquido_unit !== 0
            ? p.preco_liquido_unit
            : (p.qtd_pedido && p.qtd_pedido !== 0 && p.preco_liquido
                ? p.preco_liquido / p.qtd_pedido
                : p.preco_liquido);
                
          // Valor total líquido. Fallback para preco_liquido
          const valorTotalItem = p.valor_liquido !== undefined && p.valor_liquido !== null && p.valor_liquido !== 0
            ? p.valor_liquido
            : p.preco_liquido;

          return {
            cod_forn: p.cod_forn || '—',
            cnpj: p.cnpj || '—',
            fornecedor: p.fornecedor || contato?.fornecedor || '—',
            nome_fantasia: contato?.nome_fantasia || '—',
            regiao_uf: p.regiao_uf || '—',
            telefone: contato?.telefone || '—',
            email: contato?.email || '—',
            classificacao: contato?.classificacao || '—',
            ultima_data: p.data_pedido || '—',
            preco_liquido: precoUnit ?? undefined,
            qtd_pedido: p.qtd_pedido ?? undefined,
            valor_liquido: valorTotalItem ?? undefined,
            num_pedidos: count,
            rm: (p as any).reqc || p.ri || '—',
            doc_compra: (p as any).doc_compra || p.documento_compra || '—',
            data_doc: (p as any).data_doc || p.data_pedido || '—',
            item: (p as any).item_rc_cotacao || (p as any).item || p.item_pedido || (p as any).itm_liberacao || '—',
          };
        });

        fornecedores.sort((a, b) => dateVal(b.ultima_data) - dateVal(a.ultima_data));

        const first = lista.find(p => p.txt_breve && p.txt_breve.trim());
        built.push({
          material: lista[0].material || '—',
          txt_breve: first?.txt_breve || '—',
          fornecedores,
          total_pedidos: lista.length,
          valor_total: valorTotal,
          ultima_data: ultimaData,
        });
      });

      // Histórico mais recente primeiro.
      built.sort((a, b) => dateVal(b.ultima_data) - dateVal(a.ultima_data));
      setGroups(built);
    } catch (e: any) {
      console.error('Erro ao montar histórico de pedidos:', e);
      setError('Falha ao montar o histórico. Tente atualizar novamente.');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { buildHistorico(); }, [buildHistorico]);

  // Opções de filtro derivadas dos dados.
  const ufOptions = useMemo(() => {
    const s = new Set<string>();
    groups.forEach(g => g.fornecedores.forEach(f => { if (f.regiao_uf && f.regiao_uf !== '—') s.add(f.regiao_uf); }));
    return Array.from(s).sort();
  }, [groups]);

  const classOptions = useMemo(() => {
    const s = new Set<string>();
    groups.forEach(g => g.fornecedores.forEach(f => { if (f.classificacao && f.classificacao !== '—') s.add(f.classificacao); }));
    return Array.from(s).sort();
  }, [groups]);

  // Filtragem por busca (texto breve, código do material, fornecedor, CNPJ, código do fornecedor) e por UF / classificação do fornecedor.
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return groups.reduce<MaterialHistGroup[]>((acc, g) => {
      const matchesUf = ufFilter === 'Todos' || g.fornecedores.some(f => f.regiao_uf === ufFilter);
      const matchesClass = classFilter === 'Todos' || g.fornecedores.some(f => f.classificacao === classFilter);
      if (!matchesUf || !matchesClass) return acc;

      if (q) {
        const inMaterial =
          (g.material || '').toLowerCase().includes(q) ||
          (g.txt_breve || '').toLowerCase().includes(q);
        const inForn = g.fornecedores.some(f =>
          f.fornecedor.toLowerCase().includes(q) ||
          f.nome_fantasia.toLowerCase().includes(q) ||
          f.cnpj.toLowerCase().includes(q) ||
          f.cod_forn.toLowerCase().includes(q)
        );
        if (!inMaterial && !inForn) return acc;
      }
      acc.push(g);
      return acc;
    }, []);
  }, [groups, searchQuery, ufFilter, classFilter]);

  // Reinicia a paginação sempre que os filtros mudam.
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchQuery, ufFilter, classFilter]);

  const visibleGroups = useMemo(() => filteredGroups.slice(0, visibleCount), [filteredGroups, visibleCount]);

  // KPIs / indicadores.
  const kpis = useMemo(() => {
    const fornSet = new Set<string>();
    let pedidos = 0;
    let valor = 0;
    filteredGroups.forEach(g => {
      pedidos += g.total_pedidos;
      valor += g.valor_total;
      g.fornecedores.forEach(f => {
        const key = f.cnpj && f.cnpj !== '—' ? f.cnpj : f.cod_forn;
        if (key && key !== '—') fornSet.add(key);
      });
    });
    return {
      materiais: filteredGroups.length,
      pedidos,
      fornecedores: fornSet.size,
      valor,
      ticket: pedidos > 0 ? valor / pedidos : 0,
    };
  }, [filteredGroups]);

  const totalMateriais = groups.length;

  const handleExportExcel = () => {
    if (filteredGroups.length === 0) return;
    const rows: any[] = [];
    filteredGroups.forEach(g => {
      g.fornecedores.forEach(f => {
        rows.push({
          'Código do Material': g.material,
          'Descrição': g.txt_breve,
          'Cód. Fornecedor': f.cod_forn,
          'CNPJ': f.cnpj,
          'Fornecedor': f.fornecedor,
          'Nome Fantasia': f.nome_fantasia,
          'UF': f.regiao_uf,
          'Telefone': f.telefone,
          'E-mail': f.email,
          'Classificação': f.classificacao,
          'Quantidade': f.qtd_pedido ?? '—',
          'Preço Unitário': f.preco_liquido ?? '—',
          'Valor Total': f.valor_liquido ?? '—',
          'Nº Pedidos': f.num_pedidos,
          'Última Compra': formatDateBR(f.ultima_data),
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
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
            Consulte todo o histórico de compras por material. Identifique fornecedores já utilizados e obtenha contato e e-mail para agilizar cotações.
          </p>
        </div>
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto shrink-0">
          <button
            onClick={buildHistorico}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all disabled:opacity-50 h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          {filteredGroups.length > 0 && (
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
      {!loading && !error && groups.length > 0 && (
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
            <p className="text-xl font-black text-slate-800 dark:text-slate-100 mt-2 leading-tight">{formatPreco(kpis.ticket)}</p>
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
              placeholder="Busque por texto breve, código do material, fornecedor ou CNPJ..."
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

      {!loading && !error && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center p-16 border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 rounded-xl text-center">
          <History className="h-12 w-12 text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-955/30 p-2.5 rounded-full mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Nenhum pedido histórico encontrado</h3>
          <p className="text-sm text-slate-555 dark:text-slate-455 mt-1 max-w-md">
            Importe a base de pedidos (PEDIDOSFORN) em Cadastros SAP para visualizar o histórico de compras por material.
          </p>
        </div>
      )}

      {/* Conteúdo */}
      {!loading && !error && groups.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-550 dark:text-slate-455 px-1 font-bold">
            <span>Exibindo {Math.min(visibleCount, filteredGroups.length)} de {filteredGroups.length} materiais ({totalMateriais} no total)</span>
            
            {/* Column selector drop-down */}
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
                      onClick={() => {
                        setVisibleColumns(AVAILABLE_COLUMNS.reduce((acc, col) => ({ ...acc, [col.id]: true }), {}));
                      }}
                      className="text-[10px] text-blue-650 hover:underline font-semibold cursor-pointer"
                    >
                      Mostrar Todas
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                    {AVAILABLE_COLUMNS.map((col) => (
                      <label 
                        key={col.id} 
                        className="flex items-center space-x-2 px-1.5 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs text-slate-600 dark:text-slate-400 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={!!visibleColumns[col.id]}
                          onChange={(e) => {
                            setVisibleColumns(prev => ({ ...prev, [col.id]: e.target.checked }));
                          }}
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

          {filteredGroups.length === 0 && (
            <div className="flex items-center gap-3 p-6 border border-amber-200 dark:border-amber-900/50 rounded-xl bg-amber-50/50 dark:bg-amber-955/15 text-amber-800 dark:text-amber-300 text-sm font-semibold">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              Nenhum registro coincide com os critérios e filtros aplicados atualmente.
            </div>
          )}

          {/* VIEW: TABLE ONLY */}
          {filteredGroups.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-955/50 text-slate-500 dark:text-slate-400 text-left uppercase tracking-wider text-[10px]">
                      {visibleColumns.material && <th className="px-3 py-2.5 font-black">Material</th>}
                      {visibleColumns.descricao && <th className="px-3 py-2.5 font-black">Descrição</th>}
                      {visibleColumns.fornecedor && <th className="px-3 py-2.5 font-black">Fornecedor</th>}
                      {visibleColumns.uf && <th className="px-3 py-2.5 font-black">UF</th>}
                      {visibleColumns.contato && <th className="px-3 py-2.5 font-black">Contato</th>}
                      {visibleColumns.qtd && <th className="px-3 py-2.5 font-black text-right">Qtd</th>}
                      {visibleColumns.preco && <th className="px-3 py-2.5 font-black text-right">Preço Unit</th>}
                      {visibleColumns.total && <th className="px-3 py-2.5 font-black text-right">Valor Total</th>}
                      {visibleColumns.rm && <th className="px-3 py-2.5 font-black">RM</th>}
                      {visibleColumns.doc_compra && <th className="px-3 py-2.5 font-black">Nº Pedido</th>}
                      {visibleColumns.data_doc && <th className="px-3 py-2.5 font-black">Data Pedido</th>}
                      {visibleColumns.item && <th className="px-3 py-2.5 font-black text-center">Item</th>}
                      {visibleColumns.ultima_compra && <th className="px-3 py-2.5 font-black text-right">Última Compra</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {visibleGroups.flatMap(g =>
                      g.fornecedores.map((f, i) => (
                        <tr key={`${g.material}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-850/30 transition-colors">
                          {visibleColumns.material && (
                            <td className="px-3 py-2 font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              {i === 0 ? g.material : ''}
                            </td>
                          )}
                          {visibleColumns.descricao && (
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[220px] truncate" title={g.txt_breve}>
                              {i === 0 ? g.txt_breve : ''}
                            </td>
                          )}
                          {visibleColumns.fornecedor && (
                            <td className="px-3 py-2 text-slate-800 dark:text-slate-200 font-semibold max-w-[200px] truncate" title={f.fornecedor}>
                              {f.fornecedor}
                            </td>
                          )}
                          {visibleColumns.uf && <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{f.regiao_uf}</td>}
                          {visibleColumns.contato && (
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-1.5">
                                {f.telefone !== '—' && (
                                  <div className="flex items-center gap-1.5">
                                    <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                                    <a href={`tel:${f.telefone.split(';')[0].trim()}`} className="font-mono text-slate-700 dark:text-slate-350 hover:text-emerald-600 font-bold hover:underline">
                                      {f.telefone.split(';')[0].trim()}
                                    </a>
                                    <ClipboardCopyButton text={f.telefone.split(';')[0].trim()} label="telefone" />
                                  </div>
                                )}
                                {f.email !== '—' && (
                                  <div className="flex items-center gap-1.5">
                                    <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                                    <a href={`mailto:${f.email}`} className="text-slate-650 dark:text-slate-355 hover:text-blue-600 font-bold hover:underline break-all">
                                      {f.email}
                                    </a>
                                    <ClipboardCopyButton text={f.email} label="e-mail" />
                                  </div>
                                )}
                                {f.telefone === '—' && f.email === '—' && <span className="text-slate-400">—</span>}
                              </div>
                            </td>
                          )}
                          {visibleColumns.qtd && (
                            <td className="px-3 py-2 text-right font-medium text-slate-700 dark:text-slate-350">
                              {f.qtd_pedido !== undefined ? f.qtd_pedido.toLocaleString('pt-BR') : '—'}
                            </td>
                          )}
                          {visibleColumns.preco && (
                            <td className="px-3 py-2 text-right font-medium text-slate-700 dark:text-slate-350">
                              {formatPreco(f.preco_liquido)}
                            </td>
                          )}
                          {visibleColumns.total && (
                            <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-450 whitespace-nowrap">
                              {formatPreco(f.valor_liquido)}
                            </td>
                          )}
                          {visibleColumns.rm && (
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-mono" title={f.rm}>
                              {f.rm}
                            </td>
                          )}
                          {visibleColumns.doc_compra && (
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-mono" title={f.doc_compra}>
                              {f.doc_compra}
                            </td>
                          )}
                          {visibleColumns.data_doc && (
                            <td className="px-3 py-2 text-slate-550 dark:text-slate-400 whitespace-nowrap">
                              {formatDateBR(f.data_doc)}
                            </td>
                          )}
                          {visibleColumns.item && (
                            <td className="px-3 py-2 text-slate-550 dark:text-slate-400 font-mono text-center">
                              {f.item}
                            </td>
                          )}
                          {visibleColumns.ultima_compra && (
                            <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {formatDateBR(f.ultima_data)}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Load more */}
          {visibleCount < filteredGroups.length && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all"
              >
                <ChevronDown className="h-4 w-4" /> Carregar mais {Math.min(PAGE_SIZE, filteredGroups.length - visibleCount)} materiais
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
