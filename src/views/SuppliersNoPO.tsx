/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  PackageSearch, Search, FileSpreadsheet, AlertCircle, ChevronDown, ChevronRight,
  Phone, Mail, Tag, Calendar, AlertTriangle, RefreshCw, Filter, User, FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../db/supabaseClient';
import { localDb } from '../db/localDb';
import {
  Profile, EnrichedSAPRecord, PedidoForn, ContatoFornecedor,
  FornecedorMaterialRow
} from '../types';

interface SuppliersNoPOProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

interface ItemNode {
  record: EnrichedSAPRecord;
  encontrado: boolean;
  fornecedores: FornecedorMaterialRow[];
}

interface RMGroup {
  rm: string;
  items: ItemNode[];
}

// Normaliza códigos de material para casar registros mesmo com diferença de zeros à
// esquerda (a requisição costuma vir com 8 dígitos "01397133" e o pedidosforn com o
// código "puro" 1397133, ou vice-versa). Comparamos sempre sem zeros à esquerda.
const normalizeCode = (c: any): string => {
  const s = String(c ?? '').trim();
  const stripped = s.replace(/^0+/, '');
  return stripped.length > 0 ? stripped : (s.length > 0 ? '0' : '');
};

const formatPreco = (v?: number | null): string =>
  v === undefined || v === null || isNaN(v)
    ? '—'
    : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// O PostgREST/Supabase limita a resposta de qualquer select a um teto padrão de 1000
// linhas — inclusive para uma única consulta `.in(...)`. A tabela pedidosforn tem
// dezenas de milhares de linhas, então um `.in('material', [muitos códigos])` sem
// paginação corta a resposta em 1000 linhas no total (não por material!), fazendo
// materiais cujas linhas ficam "depois do corte" desaparecerem por completo da
// resposta — e a tela os marcava como "Sem Histórico" mesmo tendo compras registradas.
// Por isso paginamos com `.range()` até esgotar, igual ao `fetchAllFromTable` do localDb.
async function fetchAllMatching<T>(
  table: string,
  column: string,
  values: string[],
  select: string
): Promise<T[]> {
  if (!supabase || values.length === 0) return [];
  const pageSize = 1000;
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .in(column, values)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (data) all.push(...(data as unknown as T[]));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export default function SuppliersNoPO({ user, onNavigate }: SuppliersNoPOProps) {
  const [loading, setLoading] = useState(true);
  const [rmGroups, setRmGroups] = useState<RMGroup[]>([]);
  const [expandedRMs, setExpandedRMs] = useState<Record<string, boolean>>({});
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [buyerFilter, setBuyerFilter] = useState('Todos');
  const [statusFilter, setStatusFilter] = useState('Todos');

  const buildSuppliersData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const semPoRecords = localDb
        .getEnrichedSAPRequisicoes()
        .filter(r => r.status_requisicao === 'Sem PO');

      // Variantes de código para a consulta (.in exige valores exatos): cobrimos o código
      // cru, sem zeros à esquerda e com padding em 8 dígitos, em ambos os sentidos.
      const codeVariants = new Set<string>();
      semPoRecords.forEach(r => {
        const raw = (r.material_code || '').trim();
        if (!raw) return;
        codeVariants.add(raw);
        const stripped = raw.replace(/^0+/, '');
        if (stripped) {
          codeVariants.add(stripped);
          codeVariants.add(stripped.padStart(8, '0'));
        }
        codeVariants.add(raw.padStart(8, '0'));
      });

      // material normalizado -> lista de fornecedores deduplicada
      const fornecedoresPorMaterial = new Map<string, FornecedorMaterialRow[]>();

      if (codeVariants.size > 0 && supabase) {
        const variantList = Array.from(codeVariants);
        const chunk = 150; // mantém a URL da consulta em tamanho razoável

        // 1. pedidosforn de todos os materiais (todas as variantes), paginando cada
        // consulta para não perder linhas por causa do teto padrão de 1000 do PostgREST.
        const pedidos: PedidoForn[] = [];
        for (let i = 0; i < variantList.length; i += chunk) {
          const slice = variantList.slice(i, i + chunk);
          const rows = await fetchAllMatching<PedidoForn>('pedidosforn', 'material', slice, '*');
          pedidos.push(...rows);
        }

        // 2. contatos dos fornecedores encontrados (mesma paginação por segurança)
        const codsForn = Array.from(
          new Set(pedidos.map(p => p.cod_forn).filter((c): c is string => !!c))
        );
        const contatosMap = new Map<string, ContatoFornecedor>();
        for (let i = 0; i < codsForn.length; i += chunk) {
          const slice = codsForn.slice(i, i + chunk);
          if (slice.length === 0) break;
          const rows = await fetchAllMatching<ContatoFornecedor>('contatos', 'cod_vendor', slice, '*');
          rows.forEach(c => contatosMap.set(c.cod_vendor, c));
        }

        // 3. Agrupar pedidos por material normalizado
        const pedidosPorNorm = new Map<string, PedidoForn[]>();
        pedidos.forEach(p => {
          const key = normalizeCode(p.material);
          if (!key) return;
          const arr = pedidosPorNorm.get(key);
          if (arr) arr.push(p);
          else pedidosPorNorm.set(key, [p]);
        });

        // 4. Deduplicar fornecedores por material (por CNPJ/cod_forn, mantendo o mais recente)
        pedidosPorNorm.forEach((pedidosMaterial, normKey) => {
          const fornMap = new Map<string, PedidoForn>();
          pedidosMaterial.forEach(p => {
            const key = p.cnpj ? p.cnpj.trim() : (p.cod_forn || '');
            if (!key) return;
            const existing = fornMap.get(key);
            if (!existing) {
              fornMap.set(key, p);
            } else {
              const dateA = p.data_pedido ? new Date(p.data_pedido).getTime() : 0;
              const dateB = existing.data_pedido ? new Date(existing.data_pedido).getTime() : 0;
              if (dateA > dateB) fornMap.set(key, p);
            }
          });

          const list: FornecedorMaterialRow[] = Array.from(fornMap.values()).map(p => {
            const contato = p.cod_forn ? contatosMap.get(p.cod_forn) : undefined;
            return {
              cod_forn: p.cod_forn || '—',
              cnpj: p.cnpj || '—',
              fornecedor: p.fornecedor || contato?.fornecedor || '—',
              regiao_uf: p.regiao_uf || '—',
              telefone: contato?.telefone || '—',
              email: contato?.email || '—',
              classificacao: contato?.classificacao || '—',
              ultima_data: p.data_pedido || '—',
              preco_liquido: p.preco_liquido
            };
          });

          list.sort((a, b) => {
            const dateA = a.ultima_data !== '—' ? new Date(a.ultima_data).getTime() : 0;
            const dateB = b.ultima_data !== '—' ? new Date(b.ultima_data).getTime() : 0;
            return dateB - dateA;
          });

          fornecedoresPorMaterial.set(normKey, list);
        });
      }

      // 5. Montar hierarquia RM -> Itens -> Fornecedores
      const rmMap = new Map<string, ItemNode[]>();
      const rmOrder: string[] = [];
      semPoRecords.forEach(record => {
        const fornecedores = fornecedoresPorMaterial.get(normalizeCode(record.material_code)) || [];
        const node: ItemNode = { record, encontrado: fornecedores.length > 0, fornecedores };
        const rm = record.requisicao_de_compra || '—';
        if (!rmMap.has(rm)) { rmMap.set(rm, []); rmOrder.push(rm); }
        rmMap.get(rm)!.push(node);
      });

      const built: RMGroup[] = rmOrder.map(rm => {
        const items = rmMap.get(rm)!;
        items.sort((a, b) => (a.record.item_reqc || '').localeCompare(b.record.item_reqc || ''));
        return { rm, items };
      });

      setRmGroups(built);
    } catch (e: any) {
      console.error('Erro ao montar consulta de fornecedores (Sem PO):', e);
      setError('Falha ao consultar a base de fornecedores. Tente atualizar novamente.');
      setRmGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    buildSuppliersData();
  }, [buildSuppliersData]);

  // Opções de filtro
  const buyerOptions = useMemo(() => {
    const s = new Set<string>();
    rmGroups.forEach(g => g.items.forEach(it => { if (it.record.grupo_comprador) s.add(it.record.grupo_comprador); }));
    return Array.from(s).sort();
  }, [rmGroups]);

  const statusOptions = useMemo(() => {
    const s = new Set<string>();
    rmGroups.forEach(g => g.items.forEach(it => { if (it.record.status_atualizado) s.add(it.record.status_atualizado); }));
    return Array.from(s).sort();
  }, [rmGroups]);

  // Aplicação dos filtros (nível item); a RM aparece se tiver ao menos 1 item que casa.
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const result: RMGroup[] = [];
    rmGroups.forEach(g => {
      const rmMatchesSearch = q ? g.rm.toLowerCase().includes(q) : false;
      const items = g.items.filter(it => {
        const r = it.record;
        if (buyerFilter !== 'Todos' && r.grupo_comprador !== buyerFilter) return false;
        if (statusFilter !== 'Todos' && r.status_atualizado !== statusFilter) return false;
        if (q) {
          const inRecord =
            (r.material_code || '').toLowerCase().includes(q) ||
            (r.texto_breve || '').toLowerCase().includes(q) ||
            (r.requisitante_name || '').toLowerCase().includes(q);
          const inFornecedor = it.fornecedores.some(f =>
            f.fornecedor.toLowerCase().includes(q) ||
            f.cnpj.toLowerCase().includes(q) ||
            f.cod_forn.toLowerCase().includes(q)
          );
          if (!rmMatchesSearch && !inRecord && !inFornecedor) return false;
        }
        return true;
      });
      if (items.length > 0) result.push({ rm: g.rm, items });
    });
    return result;
  }, [rmGroups, searchQuery, buyerFilter, statusFilter]);

  const totalItems = useMemo(() => rmGroups.reduce((s, g) => s + g.items.length, 0), [rmGroups]);
  const filteredItemCount = useMemo(() => filteredGroups.reduce((s, g) => s + g.items.length, 0), [filteredGroups]);

  const toggleRM = (rm: string) => setExpandedRMs(prev => ({ ...prev, [rm]: !prev[rm] }));
  const toggleItem = (ri: string) => setExpandedItems(prev => ({ ...prev, [ri]: !prev[ri] }));

  const allExpanded = filteredGroups.length > 0 && filteredGroups.every(g => expandedRMs[g.rm]);
  const toggleExpandAll = () => {
    const nextRMs: Record<string, boolean> = { ...expandedRMs };
    const nextItems: Record<string, boolean> = { ...expandedItems };
    const expand = !allExpanded;
    filteredGroups.forEach(g => {
      nextRMs[g.rm] = expand;
      g.items.forEach(it => { nextItems[it.record.ri] = expand; });
    });
    setExpandedRMs(nextRMs);
    setExpandedItems(nextItems);
  };

  const handleExportExcel = () => {
    if (filteredGroups.length === 0) return;
    const dataToExport: any[] = [];
    filteredGroups.forEach(g => {
      g.items.forEach(({ record: r, encontrado, fornecedores }) => {
        const base = {
          'RM / Requisição': r.requisicao_de_compra || '—',
          'Item': r.item_reqc || '—',
          'Código do Material': r.material_code || '—',
          'Descrição': r.texto_breve || '—',
          'Qtd.': r.qtd_requisicao ?? '—',
          'Un.': r.unidade_medida || '—',
          'Grupo Comprador': r.grupo_comprador || '—',
          'Natureza': r.natureza || '—',
          'Status': r.status_atualizado || '—',
          'Alerta': r.alerta || '—',
          'Dias em Aberto': r.dias_em_aberto ?? '—'
        };
        if (!encontrado || fornecedores.length === 0) {
          dataToExport.push({
            ...base,
            'Cód. Fornecedor': '—', 'CNPJ': '—', 'Fornecedor': 'Material sem histórico de fornecedores',
            'UF': '—', 'Telefone': '—', 'E-mail': '—', 'Classificação': '—', 'Preço Líquido': '—', 'Última Compra': '—'
          });
        } else {
          fornecedores.forEach(f => {
            dataToExport.push({
              ...base,
              'Cód. Fornecedor': f.cod_forn, 'CNPJ': f.cnpj, 'Fornecedor': f.fornecedor,
              'UF': f.regiao_uf, 'Telefone': f.telefone, 'E-mail': f.email,
              'Classificação': f.classificacao,
              'Preço Líquido': f.preco_liquido !== undefined && f.preco_liquido !== null ? f.preco_liquido : '—',
              'Última Compra': f.ultima_data
            });
          });
        }
      });
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Itens Sem PO - Fornecedores');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    XLSX.writeFile(wb, `itens_sem_po_fornecedores_${timestamp}.xlsx`);
  };

  // Severidade do alerta -> aparência (chip + acento colorido à esquerda)
  const alertLevel = (alerta: string): 'critico' | 'atencao' | 'monitorar' | 'ok' => {
    if (alerta.includes('⚠️')) return 'critico';
    if (alerta.includes('⚡')) return 'atencao';
    if (alerta.includes('📋')) return 'monitorar';
    return 'ok';
  };
  const ALERT_STYLE: Record<string, { chip: string; bar: string; dot: string }> = {
    critico: { chip: 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400', bar: 'bg-rose-500', dot: 'bg-rose-500' },
    atencao: { chip: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400', bar: 'bg-amber-500', dot: 'bg-amber-500' },
    monitorar: { chip: 'bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400', bar: 'bg-sky-500', dot: 'bg-sky-500' },
    ok: { chip: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-500', dot: 'bg-emerald-400' },
  };
  // Pior severidade dentre os itens de uma RM (para o acento do cabeçalho da RM)
  const worstLevel = (items: ItemNode[]): 'critico' | 'atencao' | 'monitorar' | 'ok' => {
    const order = ['ok', 'monitorar', 'atencao', 'critico'];
    let worst = 'ok';
    items.forEach(it => {
      const lvl = alertLevel(it.record.alerta || '');
      if (order.indexOf(lvl) > order.indexOf(worst)) worst = lvl;
    });
    return worst as any;
  };

  // KPIs baseados no que está visível (após filtros)
  const kpis = useMemo(() => {
    let com = 0, sem = 0, criticos = 0;
    filteredGroups.forEach(g => g.items.forEach(it => {
      if (it.encontrado) com++; else sem++;
      const lvl = alertLevel(it.record.alerta || '');
      if (lvl === 'critico' || lvl === 'atencao') criticos++;
    }));
    return { rms: filteredGroups.length, itens: filteredItemCount, com, sem, criticos };
  }, [filteredGroups, filteredItemCount]);

  return (
    <div className="space-y-6 select-text">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <PackageSearch className="h-6 w-6 text-emerald-600 dark:text-emerald-500" />
            Itens Sem PO — Fornecedores
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Requisições ME5A em aberto (Sem PO) agrupadas por RM &gt; Item &gt; Fornecedores, com a consulta já pronta. Itens processados saem automaticamente da lista.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={buildSuppliersData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          {filteredItemCount > 0 && (
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      {!loading && !error && rmGroups.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">RMs em aberto</span>
            <p className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">{kpis.rms}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Itens em aberto</span>
            <p className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">{kpis.itens}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Com fornecedor</span>
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-500 mt-1">{kpis.com}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sem histórico</span>
            <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-500 mt-1">{kpis.sem}</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por código, palavra-chave, RM ou fornecedor..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                value={buyerFilter}
                onChange={(e) => setBuyerFilter(e.target.value)}
                className="pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none"
              >
                <option value="Todos">Comprador: Todos</option>
                {buyerOptions.map(g => <option key={g} value={g}>Grupo {g}</option>)}
              </select>
            </div>
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-8 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none"
              >
                <option value="Todos">Status: Todos</option>
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-12 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl space-y-3">
          <RefreshCw className="h-7 w-7 text-emerald-600 animate-spin" />
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Carregando itens em aberto e consultando fornecedores...</span>
        </div>
      )}

      {/* Erro */}
      {!loading && error && (
        <div className="flex items-center gap-3 p-5 border border-rose-200 dark:border-rose-900 rounded-xl bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300">
          <AlertCircle className="h-6 w-6 text-rose-500 shrink-0" />
          <span className="text-xs font-semibold">{error}</span>
        </div>
      )}

      {/* Vazio */}
      {!loading && !error && rmGroups.length === 0 && (
        <div className="flex items-center gap-3 p-5 border border-emerald-200 dark:border-emerald-900 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300">
          <AlertCircle className="h-6 w-6 text-emerald-500 shrink-0" />
          <div className="text-xs">
            <p className="font-bold">Nenhum item em aberto (Sem PO).</p>
            <p className="mt-0.5 opacity-90">Todos os itens ME5A carregados já foram processados.</p>
          </div>
        </div>
      )}

      {/* Resultados */}
      {!loading && !error && rmGroups.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1 font-semibold">
            <span>{filteredGroups.length} RM(s) · {filteredItemCount} de {totalItems} itens em aberto</span>
            {filteredGroups.length > 0 && (
              <button onClick={toggleExpandAll} className="hover:text-emerald-600 dark:hover:text-emerald-500 cursor-pointer">
                {allExpanded ? 'Colapsar todos' : 'Expandir todos'}
              </button>
            )}
          </div>

          {filteredGroups.length === 0 && (
            <div className="flex items-center gap-3 p-5 border border-amber-200 dark:border-amber-900 rounded-xl bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs font-semibold">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              Nenhum item corresponde aos filtros aplicados.
            </div>
          )}

          {/* Nível 1: RM */}
          <div className="space-y-3">
            {filteredGroups.map((g) => {
              const rmExpanded = !!expandedRMs[g.rm];
              const rmWithHistory = g.items.filter(it => it.encontrado).length;
              const lvl = worstLevel(g.items);
              const rmBar = { critico: 'border-l-rose-500', atencao: 'border-l-amber-500', monitorar: 'border-l-sky-500', ok: 'border-l-emerald-500' }[lvl];
              return (
                <div key={g.rm} className={`border border-slate-200 dark:border-slate-800 border-l-4 ${rmBar} rounded-xl shadow-sm overflow-hidden bg-white dark:bg-slate-900`}>
                  {/* RM header */}
                  <div
                    onClick={() => toggleRM(g.rm)}
                    className="pl-4 pr-4 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors"
                  >
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">RM</span>
                        <span className="font-mono font-bold text-base text-slate-800 dark:text-slate-100">{g.rm}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {g.items.length} {g.items.length === 1 ? 'item' : 'itens'} · {rmWithHistory} com fornecedor
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300">
                        {g.items.length}
                      </span>
                      {rmExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                    </div>
                  </div>

                  {/* Nível 2: Itens (linhas planas divididas) */}
                  {rmExpanded && (
                    <div className="border-t border-slate-100 dark:border-slate-850 divide-y divide-slate-100 dark:divide-slate-850">
                      {g.items.map(({ record: r, encontrado, fornecedores }) => {
                        const itemExpanded = !!expandedItems[r.ri];
                        const ilvl = alertLevel(r.alerta || '');
                        const dot = ALERT_STYLE[ilvl].dot;
                        return (
                          <div key={r.ri}>
                            {/* Item row */}
                            <div
                              onClick={() => toggleItem(r.ri)}
                              className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors ${itemExpanded ? 'bg-slate-50 dark:bg-slate-850/40' : 'hover:bg-slate-50/70 dark:hover:bg-slate-850/25'}`}
                            >
                              <span className={`h-2 w-2 rounded-full shrink-0 ${encontrado ? dot : 'bg-rose-500'}`} title={r.alerta || ''} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-bold text-sm text-slate-800 dark:text-slate-100">{r.material_code || '—'}</span>
                                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">Item {r.item_reqc}</span>
                                  {r.alerta && ilvl !== 'ok' && (
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ALERT_STYLE[ilvl].chip}`}>{r.alerta}</span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 truncate">{r.texto_breve || 'Descrição indisponível'}</p>
                                <div className="flex items-center gap-x-3 gap-y-0.5 mt-1 text-[10px] text-slate-400 dark:text-slate-500 font-semibold flex-wrap">
                                  <span>{r.qtd_requisicao} {r.unidade_medida}</span>
                                  <span>Grupo {r.grupo_comprador || '—'}</span>
                                  <span>{r.natureza}</span>
                                  <span>{r.dias_em_aberto}d em aberto</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2.5 shrink-0">
                                {encontrado ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                    <User className="h-3 w-3" /> {fornecedores.length}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full bg-rose-50 dark:bg-rose-950/30 text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wide">
                                    Sem histórico
                                  </span>
                                )}
                                {itemExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                              </div>
                            </div>

                            {/* Nível 3: Fornecedores (painel embutido) */}
                            {itemExpanded && (
                              <div className="px-4 pb-4 pt-1 bg-slate-50 dark:bg-slate-850/40">
                                <div className="ml-5 border-l-2 border-emerald-200 dark:border-emerald-900/50 pl-4">
                                  {!encontrado ? (
                                    <div className="flex items-center gap-2.5 p-3 rounded-lg border border-rose-150 dark:border-rose-950/30 bg-rose-50/40 dark:bg-rose-950/10 text-rose-800 dark:text-rose-400 text-xs">
                                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                                      <span>Sem registro de compras anteriores para este material no banco de dados.</span>
                                    </div>
                                  ) : (
                                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                                      <table className="min-w-full divide-y divide-slate-150 dark:divide-slate-800 text-left text-xs">
                                        <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                                          <tr>
                                            <th className="py-2.5 px-3">Cód.</th>
                                            <th className="py-2.5 px-3">CNPJ</th>
                                            <th className="py-2.5 px-3">Fornecedor</th>
                                            <th className="py-2.5 px-3 text-center">UF</th>
                                            <th className="py-2.5 px-3">Telefone</th>
                                            <th className="py-2.5 px-3">E-mail</th>
                                            <th className="py-2.5 px-3">Classificação</th>
                                            <th className="py-2.5 px-3 text-right">Preço Líquido</th>
                                            <th className="py-2.5 px-3">Última Compra</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-150 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                                          {fornecedores.map((f, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20">
                                              <td className="py-2.5 px-3 font-mono text-[11px] font-semibold">{f.cod_forn}</td>
                                              <td className="py-2.5 px-3 font-mono text-[11px]">{f.cnpj}</td>
                                              <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">{f.fornecedor}</td>
                                              <td className="py-2.5 px-3 text-center">{f.regiao_uf}</td>
                                              <td className="py-2.5 px-3">
                                                {f.telefone !== '—' ? (
                                                  <a href={`tel:${f.telefone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-500 transition-colors">
                                                    <Phone className="h-3 w-3 opacity-60" /> {f.telefone}
                                                  </a>
                                                ) : '—'}
                                              </td>
                                              <td className="py-2.5 px-3">
                                                {f.email !== '—' ? (
                                                  <a href={`mailto:${f.email}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 hover:text-emerald-600 dark:hover:text-emerald-500 transition-colors font-medium">
                                                    <Mail className="h-3 w-3 opacity-60" /> {f.email}
                                                  </a>
                                                ) : '—'}
                                              </td>
                                              <td className="py-2.5 px-3">
                                                {f.classificacao !== '—' ? (
                                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400">
                                                    <Tag className="h-2.5 w-2.5" /> {f.classificacao}
                                                  </span>
                                                ) : '—'}
                                              </td>
                                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                                {formatPreco(f.preco_liquido)}
                                              </td>
                                              <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">
                                                <span className="flex items-center gap-1">
                                                  <Calendar className="h-3 w-3 opacity-60" /> {f.ultima_data}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
