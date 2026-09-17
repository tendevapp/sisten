/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Recorrência de Compras — auditoria e planejamento das áreas requisitantes.
 *
 * Responde "quantas vezes compramos isso, para quem, com quem e com que
 * intervalo" — cruzando material (ou item parecido, quando não há o mesmo
 * código SAP) com tempo, área solicitante, fornecedor e valor. É diferente
 * de `TabAnaliseCompras`: aquela pergunta onde está concentrado o gasto;
 * esta pergunta se o padrão de compra ao longo do tempo é saudável ou indica
 * falta de planejamento / fracionamento de demanda.
 *
 * Mesma base de dados e mesmo padrão de filtros próprios de
 * `TabAnaliseCompras` (a página não usa os filtros do shell porque a base é
 * `vw_historico_pedidos`, não `EnrichedSAPRecord`).
 *
 * Consumo operacional recorrente e consumo de projeto (arame, tinta,
 * eletrodo — entregas parciais e uso contínuo por natureza) são mostrados em
 * seções separadas: só a seção de Consumo alimenta os alertas de auditoria.
 * Recorrência de projeto não é irregularidade.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx-js-style';
import {
  RefreshCw,
  Wallet,
  Repeat,
  Clock,
  TrendingUp,
  Building2,
  Layers,
  ShieldAlert,
  LineChart as LineChartIcon,
  type LucideIcon,
} from 'lucide-react';
import { localDb } from '../../db/localDb';
import { HistoricoPedidoView } from '../../types';
import {
  calcRecorrencia,
  detectarAlertasAuditoria,
  normalizarDescricaoItem,
  serieTemporalRecorrencia,
  porFornecedor,
  porTipoItem,
  NAO_INFORMADO,
  type RecorrenciaItem,
  type AlertaAuditoria,
  type ChaveRecorrencia,
  type TipoAlerta,
  type FatiaValor,
} from '../../lib/historicoAnalytics';
import { formatInt, formatPct, formatBRLCompacto, formatDateBR } from '../../lib/format';
import KpiCard from '../charts/KpiCard';
import ComposicaoModal, { ComposicaoColuna, ComposicaoModalConfig } from '../charts/ComposicaoModal';
import ParetoValorChart from '../historico/ParetoValorChart';
import SerieTemporalChart from '../historico/SerieTemporalChart';

interface TabRecorrenciaComprasProps {
  onNavigate: (path: string) => void;
}

interface Filtros {
  de: string;
  ate: string;
  area: string;
  grupo: string;
  nivel1: string;
  nivel2: string;
  material: string;
  descricao: string;
  fornecedor: string;
  valorMin: string;
  valorMax: string;
  qtdMin: string;
  qtdMax: string;
  status: string;
  tipoItem: string;
}

const FILTROS_VAZIOS: Filtros = {
  de: `${new Date().getFullYear()}-01-01`,
  ate: '',
  area: 'todas',
  grupo: 'todos',
  nivel1: 'todos',
  nivel2: 'todos',
  material: '',
  descricao: '',
  fornecedor: 'todos',
  valorMin: '',
  valorMax: '',
  qtdMin: '',
  qtdMax: '',
  status: 'todos',
  tipoItem: 'todos',
};

type Ordenacao = 'valor' | 'repeticao' | 'intervalo' | 'variacao' | 'concentracao';

const selectClass =
  'rounded-lg border py-1.5 px-3 text-xs cursor-pointer transition-colors duration-150 focus:outline-2 focus:outline-offset-1 border-[var(--hairline)] bg-[var(--surface-card)] text-[var(--ink-secondary)] focus:outline-[var(--brand)]';

const ALERTA_META: Record<TipoAlerta, { label: string; icon: LucideIcon }> = {
  maior_valor: { label: 'Maior valor comprado', icon: Wallet },
  mais_repetido: { label: 'Compra muito repetida', icon: Repeat },
  intervalo_curto: { label: 'Intervalo curto entre compras', icon: Clock },
  aumento_anormal: { label: 'Aumento fora do padrão', icon: TrendingUp },
  concentracao: { label: 'Concentração em área/fornecedor', icon: Building2 },
};

const COLUNAS_DETALHE: ComposicaoColuna<HistoricoPedidoView>[] = [
  { header: 'Material', render: l => React.createElement('span', { className: 'font-mono' }, l.material) },
  { header: 'Descrição', render: l => l.txt_breve || '—' },
  { header: 'Área', render: l => l.area_solicitante || '—' },
  { header: 'Fornecedor', render: l => porFornecedor(l) || 'Não informado' },
  { header: 'Doc. Compra', render: l => l.doc_compra || '—' },
  { header: 'Data', render: l => formatDateBR(l.data_doc) },
  { header: 'Qtd.', align: 'right', render: l => (l.qtd_pedido != null ? formatInt(l.qtd_pedido) : '—') },
  {
    header: 'Valor (BRL)',
    align: 'right',
    render: l => (typeof l.valor_liquido === 'number' ? formatBRLCompacto(l.valor_liquido) : '—'),
  },
];

/**
 * Rótulo de exibição do item — descrição resumida, não o código, tanto no
 * ranking quanto na correspondência ao clique (o Pareto encurta sozinho para
 * o eixo, mas usa este mesmo texto como valor de clique — colisão entre dois
 * materiais com descrição idêntica é uma hipótese rara e de baixo risco: o
 * pior caso é abrir o item "irmão" no drill-down).
 */
function rotuloItem(item: RecorrenciaItem, chaveDe: ChaveRecorrencia): string {
  return chaveDe === 'material'
    ? item.descricao || item.material || item.chave
    : `${item.grupoDesc} — ${item.descricao || item.chave}`;
}

/** Linhas que não representam uma compra de material: serviço (ZP06) ou o
 *  próprio contrato-quadro aparecendo como linha (descrição começa com
 *  "Contrato..."). Excluídas de toda a análise de recorrência de compras. */
function ehCompraDeMaterial(l: HistoricoPedidoView): boolean {
  if (l.tipo_doc_compra === 'ZP06') return false;
  if (/^contrato\b/i.test((l.txt_breve || '').trim())) return false;
  return true;
}

/** Razão entre a última compra e a média das anteriores — só para ordenação por variação. */
function razaoUltimaMedia(item: RecorrenciaItem): number {
  const ordenados = item.itens
    .filter(l => l.data_doc)
    .sort((a, b) => (a.data_doc || '').localeCompare(b.data_doc || ''));
  if (ordenados.length < 2) return 0;
  const ultimo = ordenados[ordenados.length - 1];
  const anteriores = ordenados.slice(0, -1);
  const mediaValor = anteriores.reduce((s, l) => s + (typeof l.valor_liquido === 'number' ? l.valor_liquido : 0), 0) / anteriores.length;
  const valorUltimo = typeof ultimo.valor_liquido === 'number' ? ultimo.valor_liquido : 0;
  return mediaValor > 0 ? valorUltimo / mediaValor : 0;
}

/** Menor eixo de concentração (áreas ou fornecedores) — só relevante com 2+ pedidos. */
function scoreConcentracao(item: RecorrenciaItem): number {
  if (item.pedidosDistintos < 2) return Infinity;
  return Math.min(item.areas.length || Infinity, item.fornecedores.length || Infinity);
}

export default function TabRecorrenciaCompras({ onNavigate }: TabRecorrenciaComprasProps) {
  const [linhas, setLinhas] = useState<HistoricoPedidoView[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [chaveRecorrencia, setChaveRecorrencia] = useState<ChaveRecorrencia>('material');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('valor');
  const [granularidade, setGranularidade] = useState<'semana' | 'mes'>('mes');
  const [itemSelecionado, setItemSelecionado] = useState<RecorrenciaItem | null>(null);
  const [composicaoModal, setComposicaoModal] = useState<ComposicaoModalConfig<HistoricoPedidoView> | null>(null);

  const carregar = useCallback(async (force = false) => {
    if (force) setSincronizando(true);
    try {
      setLinhas(await localDb.fetchHistoricoPedidos(force));
    } catch (err) {
      console.error('Falha ao carregar histórico de compras:', err);
      setLinhas(localDb.getHistoricoPedidos());
    } finally {
      setCarregando(false);
      setSincronizando(false);
    }
  }, []);

  useEffect(() => {
    setLinhas(localDb.getHistoricoPedidos());
    carregar();
  }, [carregar]);

  const patch = (p: Partial<Filtros>) => setFiltros(f => ({ ...f, ...p }));

  /* Opções de filtro, sobre a base inteira (não o recorte filtrado) -------- */

  const opcoes = useMemo(() => {
    const areas = new Set<string>();
    const grupos = new Set<string>();
    const fornecedores = new Set<string>();
    const nivel1s = new Set<string>();
    const nivel2PorNivel1 = new Map<string, Set<string>>();
    const nivel2sTodos = new Set<string>();
    for (const l of linhas) {
      if (!ehCompraDeMaterial(l)) continue;
      const a = (l.area_solicitante || '').trim();
      if (a) areas.add(a);
      const g = (l.grp_mercads_desc || l.grp_mercads || '').trim();
      if (g) grupos.add(g);
      const f = porFornecedor(l);
      if (f) fornecedores.add(f);
      const n1 = (l.classificacao_nivel1 || '').trim();
      const n2 = (l.classificacao_nivel2 || '').trim();
      if (n1) nivel1s.add(n1);
      if (n2) {
        nivel2sTodos.add(n2);
        if (n1) {
          const conjunto = nivel2PorNivel1.get(n1) || new Set<string>();
          conjunto.add(n2);
          nivel2PorNivel1.set(n1, conjunto);
        }
      }
    }
    const ordenar = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const nivel2PorNivel1Ordenado = new Map<string, string[]>();
    for (const [n1, conjunto] of nivel2PorNivel1) nivel2PorNivel1Ordenado.set(n1, ordenar(conjunto));
    return {
      areas: ordenar(areas),
      grupos: ordenar(grupos),
      fornecedores: ordenar(fornecedores),
      nivel1s: ordenar(nivel1s),
      nivel2sTodos: ordenar(nivel2sTodos),
      nivel2PorNivel1: nivel2PorNivel1Ordenado,
    };
  }, [linhas]);

  /* Filtro ------------------------------------------------------------- */

  const filtradas = useMemo(() => {
    const valorMin = filtros.valorMin ? parseFloat(filtros.valorMin) : null;
    const valorMax = filtros.valorMax ? parseFloat(filtros.valorMax) : null;
    const qtdMin = filtros.qtdMin ? parseFloat(filtros.qtdMin) : null;
    const qtdMax = filtros.qtdMax ? parseFloat(filtros.qtdMax) : null;
    const materialBusca = filtros.material.trim().toLowerCase();
    const descBusca = filtros.descricao.trim().toLowerCase();

    return linhas.filter(l => {
      // Serviço (ZP06) e linha de contrato-quadro não são compra de material
      // — ficam fora da análise de recorrência inteira, não só de um filtro.
      if (!ehCompraDeMaterial(l)) return false;
      const d = String(l.data_doc ?? '');
      if (filtros.de && (!d || d < filtros.de)) return false;
      if (filtros.ate && (!d || d > filtros.ate)) return false;
      if (filtros.area !== 'todas' && (l.area_solicitante || '').trim() !== filtros.area) return false;
      if (filtros.grupo !== 'todos' && (l.grp_mercads_desc || l.grp_mercads || '').trim() !== filtros.grupo) return false;
      if (filtros.nivel1 !== 'todos' && (l.classificacao_nivel1 || '').trim() !== filtros.nivel1) return false;
      if (filtros.nivel2 !== 'todos' && (l.classificacao_nivel2 || '').trim() !== filtros.nivel2) return false;
      if (materialBusca && !(l.material || '').toLowerCase().includes(materialBusca)) return false;
      if (descBusca && !(l.txt_breve || '').toLowerCase().includes(descBusca)) return false;
      if (filtros.fornecedor !== 'todos' && (porFornecedor(l) || NAO_INFORMADO) !== filtros.fornecedor) return false;
      if (valorMin !== null && (l.valor_liquido || 0) < valorMin) return false;
      if (valorMax !== null && (l.valor_liquido || 0) > valorMax) return false;
      if (qtdMin !== null && (l.qtd_pedido || 0) < qtdMin) return false;
      if (qtdMax !== null && (l.qtd_pedido || 0) > qtdMax) return false;
      if (filtros.status === 'entregue' && l.pedido_parcial) return false;
      if (filtros.status === 'parcial' && !l.pedido_parcial) return false;
      if (filtros.tipoItem !== 'todos' && porTipoItem(l) !== filtros.tipoItem) return false;
      return true;
    });
  }, [linhas, filtros]);

  const filtradasConsumo = useMemo(() => filtradas.filter(l => porTipoItem(l) !== 'Projeto'), [filtradas]);
  const filtradasProjeto = useMemo(() => filtradas.filter(l => porTipoItem(l) === 'Projeto'), [filtradas]);

  /* Recorrência ----------------------------------------------------------- */

  const recorrenciasConsumo = useMemo(
    () => calcRecorrencia(filtradasConsumo, chaveRecorrencia),
    [filtradasConsumo, chaveRecorrencia]
  );
  const recorrenciasProjeto = useMemo(
    () => calcRecorrencia(filtradasProjeto, chaveRecorrencia),
    [filtradasProjeto, chaveRecorrencia]
  );

  const alertas = useMemo(() => detectarAlertasAuditoria(recorrenciasConsumo), [recorrenciasConsumo]);

  const alertasPorChave = useMemo(() => {
    const mapa = new Map<string, AlertaAuditoria[]>();
    for (const a of alertas) {
      const lista = mapa.get(a.item.chave) || [];
      lista.push(a);
      mapa.set(a.item.chave, lista);
    }
    return mapa;
  }, [alertas]);

  const recorrenciasOrdenadas = useMemo(() => {
    const copia = [...recorrenciasConsumo];
    switch (ordenacao) {
      case 'repeticao':
        return copia.sort((a, b) => b.pedidosDistintos - a.pedidosDistintos);
      case 'intervalo':
        return copia.sort((a, b) => {
          const ai = a.menorIntervaloDias ?? Infinity;
          const bi = b.menorIntervaloDias ?? Infinity;
          return ai - bi;
        });
      case 'variacao':
        return copia.sort((a, b) => razaoUltimaMedia(b) - razaoUltimaMedia(a));
      case 'concentracao':
        return copia.sort((a, b) => scoreConcentracao(a) - scoreConcentracao(b) || b.pedidosDistintos - a.pedidosDistintos);
      case 'valor':
      default:
        return copia.sort((a, b) => b.valor - a.valor);
    }
  }, [recorrenciasConsumo, ordenacao]);

  /* Ranking (Pareto) -------------------------------------------------------
   * Reaproveita RecorrenciaItem já calculado em vez de agregar de novo — o
   * "chave" do FatiaValor vira o rótulo do eixo/clique, resolvido de volta
   * ao RecorrenciaItem por rotuloItem() no onSelecionar. */

  const fatiasRanking: FatiaValor[] = useMemo(() => {
    const total = recorrenciasConsumo.reduce((s, r) => s + r.valor, 0);
    let acumulado = 0;
    return [...recorrenciasConsumo]
      .sort((a, b) => b.valor - a.valor)
      .map(r => {
        const participacao = total > 0 ? (r.valor / total) * 100 : 0;
        acumulado += participacao;
        return {
          chave: rotuloItem(r, chaveRecorrencia),
          valor: r.valor,
          itens: r.itens.length,
          pedidos: r.pedidosDistintos,
          participacao,
          acumulado,
        };
      });
  }, [recorrenciasConsumo, chaveRecorrencia]);

  const handleSelecionarRanking = useCallback(
    (rotulo: string) => {
      const item = recorrenciasConsumo.find(r => rotuloItem(r, chaveRecorrencia) === rotulo);
      if (item) setItemSelecionado(item);
    },
    [recorrenciasConsumo, chaveRecorrencia]
  );

  const serieItemSelecionado = useMemo(
    () => (itemSelecionado ? serieTemporalRecorrencia(itemSelecionado.itens, granularidade) : []),
    [itemSelecionado, granularidade]
  );

  /* KPIs -------------------------------------------------------------- */

  const kpis = useMemo(() => {
    const valorTotal = recorrenciasConsumo.reduce((s, r) => s + r.valor, 0);
    const comRecorrencia = recorrenciasConsumo.filter(r => r.pedidosDistintos >= 2);
    const intervalos = recorrenciasConsumo
      .map(r => r.menorIntervaloDias)
      .filter((d): d is number => d !== null);
    return {
      valorTotal,
      comRecorrencia: comRecorrencia.length,
      totalAlertas: alertas.length,
      menorIntervalo: intervalos.length > 0 ? Math.min(...intervalos) : null,
      materiaisAnalisados: recorrenciasConsumo.length,
    };
  }, [recorrenciasConsumo, alertas]);

  /* Modal de composição --------------------------------------------------- */

  const abrirModalItem = useCallback(
    (item: RecorrenciaItem) => {
      setComposicaoModal({
        title: chaveRecorrencia === 'material' ? `Material — ${item.material}` : `Item similar — ${item.grupoDesc}`,
        badge: item.descricao || item.material || item.chave,
        subtitle: item.descricao,
        items: item.itens,
        groupBy: l => porFornecedor(l) || NAO_INFORMADO,
        groupLabelHeader: 'Fornecedor',
        valueOf: l => (typeof l.valor_liquido === 'number' ? l.valor_liquido : 0),
        formatValue: formatBRLCompacto,
        valueHeader: 'Valor Total',
        unidadeItem: 'pedido(s)',
        detailColumns: COLUNAS_DETALHE,
        searchPredicate: (l, q) =>
          (l.material || '').toLowerCase().includes(q) ||
          (l.txt_breve || '').toLowerCase().includes(q) ||
          (porFornecedor(l) || '').toLowerCase().includes(q),
        searchPlaceholder: 'Pesquisar por material, descrição ou fornecedor...',
        itemKey: (l, idx) => `${l.material}-${l.doc_compra || ''}-${idx}`,
      });
    },
    [chaveRecorrencia]
  );

  /* Exportação -------------------------------------------------------- */

  const exportarRanking = useCallback(() => {
    const dados = recorrenciasOrdenadas.map(r => ({
      Material: r.material,
      Descrição: r.descricao,
      Grupo: r.grupoDesc,
      Tipo: r.tipoItem,
      'Pedidos Distintos': r.pedidosDistintos,
      'Quantidade Total': r.qtdTotal,
      'Valor Total (BRL)': r.valor,
      Áreas: r.areas.join('; '),
      Fornecedores: r.fornecedores.join('; '),
      'Intervalo Médio (dias)': r.intervaloMedioDias != null ? Math.round(r.intervaloMedioDias) : '',
      'Menor Intervalo (dias)': r.menorIntervaloDias ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ranking de Recorrência');
    XLSX.writeFile(wb, `recorrencia_compras_ranking_${Date.now()}.xlsx`);
  }, [recorrenciasOrdenadas]);

  const exportarAlertas = useCallback(() => {
    const dados = alertas.map(a => ({
      Tipo: ALERTA_META[a.tipo].label,
      Severidade: a.severidade,
      Material: a.item.material,
      Descrição: a.item.descricao,
      Grupo: a.item.grupoDesc,
      Justificativa: a.justificativa,
      'Valor Total (BRL)': a.item.valor,
      'Pedidos Distintos': a.item.pedidosDistintos,
      Áreas: a.item.areas.join('; '),
      Fornecedores: a.item.fornecedores.join('; '),
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Alertas de Auditoria');
    XLSX.writeFile(wb, `recorrencia_compras_alertas_${Date.now()}.xlsx`);
  }, [alertas]);

  return (
    <div className="space-y-6">
      {/* Ações */}
      <div className="flex items-center justify-end gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
        <button
          onClick={() => carregar(true)}
          disabled={sincronizando}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', outlineColor: 'var(--brand)' }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-5 stagger">
        <KpiCard
          label="Valor Total (Consumo)"
          value={kpis.valorTotal}
          format={formatBRLCompacto}
          detail={`${formatInt(kpis.materiaisAnalisados)} itens analisados`}
          icon={Wallet}
          accent="var(--series-7)"
          emphasize
        />
        <KpiCard
          label="Itens com Recorrência"
          value={kpis.comRecorrencia}
          format={formatInt}
          detail="2+ compras distintas no período"
          icon={Repeat}
          accent="var(--series-1)"
        />
        <KpiCard
          label="Alertas de Auditoria"
          value={kpis.totalAlertas}
          format={formatInt}
          detail="Somando todos os tipos"
          icon={ShieldAlert}
          accent={kpis.totalAlertas > 0 ? 'var(--status-warning)' : 'var(--status-good)'}
        />
        <KpiCard
          label="Menor Intervalo Observado"
          value={kpis.menorIntervalo ?? undefined}
          display={kpis.menorIntervalo === null ? '—' : `${formatInt(kpis.menorIntervalo)} dia(s)`}
          detail="Entre duas compras do mesmo item"
          icon={Clock}
          accent={kpis.menorIntervalo !== null && kpis.menorIntervalo < 7 ? 'var(--status-critical)' : 'var(--series-3)'}
        />
        <KpiCard
          label="Consumo Recorrente de Projeto"
          value={recorrenciasProjeto.length}
          format={formatInt}
          detail="Itens — visão informativa, sem alerta"
          icon={Layers}
          accent="var(--series-2)"
        />
      </div>

      {/* Filtros próprios desta aba */}
      <div
        className="rounded-xl border p-4 flex flex-wrap items-center gap-3"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
      >
        <input type="date" value={filtros.de} onChange={e => patch({ de: e.target.value })} className={selectClass} aria-label="Data inicial" />
        <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>até</span>
        <input type="date" value={filtros.ate} onChange={e => patch({ ate: e.target.value })} className={selectClass} aria-label="Data final" />

        <select value={filtros.area} onChange={e => patch({ area: e.target.value })} className={selectClass} aria-label="Área requisitante">
          <option value="todas">Todas as áreas</option>
          {opcoes.areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select value={filtros.grupo} onChange={e => patch({ grupo: e.target.value })} className={selectClass} aria-label="Grupo de mercadoria">
          <option value="todos">Todos os grupos</option>
          {opcoes.grupos.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <select
          value={filtros.nivel1}
          onChange={e => patch({ nivel1: e.target.value, nivel2: 'todos' })}
          className={selectClass}
          aria-label="Categoria — Nível 1"
        >
          <option value="todos">Categoria: todos os níveis 1</option>
          {opcoes.nivel1s.map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        <select
          value={filtros.nivel2}
          onChange={e => patch({ nivel2: e.target.value })}
          className={selectClass}
          aria-label="Categoria — Nível 2"
        >
          <option value="todos">Categoria: todos os níveis 2</option>
          {(filtros.nivel1 === 'todos' ? opcoes.nivel2sTodos : opcoes.nivel2PorNivel1.get(filtros.nivel1) || []).map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>

        <select value={filtros.fornecedor} onChange={e => patch({ fornecedor: e.target.value })} className={selectClass} aria-label="Fornecedor">
          <option value="todos">Todos os fornecedores</option>
          {opcoes.fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
        </select>

        <input
          type="text"
          value={filtros.material}
          onChange={e => patch({ material: e.target.value })}
          placeholder="Código do material..."
          className={`${selectClass} w-40`}
          aria-label="Código do material"
        />
        <input
          type="text"
          value={filtros.descricao}
          onChange={e => patch({ descricao: e.target.value })}
          placeholder="Descrição..."
          className={`${selectClass} w-40`}
          aria-label="Descrição"
        />

        <select value={filtros.status} onChange={e => patch({ status: e.target.value })} className={selectClass} aria-label="Status da compra">
          <option value="todos">Entregue e parcial</option>
          <option value="entregue">Só entregue</option>
          <option value="parcial">Só parcial</option>
        </select>

        <div className="flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: 'var(--hairline)' }} role="group" aria-label="Natureza do item">
          {[
            { v: 'todos', r: 'Tudo' },
            { v: 'Consumo', r: 'Consumo' },
            { v: 'Projeto', r: 'Projeto' },
          ].map(o => (
            <button
              key={o.v}
              onClick={() => patch({ tipoItem: o.v })}
              aria-pressed={filtros.tipoItem === o.v}
              className="px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150"
              style={filtros.tipoItem === o.v ? { background: 'var(--brand)', color: '#ffffff' } : { color: 'var(--ink-muted)' }}
            >
              {o.r}
            </button>
          ))}
        </div>

        <input
          type="number"
          value={filtros.valorMin}
          onChange={e => patch({ valorMin: e.target.value })}
          placeholder="Valor mín."
          className={`${selectClass} w-28`}
          aria-label="Valor mínimo"
        />
        <input
          type="number"
          value={filtros.valorMax}
          onChange={e => patch({ valorMax: e.target.value })}
          placeholder="Valor máx."
          className={`${selectClass} w-28`}
          aria-label="Valor máximo"
        />
        <input
          type="number"
          value={filtros.qtdMin}
          onChange={e => patch({ qtdMin: e.target.value })}
          placeholder="Qtd. mín."
          className={`${selectClass} w-24`}
          aria-label="Quantidade mínima"
        />
        <input
          type="number"
          value={filtros.qtdMax}
          onChange={e => patch({ qtdMax: e.target.value })}
          placeholder="Qtd. máx."
          className={`${selectClass} w-24`}
          aria-label="Quantidade máxima"
        />

        <button
          onClick={() => setFiltros(FILTROS_VAZIOS)}
          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-1"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', outlineColor: 'var(--brand)' }}
        >
          Limpar
        </button>

        <span className="ml-auto text-xs tabular" style={{ color: 'var(--ink-muted)' }}>
          {formatInt(filtradas.length)} linhas no filtro
        </span>
      </div>

      {carregando && linhas.length === 0 ? (
        <div className="py-24 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
          Carregando histórico de compras…
        </div>
      ) : (
        <>
          {/* Toggle material exato / item similar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: 'var(--hairline)' }} role="group" aria-label="Como agrupar itens">
              {[
                { v: 'material' as ChaveRecorrencia, r: 'Material exato (código SAP)' },
                { v: 'similar' as ChaveRecorrencia, r: 'Itens similares (grupo + descrição)' },
              ].map(o => (
                <button
                  key={o.v}
                  onClick={() => { setChaveRecorrencia(o.v); setItemSelecionado(null); }}
                  aria-pressed={chaveRecorrencia === o.v}
                  className="px-3 py-1.5 text-xs font-bold rounded-md transition-colors duration-150"
                  style={chaveRecorrencia === o.v ? { background: 'var(--brand)', color: '#ffffff' } : { color: 'var(--ink-muted)' }}
                >
                  {o.r}
                </button>
              ))}
            </div>

            <select value={ordenacao} onChange={e => setOrdenacao(e.target.value as Ordenacao)} className={selectClass} aria-label="Priorizar por">
              <option value="valor">Priorizar: maior valor total</option>
              <option value="repeticao">Priorizar: mais compras repetidas</option>
              <option value="intervalo">Priorizar: menor intervalo entre compras</option>
              <option value="variacao">Priorizar: maior aumento vs. histórico</option>
              <option value="concentracao">Priorizar: mais concentrado (área/fornecedor)</option>
            </select>
          </div>

          {/* Ranking (Pareto) */}
          <ParetoValorChart
            fatias={fatiasRanking}
            title={chaveRecorrencia === 'material' ? 'Ranking de Materiais Recorrentes' : 'Ranking de Itens Similares Recorrentes'}
            icon={Repeat}
            unidade={chaveRecorrencia === 'material' ? 'material' : 'item similar'}
            description="Clique numa barra para ver a série temporal e o detalhe das compras."
            onSelecionar={handleSelecionarRanking}
          />

          {/* Série temporal do item selecionado */}
          {itemSelecionado && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                    {itemSelecionado.descricao || itemSelecionado.material} — {formatInt(itemSelecionado.pedidosDistintos)} pedido(s)
                  </h4>
                  <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                    {itemSelecionado.grupoDesc} · Áreas: {itemSelecionado.areas.join(', ') || '—'} · Fornecedores: {itemSelecionado.fornecedores.join(', ') || '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: 'var(--hairline)' }} role="group" aria-label="Granularidade">
                    {[
                      { v: 'semana' as const, r: 'Semana' },
                      { v: 'mes' as const, r: 'Mês' },
                    ].map(o => (
                      <button
                        key={o.v}
                        onClick={() => setGranularidade(o.v)}
                        aria-pressed={granularidade === o.v}
                        className="px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-150"
                        style={granularidade === o.v ? { background: 'var(--brand)', color: '#ffffff' } : { color: 'var(--ink-muted)' }}
                      >
                        {o.r}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => abrirModalItem(itemSelecionado)}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-150 hover:bg-[var(--surface-raised)]"
                    style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                  >
                    Ver todas as compras
                  </button>
                </div>
              </div>
              <SerieTemporalChart
                pontos={serieItemSelecionado}
                title="Evolução no Tempo"
                icon={LineChartIcon}
                description="Valor comprado (linha) e nº de pedidos distintos (barras) por período."
              />
            </div>
          )}

          {/* Alertas de Auditoria */}
          <div className="rounded-xl border p-4 sm:p-5 space-y-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
                <ShieldAlert className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
                Alertas de Auditoria
              </h3>
              {alertas.length > 0 && (
                <button
                  onClick={exportarAlertas}
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors duration-150 hover:bg-[var(--surface-raised)]"
                  style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                >
                  Exportar XLSX
                </button>
              )}
            </div>
            {alertas.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                Nenhum alerta com os filtros atuais.
              </p>
            ) : (
              <div className="space-y-2">
                {alertas.map((a, idx) => {
                  const Icone = ALERTA_META[a.tipo].icon;
                  return (
                    <button
                      key={`${a.item.chave}-${a.tipo}-${idx}`}
                      onClick={() => abrirModalItem(a.item)}
                      className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors duration-150 hover:bg-[var(--surface-raised)]"
                      style={{ borderColor: 'var(--hairline)' }}
                    >
                      <Icone
                        className="h-4 w-4 mt-0.5 shrink-0"
                        style={{ color: a.severidade === 'critico' ? 'var(--status-critical)' : 'var(--status-warning)' }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
                            {ALERTA_META[a.tipo].label}
                          </span>
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                            style={{
                              background: a.severidade === 'critico' ? 'var(--status-critical)' : 'var(--status-warning)',
                              color: '#ffffff',
                            }}
                          >
                            {a.severidade}
                          </span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-secondary)' }}>
                          <strong>{a.item.descricao || a.item.material}</strong> ({a.item.grupoDesc}) — {a.justificativa}
                        </p>
                      </div>
                      <span className="text-xs font-bold tabular shrink-0" style={{ color: 'var(--ink-primary)' }}>
                        {formatBRLCompacto(a.item.valor)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tabela detalhada de recorrência (Consumo) */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
            <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b" style={{ borderColor: 'var(--hairline)' }}>
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--ink-primary)' }}>
                Recorrência de Consumo — Detalhe
              </h3>
              <button
                onClick={exportarRanking}
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors duration-150 hover:bg-[var(--surface-raised)]"
                style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
              >
                Exportar XLSX
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--surface-raised)' }}>
                    <th className="px-3 py-2.5 text-left font-bold" style={{ color: 'var(--ink-muted)' }}>Material / Descrição</th>
                    <th className="px-3 py-2.5 text-left font-bold" style={{ color: 'var(--ink-muted)' }}>Grupo</th>
                    <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Pedidos</th>
                    <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Valor</th>
                    <th className="px-3 py-2.5 text-left font-bold" style={{ color: 'var(--ink-muted)' }}>Áreas</th>
                    <th className="px-3 py-2.5 text-left font-bold" style={{ color: 'var(--ink-muted)' }}>Fornecedores</th>
                    <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Interv. Médio</th>
                    <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Menor Interv.</th>
                    <th className="px-3 py-2.5 text-left font-bold" style={{ color: 'var(--ink-muted)' }}>Alertas</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                  {recorrenciasOrdenadas.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center" style={{ color: 'var(--ink-muted)' }}>
                        Nenhum item de consumo no filtro selecionado.
                      </td>
                    </tr>
                  ) : (
                    recorrenciasOrdenadas.map(item => {
                      const alertasItem = alertasPorChave.get(item.chave) || [];
                      return (
                        <tr
                          key={item.chave}
                          onClick={() => abrirModalItem(item)}
                          className="cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-raised)]"
                        >
                          <td className="px-3 py-2.5">
                            <div className="font-mono text-[11px]" style={{ color: 'var(--ink-muted)' }}>{item.material}</div>
                            <div className="font-semibold truncate max-w-[260px]" style={{ color: 'var(--ink-primary)' }} title={item.descricao}>
                              {item.descricao || '—'}
                            </div>
                          </td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--ink-secondary)' }}>{item.grupoDesc}</td>
                          <td className="px-3 py-2.5 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>{formatInt(item.pedidosDistintos)}</td>
                          <td className="px-3 py-2.5 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>{formatBRLCompacto(item.valor)}</td>
                          <td className="px-3 py-2.5 truncate max-w-[160px]" style={{ color: 'var(--ink-secondary)' }} title={item.areas.join(', ')}>
                            {item.areas.join(', ') || '—'}
                          </td>
                          <td className="px-3 py-2.5 truncate max-w-[160px]" style={{ color: 'var(--ink-secondary)' }} title={item.fornecedores.join(', ')}>
                            {item.fornecedores.join(', ') || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>
                            {item.intervaloMedioDias != null ? `${formatInt(Math.round(item.intervaloMedioDias))}d` : '—'}
                          </td>
                          <td
                            className="px-3 py-2.5 text-right tabular font-bold"
                            style={{ color: item.menorIntervaloDias != null && item.menorIntervaloDias < 7 ? 'var(--status-critical)' : 'var(--ink-secondary)' }}
                          >
                            {item.menorIntervaloDias != null ? `${formatInt(item.menorIntervaloDias)}d` : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            {alertasItem.length > 0 ? (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style={{ background: 'var(--status-warning)', color: '#ffffff' }}
                              >
                                {alertasItem.length}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--ink-muted)' }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Consumo recorrente de projeto — informativo, sem alertas */}
          {recorrenciasProjeto.length > 0 && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
              <div className="p-4 sm:p-5 border-b" style={{ borderColor: 'var(--hairline)' }}>
                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--ink-primary)' }}>
                  Consumo Recorrente de Projeto
                </h3>
                <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>
                  Insumos com entrega parcial ou consumo contínuo vinculados à execução de projeto (arame, tinta,
                  eletrodo e afins) — natureza recorrente esperada, não tratado como irregularidade nesta análise.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--surface-raised)' }}>
                      <th className="px-3 py-2.5 text-left font-bold" style={{ color: 'var(--ink-muted)' }}>Material / Descrição</th>
                      <th className="px-3 py-2.5 text-left font-bold" style={{ color: 'var(--ink-muted)' }}>Grupo</th>
                      <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Pedidos</th>
                      <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Quantidade</th>
                      <th className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--ink-muted)' }}>Valor</th>
                      <th className="px-3 py-2.5 text-left font-bold" style={{ color: 'var(--ink-muted)' }}>Fornecedores</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                    {recorrenciasProjeto
                      .sort((a, b) => b.valor - a.valor)
                      .map(item => (
                        <tr
                          key={item.chave}
                          onClick={() => abrirModalItem(item)}
                          className="cursor-pointer transition-colors duration-150 hover:bg-[var(--surface-raised)]"
                        >
                          <td className="px-3 py-2.5">
                            <div className="font-mono text-[11px]" style={{ color: 'var(--ink-muted)' }}>{item.material}</div>
                            <div className="font-semibold truncate max-w-[260px]" style={{ color: 'var(--ink-primary)' }} title={item.descricao}>
                              {item.descricao || '—'}
                            </div>
                          </td>
                          <td className="px-3 py-2.5" style={{ color: 'var(--ink-secondary)' }}>{item.grupoDesc}</td>
                          <td className="px-3 py-2.5 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>{formatInt(item.pedidosDistintos)}</td>
                          <td className="px-3 py-2.5 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>{formatInt(item.qtdTotal)}</td>
                          <td className="px-3 py-2.5 text-right tabular font-bold" style={{ color: 'var(--ink-primary)' }}>{formatBRLCompacto(item.valor)}</td>
                          <td className="px-3 py-2.5 truncate max-w-[200px]" style={{ color: 'var(--ink-secondary)' }} title={item.fornecedores.join(', ')}>
                            {item.fornecedores.join(', ') || '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <ComposicaoModal config={composicaoModal} onClose={() => setComposicaoModal(null)} />
    </div>
  );
}
