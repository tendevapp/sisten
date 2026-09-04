/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LayoutDashboard, RefreshCw, AlertCircle, Boxes, Filter, X, Info, Search, ArrowUp, ArrowDown, ArrowUpDown, ChevronRight, ChevronDown, ChevronsUpDown, Warehouse } from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, EstoqueItem, EstoqueAnalise, EnrichedSAPRecord } from '../types';
import { calcularKpis, classifyABC, resumirAbc, agregarPor, topN, ClasseAbc, normalizeCode, acharCompraEvitavel, acharDivergenciaPmm, acharLacunasCadastro, formatBRL, formatQtd, isProjetoItem, formatDeposito } from '../lib/almoxarifado';
import EstoqueKpis from '../components/almoxarifado/EstoqueKpis';
import CurvaAbcChart from '../components/almoxarifado/CurvaAbcChart';
import ValorPorDepositoChart from '../components/almoxarifado/ValorPorDepositoChart';
import ComposicaoChart from '../components/almoxarifado/ComposicaoChart';
import ConcentracaoChart from '../components/almoxarifado/ConcentracaoChart';
import TopMateriaisChart from '../components/almoxarifado/TopMateriaisChart';
import CompraEvitavelPanel from '../components/almoxarifado/CompraEvitavelPanel';
import DivergenciaPmmPanel from '../components/almoxarifado/DivergenciaPmmPanel';
import QualidadeCadastroPanel from '../components/almoxarifado/QualidadeCadastroPanel';
import ChartCard from '../components/charts/ChartCard';
import MultiSelectFilter from '../components/ui/MultiSelectFilter';
import { formatInt, formatPct } from '../lib/format';
import { TableShell, TableHeadRow, Th, TableBody, Td } from '../components/ui/DataTable';

interface AlmoxarifadoDashboardsProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

interface AlmoxModalData {
  title: string;
  badge: string;
  items: EstoqueItem[];
  filterQuery?: string;
}

export default function AlmoxarifadoDashboards({ user, onNavigate }: AlmoxarifadoDashboardsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EstoqueItem[]>([]);
  const [analise, setAnalise] = useState<EstoqueAnalise[]>([]);
  const [requisicoes, setRequisicoes] = useState<EnrichedSAPRecord[]>([]);

  // Filtros compartilhados por todos os painéis.
  // Depósito aceita seleção múltipla: vazio = todos.
  const [depositoFiltro, setDepositoFiltro] = useState<Set<string>>(new Set());
  const [tipoFiltro, setTipoFiltro] = useState('Todos');
  const [classeFiltro, setClasseFiltro] = useState('Todos');
  const [abcFiltro, setAbcFiltro] = useState<'Todos' | ClasseAbc>('Todos');
  const [grupoFiltro, setGrupoFiltro] = useState('Todos');
  const [tipoItemFiltro, setTipoItemFiltro] = useState<'Todos' | 'projeto' | 'consumo'>('Todos');

  const [selectedModalData, setSelectedModalData] = useState<AlmoxModalData | null>(null);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [modalSortDir, setModalSortDir] = useState<'desc' | 'asc'>('desc');
  const [modalExpandedGroups, setModalExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (selectedModalData) {
      setModalSearchQuery('');
      setModalSortDir('desc');
    }
  }, [selectedModalData]);

  // Grupos por Grupo de Mercadorias no Modal
  const modalGroups = useMemo(() => {
    if (!selectedModalData) return [];
    let filtered = selectedModalData.items;

    if (modalSearchQuery.trim()) {
      const q = modalSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(item =>
        (item.txt_breve_material || '').toLowerCase().includes(q) ||
        (item.material || '').toLowerCase().includes(q) ||
        (item.grupo_mercadorias || '').toLowerCase().includes(q)
      );
    }

    const groupMap = new Map<string, {
      grupoName: string;
      items: EstoqueItem[];
      totalValor: number;
      totalQtd: number;
    }>();

    filtered.forEach(item => {
      const name = item.grupo_mercadorias?.trim() || 'Sem Grupo de Mercadoria';
      let g = groupMap.get(name);
      if (!g) {
        g = {
          grupoName: name,
          items: [],
          totalValor: 0,
          totalQtd: 0,
        };
        groupMap.set(name, g);
      }
      g.items.push(item);
      g.totalValor += item.valor_total || 0;
      g.totalQtd += item.quantidade || 0;
    });

    groupMap.forEach(g => {
      g.items.sort((a, b) => (b.valor_total || 0) - (a.valor_total || 0));
    });

    return Array.from(groupMap.values()).sort((a, b) => {
      return modalSortDir === 'desc' ? b.totalValor - a.totalValor : a.totalValor - b.totalValor;
    });
  }, [selectedModalData, modalSearchQuery, modalSortDir]);

  // Por padrão, expande todos os grupos quando o modal é aberto ou os grupos mudam
  useEffect(() => {
    if (selectedModalData && modalGroups.length > 0) {
      const initial: Record<string, boolean> = {};
      modalGroups.forEach(g => {
        initial[g.grupoName] = true;
      });
      setModalExpandedGroups(initial);
    }
  }, [selectedModalData, modalGroups.length]);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const [estoque, analiseRows] = await Promise.all([
        localDb.fetchEstoque(force),
        localDb.fetchEstoqueAnalise(force).catch(() => [] as EstoqueAnalise[]),
      ]);
      setRows(estoque);
      setAnalise(analiseRows);
      setRequisicoes(localDb.getEnrichedSAPRequisicoes());
    } catch (e: any) {
      console.error('Erro ao carregar os dashboards do almoxarifado:', e);
      setError('Falha ao carregar a posição de estoque. Tente atualizar novamente.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const mapaAbc = useMemo(() => classifyABC(rows), [rows]);

  const opcoes = useMemo(() => {
    const depositos = new Set<string>();
    const tipos = new Set<string>();
    const classes = new Set<string>();
    const grupos = new Set<string>();
    rows.forEach(r => {
      if (r.deposito) depositos.add(r.deposito);
      if (r.tipo_material) tipos.add(r.tipo_material);
      if (r.class_item) classes.add(r.class_item);
      if (r.grupo_mercadorias) grupos.add(r.grupo_mercadorias);
    });
    const ordenar = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { depositos: ordenar(depositos), tipos: ordenar(tipos), classes: ordenar(classes), grupos: ordenar(grupos) };
  }, [rows]);

  const filtrados = useMemo(() => rows.filter(r => {
    if (depositoFiltro.size > 0 && !depositoFiltro.has(r.deposito)) return false;
    if (tipoFiltro !== 'Todos' && r.tipo_material !== tipoFiltro) return false;
    if (classeFiltro !== 'Todos' && r.class_item !== classeFiltro) return false;
    if (grupoFiltro !== 'Todos' && r.grupo_mercadorias !== grupoFiltro) return false;
    if (abcFiltro !== 'Todos' && mapaAbc.get(normalizeCode(r.material)) !== abcFiltro) return false;
    if (tipoItemFiltro !== 'Todos') {
      const eProjeto = isProjetoItem(r.material);
      if (tipoItemFiltro === 'projeto' && !eProjeto) return false;
      if (tipoItemFiltro === 'consumo' && eProjeto) return false;
    }
    return true;
  }), [rows, depositoFiltro, tipoFiltro, classeFiltro, grupoFiltro, abcFiltro, tipoItemFiltro, mapaAbc]);

  const filtroAtivo = depositoFiltro.size > 0 || tipoFiltro !== 'Todos'
    || classeFiltro !== 'Todos' || grupoFiltro !== 'Todos' || abcFiltro !== 'Todos' || tipoItemFiltro !== 'Todos';

  const limparFiltros = useCallback(() => {
    setDepositoFiltro(new Set());
    setTipoFiltro('Todos');
    setClasseFiltro('Todos');
    setGrupoFiltro('Todos');
    setAbcFiltro('Todos');
    setTipoItemFiltro('Todos');
  }, []);

  const kpi = useMemo(() => calcularKpis(filtrados), [filtrados]);
  const kpiGeral = useMemo(() => calcularKpis(rows), [rows]);
  const resumoAbc = useMemo(() => resumirAbc(filtrados, mapaAbc), [filtrados, mapaAbc]);
  const porDeposito = useMemo(() => agregarPor(filtrados, 'deposito'), [filtrados]);
  const porTipo = useMemo(() => agregarPor(filtrados, 'tipo_material'), [filtrados]);
  const porClasse = useMemo(() => agregarPor(filtrados, 'class_item', 'Sem classe'), [filtrados]);
  const porGrupo = useMemo(() => topN(agregarPor(filtrados, 'grupo_mercadorias'), 10), [filtrados]);
  const porAplicacao = useMemo(() => topN(agregarPor(filtrados, 'aplicacao'), 10), [filtrados]);
  const compraEvitavel = useMemo(() => acharCompraEvitavel(filtrados, requisicoes), [filtrados, requisicoes]);
  const divergenciaPmm = useMemo(() => acharDivergenciaPmm(filtrados, analise), [filtrados, analise]);
  const lacunas = useMemo(() => acharLacunasCadastro(filtrados), [filtrados]);
  const analiseIndisponivel = rows.length > 0 && analise.length === 0;

  const selectClass = 'rounded-lg border py-2 px-3 text-xs font-bold cursor-pointer transition-colors duration-150 focus:outline-2 focus:outline-offset-1 border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-secondary)] focus:outline-[var(--brand)]';

  const irParaEstoque = useCallback((query: string) => {
    onNavigate(`/almoxarifado/estoque?${query}`);
  }, [onNavigate]);

  const abrirModalAbc = useCallback((classe: ClasseAbc) => {
    const items = filtrados.filter(r => mapaAbc.get(normalizeCode(r.material)) === classe);
    setSelectedModalData({
      title: `Itens em Estoque — Classe ${classe}`,
      badge: `Curva ABC (${classe})`,
      items,
      filterQuery: `abc=${classe}`,
    });
  }, [filtrados, mapaAbc]);

  const abrirModalDeposito = useCallback((dep: string) => {
    const items = filtrados.filter(r => r.deposito === dep);
    setSelectedModalData({
      title: `Itens no Depósito ${formatDeposito(dep)}`,
      badge: `Depósito ${dep}`,
      items,
      filterQuery: `deposito=${encodeURIComponent(dep)}`,
    });
  }, [filtrados]);

  const abrirModalTipo = useCallback((tipo: string) => {
    const items = filtrados.filter(r => r.tipo_material === tipo);
    setSelectedModalData({
      title: `Itens por Tipo — ${tipo}`,
      badge: `Tipo: ${tipo}`,
      items,
      filterQuery: `tipo=${encodeURIComponent(tipo)}`,
    });
  }, [filtrados]);

  const abrirModalClasse = useCallback((classe: string) => {
    const items = filtrados.filter(r => (r.class_item || 'Sem classe') === classe);
    setSelectedModalData({
      title: `Itens por Classificação — ${classe}`,
      badge: `Classificação: ${classe}`,
      items,
      filterQuery: `classe=${encodeURIComponent(classe)}`,
    });
  }, [filtrados]);

  const abrirModalGrupo = useCallback((grupo: string) => {
    const items = filtrados.filter(r => r.grupo_mercadorias === grupo);
    setSelectedModalData({
      title: `Itens por Grupo de Mercadoria — ${grupo}`,
      badge: `Grupo: ${grupo}`,
      items,
      filterQuery: `grupo=${encodeURIComponent(grupo)}`,
    });
  }, [filtrados]);

  const abrirModalAplicacao = useCallback((aplicacao: string) => {
    const items = filtrados.filter(r => r.aplicacao === aplicacao);
    setSelectedModalData({
      title: `Itens por Aplicação — ${aplicacao}`,
      badge: `Aplicação: ${aplicacao}`,
      items,
    });
  }, [filtrados]);

  const abrirModalMaterial = useCallback((material: string) => {
    const items = filtrados.filter(r => normalizeCode(r.material) === normalizeCode(material));
    const desc = items[0]?.txt_breve_material || '';
    setSelectedModalData({
      title: `Material ${material}${desc ? ` — ${desc}` : ''}`,
      badge: `Material ${material}`,
      items,
      filterQuery: `material=${encodeURIComponent(material)}`,
    });
  }, [filtrados]);

  const totalItensNoModal = useMemo(() => {
    if (!selectedModalData) return 0;
    return modalGroups.reduce((acc, g) => acc + g.items.length, 0);
  }, [selectedModalData, modalGroups]);

  const modalTotalValor = useMemo(() => {
    if (!selectedModalData) return 0;
    return modalGroups.reduce((acc, g) => acc + g.totalValor, 0);
  }, [selectedModalData, modalGroups]);

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5 reveal" style={{ borderColor: 'var(--hairline)' }}>
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold flex items-center gap-2.5" style={{ color: 'var(--ink-primary)' }}>
            <LayoutDashboard className="h-7 w-7" style={{ color: 'var(--brand)' }} />
            Dashboards do Almoxarifado
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-secondary)' }}>
            Onde está o valor imobilizado, quais itens exigem controle e negociação, e que compras estão sendo feitas contra saldo existente.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0 cursor-pointer border hover:opacity-90 active:scale-95 disabled:opacity-50"
          style={{
            borderColor: 'var(--hairline)',
            background: 'var(--surface-raised)',
            color: 'var(--ink-primary)',
          }}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar Posição
        </button>
      </div>

      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className="rounded-xl border p-4 space-y-2"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
              >
                <div className="skeleton h-2.5 w-24" style={{ animationDelay: `${i * 80}ms` }} />
                <div className="skeleton h-6 w-32" style={{ animationDelay: `${i * 80 + 40}ms` }} />
                <div className="skeleton h-2 w-20" style={{ animationDelay: `${i * 80 + 80}ms` }} />
              </div>
            ))}
          </div>
          <ChartCard title="Curva ABC" loading height={300} />
          <ChartCard title="Valor por Depósito" loading height={240} />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-3.5 p-5 border border-rose-200 dark:border-rose-900/50 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300">
          <AlertCircle className="h-6 w-6 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center p-16 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-center">
          <Boxes className="h-12 w-12 text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-full mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Nenhuma posição de estoque disponível</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">
            Importe a posição de estoque (transação ZL0024) na aba "Importar SAP" do painel administrativo.
          </p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          {/* Linha de Filtros: no mobile vira uma trilha com rolagem
              horizontal (evita empurrar os gráficos para muito longe do
              topo). O overflow fica num wrapper interno para não colidir
              com o position:sticky do container externo. */}
          <div
            className="rounded-xl border p-4 sticky top-2 z-10 backdrop-blur-sm"
            style={{
              borderColor: 'var(--hairline)',
              background: 'color-mix(in srgb, var(--surface-card) 92%, transparent)',
              boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
            }}
          >
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible">
              <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                <Filter className="h-3 w-3" /> Filtros
              </span>

              <MultiSelectFilter
                label="Depósito"
                icon={Warehouse}
                options={opcoes.depositos}
                selected={depositoFiltro}
                onChange={setDepositoFiltro}
                renderOption={formatDeposito}
                searchable
                className="shrink-0 w-[140px] lg:w-auto lg:min-w-[140px]"
                panelClassName="w-80 sm:w-96"
              />

              <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} className={`${selectClass} shrink-0 w-[130px] lg:w-auto truncate`}>
                <option value="Todos">Tipo: Todos</option>
                {opcoes.tipos.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <select value={classeFiltro} onChange={e => setClasseFiltro(e.target.value)} className={`${selectClass} shrink-0 w-[150px] lg:w-auto truncate`}>
                <option value="Todos">Class. Item: Todos</option>
                {opcoes.classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <select value={abcFiltro} onChange={e => setAbcFiltro(e.target.value as 'Todos' | ClasseAbc)} className={`${selectClass} shrink-0 w-[150px] lg:w-auto truncate`}>
                <option value="Todos">Curva ABC: Todas</option>
                <option value="A">Classe A</option>
                <option value="B">Classe B</option>
                <option value="C">Classe C</option>
              </select>

              <select value={grupoFiltro} onChange={e => setGrupoFiltro(e.target.value)} className={`${selectClass} shrink-0 w-[160px] lg:w-auto truncate`}>
                <option value="Todos">Grupo: Todos</option>
                {opcoes.grupos.map(g => <option key={g} value={g}>{g}</option>)}
              </select>

              <select value={tipoItemFiltro} onChange={e => setTipoItemFiltro(e.target.value as any)} className={`${selectClass} shrink-0 w-[130px] lg:w-auto truncate`}>
                <option value="Todos">Item: Todos</option>
                <option value="projeto">Projeto (100000...)</option>
                <option value="consumo">Consumo</option>
              </select>

              {filtroAtivo && (
                <button
                  onClick={limparFiltros}
                  className="shrink-0 text-xs font-bold text-rose-500 hover:text-rose-600 dark:text-rose-400 underline lg:ml-auto cursor-pointer whitespace-nowrap"
                >
                  Limpar Filtros
                </button>
              )}
            </div>
          </div>

          {/* KPIs Principais */}
          <EstoqueKpis kpi={kpi} totalGeral={kpiGeral} />

          {/* 1º GRÁFICO: Curva ABC (Requisitos do Usuário) */}
          <CurvaAbcChart resumo={resumoAbc} onSelecionar={abrirModalAbc} />

          {/* Painéis operacionais de ação imediata */}
          <CompraEvitavelPanel dados={compraEvitavel} onSelecionar={abrirModalMaterial} />
          <DivergenciaPmmPanel dados={divergenciaPmm} indisponivel={analiseIndisponivel} onSelecionar={abrirModalMaterial} />

          {/* Demais Gráficos */}
          <ValorPorDepositoChart dados={porDeposito} onSelecionar={abrirModalDeposito} />

          <ComposicaoChart
            porTipo={porTipo}
            porClasse={porClasse}
            onSelecionarTipo={abrirModalTipo}
            onSelecionarClasse={abrirModalClasse}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ConcentracaoChart
              titulo="Top 10 Grupos de Mercadorias"
              subtitulo="Principais grupos em valor imobilizado"
              dados={porGrupo}
              onSelecionar={abrirModalGrupo}
            />
            <ConcentracaoChart
              titulo="Top 10 Aplicações de Material"
              subtitulo="Principais destinações em valor imobilizado"
              dados={porAplicacao}
              onSelecionar={abrirModalAplicacao}
            />
          </div>

          <TopMateriaisChart itens={filtrados} mapaAbc={mapaAbc} onSelecionar={abrirModalMaterial} />
          <QualidadeCadastroPanel lacunas={lacunas} totalItens={filtrados.length} />
        </>
      )}

      {/* Modal / Janela Suspensa ao Clicar no Gráfico */}
      {selectedModalData && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedModalData(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-[98vw] max-h-[95vh] flex flex-col overflow-hidden select-text"
            onClick={e => e.stopPropagation()}
          >
            {/* Cabeçalho do Modal */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/80">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0 bg-emerald-500" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                    {selectedModalData.title}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {selectedModalData.badge}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Listagem agrupada por Grupo de Mercadoria com opção de expandir e pesquisar materiais.
                </p>
              </div>
              <button
                onClick={() => setSelectedModalData(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Fechar janela"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Corpo do Modal */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* KPIs Resumidos */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Total Imobilizado</span>
                  <p className="text-base font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                    {formatBRL(selectedModalData.items.reduce((sum, i) => sum + (i.valor_total || 0), 0))}
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Qtd. Grupos de Mercadorias</span>
                  <p className="text-base font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                    {modalGroups.length} grupo(s)
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Total de Itens</span>
                  <p className="text-base font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
                    {totalItensNoModal} item(ns)
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      const allNames = modalGroups.map(g => g.grupoName);
                      const allAreExpanded = allNames.every(n => !!modalExpandedGroups[n]);
                      const next: Record<string, boolean> = {};
                      allNames.forEach(n => { next[n] = !allAreExpanded; });
                      setModalExpandedGroups(next);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    <ChevronsUpDown className="h-3.5 w-3.5 text-slate-500" />
                    Expandir / Recolher
                  </button>
                  {selectedModalData.filterQuery && (
                    <button
                      onClick={() => {
                        const query = selectedModalData.filterQuery;
                        setSelectedModalData(null);
                        if (query) irParaEstoque(query);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-sm"
                    >
                      Ir p/ Tabela
                    </button>
                  )}
                </div>
              </div>

              {/* Barra de Pesquisa e Ordenação */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Pesquisar por grupo, texto breve ou código..."
                    value={modalSearchQuery}
                    onChange={e => setModalSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  />
                  {modalSearchQuery && (
                    <button
                      onClick={() => setModalSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                      title="Limpar pesquisa"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 font-medium">
                    Exibindo <strong>{modalGroups.length}</strong> grupo(s) ({totalItensNoModal} itens)
                  </span>
                  <button
                    type="button"
                    onClick={() => setModalSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <span>Ordenar por Valor:</span>
                    {modalSortDir === 'desc' ? (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        Maior p/ Menor <ArrowDown className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        Menor p/ Maior <ArrowUp className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Tabela Agrupada por Grupo Mercadorias */}
              {modalGroups.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  {modalSearchQuery ? 'Nenhum grupo ou item encontrado para a pesquisa informada.' : 'Nenhum item de estoque encontrado para esta seleção.'}
                </div>
              ) : (
                <TableShell maxHeight="58vh" className="w-full">
                  <table className="w-full text-xs border-collapse">
                    <TableHeadRow>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 dark:text-slate-400">Grupo de Mercadorias (Categoria)</th>
                      <th className="px-4 py-3 text-center font-bold text-slate-600 dark:text-slate-400 w-28">Qtd. Itens</th>
                      <th className="px-4 py-3 text-right font-bold text-slate-600 dark:text-slate-400 w-36">Saldo Total</th>
                      <th className="px-4 py-3 text-right font-bold text-slate-600 dark:text-slate-400 w-44">
                        <button
                          type="button"
                          onClick={() => setModalSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                          className="inline-flex items-center gap-1.5 font-bold hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                          title="Clique para alterar ordenação por Valor Total"
                        >
                          Valor Total do Grupo
                          {modalSortDir === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          )}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right font-bold text-slate-600 dark:text-slate-400 w-28">% do Total</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600 dark:text-slate-400 w-24">Ação</th>
                    </TableHeadRow>
                    <TableBody>
                      {modalGroups.map(group => {
                        const isExpanded = !!modalExpandedGroups[group.grupoName];
                        const pctGrupo = modalTotalValor > 0 ? (group.totalValor / modalTotalValor) * 100 : 0;
                        return (
                          <React.Fragment key={group.grupoName}>
                            {/* Linha Mãe do Grupo */}
                            <tr
                              onClick={() => {
                                setModalExpandedGroups(prev => ({
                                  ...prev,
                                  [group.grupoName]: !prev[group.grupoName],
                                }));
                              }}
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
                                    <span className="font-bold text-slate-900 dark:text-slate-100 text-sm block truncate" title={group.grupoName}>
                                      {group.grupoName}
                                    </span>
                                  </div>
                                </div>
                              </Td>
                              <Td className="text-center">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                  {group.items.length} item(ns)
                                </span>
                              </Td>
                              <Td align="right" numeric>
                                {formatQtd(group.totalQtd)}
                              </Td>
                              <Td align="right" numeric strong className="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">
                                {formatBRL(group.totalValor)}
                              </Td>
                              <Td align="right" numeric className="font-bold text-slate-700 dark:text-slate-300">
                                {formatPct(pctGrupo)}
                              </Td>
                              <Td>
                                <span className="text-[11px] font-semibold text-slate-500 hover:text-emerald-600 transition-colors">
                                  {isExpanded ? 'Recolher [-]' : 'Expandir [+]'}
                                </span>
                              </Td>
                            </tr>

                            {/* Linhas Filhas: Tabela de Materiais do Grupo */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={6} className="p-0 border-b-2 border-emerald-500/40 bg-slate-50/70 dark:bg-slate-950/60">
                                  <div className="py-2.5 px-4 sm:px-8 border-l-4 border-emerald-500">
                                    <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider flex items-center justify-between">
                                      <span>Materiais do Grupo: {group.grupoName} ({group.items.length} item/ns)</span>
                                    </div>
                                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-inner">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 text-[11px]">
                                            <th className="px-3 py-2 text-left font-bold w-28">Material</th>
                                            <th className="px-3 py-2 text-left font-bold">Texto Breve (Descrição)</th>
                                            <th className="px-3 py-2 text-left font-bold w-24">Depósito</th>
                                            <th className="px-3 py-2 text-left font-bold w-28">Tipo Material</th>
                                            <th className="px-3 py-2 text-left font-bold w-28">Class. Item</th>
                                            <th className="px-3 py-2 text-right font-bold w-28">Saldo Total</th>
                                            <th className="px-3 py-2 text-center font-bold w-16">UMB</th>
                                            <th className="px-3 py-2 text-right font-bold w-28">Preço Médio</th>
                                            <th className="px-3 py-2 text-right font-bold w-32">Valor Total</th>
                                            <th className="px-3 py-2 text-right font-bold w-24">% do Total</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                          {group.items.map((item, idx) => {
                                            const pctItem = modalTotalValor > 0 ? ((item.valor_total || 0) / modalTotalValor) * 100 : 0;
                                            return (
                                              <tr key={item.id || `${item.material}-${item.deposito}-${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                                <td className="px-3 py-2 font-mono font-bold text-slate-800 dark:text-slate-200">
                                                  {item.material}
                                                </td>
                                                <td className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-normal break-words max-w-md" title={item.txt_breve_material || ''}>
                                                  {item.txt_breve_material || '—'}
                                                </td>
                                                <td className="px-3 py-2 text-slate-700 dark:text-slate-300" title={formatDeposito(item.deposito)}>{item.deposito || '—'}</td>
                                                <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.tipo_material || '—'}</td>
                                                <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.class_item || '—'}</td>
                                                <td className="px-3 py-2 text-right font-mono text-slate-800 dark:text-slate-200 font-medium">{formatQtd(item.quantidade)}</td>
                                                <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">{item.umb || '—'}</td>
                                                <td className="px-3 py-2 text-right font-mono text-slate-800 dark:text-slate-200">{formatBRL(item.preco_medio)}</td>
                                                <td className="px-3 py-2 text-right font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                                                  {formatBRL(item.valor_total)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono font-medium text-slate-700 dark:text-slate-300">
                                                  {formatPct(pctItem)}
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
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
