/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Consulta dos lançamentos de Contas a Pagar (FBL1N) — dados brutos importados
 * na aba Importar SAP, sem cache local (tabela grande e volátil, atualizada por
 * substituição total a cada carga).
 *
 * Duas apresentações sobre os mesmos filtros: a grade agrupada por fornecedor
 * no desktop (`lg+`) e, no celular, resumo + atalhos de situação + lista de
 * fornecedores ou agenda de vencimentos, com o detalhe num painel
 * (components/financeiro/ContasPagarMobile.tsx). Regras de saldo e de
 * vencimento em lib/contasPagar.ts.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Receipt, RefreshCw, FileSpreadsheet, Search, AlertCircle, Wallet, CalendarClock, ListChecks,
  ChevronRight, ChevronDown, ChevronsUpDown, Building2, Layers, Clock, CheckCircle2, X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../db/supabaseClient';
import { localDb } from '../db/localDb';
import { Profile } from '../types';
import { canAccessPage } from '../lib/pages';
import { formatBRL, formatDateBR } from '../lib/format';
import {
  agruparPorFornecedor, estaCompensada, estaVencida, hojeISO, nomeFornecedor, ordenarFornecedores, passaAtalho,
  resumirAberto, rotuloTipoDoc, venceEm7Dias,
  type AtalhoSituacao, type GrupoFornecedor, type OrdemFornecedores, type PartidaPagar,
} from '../lib/contasPagar';
import PlanilhaSapUploadButton from '../components/almoxarifado/PlanilhaSapUploadButton';
import KpiCard from '../components/charts/KpiCard';
import MultiSelectFilter from '../components/ui/MultiSelectFilter';
import FiltrosSheet, { BotaoFiltros, CampoFiltro, classeCampoFiltro } from '../components/ui/FiltrosSheet';
import {
  AgendaVencimentosMobile, AtalhosSituacao, DetalheFornecedorSheet, ListaFornecedoresMobile, ResumoAbertoMobile,
} from '../components/financeiro/ContasPagarMobile';
import {
  TableShell, TableHeadRow, TableBody, SortableTh, Td, TableSkeleton, TableEmpty, TableFooter, TableDesktop,
} from '../components/ui/DataTable';

interface ContasPagarProps {
  user: Profile;
}

interface Fbl1nLancamento extends PartidaPagar {
  moeda_documento: string | null;
}

type SortDir = 'asc' | 'desc';
type StatusFiltro = 'Em aberto' | 'Compensado' | 'Vencido';
type Agrupamento = 'fornecedor' | 'vencimento';

const STATUS_OPCOES: StatusFiltro[] = ['Em aberto', 'Vencido', 'Compensado'];
const ROTULO_STATUS: Record<string, string> = {
  'Em aberto': 'Em aberto',
  Vencido: 'Partidas vencidas',
  Compensado: 'Compensado',
};

const ORDENS_MOBILE: [OrdemFornecedores | null, SortDir, string][] = [
  [null, 'desc', 'Maior saldo em aberto'],
  ['vencidos', 'desc', 'Maior valor vencido'],
  ['fornecedor', 'asc', 'Nome (A–Z)'],
  ['lancamentos', 'desc', 'Mais lançamentos'],
  ['valor', 'desc', 'Maior valor pago'],
];

const PAGE_SIZE = 50;

/** Celular abre direto no que está em aberto; o desktop mantém a visão completa. */
const telaCelular = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(max-width: 1023px)').matches;

function statusDe(l: PartidaPagar): 'Em aberto' | 'Compensado' {
  return estaCompensada(l) ? 'Compensado' : 'Em aberto';
}

export default function ContasPagar({ user }: ContasPagarProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lancamentos, setLancamentos] = useState<Fbl1nLancamento[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [fornecedoresSelecionados, setFornecedoresSelecionados] = useState<Set<string>>(new Set());
  // Filtros de seleção múltipla: conjunto vazio = sem restrição.
  const [empresasSelecionadas, setEmpresasSelecionadas] = useState<Set<string>>(new Set());
  const [statusSelecionados, setStatusSelecionados] = useState<Set<string>>(() => new Set(telaCelular() ? ['Em aberto'] : []));
  const [tiposDocSelecionados, setTiposDocSelecionados] = useState<Set<string>>(new Set());
  const [vencimentoDe, setVencimentoDe] = useState('');
  const [vencimentoAte, setVencimentoAte] = useState('');
  /** Só o que vence de hoje a 7 dias (atalho "7 dias"). */
  const [janela7d, setJanela7d] = useState(false);

  const [expandedSuppliers, setExpandedSuppliers] = useState<Record<string, boolean>>({});

  const [sortColumn, setSortColumn] = useState<OrdemFornecedores | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Celular
  const [agrupamento, setAgrupamento] = useState<Agrupamento>('fornecedor');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [fornecedorAberto, setFornecedorAberto] = useState<string | null>(null);

  const hoje = hojeISO();

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
      setError('Não foi possível carregar os lançamentos. Confira a conexão e toque em Atualizar.');
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

  const tipoDocLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    lancamentos.forEach(l => {
      const code = l.tipo_documento?.trim();
      const desc = l.tipo_documento_descricao?.trim();
      if (code || desc) map.set(code || desc || '', rotuloTipoDoc(l));
    });
    return map;
  }, [lancamentos]);

  const tipoDocOptions = useMemo(
    () => Array.from(tipoDocLabelMap.keys()).sort((a, b) =>
      (tipoDocLabelMap.get(a) ?? a).localeCompare(tipoDocLabelMap.get(b) ?? b, 'pt-BR')),
    [tipoDocLabelMap],
  );
  const renderTipoDoc = useCallback((key: string) => tipoDocLabelMap.get(key) ?? key, [tipoDocLabelMap]);
  const renderStatus = useCallback((key: string) => ROTULO_STATUS[key] ?? key, []);

  const fornecedorOptions = useMemo(() => {
    const s = new Set<string>();
    lancamentos.forEach(l => {
      const nome = l.razao_social_fornecedor?.trim() || l.fornecedor?.trim();
      if (nome) s.add(nome);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [lancamentos]);

  const fornecedorCodigoMap = useMemo(() => {
    const map = new Map<string, string>();
    lancamentos.forEach(l => {
      const nome = l.razao_social_fornecedor?.trim() || l.fornecedor?.trim();
      if (nome && l.fornecedor && l.fornecedor !== nome) map.set(nome, l.fornecedor);
    });
    return map;
  }, [lancamentos]);

  const renderFornecedorOption = useCallback((name: string) => {
    const cod = fornecedorCodigoMap.get(name);
    return cod ? `${name} (${cod})` : name;
  }, [fornecedorCodigoMap]);

  /** Todos os filtros menos a situação (status / 7 dias): base dos totais e das contagens dos atalhos. */
  const base = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return lancamentos.filter(l => {
      if (empresasSelecionadas.size > 0 && !empresasSelecionadas.has(l.empresa ?? '')) return false;
      if (fornecedoresSelecionados.size > 0) {
        const nome = l.razao_social_fornecedor?.trim() || l.fornecedor?.trim() || '';
        if (!fornecedoresSelecionados.has(nome)) return false;
      }
      if (tiposDocSelecionados.size > 0) {
        const itemKey = l.tipo_documento?.trim() || l.tipo_documento_descricao?.trim() || '';
        if (!tiposDocSelecionados.has(itemKey)) return false;
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
  }, [lancamentos, searchQuery, fornecedoresSelecionados, empresasSelecionadas, tiposDocSelecionados, vencimentoDe, vencimentoAte]);

  const filtered = useMemo(() => base.filter(l => {
    if (statusSelecionados.size > 0) {
      const aberto = !estaCompensada(l);
      const passa =
        (statusSelecionados.has('Em aberto') && aberto) ||
        (statusSelecionados.has('Vencido') && estaVencida(l, hoje)) ||
        (statusSelecionados.has('Compensado') && !aberto);
      if (!passa) return false;
    }
    if (janela7d && !venceEm7Dias(l, hoje)) return false;
    return true;
  }), [base, statusSelecionados, janela7d, hoje]);

  /* Atalhos de situação: leem e escrevem o mesmo estado do filtro "Status". */
  const atalhoAtivo: AtalhoSituacao | null = useMemo(() => {
    const s = statusSelecionados;
    if (janela7d) return s.size === 1 && s.has('Em aberto') ? '7d' : null;
    if (s.size === 0) return 'tudo';
    if (s.size === 1 && s.has('Vencido')) return 'vencidos';
    if (s.size === 1 && s.has('Em aberto')) return 'aberto';
    return null;
  }, [statusSelecionados, janela7d]);

  const escolherAtalho = useCallback((a: AtalhoSituacao) => {
    setJanela7d(a === '7d');
    setStatusSelecionados(new Set(a === 'vencidos' ? ['Vencido'] : a === '7d' || a === 'aberto' ? ['Em aberto'] : []));
  }, []);

  /** No desktop o botão é um liga/desliga: tocar no ativo volta para "Tudo". */
  const alternarAtalho = (a: AtalhoSituacao) => escolherAtalho(atalhoAtivo === a ? 'tudo' : a);

  const contagensAtalho = useMemo(() => {
    const c: Record<AtalhoSituacao, number> = { vencidos: 0, '7d': 0, aberto: 0, tudo: base.length };
    for (const l of base) {
      if (passaAtalho(l, 'vencidos', hoje)) c.vencidos++;
      if (passaAtalho(l, '7d', hoje)) c['7d']++;
      if (passaAtalho(l, 'aberto', hoje)) c.aberto++;
    }
    return c;
  }, [base, hoje]);

  const groupedSuppliers = useMemo(
    () => ordenarFornecedores(agruparPorFornecedor(filtered, hoje), sortColumn, sortDir),
    [filtered, sortColumn, sortDir, hoje],
  );

  useEffect(() => {
    if (searchQuery.trim() || fornecedoresSelecionados.size > 0) {
      const next: Record<string, boolean> = {};
      groupedSuppliers.forEach(g => { next[g.nome] = true; });
      setExpandedSuppliers(next);
    }
  }, [searchQuery, fornecedoresSelecionados, groupedSuppliers]);

  const visibleGroups = useMemo(() => groupedSuppliers.slice(0, visibleCount), [groupedSuppliers, visibleCount]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchQuery, fornecedoresSelecionados, empresasSelecionadas, statusSelecionados, tiposDocSelecionados, vencimentoDe, vencimentoAte, janela7d, sortColumn, sortDir]);

  const toggleSort = (col: string) => {
    const c = col as OrdemFornecedores;
    if (sortColumn === c) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(c); setSortDir(c === 'fornecedor' ? 'asc' : 'desc'); }
  };

  const toggleSupplier = (supplierName: string) => {
    setExpandedSuppliers(prev => ({ ...prev, [supplierName]: !prev[supplierName] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    groupedSuppliers.forEach(g => { next[g.nome] = true; });
    setExpandedSuppliers(next);
  };

  const collapseAll = () => setExpandedSuppliers({});

  /** Totais sobre os filtros da tela, sem a situação: os atalhos estreitam a lista, não os números do topo. */
  const resumo = useMemo(() => resumirAberto(base, hoje), [base, hoje]);
  const qtdFornecedoresAbertos = useMemo(
    () => new Set(base.filter(l => !estaCompensada(l)).map(l => nomeFornecedor(l))).size,
    [base],
  );

  /** Filtros fora dos atalhos — o número no botão "Filtros" do celular. */
  const filtrosAvancados =
    (fornecedoresSelecionados.size > 0 ? 1 : 0) + (empresasSelecionadas.size > 0 ? 1 : 0) +
    (tiposDocSelecionados.size > 0 ? 1 : 0) + (vencimentoDe || vencimentoAte ? 1 : 0) +
    (atalhoAtivo === null ? 1 : 0) + (sortColumn ? 1 : 0);
  const atalhoPadrao: AtalhoSituacao = telaCelular() ? 'aberto' : 'tudo';
  const algumFiltro = filtrosAvancados > 0 || !!searchQuery.trim() || atalhoAtivo !== atalhoPadrao;

  const limparFiltros = () => {
    setSearchQuery('');
    setFornecedoresSelecionados(new Set());
    setEmpresasSelecionadas(new Set());
    setTiposDocSelecionados(new Set());
    setVencimentoDe('');
    setVencimentoAte('');
    setSortColumn(null);
    setSortDir('desc');
    escolherAtalho(atalhoPadrao);
  };

  const handleExportExcel = () => {
    if (filtered.length === 0) return;
    const data = filtered.map(l => ({
      'Fornecedor': l.razao_social_fornecedor || '—',
      'Cód. Fornecedor': l.fornecedor || '—',
      'Nº Documento': l.numero_documento || '—',
      'Tipo Documento - Descrição': rotuloTipoDoc(l),
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
    XLSX.writeFile(wb, `contas_a_pagar_${hoje}.xlsx`);
  };

  const allExpanded = useMemo(() => {
    if (groupedSuppliers.length === 0) return false;
    return groupedSuppliers.every(g => expandedSuppliers[g.nome]);
  }, [groupedSuppliers, expandedSuppliers]);

  const lastUpdated = useMemo(() => localDb.getDatasetUpdatedAt('fbl1n_c_pagar'), [lancamentos]);

  /** O painel do celular procura o fornecedor na lista filtrada; sem a situação, mostra todas as partidas dele. */
  const grupoAberto: GrupoFornecedor | null = useMemo(() => {
    if (!fornecedorAberto) return null;
    return agruparPorFornecedor(base.filter(l => nomeFornecedor(l) === fornecedorAberto), hoje)[0] ?? null;
  }, [fornecedorAberto, base, hoje]);

  const ordemMobile = ORDENS_MOBILE.findIndex(([c, d]) => c === sortColumn && (c === null || d === sortDir));

  const campoData = 'px-2 py-1 bg-transparent text-xs outline-none cursor-pointer';

  return (
    <div className="space-y-4 lg:space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-3 lg:pb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl lg:text-2xl font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2 lg:gap-2.5">
            <Receipt className="h-6 w-6 lg:h-7 lg:w-7 shrink-0 text-emerald-600 dark:text-emerald-500" />
            Contas a Pagar
          </h2>
          <p className="hidden lg:block text-sm text-slate-555 dark:text-slate-400 mt-1">
            Tabela dinâmica de contas a pagar agrupada por fornecedor com detalhamento expansível (FBL1N).
          </p>
          {lastUpdated && (
            <p className="lg:hidden mt-0.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
              FBL1N · {localDb.getDatasetUpdateBadge('contas_pagar')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lastUpdated && (
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Clock className="h-3 w-3" />
              <span>{localDb.getDatasetUpdateBadge('contas_pagar')}</span>
            </div>
          )}
          {/* Importar é tarefa de mesa (planilha de milhares de linhas): só no desktop. */}
          {canAccessPage(user, 'fin_contas_pagar') && (
            <PlanilhaSapUploadButton
              sigla="FBL1N"
              descricao="Contas a Pagar — substituição total da carga atual"
              importar={(rawRows, filename, onProgress) => localDb.importFBL1NRaw(rawRows, filename, onProgress)}
              onImportado={load}
              className="hidden lg:inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm shrink-0 cursor-pointer bg-cyan-600 hover:bg-cyan-700 text-white active:scale-95 disabled:opacity-50"
            />
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            aria-label="Atualizar"
            className="lg:hidden grid h-10 w-10 place-items-center rounded-xl border disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-secondary)' }}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={filtered.length === 0}
            aria-label="Exportar para Excel"
            className="lg:hidden grid h-10 w-10 place-items-center rounded-xl border disabled:opacity-40"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-secondary)' }}
          >
            <FileSpreadsheet className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Barra de filtros do desktop */}
      <div className="hidden lg:flex lg:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <MultiSelectFilter
            label="Fornecedor"
            icon={Building2}
            allLabel="Todos"
            searchable
            options={fornecedorOptions}
            selected={fornecedoresSelecionados}
            onChange={setFornecedoresSelecionados}
            renderOption={renderFornecedorOption}
            className="shrink-0 min-w-[200px]"
            panelClassName="w-80 sm:w-96 max-h-80"
          />
          <div className="relative shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--ink-muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar fornecedor ou doc..."
              aria-label="Buscar por fornecedor, código ou número do documento"
              className="pl-8 pr-3 py-2 border rounded-lg text-xs h-9 w-56"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
            />
          </div>
          <MultiSelectFilter
            label="Empresa"
            icon={Building2}
            allLabel="Todas empresas"
            options={empresaOptions}
            selected={empresasSelecionadas}
            onChange={setEmpresasSelecionadas}
            className="shrink-0 min-w-[150px]"
          />
          <MultiSelectFilter
            label="Tipo de doc."
            icon={Receipt}
            allLabel="Todos tipos de doc."
            options={tipoDocOptions}
            selected={tiposDocSelecionados}
            onChange={setTiposDocSelecionados}
            renderOption={renderTipoDoc}
            searchable
            className="shrink-0 min-w-[190px]"
            panelClassName="w-80 sm:w-96"
          />
          <MultiSelectFilter
            label="Status"
            icon={ListChecks}
            allLabel="Todos status"
            options={STATUS_OPCOES}
            selected={statusSelecionados}
            onChange={next => { setJanela7d(false); setStatusSelecionados(next); }}
            renderOption={renderStatus}
            className="shrink-0 min-w-[150px]"
          />
          <button
            type="button"
            onClick={() => alternarAtalho('vencidos')}
            aria-pressed={atalhoAtivo === 'vencidos'}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-bold transition-all cursor-pointer h-9 shrink-0 whitespace-nowrap ${
              atalhoAtivo === 'vencidos'
                ? 'bg-red-600 text-white border-red-600 shadow-sm'
                : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/60 hover:bg-red-100 dark:hover:bg-red-900/60'
            }`}
            title="Só partidas em aberto com vencimento antes de hoje"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Vencidos <span className="tabular opacity-80">{contagensAtalho.vencidos}</span>
          </button>
          <button
            type="button"
            onClick={() => alternarAtalho('7d')}
            aria-pressed={atalhoAtivo === '7d'}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-bold transition-all cursor-pointer h-9 shrink-0 whitespace-nowrap ${
              atalhoAtivo === '7d'
                ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/60 hover:bg-amber-100 dark:hover:bg-amber-900/60'
            }`}
            title="Partidas em aberto que vencem de hoje a 7 dias"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Vence em 7 dias <span className="tabular opacity-80">{contagensAtalho['7d']}</span>
          </button>
          <div
            className="flex items-center gap-1 border rounded-lg pl-3 pr-1 h-9 shrink-0 whitespace-nowrap"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          >
            <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>Vencimento</span>
            <input type="date" value={vencimentoDe} onChange={e => setVencimentoDe(e.target.value)} className={campoData} aria-label="Vencimento a partir de" />
            <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>até</span>
            <input type="date" value={vencimentoAte} onChange={e => setVencimentoAte(e.target.value)} className={campoData} aria-label="Vencimento até" />
          </div>
          {algumFiltro && (
            <button
              type="button"
              onClick={limparFiltros}
              className="flex items-center gap-1 px-2 h-9 text-xs font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              style={{ color: 'var(--ink-secondary)' }}
            >
              <X className="h-3.5 w-3.5" /> Limpar filtros
            </button>
          )}
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
        <>
          <div className="hidden lg:grid grid-cols-4 gap-3.5">
            <KpiCard
              label="Total em Aberto"
              value={resumo.total}
              format={formatBRL}
              detail={`${resumo.qtdAbertas} partida(s) · ${qtdFornecedoresAbertos} fornecedor(es)`}
              icon={Wallet}
              accent="var(--brand)"
            />
            <KpiCard
              label="Total Vencido"
              value={resumo.vencido}
              format={formatBRL}
              detail={`${resumo.qtdVencidas} partida(s) · clique para filtrar`}
              icon={AlertCircle}
              accent="#dc2626"
              share={resumo.total > 0 ? resumo.vencido / resumo.total : undefined}
              onClick={() => alternarAtalho('vencidos')}
            />
            <KpiCard
              label="Vence em 7 dias"
              value={resumo.prox7}
              format={formatBRL}
              detail={`${contagensAtalho['7d']} partida(s) · clique para filtrar`}
              icon={CalendarClock}
              accent="#d97706"
              share={resumo.total > 0 ? resumo.prox7 / resumo.total : undefined}
              onClick={() => alternarAtalho('7d')}
            />
            <KpiCard
              label="Total Compensado"
              value={resumo.pago}
              format={formatBRL}
              detail={`${resumo.qtdPagas} pagamento(s)`}
              icon={CheckCircle2}
              accent="#059669"
            />
          </div>

          <ResumoAbertoMobile resumo={resumo} qtdFornecedores={qtdFornecedoresAbertos} ativo={atalhoAtivo} onAtalho={escolherAtalho} />
        </>
      )}

      {/* Barra do celular: fica presa no topo enquanto a lista rola. */}
      {!error && lancamentos.length > 0 && (
        <div
          className="lg:hidden sticky top-0 z-20 -mx-3 sm:-mx-6 px-3 sm:px-6 py-2 space-y-2"
          style={{ background: 'var(--surface-page)' }}
        >
          <AtalhosSituacao ativo={atalhoAtivo} contagens={contagensAtalho} onEscolher={escolherAtalho} />
          <div className="flex gap-2">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border px-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
              <Search className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Fornecedor, código ou nº doc."
                aria-label="Buscar por fornecedor, código ou número do documento"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--ink-primary)' }}
              />
            </label>
            <BotaoFiltros ativos={filtrosAvancados} onClick={() => setFiltrosAbertos(true)} />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--ink-muted)' }}>
            <span className="tabular">
              {agrupamento === 'fornecedor'
                ? `${groupedSuppliers.length} fornecedor(es)`
                : `${filtered.length} partida(s)`}
            </span>
            <div className="flex rounded-lg bg-slate-200/70 p-0.5 dark:bg-[var(--surface-sunken)]" role="group" aria-label="Agrupar por">
              {([['fornecedor', 'Fornecedor'], ['vencimento', 'Vencimento']] as const).map(([k, r]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAgrupamento(k)}
                  aria-pressed={agrupamento === k}
                  className={`h-8 rounded-md px-3 text-xs font-bold ${agrupamento === k ? 'bg-[var(--surface-card)] shadow-sm' : ''}`}
                  style={{ color: agrupamento === k ? 'var(--ink-primary)' : 'var(--ink-muted)' }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
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
        <TableEmpty
          icon={Receipt}
          title="Nenhum lançamento encontrado"
          hint={lancamentos.length === 0 ? 'Importe uma planilha FBL1N em Importar SAP.' : 'Nada com esses filtros.'}
          action={lancamentos.length > 0 && algumFiltro ? (
            <button type="button" onClick={limparFiltros} className="h-10 rounded-xl border px-4 text-sm font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
              Limpar filtros
            </button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-2">
          {/* Celular */}
          {agrupamento === 'fornecedor' ? (
            <ListaFornecedoresMobile grupos={visibleGroups} onAbrir={g => setFornecedorAberto(g.nome)} />
          ) : (
            <AgendaVencimentosMobile linhas={filtered} hoje={hoje} onAbrirFornecedor={setFornecedorAberto} />
          )}

          {/* Desktop */}
          <TableDesktop>
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
                  Exibindo {visibleGroups.length} de {groupedSuppliers.length} fornecedor(es) ({filtered.length} lançamentos)
                </span>
                <button
                  onClick={allExpanded ? collapseAll : expandAll}
                  className="flex items-center gap-1 px-2.5 py-1 border border-slate-200 dark:border-slate-800 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium transition-colors text-xs"
                >
                  <ChevronsUpDown className="h-3.5 w-3.5 text-slate-500" />
                  {allExpanded ? 'Recolher Todos' : 'Expandir Todos'}
                </button>
              </div>

              <TableShell>
                <table className="w-full text-xs border-collapse" data-no-cards>
                  <TableHeadRow>
                    <SortableTh col="fornecedor" label="Fornecedor (Razão Social)" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh col="lancamentos" label="Qtd. Lançamentos" align="center" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh col="aberto" label="Total em Aberto" align="right" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                    <SortableTh col="valor" label="Montante Pago" align="right" sortColumn={sortColumn} sortDir={sortDir} onSort={toggleSort} />
                    <th className="px-4 py-3 text-left font-bold text-slate-600 dark:text-slate-400">Status Geral</th>
                  </TableHeadRow>
                  <TableBody>
                    {visibleGroups.map(group => {
                      const isExpanded = !!expandedSuppliers[group.nome];
                      const credito = group.saldoAberto < 0;
                      return (
                        <React.Fragment key={group.nome}>
                          {/* Linha Mãe: Totalizador por Fornecedor */}
                          <tr
                            onClick={() => toggleSupplier(group.nome)}
                            className={`transition-colors cursor-pointer select-none border-b border-slate-200/80 dark:border-slate-800 ${
                              isExpanded
                                ? 'bg-emerald-50/60 dark:bg-emerald-950/20 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/30'
                                : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            <Td>
                              <div className="flex items-center gap-2.5 py-0.5">
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); toggleSupplier(group.nome); }}
                                  aria-expanded={isExpanded}
                                  aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} partidas de ${group.nome}`}
                                  className="p-1 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors shrink-0"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-emerald-600 dark:text-emerald-400 font-bold" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-slate-500" />
                                  )}
                                </button>
                                <div className="min-w-0">
                                  <span className="font-bold text-slate-900 dark:text-slate-100 text-sm block truncate" title={group.nome}>
                                    {group.nome}
                                  </span>
                                  {group.codigo && (
                                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500">
                                      Cód. SAP: {group.codigo}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </Td>
                            <Td className="text-center">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {group.itens.length} doc(s)
                              </span>
                            </Td>
                            <Td align="right" numeric strong>
                              {Math.abs(group.saldoAberto) >= 0.005 ? (
                                <span
                                  className={`font-extrabold ${credito ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}
                                  title={credito ? 'Saldo a favor da empresa (notas de crédito maiores que as faturas em aberto)' : undefined}
                                >
                                  {formatBRL(group.saldoAberto)}
                                </span>
                              ) : (
                                <span className="text-slate-500 font-normal">—</span>
                              )}
                            </Td>
                            <Td align="right" numeric strong className="text-emerald-700 dark:text-emerald-400 font-extrabold">
                              {group.valorPago > 0 ? formatBRL(group.valorPago) : <span className="text-slate-500 font-normal">—</span>}
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
                                    <span>Detalhes das Partidas — {group.nome} ({group.itens.length} lançamento(s))</span>
                                  </div>
                                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-inner">
                                    <table className="w-full text-xs" data-no-cards>
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
                                        {group.itens.map(l => {
                                          const tipoLabel = rotuloTipoDoc(l);
                                          const st = statusDe(l);
                                          const isVencido = estaVencida(l, hoje);
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
                                                  {isVencido ? 'Vencido' : st}
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
            </div>
          </TableDesktop>

          {/* A agenda do celular tem a própria paginação por faixa. */}
          <div className={agrupamento === 'vencimento' ? 'hidden lg:block' : undefined}>
            <TableFooter shown={visibleGroups.length} total={groupedSuppliers.length} onLoadMore={() => setVisibleCount(v => v + PAGE_SIZE)} loadStep={PAGE_SIZE} />
          </div>
        </div>
      )}

      {filtrosAbertos && (
        <FiltrosSheet
          onClose={() => setFiltrosAbertos(false)}
          onLimpar={limparFiltros}
          ativos={filtrosAvancados}
          rotuloAplicar={agrupamento === 'fornecedor' ? `Ver ${groupedSuppliers.length} fornecedor(es)` : `Ver ${filtered.length} partida(s)`}
        >
          <CampoFiltro rotulo="Fornecedor">
            <MultiSelectFilter
              label="Fornecedor"
              icon={Building2}
              allLabel="Todos"
              searchable
              options={fornecedorOptions}
              selected={fornecedoresSelecionados}
              onChange={setFornecedoresSelecionados}
              renderOption={renderFornecedorOption}
              className="w-full"
              panelClassName="w-80 max-h-80"
            />
          </CampoFiltro>
          <div className="grid grid-cols-2 gap-3">
            <CampoFiltro rotulo="Vencimento de">
              <input type="date" value={vencimentoDe} onChange={e => setVencimentoDe(e.target.value)} className={classeCampoFiltro} />
            </CampoFiltro>
            <CampoFiltro rotulo="Até">
              <input type="date" value={vencimentoAte} onChange={e => setVencimentoAte(e.target.value)} className={classeCampoFiltro} />
            </CampoFiltro>
          </div>
          <CampoFiltro rotulo="Empresa">
            <MultiSelectFilter
              label="Empresa"
              icon={Building2}
              allLabel="Todas empresas"
              options={empresaOptions}
              selected={empresasSelecionadas}
              onChange={setEmpresasSelecionadas}
              className="w-full"
            />
          </CampoFiltro>
          <CampoFiltro rotulo="Tipo de documento">
            <MultiSelectFilter
              label="Tipo de doc."
              icon={Receipt}
              allLabel="Todos tipos de doc."
              options={tipoDocOptions}
              selected={tiposDocSelecionados}
              onChange={setTiposDocSelecionados}
              renderOption={renderTipoDoc}
              searchable
              className="w-full"
              panelClassName="w-80"
            />
          </CampoFiltro>
          <CampoFiltro rotulo="Situação (combinações)">
            <MultiSelectFilter
              label="Status"
              icon={ListChecks}
              allLabel="Todos status"
              options={STATUS_OPCOES}
              selected={statusSelecionados}
              onChange={next => { setJanela7d(false); setStatusSelecionados(next); }}
              renderOption={renderStatus}
              className="w-full"
            />
          </CampoFiltro>
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Ordenar fornecedores</legend>
            {ORDENS_MOBILE.map(([col, dir, rotulo], i) => (
              <label key={rotulo} className="flex h-11 items-center gap-3 rounded-xl border px-3 text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}>
                <input
                  type="radio"
                  name="ordem-fornecedores"
                  checked={ordemMobile === i || (ordemMobile === -1 && i === 0)}
                  onChange={() => { setSortColumn(col); setSortDir(dir); }}
                  className="h-4 w-4 accent-emerald-600"
                />
                {rotulo}
              </label>
            ))}
          </fieldset>
        </FiltrosSheet>
      )}

      {grupoAberto && (
        <DetalheFornecedorSheet grupo={grupoAberto} hoje={hoje} onClose={() => setFornecedorAberto(null)} />
      )}
    </div>
  );
}
