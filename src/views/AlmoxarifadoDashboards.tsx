/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LayoutDashboard, RefreshCw, AlertCircle, Boxes, Filter, X } from 'lucide-react';
import { localDb } from '../db/localDb';
import { Profile, EstoqueItem, EstoqueAnalise, EnrichedSAPRecord } from '../types';
import { calcularKpis, classifyABC, resumirAbc, agregarPor, topN, ClasseAbc, normalizeCode, acharCompraEvitavel, acharDivergenciaPmm } from '../lib/almoxarifado';
import EstoqueKpis from '../components/almoxarifado/EstoqueKpis';
import CurvaAbcChart from '../components/almoxarifado/CurvaAbcChart';
import ValorPorDepositoChart from '../components/almoxarifado/ValorPorDepositoChart';
import ComposicaoChart from '../components/almoxarifado/ComposicaoChart';
import ConcentracaoChart from '../components/almoxarifado/ConcentracaoChart';
import TopMateriaisChart from '../components/almoxarifado/TopMateriaisChart';
import CompraEvitavelPanel from '../components/almoxarifado/CompraEvitavelPanel';
import DivergenciaPmmPanel from '../components/almoxarifado/DivergenciaPmmPanel';

interface AlmoxarifadoDashboardsProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function AlmoxarifadoDashboards({ user, onNavigate }: AlmoxarifadoDashboardsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EstoqueItem[]>([]);
  const [analise, setAnalise] = useState<EstoqueAnalise[]>([]);
  const [requisicoes, setRequisicoes] = useState<EnrichedSAPRecord[]>([]);

  // Filtros compartilhados por todos os painéis.
  const [depositoFiltro, setDepositoFiltro] = useState('Todos');
  const [tipoFiltro, setTipoFiltro] = useState('Todos');
  const [classeFiltro, setClasseFiltro] = useState('Todos');
  const [abcFiltro, setAbcFiltro] = useState<'Todos' | ClasseAbc>('Todos');
  const [grupoFiltro, setGrupoFiltro] = useState('Todos');

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      // A análise falha de forma isolada: sem ela apenas o painel de PMM degrada,
      // então não deve derrubar o carregamento do estoque.
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

  // Classificação sobre a posição inteira (`rows`), nunca sobre o filtro — ver
  // classifyABC. O resumo, sim, respeita o filtro vigente.
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
    if (depositoFiltro !== 'Todos' && r.deposito !== depositoFiltro) return false;
    if (tipoFiltro !== 'Todos' && r.tipo_material !== tipoFiltro) return false;
    if (classeFiltro !== 'Todos' && r.class_item !== classeFiltro) return false;
    if (grupoFiltro !== 'Todos' && r.grupo_mercadorias !== grupoFiltro) return false;
    if (abcFiltro !== 'Todos' && mapaAbc.get(normalizeCode(r.material)) !== abcFiltro) return false;
    return true;
  }), [rows, depositoFiltro, tipoFiltro, classeFiltro, grupoFiltro, abcFiltro, mapaAbc]);

  const filtroAtivo = depositoFiltro !== 'Todos' || tipoFiltro !== 'Todos'
    || classeFiltro !== 'Todos' || grupoFiltro !== 'Todos' || abcFiltro !== 'Todos';

  const limparFiltros = useCallback(() => {
    setDepositoFiltro('Todos');
    setTipoFiltro('Todos');
    setClasseFiltro('Todos');
    setGrupoFiltro('Todos');
    setAbcFiltro('Todos');
  }, []);

  const kpi = useMemo(() => calcularKpis(filtrados), [filtrados]);
  const resumoAbc = useMemo(() => resumirAbc(filtrados, mapaAbc), [filtrados, mapaAbc]);
  const porDeposito = useMemo(() => agregarPor(filtrados, 'deposito'), [filtrados]);
  const porTipo = useMemo(() => agregarPor(filtrados, 'tipo_material'), [filtrados]);
  const porClasse = useMemo(() => agregarPor(filtrados, 'class_item', 'Sem classe'), [filtrados]);
  // Top 10 mais "Outros": são 113 grupos de mercadoria e 62 aplicações, e o
  // ranking inteiro seria ilegível.
  const porGrupo = useMemo(() => topN(agregarPor(filtrados, 'grupo_mercadorias'), 10), [filtrados]);
  const porAplicacao = useMemo(() => topN(agregarPor(filtrados, 'aplicacao'), 10), [filtrados]);
  const compraEvitavel = useMemo(() => acharCompraEvitavel(filtrados, requisicoes), [filtrados, requisicoes]);
  const divergenciaPmm = useMemo(() => acharDivergenciaPmm(filtrados, analise), [filtrados, analise]);
  // A análise vazia com estoque carregado significa que a view não respondeu.
  const analiseIndisponivel = rows.length > 0 && analise.length === 0;

  const selectClass = 'rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 py-2 px-3 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-emerald-500 focus:outline-none cursor-pointer';

  const irParaEstoque = useCallback((query: string) => {
    onNavigate(`/almoxarifado/estoque?${query}`);
  }, [onNavigate]);

  const abrirClasseAbc = useCallback((classe: ClasseAbc) => {
    irParaEstoque(`abc=${classe}`);
  }, [irParaEstoque]);

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold text-slate-800 dark:text-slate-50 flex items-center gap-2.5">
            <LayoutDashboard className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
            Dashboards do Almoxarifado
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Onde está o valor imobilizado, quais itens exigem controle e negociação, e que compras estão sendo feitas contra saldo existente.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all disabled:opacity-50 h-9 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center p-20 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl space-y-4">
          <RefreshCw className="h-8 w-8 text-emerald-600 animate-spin" />
          <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Carregando indicadores...</span>
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
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <Filter className="h-3 w-3" /> Filtros
            </span>

            <select value={depositoFiltro} onChange={e => setDepositoFiltro(e.target.value)} className={selectClass}>
              <option value="Todos">Depósito: Todos</option>
              {opcoes.depositos.map(d => <option key={d} value={d}>{d}</option>)}
            </select>

            <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} className={selectClass}>
              <option value="Todos">Tipo: Todos</option>
              {opcoes.tipos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <select value={classeFiltro} onChange={e => setClasseFiltro(e.target.value)} className={selectClass}>
              <option value="Todos">Class. Item: Todos</option>
              {opcoes.classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select value={abcFiltro} onChange={e => setAbcFiltro(e.target.value as 'Todos' | ClasseAbc)} className={selectClass}>
              <option value="Todos">Curva ABC: Todas</option>
              <option value="A">Classe A</option>
              <option value="B">Classe B</option>
              <option value="C">Classe C</option>
            </select>

            <select value={grupoFiltro} onChange={e => setGrupoFiltro(e.target.value)} className={selectClass}>
              <option value="Todos">Grupo: Todos</option>
              {opcoes.grupos.map(g => <option key={g} value={g}>{g}</option>)}
            </select>

            {filtroAtivo && (
              <button
                onClick={limparFiltros}
                className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                <X className="h-3.5 w-3.5" /> Limpar
              </button>
            )}

            <span className="ml-auto text-xs font-bold text-slate-400 dark:text-slate-500">
              {filtrados.length.toLocaleString('pt-BR')} de {rows.length.toLocaleString('pt-BR')} itens
            </span>
          </div>

          <EstoqueKpis kpi={kpi} />
          <CompraEvitavelPanel
            dados={compraEvitavel}
            onSelecionar={(mat) => irParaEstoque(`material=${encodeURIComponent(mat)}`)}
          />
          <DivergenciaPmmPanel
            dados={divergenciaPmm}
            indisponivel={analiseIndisponivel}
            onSelecionar={(mat) => irParaEstoque(`material=${encodeURIComponent(mat)}`)}
          />
          <CurvaAbcChart resumo={resumoAbc} onSelecionar={abrirClasseAbc} />
          <ValorPorDepositoChart
            dados={porDeposito}
            onSelecionar={(dep) => irParaEstoque(`deposito=${encodeURIComponent(dep)}`)}
          />

          <ComposicaoChart
            porTipo={porTipo}
            porClasse={porClasse}
            onSelecionarTipo={(t) => irParaEstoque(`tipo=${encodeURIComponent(t)}`)}
            onSelecionarClasse={(c) => irParaEstoque(`classe=${encodeURIComponent(c)}`)}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ConcentracaoChart
              titulo="Concentração por Grupo de Mercadoria"
              subtitulo="Top 10 grupos por valor imobilizado; os demais somados em Outros."
              dados={porGrupo}
              onSelecionar={(g) => irParaEstoque(`grupo=${encodeURIComponent(g)}`)}
            />
            <ConcentracaoChart
              titulo="Concentração por Aplicação"
              subtitulo="Top 10 aplicações por valor imobilizado; as demais somadas em Outros."
              dados={porAplicacao}
            />
          </div>

          <TopMateriaisChart
            itens={filtrados}
            mapaAbc={mapaAbc}
            onSelecionar={(mat) => irParaEstoque(`material=${encodeURIComponent(mat)}`)}
          />
        </>
      )}
    </div>
  );
}
