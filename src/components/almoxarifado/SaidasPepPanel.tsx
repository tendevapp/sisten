/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Movimentações — Análise de Saídas de Estoque por Elemento PEP.
 *
 * Agrupa todas as saídas e consumos de estoque pelo Elemento PEP (WBS Element)
 * vinculado à transação MB51, enriquecido com a descrição e metadados de `fin_pep`.
 */

import React, { useState, useMemo } from 'react';
import {
  FolderTree, Search, FileSpreadsheet, Layers, Building2,
  TrendingDown, CheckCircle2, AlertTriangle, ArrowUpDown, ChevronRight,
  ChevronDown, ExternalLink, Package, Filter, CalendarRange,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import * as XLSX from 'xlsx';
import type { MB51Classificado, FinPep } from '../../types';
import { formatBRL, formatBRLCompacto, formatQtd } from '../../lib/almoxarifado';
import { formatDateBR, formatInt, formatPct } from '../../lib/format';
import { bucketDate, Granularidade } from '../../lib/demandas';
import { useChartConfig, estimateCategoryChartWidth } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';
import KpiCard from '../charts/KpiCard';
import Modal, { ModalHeader, ModalBody } from '../ui/Modal';
import {
  TableShell, TableHeadRow, TableBody, Th, SortableTh, Tr, Td, TableEmpty,
} from '../ui/DataTable';

interface SaidasPepPanelProps {
  movs: MB51Classificado[];
  pepMap: Map<string, FinPep>;
  loading?: boolean;
}

export interface AgregadoSaidaPep {
  wbs: string;
  nome: string;
  projeto: string;
  nivel: number | null;
  valorTotal: number;
  qtdTotal: number;
  totalMovimentos: number;
  materiaisDistintos: number;
  materiaisLista: { material: string; texto: string; qtd: number; valor: number }[];
  movimentos: MB51Classificado[];
}

/** Agrupa uma lista de movimentos de saída por Elemento PEP. Reaproveitado
 * tanto no agregado geral do painel quanto no drill-down por período. */
function construirAgregadosPep(lista: MB51Classificado[], pepMap: Map<string, FinPep>): AgregadoSaidaPep[] {
  const mapa = new Map<string, AgregadoSaidaPep>();

  lista.forEach(m => {
    const rawPep = m.elemento_pep?.trim() || '';
    const wbsChave = rawPep || 'SEM_PEP';

    const cadastroPep = rawPep ? pepMap.get(rawPep) : undefined;
    const nomePep = m.pep_nome || cadastroPep?.nome || (wbsChave === 'SEM_PEP' ? 'Saída sem Elemento PEP informado' : 'PEP não cadastrado');
    const projeto = m.pep_projeto || cadastroPep?.definicao_projeto || (wbsChave === 'SEM_PEP' ? '—' : 'Outros');
    const nivel = m.pep_nivel != null ? m.pep_nivel : (cadastroPep?.nivel ?? null);

    let item = mapa.get(wbsChave);
    if (!item) {
      item = {
        wbs: wbsChave,
        nome: nomePep,
        projeto,
        nivel,
        valorTotal: 0,
        qtdTotal: 0,
        totalMovimentos: 0,
        materiaisDistintos: 0,
        materiaisLista: [],
        movimentos: [],
      };
      mapa.set(wbsChave, item);
    }

    const valor = Math.abs(m.montante_mi || 0);
    const qtd = Math.abs(m.qtd_um_registro || 0);
    item.valorTotal += valor;
    item.qtdTotal += qtd;
    item.totalMovimentos += 1;
    item.movimentos.push(m);

    // Agrupa materiais deste PEP
    const matCod = m.material || '—';
    const matExistente = item.materiaisLista.find(mat => mat.material === matCod);
    if (matExistente) {
      matExistente.qtd += qtd;
      matExistente.valor += valor;
    } else {
      item.materiaisLista.push({
        material: matCod,
        texto: m.texto_breve_material || 'Sem descrição',
        qtd,
        valor,
      });
    }
  });

  // Ordena a lista interna de materiais de cada PEP pelo valor decrescente
  mapa.forEach(item => {
    item.materiaisDistintos = item.materiaisLista.length;
    item.materiaisLista.sort((a, b) => b.valor - a.valor);
  });

  return Array.from(mapa.values());
}

interface PontoSerieTemporal {
  key: string;
  label: string;
  rangeLabel?: string;
  valor: number;
  qtd: number;
  movimentos: number;
}

export default function SaidasPepPanel({ movs, pepMap, loading }: SaidasPepPanelProps) {
  const c = useChartConfig();
  const [pesquisa, setPesquisa] = useState('');
  const [projetoFiltro, setProjetoFiltro] = useState('Todos');
  const [apenasComPep, setApenasComPep] = useState<'todos' | 'com_pep' | 'sem_pep'>('todos');
  const [pepSelecionado, setPepSelecionado] = useState<string | null>(null);
  const [linhaExpandida, setLinhaExpandida] = useState<string | null>(null);
  const [granularidadeSerie, setGranularidadeSerie] = useState<Extract<Granularidade, 'semana' | 'mes'>>('semana');
  const [periodoModal, setPeriodoModal] = useState<PontoSerieTemporal | null>(null);
  const [linhaExpandidaModal, setLinhaExpandidaModal] = useState<string | null>(null);

  // Ordenação
  const [sortCol, setSortCol] = useState<'valor' | 'movimentos' | 'materiais' | 'wbs' | 'nome'>('valor');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Filtra apenas saídas e consumos de estoque
  const saidasBrutas = useMemo(() => {
    return movs.filter(m => {
      // Considera saídas: sinal 'saida' ou quantidade negativa ou categoria de consumo/remessa/baixa
      const ehSaida = m.sinal === 'saida' ||
        (m.qtd_um_registro != null && m.qtd_um_registro < 0) ||
        m.categoria === 'consumo' ||
        m.categoria === 'saida_remessa' ||
        m.categoria === 'baixa_sucata';
      return ehSaida;
    });
  }, [movs]);

  // Agrupamento por Elemento PEP
  const agregadosPorPep = useMemo(
    () => construirAgregadosPep(saidasBrutas, pepMap),
    [saidasBrutas, pepMap]
  );

  // Série temporal (semana ou mês) do valor total de saídas, para o gráfico
  // de evolução. Usa a mesma `bucketDate` dos painéis de Suprimentos, para as
  // semanas/meses coincidirem entre telas.
  const serieTemporal = useMemo<PontoSerieTemporal[]>(() => {
    const buckets = new Map<string, PontoSerieTemporal>();
    saidasBrutas.forEach(m => {
      const b = bucketDate(m.data_lancamento, granularidadeSerie);
      if (!b) return;
      let item = buckets.get(b.key);
      if (!item) {
        item = { key: b.key, label: b.label, rangeLabel: b.rangeLabel, valor: 0, qtd: 0, movimentos: 0 };
        buckets.set(b.key, item);
      }
      item.valor += Math.abs(m.montante_mi || 0);
      item.qtd += Math.abs(m.qtd_um_registro || 0);
      item.movimentos += 1;
    });
    return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [saidasBrutas, granularidadeSerie]);

  // Detalhamento por PEP do período clicado no gráfico de evolução —
  // classificado por WBS Element, como pedido no drill-down.
  const agregadosPeriodoModal = useMemo(() => {
    if (!periodoModal) return [];
    const movsDoPeriodo = saidasBrutas.filter(
      m => bucketDate(m.data_lancamento, granularidadeSerie)?.key === periodoModal.key
    );
    return construirAgregadosPep(movsDoPeriodo, pepMap)
      .sort((a, b) => a.wbs.localeCompare(b.wbs, 'pt-BR'));
  }, [saidasBrutas, periodoModal, granularidadeSerie, pepMap]);

  // Lista de Projetos únicos para filtro
  const projetosDisponiveis = useMemo(() => {
    const setProj = new Set<string>();
    agregadosPorPep.forEach(p => {
      if (p.projeto && p.projeto !== '—') setProj.add(p.projeto);
    });
    return Array.from(setProj).sort();
  }, [agregadosPorPep]);

  // Filtragem dos agregados
  const agregadosFiltrados = useMemo(() => {
    const q = pesquisa.trim().toLowerCase();
    return agregadosPorPep.filter(p => {
      if (projetoFiltro !== 'Todos' && p.projeto !== projetoFiltro) return false;
      if (apenasComPep === 'com_pep' && p.wbs === 'SEM_PEP') return false;
      if (apenasComPep === 'sem_pep' && p.wbs !== 'SEM_PEP') return false;
      if (pepSelecionado && p.wbs !== pepSelecionado) return false;

      if (q) {
        const hit =
          p.wbs.toLowerCase().includes(q) ||
          p.nome.toLowerCase().includes(q) ||
          p.projeto.toLowerCase().includes(q) ||
          p.materiaisLista.some(m => m.material.toLowerCase().includes(q) || m.texto.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [agregadosPorPep, pesquisa, projetoFiltro, apenasComPep, pepSelecionado]);

  // Ordenação dos agregados
  const agregadosOrdenados = useMemo(() => {
    const arr = [...agregadosFiltrados];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortCol) {
        case 'valor': return (a.valorTotal - b.valorTotal) * dir;
        case 'movimentos': return (a.totalMovimentos - b.totalMovimentos) * dir;
        case 'materiais': return (a.materiaisDistintos - b.materiaisDistintos) * dir;
        case 'wbs': return a.wbs.localeCompare(b.wbs, 'pt-BR') * dir;
        case 'nome': return a.nome.localeCompare(b.nome, 'pt-BR') * dir;
        default: return 0;
      }
    });
    return arr;
  }, [agregadosFiltrados, sortCol, sortDir]);

  // Totais e KPIs
  const kpis = useMemo(() => {
    const valorTotalSaidas = saidasBrutas.reduce((acc, m) => acc + Math.abs(m.montante_mi || 0), 0);
    const saídasComPep = saidasBrutas.filter(m => !!m.elemento_pep?.trim());
    const valorComPep = saídasComPep.reduce((acc, m) => acc + Math.abs(m.montante_mi || 0), 0);
    const pepsValidos = agregadosPorPep.filter(p => p.wbs !== 'SEM_PEP');

    const topPep = [...pepsValidos].sort((a, b) => b.valorTotal - a.valorTotal)[0];

    return {
      valorTotalSaidas,
      valorComPep,
      pctComPep: valorTotalSaidas > 0 ? (valorComPep / valorTotalSaidas) * 100 : 0,
      totalPeps: pepsValidos.length,
      topPepNome: topPep?.nome || '—',
      topPepWbs: topPep?.wbs || '—',
      topPepValor: topPep?.valorTotal || 0,
    };
  }, [saidasBrutas, agregadosPorPep]);

  // Dados para o Gráfico de Top 10 PEPs
  const top10ChartData = useMemo(() => {
    return [...agregadosPorPep]
      .filter(p => p.wbs !== 'SEM_PEP')
      .sort((a, b) => b.valorTotal - a.valorTotal)
      .slice(0, 10)
      .map(p => ({
        wbs: p.wbs,
        nome: p.nome,
        rotulo: p.nome.length > 28 ? `${p.nome.substring(0, 26)}...` : p.nome,
        valor: p.valorTotal,
        movimentos: p.totalMovimentos,
        share: kpis.valorTotalSaidas > 0 ? (p.valorTotal / kpis.valorTotalSaidas) * 100 : 0,
      }));
  }, [agregadosPorPep, kpis.valorTotalSaidas]);

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  // Exportação Excel
  const handleExportExcel = () => {
    if (!agregadosFiltrados.length) return;

    // Aba 1: Resumo consolidado por PEP
    const resumoData = agregadosFiltrados.map(p => ({
      'Elemento PEP': p.wbs,
      'Descrição do PEP': p.nome,
      'Projeto': p.projeto,
      'Nível': p.nivel ?? '—',
      'Total Movimentações': p.totalMovimentos,
      'Materiais Distintos': p.materiaisDistintos,
      'Valor Total das Saídas (R$)': p.valorTotal,
      'Participação no Total': kpis.valorTotalSaidas > 0 ? (p.valorTotal / kpis.valorTotalSaidas) : 0,
    }));

    // Aba 2: Extrato Detalhado de Movimentos
    const extratoData: any[] = [];
    agregadosFiltrados.forEach(p => {
      p.movimentos.forEach(m => {
        extratoData.push({
          'Elemento PEP': p.wbs,
          'Descrição do PEP': p.nome,
          'Projeto': p.projeto,
          'Doc. Material': m.doc_material,
          'Item': m.item || '',
          'Data Lançamento': formatDateBR(m.data_lancamento),
          'Tipo Movimento': m.tipo_movimento || '',
          'Desc. Tipo Movimento': m.descricao_tipo_movimento || '',
          'Material': m.material || '',
          'Texto Breve Material': m.texto_breve_material || '',
          'Quantidade': Math.abs(m.qtd_um_registro || 0),
          'Unidade': m.unid_medida_basica || '',
          'Valor (R$)': Math.abs(m.montante_mi || 0),
          'Depósito': m.deposito || '',
          'Centro': m.centro || '',
          'Usuário': m.nome_usuario || '',
        });
      });
    });

    const wb = XLSX.utils.book_new();
    const wsResumo = XLSX.utils.json_to_sheet(resumoData);
    const wsExtrato = XLSX.utils.json_to_sheet(extratoData);

    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo por PEP');
    XLSX.utils.book_append_sheet(wb, wsExtrato, 'Extrato de Saídas');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    XLSX.writeFile(wb, `saidas_estoque_por_pep_${timestamp}.xlsx`);
  };

  function TooltipTopPep({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <ChartTooltip
        title={row.nome}
        rows={[
          { label: 'WBS Element', value: row.wbs },
          { label: 'Valor das Saídas', value: formatBRL(row.valor) },
          { label: 'Movimentações', value: formatInt(row.movimentos) },
          { label: 'Participação nas Saídas', value: `${row.share.toFixed(1)}%` },
        ]}
        footer="Clique na barra para filtrar a tabela por este PEP"
      />
    );
  }

  function TooltipSerieTemporal({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as PontoSerieTemporal;
    return (
      <ChartTooltip
        title={row.label}
        subtitle={row.rangeLabel}
        rows={[
          { label: 'Valor das Saídas', value: formatBRL(row.valor) },
          { label: 'Movimentações', value: formatInt(row.movimentos) },
        ]}
        footer="Clique na barra para ver o detalhamento por PEP"
      />
    );
  }

  return (
    <div className="space-y-6 select-text">
      {/* KPIs Superiores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiCard
          label="Total de Saídas de Estoque"
          value={kpis.valorTotalSaidas}
          format={formatBRL}
          detail={`${formatInt(saidasBrutas.length)} lançamentos de consumo/saída`}
          icon={TrendingDown}
          accent="var(--brand)"
        />
        <KpiCard
          label="Apropriado a Elementos PEP"
          value={kpis.valorComPep}
          format={formatBRL}
          detail={`${kpis.pctComPep.toFixed(1)}% do valor com PEP alocado`}
          icon={CheckCircle2}
          accent="var(--status-good)"
          share={kpis.pctComPep / 100}
        />
        <KpiCard
          label="Elementos PEP Atendidos"
          value={kpis.totalPeps}
          format={formatInt}
          detail="Centros de custo/projetos com saídas"
          icon={FolderTree}
          accent="var(--series-4)"
        />
        <KpiCard
          label="Maior PEP em Consumo"
          display={formatBRL(kpis.topPepValor)}
          detail={kpis.topPepNome}
          icon={Layers}
          accent="var(--status-warning)"
          emphasize
        />
      </div>

      {/* Gráfico de Evolução das Saídas (Semana/Mês) */}
      <ChartCard
        title={`Evolução das Saídas de Estoque por ${granularidadeSerie === 'semana' ? 'Semana' : 'Mês'}`}
        icon={CalendarRange}
        description="Soma do valor de saídas no período. Clique numa barra para abrir o detalhamento por Elemento PEP daquele período."
        height={280}
        minPlotWidth={estimateCategoryChartWidth(serieTemporal.length, 56, 480)}
        empty={serieTemporal.length === 0}
        emptyMessage="Nenhuma saída no período selecionado."
        actions={
          <div
            className="flex items-center gap-1 rounded-lg border p-0.5"
            style={{ borderColor: 'var(--hairline)' }}
            role="group"
            aria-label="Granularidade da série temporal"
          >
            {(['semana', 'mes'] as const).map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularidadeSerie(g)}
                aria-pressed={granularidadeSerie === g}
                className="px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 cursor-pointer"
                style={
                  granularidadeSerie === g
                    ? { background: 'var(--brand)', color: '#ffffff' }
                    : { color: 'var(--ink-muted)' }
                }
              >
                {g === 'semana' ? 'Semana' : 'Mês'}
              </button>
            ))}
          </div>
        }
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={serieTemporal} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid {...c.grid} />
            <XAxis dataKey="label" {...c.xAxis} />
            <YAxis tickFormatter={formatBRLCompacto} {...c.yAxis} width={56} />
            <Tooltip content={<TooltipSerieTemporal />} cursor={c.cursor} />
            <Bar
              dataKey="valor"
              name="Valor das Saídas"
              fill="var(--brand)"
              radius={c.radius.top}
              onClick={(data: any) => { setPeriodoModal(data?.payload ?? null); setLinhaExpandidaModal(null); }}
              className="cursor-pointer hover:opacity-85 transition-opacity"
              {...c.animation}
            >
              <LabelList
                dataKey="valor"
                position="top"
                formatter={(val: any) => formatBRLCompacto(Number(val) || 0)}
                style={{ ...c.labelOnSurface, fontSize: 10 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Gráfico Top PEPs */}
      {top10ChartData.length > 0 && (
        <ChartCard
          title="Top 10 Elementos PEP por Valor de Saída de Estoque"
          icon={FolderTree}
          description="Apropriação de materiais e custos por descrição do elemento PEP. Clique numa barra para isolar o elemento."
          height={320}
          empty={top10ChartData.length === 0}
          emptyMessage="Nenhuma saída com elemento PEP no período selecionado."
        >
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={top10ChartData} layout="vertical" margin={{ top: 8, right: 90, left: 10, bottom: 4 }}>
              <CartesianGrid {...c.grid} vertical horizontal={false} />
              <XAxis type="number" tickFormatter={formatBRLCompacto} {...c.yAxis} />
              <YAxis
                type="category"
                dataKey="rotulo"
                {...c.xAxis}
                width={190}
                tick={{ fontSize: 11, fill: 'var(--ink-secondary)' }}
              />
              <Tooltip content={<TooltipTopPep />} cursor={c.cursor} />
              <Bar
                dataKey="valor"
                fill="var(--brand)"
                radius={[0, 4, 4, 0]}
                onClick={(data: any) => setPepSelecionado(prev => prev === data.wbs ? null : data.wbs)}
                className="cursor-pointer hover:opacity-85 transition-opacity"
              >
                <LabelList
                  dataKey="valor"
                  position="right"
                  formatter={(val: any) => formatBRLCompacto(Number(val) || 0)}
                  style={{ fontSize: 10, fontWeight: 700, fill: 'var(--ink-secondary)' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Barra de Filtros e Busca */}
      <div className="rounded-xl border p-4 shadow-xs space-y-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={pesquisa}
              onChange={e => setPesquisa(e.target.value)}
              placeholder="Busque por descrição do PEP, código WBS ou material consumido..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border text-xs focus:outline-none focus:border-emerald-500 transition-colors"
              style={{
                borderColor: 'var(--hairline)',
                background: 'var(--surface-sunken)',
                color: 'var(--ink-primary)',
              }}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {projetosDisponiveis.length > 0 && (
              <select
                value={projetoFiltro}
                onChange={e => setProjetoFiltro(e.target.value)}
                className="px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)', color: 'var(--ink-primary)' }}
              >
                <option value="Todos">Projeto: Todos</option>
                {projetosDisponiveis.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}

            <select
              value={apenasComPep}
              onChange={e => setApenasComPep(e.target.value as any)}
              className="px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)', color: 'var(--ink-primary)' }}
            >
              <option value="todos">Alocação: Todas as saídas</option>
              <option value="com_pep">Apenas com Elemento PEP</option>
              <option value="sem_pep">Sem Elemento PEP alocado</option>
            </select>

            {pepSelecionado && (
              <button
                onClick={() => setPepSelecionado(null)}
                className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                Filtrado por PEP: {pepSelecionado} ✕
              </button>
            )}

            <button
              onClick={handleExportExcel}
              disabled={agregadosFiltrados.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Exportar Planilha
            </button>
          </div>
        </div>
      </div>

      {/* Tabela Agregada por PEP */}
      {agregadosOrdenados.length === 0 ? (
        <TableEmpty
          icon={FolderTree}
          title="Nenhuma saída coincide com o filtro"
          hint="Verifique os filtros de período, projeto ou termo de busca."
        />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs px-1 font-bold" style={{ color: 'var(--ink-muted)' }}>
            <span>Exibindo {agregadosOrdenados.length} elementos PEP com saída de estoque</span>
            <span>Clique numa linha para ver os materiais consumidos</span>
          </div>

          <TableShell maxHeight="65vh">
            <table className="w-full text-xs border-collapse">
              <TableHeadRow>
                <Th label="" width="w-8" />
                <SortableTh col="wbs" label="WBS Element" sortColumn={sortCol} sortDir={sortDir} onSort={handleSort as any} />
                <SortableTh col="nome" label="Descrição do Elemento PEP" sortColumn={sortCol} sortDir={sortDir} onSort={handleSort as any} />
                <Th label="Projeto" width="w-24" />
                <Th label="Nível" width="w-20" />
                <SortableTh col="movimentos" label="Lançamentos" align="right" sortColumn={sortCol} sortDir={sortDir} onSort={handleSort as any} width="w-28" />
                <SortableTh col="materiais" label="Itens Distintos" align="right" sortColumn={sortCol} sortDir={sortDir} onSort={handleSort as any} width="w-28" />
                <SortableTh col="valor" label="Valor Total Saídas (R$)" align="right" sortColumn={sortCol} sortDir={sortDir} onSort={handleSort as any} width="w-40" />
                <Th label="Participação" align="right" width="w-24" />
              </TableHeadRow>
              <TableBody>
                {agregadosOrdenados.map(p => {
                  const expandida = linhaExpandida === p.wbs;
                  const share = kpis.valorTotalSaidas > 0 ? (p.valorTotal / kpis.valorTotalSaidas) * 100 : 0;
                  return (
                    <React.Fragment key={p.wbs}>
                      <Tr
                        onClick={() => setLinhaExpandida(expandida ? null : p.wbs)}
                        className={`cursor-pointer transition-colors ${expandida ? 'bg-slate-50/80 dark:bg-slate-800/40' : ''}`}
                      >
                        <Td>
                          <span className="text-slate-400">
                            {expandida ? <ChevronDown className="h-4 w-4 text-emerald-600" /> : <ChevronRight className="h-4 w-4" />}
                          </span>
                        </Td>
                        <Td mono strong className="whitespace-nowrap">
                          {p.wbs === 'SEM_PEP' ? (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono text-[10px]">
                              SEM PEP
                            </span>
                          ) : (
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold">{p.wbs}</span>
                          )}
                        </Td>
                        <Td strong title={p.nome} className="max-w-[320px]">
                          <span style={{ color: 'var(--ink-primary)' }}>{p.nome}</span>
                        </Td>
                        <Td mono>{p.projeto}</Td>
                        <Td>
                          {p.nivel != null ? (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              p.nivel === 1
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                : p.nivel === 2
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}>
                              N{p.nivel}
                            </span>
                          ) : '—'}
                        </Td>
                        <Td align="right" numeric>{formatInt(p.totalMovimentos)}</Td>
                        <Td align="right" numeric>{formatInt(p.materiaisDistintos)}</Td>
                        <Td align="right" numeric strong className="whitespace-nowrap">
                          {formatBRL(p.valorTotal)}
                        </Td>
                        <Td align="right" numeric className="text-[11px] font-semibold text-slate-500">
                          {share.toFixed(1)}%
                        </Td>
                      </Tr>

                      {/* Linha expandida com detalhamento de materiais */}
                      {expandida && (
                        <tr>
                          <td colSpan={9} className="p-0 border-b" style={{ borderColor: 'var(--hairline)' }}>
                            <div className="p-4 bg-slate-50/70 dark:bg-slate-900/60 border-l-4 border-emerald-500 space-y-3">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold flex items-center gap-1.5" style={{ color: 'var(--ink-primary)' }}>
                                  <Package className="h-4 w-4 text-emerald-600" /> Materiais consumidos em: {p.nome} ({p.wbs})
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  Top materiais por valor acumulado de saída
                                </span>
                              </div>

                              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-100 dark:bg-slate-900 font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                    <tr>
                                      <th className="p-2 text-left">Código Material</th>
                                      <th className="p-2 text-left">Descrição do Material</th>
                                      <th className="p-2 text-right">Qtd Total Saída</th>
                                      <th className="p-2 text-right">Valor Total (R$)</th>
                                      <th className="p-2 text-right">% no PEP</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {p.materiaisLista.map((mat, idx) => {
                                      const shareMat = p.valorTotal > 0 ? (mat.valor / p.valorTotal) * 100 : 0;
                                      return (
                                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                                          <td className="p-2 font-mono font-bold text-slate-800 dark:text-slate-200">{mat.material}</td>
                                          <td className="p-2 text-slate-700 dark:text-slate-300">{mat.texto}</td>
                                          <td className="p-2 text-right font-mono">{formatQtd(mat.qtd)}</td>
                                          <td className="p-2 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">{formatBRL(mat.valor)}</td>
                                          <td className="p-2 text-right text-slate-500 text-[11px]">{shareMat.toFixed(1)}%</td>
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
      )}

      {/* Modal de detalhamento por PEP do período clicado no gráfico de evolução */}
      {periodoModal && (
        <Modal onClose={() => setPeriodoModal(null)} maxWidth="max-w-3xl" ariaLabel="Saídas por PEP no período">
          <ModalHeader onClose={() => setPeriodoModal(null)}>
            <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
              Saídas por Elemento PEP — {periodoModal.label}
              {periodoModal.rangeLabel ? ` (${periodoModal.rangeLabel})` : ''}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              {formatInt(periodoModal.movimentos)} lançamentos · {formatBRL(periodoModal.valor)} no período, classificado por WBS Element — clique numa linha para ver os itens
            </p>
          </ModalHeader>
          <ModalBody>
            {agregadosPeriodoModal.length === 0 ? (
              <TableEmpty
                icon={FolderTree}
                title="Nenhuma saída com PEP neste período"
              />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-900 font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-2 w-6"></th>
                      <th className="p-2 text-left">WBS Element</th>
                      <th className="p-2 text-left">Descrição do PEP</th>
                      <th className="p-2 text-left">Projeto</th>
                      <th className="p-2 text-right">Lançamentos</th>
                      <th className="p-2 text-right">Valor Total (R$)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {agregadosPeriodoModal.map(p => {
                      const expandida = linhaExpandidaModal === p.wbs;
                      return (
                        <React.Fragment key={p.wbs}>
                          <tr
                            onClick={() => setLinhaExpandidaModal(expandida ? null : p.wbs)}
                            className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40 ${expandida ? 'bg-slate-50/80 dark:bg-slate-800/40' : ''}`}
                          >
                            <td className="p-2 text-slate-400">
                              {expandida ? <ChevronDown className="h-3.5 w-3.5 text-emerald-600" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </td>
                            <td className="p-2 font-mono font-bold whitespace-nowrap">
                              {p.wbs === 'SEM_PEP' ? (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px]">SEM PEP</span>
                              ) : (
                                <span className="text-emerald-700 dark:text-emerald-400">{p.wbs}</span>
                              )}
                            </td>
                            <td className="p-2 text-slate-700 dark:text-slate-300">{p.nome}</td>
                            <td className="p-2 font-mono text-slate-600 dark:text-slate-400">{p.projeto}</td>
                            <td className="p-2 text-right font-mono">{formatInt(p.totalMovimentos)}</td>
                            <td className="p-2 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">{formatBRL(p.valorTotal)}</td>
                          </tr>
                          {expandida && (
                            <tr>
                              <td colSpan={6} className="p-0 border-b" style={{ borderColor: 'var(--hairline)' }}>
                                <div className="p-3 bg-slate-50/70 dark:bg-slate-900/60 border-l-4 border-emerald-500">
                                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                                    <table className="w-full text-xs">
                                      <thead className="bg-slate-100 dark:bg-slate-900 font-bold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                        <tr>
                                          <th className="p-2 text-left">Código Material</th>
                                          <th className="p-2 text-left">Descrição do Material</th>
                                          <th className="p-2 text-right">Qtd Total Saída</th>
                                          <th className="p-2 text-right">Valor Total (R$)</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {p.materiaisLista.map((mat, idx) => (
                                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                                            <td className="p-2 font-mono font-bold text-slate-800 dark:text-slate-200">{mat.material}</td>
                                            <td className="p-2 text-slate-700 dark:text-slate-300">{mat.texto}</td>
                                            <td className="p-2 text-right font-mono">{formatQtd(mat.qtd)}</td>
                                            <td className="p-2 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">{formatBRL(mat.valor)}</td>
                                          </tr>
                                        ))}
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
                  </tbody>
                </table>
              </div>
            )}
          </ModalBody>
        </Modal>
      )}
    </div>
  );
}
