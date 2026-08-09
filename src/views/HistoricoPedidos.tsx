/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  History, Search, FileSpreadsheet, AlertCircle, Phone, Mail, Calendar,
  RefreshCw, Filter, MapPin, Package, DollarSign, Layers,
  Copy, Check, ChevronDown, Users, SlidersHorizontal, Clock, BarChart3, Scale
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { localDb } from '../db/localDb';
import { Profile, ContatoFornecedor, CidadeForn, HistoricoPedidoView } from '../types';
import AuditoriaPrecos from '../components/historico/AuditoriaPrecos';
import { porTipoItem } from '../lib/historicoAnalytics';

import { formatInt, formatDateBR, formatDateTimeBR } from '../lib/format';
import {
  TableShell, TableHeadRow, TableBody, Th, SortableTh, Tr, Td, TableSkeleton, TableEmpty, TableFooter,
} from '../components/ui/DataTable';

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
  pais?: string;
  cidade?: string;
  rua?: string;
  codigo_postal?: string;
  telefone: string;
  email: string;
  classificacao: string;
  grp_mercads: string;
  grp_mercads_desc: string;
  /** 'Projeto' (material 18 dígitos iniciado em 100000000) ou 'Consumo'. */
  tipo_item: string;
  doc_compra: string;
  rm: string;
  data_doc: string;
  qtd?: number;
  preco_unit?: number;
  valor_total?: number;
  /** Entrega ainda não fechou (0 < qtd_fornecida < qtd_pedido no SAP). */
  pedido_parcial?: boolean;
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
  { id: 'cidade', label: 'Cidade', sortable: true },
  { id: 'estado', label: 'Estado (UF)', sortable: true },
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

// SortableTh, a casca da tabela e os estados vazios vêm de components/ui/DataTable.

type AbaHistorico = 'consulta' | 'auditoria';

export default function HistoricoPedidos({ user, onNavigate }: HistoricoPedidosProps) {
  // Consulta e auditoria respondem perguntas diferentes ("quem já forneceu isso"
  // contra "pagamos bem por isso") e por isso têm filtros próprios. Abas em vez
  // de colunas extras: a tabela de consulta já tem doze.
  const [aba, setAba] = useState<AbaHistorico>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'auditoria'
      ? 'auditoria'
      : 'consulta'
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [ufFilter, setUfFilter] = useState('Todos');
  const [classFilter, setClassFilter] = useState('Todos');
  const [yearFilter, setYearFilter] = useState('Todos');
  const [grupoFilter, setGrupoFilter] = useState('Todos');
  // 'Projeto' = material de 18 dígitos iniciado em 100000000; o resto é 'Consumo'.
  // As duas naturezas têm perfil de gasto oposto (ver spec de Análise de
  // Compras) — analisá-las juntas distorce ticket médio e concentração.
  const [tipoItemFilter, setTipoItemFilter] = useState<'Todos' | 'Consumo' | 'Projeto'>('Todos');

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

    const cidades = localDb.getCidadeForn();
    const cidadesMap = new Map<string, CidadeForn>();
    cidades.forEach(cf => { if (cf.forn_codigo) cidadesMap.set(String(cf.forn_codigo).trim(), cf); });

    return linhas.map(l => {
      const contato = l.cod_forn ? contatosMap.get(String(l.cod_forn).trim()) : undefined;
      const cidForn = l.cod_forn ? cidadesMap.get(String(l.cod_forn).trim()) : undefined;

      return {
        material: l.material || '—',
        txt_breve: l.txt_breve || '—',
        cod_forn: l.cod_forn || '—',
        cnpj: l.cnpj || '—',
        fornecedor: l.fornecedor || contato?.fornecedor || cidForn?.forn_nome || '—',
        nome_fantasia: contato?.nome_fantasia || '—',
        regiao_uf: l.regiao_uf || '—',
        pais: l.pais || cidForn?.pais || '—',
        cidade: l.cidade || l.localidade || cidForn?.localidade || '—',
        rua: l.rua || cidForn?.rua || '—',
        codigo_postal: l.codigo_postal || cidForn?.codigo_postal || '—',
        telefone: contato?.telefone || '—',
        email: contato?.email || '—',
        classificacao: contato?.classificacao || '—',
        grp_mercads: l.grp_mercads || '—',
        grp_mercads_desc: l.grp_mercads_desc || l.grp_mercads || '—',
        tipo_item: porTipoItem(l),
        doc_compra: l.doc_compra || '—',
        rm: l.reqc || '—',
        data_doc: l.data_doc || '—',
        qtd: l.qtd_pedido ?? undefined,
        preco_unit: l.preco_liquido_unit ?? undefined,
        valor_total: l.valor_liquido ?? undefined,
        pedido_parcial: l.pedido_parcial ?? false,
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

  // Só busca o histórico quando a aba de consulta está à vista: quem abre direto
  // na auditoria (via ?tab=auditoria) não precisa da view completa, que é o
  // maior dos dois downloads.
  useEffect(() => { if (aba === 'consulta') load(false); }, [load, aba]);

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

  // Grupo de mercadoria pela descrição amigável (ex.: "EPI", "TORRES/COLUNAS"),
  // com fallback ao código quando a tabela de descrições não cobre o grupo —
  // sem isso um grupo sem descrição some da lista em vez de aparecer como opção.
  const grupoOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.grp_mercads_desc && r.grp_mercads_desc !== '—') s.add(r.grp_mercads_desc); });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [rows]);

  // Filtragem por busca, UF, classificação, ano e grupo de material.
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter(r => {
      if (ufFilter !== 'Todos' && r.regiao_uf !== ufFilter) return false;
      if (classFilter !== 'Todos' && r.classificacao !== classFilter) return false;
      if (yearFilter !== 'Todos' && yearOf(r.data_doc) !== yearFilter) return false;
      if (grupoFilter !== 'Todos' && r.grp_mercads_desc !== grupoFilter) return false;
      if (tipoItemFilter !== 'Todos' && r.tipo_item !== tipoItemFilter) return false;
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
  }, [rows, searchQuery, ufFilter, classFilter, yearFilter, grupoFilter, tipoItemFilter]);

  // Ordenação: por coluna quando ativa; caso contrário material asc + data desc.
  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    if (sortColumn) {
      const getVal = (r: Row): string | number => {
        switch (sortColumn) {
          case 'material': return normalizeCode(r.material);
          case 'descricao': return r.txt_breve.toLowerCase();
          case 'fornecedor': return r.fornecedor.toLowerCase();
          case 'cidade': return (r.cidade || '').toLowerCase();
          case 'estado': case 'uf': return r.regiao_uf.toLowerCase();
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
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchQuery, ufFilter, classFilter, yearFilter, grupoFilter, tipoItemFilter, sortColumn, sortDir]);

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
      'Rua': r.rua || '—',
      'Cidade': r.cidade || '—',
      'Estado (UF)': r.regiao_uf || '—',
      'País': r.pais || '—',
      'Código Postal': r.codigo_postal || '—',
      'Telefone': r.telefone,

      'E-mail': r.email,
      'Classificação': r.classificacao,
      'Grupo de Mercadoria': r.grp_mercads_desc,
      'Natureza': r.tipo_item,
      'Quantidade': r.qtd ?? '—',
      'Preço Unitário': r.preco_unit ?? '—',
      'Valor Total': r.valor_total ?? '—',
      'RM': r.rm,
      'Nº Pedido': r.doc_compra,
      'Data Pedido': formatDateBR(r.data_doc),
      'Pedido Parcial': r.pedido_parcial ? 'Sim' : 'Não',
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
            {aba === 'consulta'
              ? 'Consulte todo o histórico de compras por material. Cada linha é um pedido consolidado por fornecedor. Identifique fornecedores já utilizados e obtenha contato para agilizar cotações.'
              : 'Audite as compras de 2026 contra o que o mesmo material custou no passado, corrigido pelo IPCA. Cada linha abre o histórico que formou a referência.'}
          </p>
          {aba === 'consulta' && lastUpdated && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 flex items-center gap-1 font-medium">
              <Clock className="h-3 w-3" /> {localDb.getDatasetUpdateBadge('historico_pedidos')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 lg:overflow-x-auto shrink-0">
          {/* Esta tela é de consulta linha a linha; a análise agregada (quem
              concentra o gasto, de onde vem, risco de fonte única) vive na
              página irmã. */}
          <button
            onClick={() => onNavigate('/suprimentos/dashboards?tab=compras')}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all h-9 cursor-pointer"
          >
            <BarChart3 className="h-3.5 w-3.5" /> Análise de Compras
          </button>
          {/* Atualizar e Exportar pertencem à consulta; a auditoria traz os seus
              junto dos próprios filtros, porque operam sobre outro recorte. */}
          {aba === 'consulta' && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-slate-150 dark:border-slate-850 -mt-2">
        {([
          { id: 'consulta',  label: 'Consulta',            icon: History },
          { id: 'auditoria', label: 'Auditoria de Preços', icon: Scale },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            aria-current={aba === id ? 'page' : undefined}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors cursor-pointer
              ${aba === id
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-500'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {aba === 'auditoria' && <AuditoriaPrecos />}

      {aba === 'consulta' && (
      <>
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
              placeholder="Busque por item (código ou descrição), fornecedor, CNPJ, RM ou Nº do pedido..."
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
            <div className="relative min-w-[170px]">
              <Package className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-455 pointer-events-none" />
              <select
                value={grupoFilter}
                onChange={(e) => setGrupoFilter(e.target.value)}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none"
              >
                <option value="Todos">Grupo: Todos</option>
                {grupoOptions.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="relative min-w-[130px]">
              <Layers className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-455 pointer-events-none" />
              <select
                value={tipoItemFilter}
                onChange={(e) => setTipoItemFilter(e.target.value as 'Todos' | 'Consumo' | 'Projeto')}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none"
                title="Itens de projeto (código de 18 dígitos) têm perfil de gasto muito diferente de consumo"
              >
                <option value="Todos">Natureza: Todas</option>
                <option value="Consumo">Consumo</option>
                <option value="Projeto">Projeto</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Loading / erro / vazio */}
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
          icon={History}
          title="Nenhum pedido histórico encontrado"
          hint="Importe a base de pedidos (PEDIDOSFORN) em Cadastros SAP e garanta que a view vw_historico_pedidos existe no banco."
        />
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
            <>
              {/* Mobile: cards (evita scroll horizontal na tabela densa) */}
              <div
                className="lg:hidden rounded-xl border overflow-hidden divide-y"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
              >
                {visibleRows.map((r, idx) => (
                  <div key={`m-${r.material}-${r.doc_compra}-${r.cod_forn}-${idx}`} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{r.material}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{r.txt_breve}</p>
                      </div>
                      {r.valor_total !== undefined && (
                        <span className="shrink-0 text-sm font-bold text-emerald-600 dark:text-emerald-450 whitespace-nowrap">{formatPreco(r.valor_total)}</span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{r.fornecedor}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {r.qtd !== undefined && <span>Qtd: <strong className="text-slate-700 dark:text-slate-300">{r.qtd.toLocaleString('pt-BR')}</strong></span>}
                      {r.preco_unit !== undefined && <span>Unit: <strong className="text-slate-700 dark:text-slate-300">{formatPreco(r.preco_unit)}</strong></span>}
                      {r.doc_compra !== '—' && <span className="font-mono">PO {r.doc_compra}</span>}
                      {r.data_doc && <span>{formatDateBR(r.data_doc)}</span>}
                      {r.pedido_parcial && (
                        <span
                          title="Entrega ainda não fechou no SAP — quantidade e valor podem mudar até concluir."
                          className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold whitespace-nowrap"
                          style={{ color: 'var(--status-warning)', background: 'color-mix(in srgb, var(--status-warning) 14%, transparent)' }}
                        >
                          pedido parcial
                        </span>
                      )}
                    </div>
                    {(r.telefone !== '—' || r.email !== '—') && (
                      <div className="flex flex-col gap-1 pt-1">
                        {r.telefone !== '—' && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                            <a href={`tel:${r.telefone.split(';')[0].trim()}`} className="font-mono font-bold text-slate-700 dark:text-slate-350">{r.telefone.split(';')[0].trim()}</a>
                            <ClipboardCopyButton text={r.telefone.split(';')[0].trim()} label="telefone" />
                          </div>
                        )}
                        {r.email !== '—' && (
                          <div className="flex items-center gap-1.5 text-xs min-w-0">
                            <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                            <a href={`mailto:${r.email}`} className="font-bold text-slate-650 dark:text-slate-355 truncate">{r.email}</a>
                            <ClipboardCopyButton text={r.email} label="e-mail" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop: tabela com cabeçalho fixo. */}
              <div className="hidden lg:block">
                <TableShell>
                  <table className="w-full text-xs">
                    <TableHeadRow>
                      {COLUMNS.map(col => (
                        visibleColumns[col.id] ? (
                          col.sortable
                            ? <SortableTh key={col.id} col={col.id} label={col.label} align={col.align} sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                            : <Th key={col.id} label={col.label} align={col.align} />
                        ) : null
                      ))}
                    </TableHeadRow>
                    <TableBody>
                      {visibleRows.map((r, idx) => {
                        // Material/descrição aparecem só quando mudam em relação à linha anterior.
                        const isNewMaterial = idx === 0 || normalizeCode(visibleRows[idx - 1].material) !== normalizeCode(r.material);
                        return (
                          <Tr key={`${r.material}-${r.doc_compra}-${r.cod_forn}-${idx}`}>
                            {visibleColumns.material && (
                              <Td mono strong className="whitespace-nowrap">{isNewMaterial ? r.material : ''}</Td>
                            )}
                            {visibleColumns.descricao && (
                              <Td truncate title={r.txt_breve}>{isNewMaterial ? r.txt_breve : ''}</Td>
                            )}
                            {visibleColumns.fornecedor && (
                              <Td strong truncate title={r.fornecedor} className="max-w-[200px]">{r.fornecedor}</Td>
                            )}
                            {visibleColumns.cidade && (
                              <Td truncate title={r.cidade || '—'}>{r.cidade || '—'}</Td>
                            )}
                            {visibleColumns.estado && <Td>{r.regiao_uf || '—'}</Td>}


                            {visibleColumns.contato && (
                              <Td>
                                <div className="flex flex-col gap-1.5">
                                  {r.telefone !== '—' && (
                                    <div className="flex items-center gap-1.5">
                                      <Phone className="h-3 w-3 shrink-0" style={{ color: 'var(--ink-muted)' }} />
                                      <a
                                        href={`tel:${r.telefone.split(';')[0].trim()}`}
                                        className="font-mono font-bold hover:underline tabular"
                                        style={{ color: 'var(--ink-secondary)' }}
                                      >
                                        {r.telefone.split(';')[0].trim()}
                                      </a>
                                      <ClipboardCopyButton text={r.telefone.split(';')[0].trim()} label="telefone" />
                                    </div>
                                  )}
                                  {r.email !== '—' && (
                                    <div className="flex items-center gap-1.5">
                                      <Mail className="h-3 w-3 shrink-0" style={{ color: 'var(--ink-muted)' }} />
                                      <a
                                        href={`mailto:${r.email}`}
                                        className="font-bold hover:underline break-all"
                                        style={{ color: 'var(--ink-secondary)' }}
                                      >
                                        {r.email}
                                      </a>
                                      <ClipboardCopyButton text={r.email} label="e-mail" />
                                    </div>
                                  )}
                                  {r.telefone === '—' && r.email === '—' && (
                                    <span style={{ color: 'var(--ink-muted)' }}>—</span>
                                  )}
                                </div>
                              </Td>
                            )}
                            {visibleColumns.qtd && (
                              <Td align="right" numeric>{r.qtd !== undefined ? formatInt(r.qtd) : '—'}</Td>
                            )}
                            {visibleColumns.preco && (
                              <Td align="right" numeric>{formatPreco(r.preco_unit)}</Td>
                            )}
                            {visibleColumns.total && (
                              <Td align="right" numeric strong className="whitespace-nowrap">{formatPreco(r.valor_total)}</Td>
                            )}
                            {visibleColumns.rm && <Td mono title={r.rm}>{r.rm}</Td>}
                            {visibleColumns.doc_compra && (
                              <Td mono title={r.doc_compra}>
                                {r.doc_compra}
                                {r.pedido_parcial && (
                                  <span
                                    title="Entrega ainda não fechou no SAP — quantidade e valor podem mudar até concluir."
                                    className="ml-1.5 inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold whitespace-nowrap align-middle"
                                    style={{ color: 'var(--status-warning)', background: 'color-mix(in srgb, var(--status-warning) 14%, transparent)' }}
                                  >
                                    pedido parcial
                                  </span>
                                )}
                              </Td>
                            )}
                            {visibleColumns.data_doc && (
                              <Td numeric className="whitespace-nowrap">{formatDateBR(r.data_doc)}</Td>
                            )}
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
      </>
      )}
    </div>
  );
}
