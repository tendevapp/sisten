/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dashboards Suprimentos › Apresentação — os indicadores das abas de carteira
 * em slides 16:9, prontos para print no PPT ou para apresentar em tela cheia.
 *
 * Responde ao filtro global do topo (período, tipo, natureza, contrato,
 * criticidade, área, comprador), como Visão Geral, Demandas, Carteira e
 * Fornecedores. Os números saem das mesmas funções dessas abas
 * (`lib/suprimentos.ts`); o que é próprio dos slides está em
 * `lib/suprimentosApresentacao.ts`.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, XAxis, YAxis } from 'recharts';
import { LayoutDashboard } from 'lucide-react';
import type { EnrichedSAPRecord } from '../../types';
import { localDb } from '../../db/localDb';
import {
  calcAging, calcCarteiraPorComprador, calcFornecedores, calcLeadTimeRmPo, calcOtd, calcResumoSetor, concentracaoTop, delta, faixaAgingDoRegistro,
  temPO, umRegistroPorItem,
} from '../../lib/suprimentos';
import { CRITICIDADE_LABEL, resolveComprador, TIPO_DEMANDA_LABEL, type CompradorInfo, type Criticidade } from '../../lib/demandas';
import {
  demandaPorArea, evolucaoRequisitadoPedido, janelaDoGrafico, materialServico, MAX_COLUNAS, META_LEAD_TIME_PADRAO,
  porCriticidade, criticidadeDoItem, itensDoPonto, rotuloDoIntervalo,
  resumoSolicitacoesSisten, type GranularidadeGrafico, type PontoEvolucao, type ResumoSolicitacoesSisten, type SerieEvolucao,
} from '../../lib/suprimentosApresentacao';
import { formatBRLCompacto, formatInt, formatPctInt } from '../../lib/format';
import {
  ApresentacaoSlides, ChipSlide, COR_SLIDE, KpiSlide, PainelSlide, RankingSlide, rotuloDentroDaBarra, Slide, SlideVazio,
} from '../apresentacao/Slides';
import { FILTRO_OUTROS, type EstadoFiltros } from './FiltrosSuprimentos';
import type { ComposicaoModalConfig } from '../charts/ComposicaoModal';
import {
  colunasEnrichedSAPRecord, filtrosEnrichedSAPRecord, itemKeyEnrichedSAPRecord, searchEnrichedSAPRecord,
  SEARCH_PLACEHOLDER_SUPRIMENTOS, valorEnrichedSAPRecord,
} from '../../lib/composicaoSuprimentos';

interface Props {
  records: EnrichedSAPRecord[];
  recordsAnterior: EnrichedSAPRecord[];
  temComparacao: boolean;
  compradores: CompradorInfo[];
  filtros: EstadoFiltros;
  /** Data da última importação SAP (requisições). */
  posicaoSap?: string | null;
  /** Abre a janela com os itens que compõem um número (mesma das outras abas). */
  onAbrirComposicao?: (config: ComposicaoModalConfig<EnrichedSAPRecord>) => void;
}

/* ── Drill-down: clicar num gráfico abre os itens que compõem o número ───── */

interface Agrupamento {
  cabecalho: string;
  chave: (r: EnrichedSAPRecord) => string;
}

interface Detalhamento {
  records: EnrichedSAPRecord[];
  granularidade: GranularidadeGrafico;
  abrir: (titulo: string, badge: string, itens: EnrichedSAPRecord[], agrupar?: Agrupamento) => void;
}

const DetalharCtx = createContext<Detalhamento | null>(null);

const rotuloCriticidade = (c: Criticidade | 'sem') => (c === 'sem' ? 'Sem classificação' : CRITICIDADE_LABEL[c]);
const POR_CRITICIDADE: Agrupamento = { cabecalho: 'Criticidade', chave: r => rotuloCriticidade(criticidadeDoItem(r)) };

/** Itens de uma barra do gráfico de evolução, no mesmo critério da contagem. */
function abrirPonto(det: Detalhamento | null, serie: SerieEvolucao, ponto: PontoEvolucao | undefined, criticidade?: Criticidade | 'sem') {
  if (!det || !ponto) return;
  const itens = itensDoPonto(det.records, det.granularidade, ponto.chave, serie, criticidade);
  const nome = serie === 'pedidos' ? 'Itens com pedido' : serie === 'semPo' ? 'Itens sem pedido' : 'Itens requisitados';
  const crit = criticidade ? ` · ${rotuloCriticidade(criticidade)}` : '';
  // Pedidos: agrupa pelo período da requisição — mostra que parte veio de RM anterior.
  const agrupar: Agrupamento = serie === 'pedidos'
    ? { cabecalho: 'Requisitado em', chave: r => rotuloDoIntervalo(r.data_solicitacao, det.granularidade) }
    : POR_CRITICIDADE;
  det.abrir(`${nome} — ${ponto.rotulo}${crit}`, ponto.rotulo, itens, agrupar);
}

/**
 * Clique no rótulo do período (eixo X): tudo o que aconteceu nele — o que foi
 * requisitado e o que ganhou pedido —, agrupado pela situação do item.
 */
function abrirPeriodo(det: Detalhamento | null, ponto: PontoEvolucao | undefined) {
  if (!det || !ponto) return;
  const requisitados = itensDoPonto(det.records, det.granularidade, ponto.chave, 'requisitados');
  const pedidos = itensDoPonto(det.records, det.granularidade, ponto.chave, 'pedidos');
  const doRequisitado = new Set(requisitados);
  const doPedido = new Set(pedidos);
  const itens = [...requisitados, ...pedidos.filter(r => !doRequisitado.has(r))];
  det.abrir(`Tudo do período — ${ponto.rotulo}`, ponto.rotulo, itens, {
    cabecalho: 'Situação no período',
    chave: r => {
      if (doRequisitado.has(r) && doPedido.has(r)) return 'Requisitado e com pedido no período';
      if (doRequisitado.has(r)) return temPO(r) ? 'Requisitado no período, pedido depois' : 'Requisitado no período, ainda sem pedido';
      return 'Pedido no período, requisitado antes';
    },
  });
}

/** Rótulo do eixo X clicável — abre os itens do período. */
const tickPeriodo = (dados: PontoEvolucao[], aoClicar: ((p: PontoEvolucao | undefined) => void) | null, pequeno: boolean) => (props: any) => {
  const { x, y, payload } = props;
  const ponto = dados.find(p => p.rotulo === payload?.value) ?? dados[payload?.index];
  return (
    <g
      transform={`translate(${x},${y})`}
      style={{ cursor: aoClicar ? 'pointer' : undefined }}
      onClick={aoClicar ? () => aoClicar(ponto) : undefined}
    >
      {aoClicar && <title>Ver todos os itens do período</title>}
      <text
        dy={pequeno ? 4 : 14}
        textAnchor={pequeno ? 'end' : 'middle'}
        transform={pequeno ? 'rotate(-45)' : undefined}
        fill={COR_SLIDE.tinta2}
        fontSize={pequeno ? 10 : 13}
        fontWeight={600}
      >
        {payload?.value}
      </text>
    </g>
  );
};

/** Bar do Recharts entrega o ponto em `payload` no clique. */
const pontoDoClique = (d: any): PontoEvolucao | undefined => d?.payload ?? d;

// Paleta dos gráficos de criticidade: azul-escuro (normal), âmbar (urgente),
// vermelho (máquina parada), cinza claro (sem classificação); pedido em
// verde-azulado, que não disputa com nenhuma das quatro.
const COR = {
  requisitado: COR_SLIDE.indigo,
  pedido: '#0d9488',
  aberto: COR_SLIDE.vermelho,
  normal: '#1e3a8a',
  urgente: '#f4a63a',
  maqParada: '#dc2626',
  semCriticidade: '#cbd5e1',
  foraDaMeta: '#dc2626',
  grade: '#eef2f7',
};

/** Rampa ordinal do aging (0-7 → +60 dias). */
const COR_AGING = ['#86efac', '#fde047', '#fbbf24', '#f97316', '#e11d48'];

const dataBR = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '…');
const um = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Variação do KPI contra a janela anterior (percentual ou pontos percentuais). */
function variacao(
  atual: number, anterior: number, direcaoBoa: 'cima' | 'baixo', temComparacao: boolean, emPontos = false,
): { texto: string; bom: boolean } | null {
  if (!temComparacao) return null;
  const d = delta(atual, anterior, direcaoBoa);
  const seta = d.absoluto > 0 ? '▲' : d.absoluto < 0 ? '▼' : '=';
  if (emPontos) return { texto: `${seta} ${um(Math.abs(d.absoluto))} p.p.`, bom: d.bom };
  if (d.percentual === null) return null;
  return { texto: `${seta} ${formatPctInt(Math.abs(d.percentual))}`, bom: d.bom };
}

/** Descrição dos recortes ativos, para o slide dizer o que está mostrando. */
function descreverFiltros(f: EstadoFiltros, compradores: CompradorInfo[]): string {
  const partes: string[] = [];
  partes.push(f.tipo === 'todos' ? 'Materiais e serviços' : TIPO_DEMANDA_LABEL[f.tipo]);
  if (f.tipoItem !== 'todos') partes.push(f.tipoItem === 'consumo' ? 'Consumo' : 'Projeto');
  if (f.contrato !== 'todos') partes.push(f.contrato === 'sem_contrato' ? 'Sem contrato' : 'Só contrato');
  if (f.criticidade !== 'todas') partes.push(CRITICIDADE_LABEL[f.criticidade]);
  if (f.area !== 'todas') partes.push(`Área ${f.area}`);
  if (f.comprador !== 'todos') {
    partes.push(f.comprador === FILTRO_OUTROS
      ? 'Comprador: Outros'
      : `Comprador: ${compradores.find(c => c.grupo_compras === f.comprador)?.nome_comprador ?? f.comprador}`);
  }
  return partes.join(' · ');
}

export default function TabApresentacao({
  records, recordsAnterior, temComparacao, compradores, filtros, posicaoSap, onAbrirComposicao,
}: Props) {
  const [granularidade, setGranularidade] = useState<GranularidadeGrafico>('semana');
  const colunas = useMemo(() => colunasEnrichedSAPRecord(compradores), [compradores]);
  const filtrosModal = useMemo(() => filtrosEnrichedSAPRecord(compradores), [compradores]);

  const abrir = useCallback((titulo: string, badge: string, itens: EnrichedSAPRecord[], agrupar?: Agrupamento) => {
    if (!onAbrirComposicao) return;
    // Em tela cheia a janela ficaria escondida atrás do slide.
    if (document.fullscreenElement) void document.exitFullscreen();
    const g = agrupar ?? POR_CRITICIDADE;
    onAbrirComposicao({
      title: titulo,
      badge,
      items: itens,
      groupBy: g.chave,
      groupLabelHeader: g.cabecalho,
      valueOf: valorEnrichedSAPRecord,
      formatValue: formatBRLCompacto,
      valueHeader: 'Valor Total',
      unidadeItem: 'item(ns)',
      detailColumns: colunas,
      filters: filtrosModal,
      searchPredicate: searchEnrichedSAPRecord,
      searchPlaceholder: SEARCH_PLACEHOLDER_SUPRIMENTOS,
      itemKey: itemKeyEnrichedSAPRecord,
    });
  }, [onAbrirComposicao, colunas, filtrosModal]);

  // Solicitações do SISTEN vêm do localDb (não do SAP); recalcula quando ele muda.
  const [versaoLocal, setVersaoLocal] = useState(0);
  useEffect(() => localDb.subscribe(() => setVersaoLocal(v => v + 1)), []);
  const sisten = useMemo(
    () => resumoSolicitacoesSisten(localDb.getRequests(), id => localDb.getRequestItems(id), filtros.dateFrom, filtros.dateTo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtros.dateFrom, filtros.dateTo, versaoLocal],
  );

  const detalhamento = useMemo<Detalhamento | null>(
    () => (onAbrirComposicao ? { records, granularidade, abrir } : null),
    [onAbrirComposicao, records, granularidade, abrir],
  );
  const periodo = `${dataBR(filtros.dateFrom)} a ${dataBR(filtros.dateTo)}`;
  const recorte = descreverFiltros(filtros, compradores);
  const subtitulo = `${recorte}${posicaoSap ? ` · SAP de ${new Date(posicaoSap).toLocaleDateString('pt-BR')}` : ''}`;
  const vazio = records.length === 0;

  const comum = { periodo, subtitulo };
  const total = 5;

  const slides = [
    { id: 'resumo', titulo: 'Resumo do setor', conteudo: <SlideResumo {...comum} numero={`1 / ${total}`} records={records} recordsAnterior={recordsAnterior} temComparacao={temComparacao} filtros={filtros} granularidade={granularidade} vazio={vazio} /> },
    { id: 'sem-po', titulo: 'Itens sem pedido por período', conteudo: <SlideSemPo {...comum} numero={`2 / ${total}`} records={records} filtros={filtros} granularidade={granularidade} vazio={vazio} /> },
    { id: 'demandas', titulo: 'Demandas', conteudo: <SlideDemandas {...comum} numero={`3 / ${total}`} records={records} sisten={sisten} vazio={vazio} /> },
    { id: 'carteira', titulo: 'Carteira & Compradores', conteudo: <SlideCarteira {...comum} numero={`4 / ${total}`} records={records} compradores={compradores} vazio={vazio} /> },
    { id: 'fornecedores', titulo: 'Fornecedores & Spend', conteudo: <SlideFornecedores {...comum} numero={`5 / ${total}`} records={records} vazio={vazio} /> },
  ];

  const dataArquivo = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');

  return (
    <DetalharCtx.Provider value={detalhamento}>
    <ApresentacaoSlides
      slides={slides}
      nomeArquivo={`Suprimentos - Apresentação ${dataArquivo(filtros.dateFrom)} a ${dataArquivo(filtros.dateTo)}`}
      controles={(
        <>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Gráficos por período:</span>
          <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800/80">
            {(['dia', 'semana', 'mes'] as GranularidadeGrafico[]).map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularidade(g)}
                className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${
                  granularidade === g
                    ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {ROTULO_GRANULARIDADE[g].botao}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-500">
            até {MAX_COLUNAS[granularidade]} {ROTULO_GRANULARIDADE[granularidade].plural} mais recentes do período · clique nos gráficos para ver os itens
          </span>
        </>
      )}
    />
    </DetalharCtx.Provider>
  );
}

interface BaseSlide {
  periodo: string;
  subtitulo: string;
  numero: string;
  vazio: boolean;
}

const secao = (texto: string) => <><LayoutDashboard style={{ width: 16, height: 16 }} /> Suprimentos · {texto}</>;
const VAZIO = 'Nenhum item de RM no período e recorte selecionados.';

/** Rótulo dentro do segmento da pilha; fonte menor quando a barra é estreita (visão por dia). */
const rotuloSegmento = (corTexto: string) => (props: any) => {
  const { x, y, width, height, value } = props;
  if (!value || width < 11 || height < 13) return null;
  return (
    <text x={x + width / 2} y={y + height / 2} fill={corTexto} fontSize={width >= 22 ? 13 : 10} fontWeight={700} textAnchor="middle" dominantBaseline="central">
      {value}
    </text>
  );
};

const ROTULO_GRANULARIDADE: Record<GranularidadeGrafico, { botao: string; singular: string; plural: string; ultimos: string }> = {
  dia: { botao: 'Dia', singular: 'dia', plural: 'dias', ultimos: 'últimos' },
  semana: { botao: 'Semana', singular: 'semana', plural: 'semanas', ultimos: 'últimas' },
  mes: { botao: 'Mês', singular: 'mês', plural: 'meses', ultimos: 'últimos' },
};

interface SegmentoPilha {
  chave: keyof PontoEvolucao;
  cor: 'normal' | 'urgente' | 'maqParada' | 'semCriticidade';
  texto: string;
  criticidade: Criticidade | 'sem';
}

/** Pilha de requisitados, de baixo para cima. */
const SEGMENTOS_REQ: SegmentoPilha[] = [
  { chave: 'normal', cor: 'normal', texto: '#fff', criticidade: 'normal' },
  { chave: 'urgente', cor: 'urgente', texto: '#422006', criticidade: 'urgente' },
  { chave: 'maquinaParada', cor: 'maqParada', texto: '#fff', criticidade: 'maquina_parada' },
  { chave: 'semCriticidade', cor: 'semCriticidade', texto: '#334155', criticidade: 'sem' },
];

/** Pilha dos itens ainda sem pedido, mesma ordem e cores. */
const SEGMENTOS_SEM_PO: SegmentoPilha[] = [
  { chave: 'semPoNormal', cor: 'normal', texto: '#fff', criticidade: 'normal' },
  { chave: 'semPoUrgente', cor: 'urgente', texto: '#422006', criticidade: 'urgente' },
  { chave: 'semPoMaquinaParada', cor: 'maqParada', texto: '#fff', criticidade: 'maquina_parada' },
  { chave: 'semPoSemCriticidade', cor: 'semCriticidade', texto: '#334155', criticidade: 'sem' },
];

/**
 * Total da pilha: segmento invisível de altura mínima no topo, que só carrega
 * o rótulo. Não depende do índice da barra — o Recharts pula segmentos
 * zerados, e um rótulo calculado por índice ia parar na coluna errada.
 */
function barraDoTotal(pilha: string, campoTotal: keyof PontoEvolucao, pequeno: boolean) {
  return (
    <Bar
      key={`total-${pilha}`}
      dataKey={(p: PontoEvolucao) => (Number(p[campoTotal]) > 0 ? 0.0001 : 0)}
      stackId={pilha}
      fill="transparent"
      isAnimationActive={false}
    >
      <LabelList
        dataKey={campoTotal as string}
        position="top"
        offset={6}
        formatter={(v: any) => (Number(v) > 0 ? formatInt(Number(v)) : '')}
        style={{ fontSize: pequeno ? 10 : 14, fontWeight: 800, fill: COR_SLIDE.tinta }}
      />
    </Bar>
  );
}

function corDaCriticidade(c: string): string {
  return c === 'maquina_parada' ? COR.maqParada : c === 'urgente' ? COR.urgente : c === 'normal' ? COR.normal : COR.semCriticidade;
}

function hojeIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ─────────────────────────────── 1. Resumo ─────────────────────────────── */

function SlideResumo({ periodo, subtitulo, numero, vazio, records, recordsAnterior, temComparacao, filtros, granularidade }: BaseSlide & {
  records: EnrichedSAPRecord[];
  recordsAnterior: EnrichedSAPRecord[];
  temComparacao: boolean;
  filtros: EstadoFiltros;
  granularidade: GranularidadeGrafico;
}) {
  const det = useContext(DetalharCtx);
  const atual = useMemo(() => calcResumoSetor(records), [records]);
  const anterior = useMemo(() => calcResumoSetor(recordsAnterior), [recordsAnterior]);
  const janela = useMemo(
    () => janelaDoGrafico(granularidade, filtros.dateFrom, filtros.dateTo, hojeIso()),
    [granularidade, filtros.dateFrom, filtros.dateTo],
  );
  const evolucao = useMemo(
    () => evolucaoRequisitadoPedido(records, granularidade, janela.de, janela.ate),
    [records, granularidade, janela.de, janela.ate],
  );
  const aging = useMemo(() => calcAging(records), [records]);
  const criticidades = useMemo(() => porCriticidade(records), [records]);
  const totalAbertosCrit = Math.max(1, criticidades.reduce((s, c) => s + c.abertos, 0));
  const temMaqParada = evolucao.some(p => p.maquinaParada > 0);
  const temSemCriticidade = evolucao.some(p => p.semCriticidade > 0);
  const muitos = evolucao.length > 16;
  const somaJanela = evolucao.reduce(
    (s, p) => ({ normal: s.normal + p.normal, urgente: s.urgente + p.urgente, mp: s.mp + p.maquinaParada }),
    { normal: 0, urgente: 0, mp: 0 },
  );

  const g = ROTULO_GRANULARIDADE[granularidade];
  const tituloGrafico = `Requisitados por criticidade × com pedido — por ${g.singular}`
    + (janela.cortado ? ` (${g.ultimos} ${MAX_COLUNAS[granularidade]} ${g.plural})` : '');

  return (
    <Slide
      rotuloSecao={secao('Resumo do setor')}
      titulo="Gestão de Suprimentos"
      ladoDireito={periodo}
      subtituloDireito={subtitulo}
      numero={numero}
      rodape={`${temComparacao ? 'Variações vs período anterior de mesma duração · ' : ''}Requisitado = data da RM · Com pedido = data do 1º PO (o item pode ter sido requisitado antes) · Lead time = pedido − solicitação · Criticidade pela natureza da RM`}
    >
      <div className="grid grid-cols-6" style={{ gap: 14, height: 124 }}>
        <KpiSlide rotulo="Itens no período" valor={formatInt(atual.total)} variacao={variacao(atual.total, anterior.total, 'cima', temComparacao)} detalhe="linhas de RM" />
        <KpiSlide rotulo="Com pedido" valor={formatInt(atual.processados)} cor="#059669" fundo="#ecfdf5"
          variacao={variacao(atual.conversao, anterior.conversao, 'cima', temComparacao, true)} detalhe={`${formatPctInt(atual.conversao)} de conversão`} />
        <KpiSlide rotulo="Carteira aberta" valor={formatInt(atual.abertos)} cor="#e11d48" fundo="#fff1f2"
          variacao={variacao(atual.abertos, anterior.abertos, 'baixo', temComparacao)} detalhe={`${formatInt(atual.criticos)} há + de 30 dias`} />
        <KpiSlide rotulo="Lead time RM → PO" valor={`${um(atual.leadTime.valor)} d`}
          variacao={variacao(atual.leadTime.valor, anterior.leadTime.valor, 'baixo', temComparacao)} detalhe="média, itens com pedido" />
        <KpiSlide rotulo="Valor pedido" valor={formatBRLCompacto(atual.spend.valor)} cor="#0369a1" fundo="#f0f9ff"
          variacao={temComparacao ? neutra(variacao(atual.spend.valor, anterior.spend.valor, 'cima', true)) : null} detalhe="pedidos do período" />
        <KpiSlide rotulo="OTD cliente" valor={atual.otdCliente.base ? formatPctInt(atual.otdCliente.valor) : '—'}
          variacao={atual.otdCliente.base ? variacao(atual.otdCliente.valor, anterior.otdCliente.valor, 'cima', temComparacao, true) : null}
          detalhe={`${formatInt(atual.otdCliente.base)} recebidos medidos`} />
      </div>

      {vazio ? <SlideVazio texto={VAZIO} /> : (
        <div className="flex flex-1" style={{ gap: 18, minHeight: 0 }}>
          <PainelSlide
            titulo={tituloGrafico}
            legenda={(
              <>
                <ChipSlide cor={COR.normal} texto={`Normal ${formatInt(somaJanela.normal)}`} />
                <ChipSlide cor={COR.urgente} texto={`Urgente ${formatInt(somaJanela.urgente)}`} />
                {temMaqParada && <ChipSlide cor={COR.maqParada} texto={`Máq. parada ${formatInt(somaJanela.mp)}`} />}
                {temSemCriticidade && <ChipSlide cor={COR.semCriticidade} texto="Sem classif." />}
                <ChipSlide cor={COR.pedido} texto="Com pedido (data do PO)" />
              </>
            )}
            style={{ width: 960 }}
          >
            <BarChart width={918} height={496} data={evolucao} margin={{ top: 24, right: 6, bottom: 0, left: -12 }} barCategoryGap={muitos ? '14%' : '20%'} barGap={2}>
              <CartesianGrid vertical={false} stroke={COR.grade} />
              <XAxis
                dataKey="rotulo"
                tick={tickPeriodo(evolucao, det ? p => abrirPeriodo(det, p) : null, muitos)}
                axisLine={false}
                tickLine={false}
                interval={0}
                height={muitos ? 40 : 24}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: COR_SLIDE.suave }} axisLine={false} tickLine={false} />
              {SEGMENTOS_REQ.map(seg => (
                <Bar
                  key={seg.chave}
                  dataKey={seg.chave}
                  stackId="req"
                  fill={COR[seg.cor]}
                  isAnimationActive={false}
                  cursor={det ? 'pointer' : undefined}
                  onClick={(d: any) => abrirPonto(det, 'requisitados', pontoDoClique(d), seg.criticidade)}
                >
                  <LabelList dataKey={seg.chave} content={rotuloSegmento(seg.texto)} />
                </Bar>
              ))}
              {barraDoTotal('req', 'requisitados', muitos)}
              <Bar
                dataKey="pedidos"
                fill={COR.pedido}
                radius={[5, 5, 0, 0]}
                isAnimationActive={false}
                cursor={det ? 'pointer' : undefined}
                onClick={(d: any) => abrirPonto(det, 'pedidos', pontoDoClique(d))}
              >
                <LabelList dataKey="pedidos" position="top" formatter={(v: any) => (Number(v) > 0 ? v : '')} style={{ fontSize: muitos ? 10 : 12, fontWeight: 700, fill: '#0f766e' }} />
              </Bar>
            </BarChart>
          </PainelSlide>

          <div className="flex flex-col" style={{ width: 550, gap: 18 }}>
            <PainelSlide titulo="Idade da carteira aberta" style={{ height: 250 }}>
              <RankingSlide
                gap={9}
                itens={aging.map(f => ({
                  onClick: det ? () => det.abrir(`Carteira aberta — ${f.rotulo}`, 'Idade da carteira', records.filter(r => faixaAgingDoRegistro(r) === f.rotulo)) : undefined,
                  chave: f.rotulo,
                  nome: f.rotulo,
                  valor: f.itens,
                  texto: formatInt(f.itens),
                  complemento: atual.abertos ? formatPctInt((f.itens / atual.abertos) * 100) : undefined,
                  cor: COR_AGING[f.rampa],
                }))}
              />
            </PainelSlide>

            {/* Do que está aberto, quanto é urgente e quanto é normal. */}
            <PainelSlide titulo="Carteira aberta por criticidade" style={{ flex: 1 }}>
              <div className="flex flex-1 flex-col justify-around">
                {criticidades.filter(c => c.abertos > 0).map(c => (
                  <div
                    key={c.chave}
                    className={`flex items-center ${det ? 'cursor-pointer rounded-md hover:bg-slate-50' : ''}`}
                    style={{ gap: 14, borderTop: `1px solid ${COR_SLIDE.linha}`, paddingTop: 8 }}
                    onClick={det ? () => det.abrir(
                      `Carteira aberta — ${c.rotulo}`, c.rotulo,
                      umRegistroPorItem(records).filter(r => !temPO(r) && criticidadeDoItem(r) === c.chave),
                    ) : undefined}
                  >
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: corDaCriticidade(c.chave), flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 16, fontWeight: 800 }}>{c.rotulo}</p>
                      <p className="truncate" style={{ fontSize: 12.5, color: COR_SLIDE.tinta2 }}>
                        {formatInt(c.abertos)} de {formatInt(totalAbertosCrit)} itens em aberto
                      </p>
                    </div>
                    <p className="font-display tabular-nums" style={{ flexShrink: 0, fontSize: 30, fontWeight: 800, lineHeight: 1, color: corDaCriticidade(c.chave) }}>
                      {formatPctInt((c.abertos / totalAbertosCrit) * 100)}
                    </p>
                  </div>
                ))}
              </div>
            </PainelSlide>
          </div>
        </div>
      )}
    </Slide>
  );
}


/* ─────────────────────────── 2. Itens sem pedido ─────────────────────────── */

function SlideSemPo({ periodo, subtitulo, numero, vazio, records, filtros, granularidade }: BaseSlide & {
  records: EnrichedSAPRecord[];
  filtros: EstadoFiltros;
  granularidade: GranularidadeGrafico;
}) {
  const janela = useMemo(
    () => janelaDoGrafico(granularidade, filtros.dateFrom, filtros.dateTo, hojeIso()),
    [granularidade, filtros.dateFrom, filtros.dateTo],
  );
  const evolucao = useMemo(
    () => evolucaoRequisitadoPedido(records, granularidade, janela.de, janela.ate),
    [records, granularidade, janela.de, janela.ate],
  );
  const det = useContext(DetalharCtx);
  const criticidades = useMemo(() => porCriticidade(records), [records]);
  const semPedido = useMemo(() => umRegistroPorItem(records).filter(r => r.status_requisicao !== 'Processado'), [records]);

  const totalSemPo = semPedido.length;
  const foraDaMeta = criticidades.reduce((s, c) => s + c.abertosForaDaMeta, 0);
  const urgentesSemPo = criticidades.filter(c => c.chave === 'urgente' || c.chave === 'maquina_parada').reduce((s, c) => s + c.abertos, 0);
  const idades = semPedido.map(r => r.dias_em_aberto || 0);
  const idadeMedia = idades.length ? idades.reduce((s, d) => s + d, 0) / idades.length : 0;
  const maisAntigo = idades.length ? Math.max(...idades) : 0;

  const muitos = evolucao.length > 16;
  const temMaqParada = evolucao.some(p => p.semPoMaquinaParada > 0);
  const temSemCriticidade = evolucao.some(p => p.semPoSemCriticidade > 0);
  const g = ROTULO_GRANULARIDADE[granularidade];
  const titulo = `Itens ainda sem pedido, pelo ${g.singular} da requisição`
    + (janela.cortado ? ` (${g.ultimos} ${MAX_COLUNAS[granularidade]} ${g.plural})` : '');

  return (
    <Slide
      rotuloSecao={secao('Itens sem pedido')}
      titulo="O que ainda não virou pedido"
      ladoDireito={periodo}
      subtituloDireito={subtitulo}
      numero={numero}
      rodape={`Cada barra = itens requisitados no ${g.singular} que hoje continuam sem PO · Fora da meta = sem pedido há mais dias que a meta (normal ${META_LEAD_TIME_PADRAO.normal} d, urgente ${META_LEAD_TIME_PADRAO.urgente} d, máq. parada ${META_LEAD_TIME_PADRAO.maquina_parada} d)`}
    >
      <div className="grid grid-cols-5" style={{ gap: 14, height: 124 }}>
        <KpiSlide rotulo="Itens sem pedido" valor={formatInt(totalSemPo)} cor="#e11d48" fundo="#fff1f2" detalhe="requisitados no período" />
        <KpiSlide rotulo="Fora da meta" valor={formatInt(foraDaMeta)} cor={foraDaMeta ? '#b91c1c' : COR_SLIDE.tinta2} fundo={foraDaMeta ? '#fef2f2' : undefined}
          detalhe={totalSemPo ? `${formatPctInt((foraDaMeta / totalSemPo) * 100)} dos sem pedido` : '—'} />
        <KpiSlide rotulo="Urgente + máq. parada" valor={formatInt(urgentesSemPo)} cor="#b45309" fundo="#fffbeb" detalhe="sem pedido" />
        <KpiSlide rotulo="Idade média" valor={`${um(idadeMedia)} d`} detalhe="desde a requisição" />
        <KpiSlide rotulo="Mais antigo" valor={`${formatInt(maisAntigo)} d`} detalhe="item sem pedido há mais tempo" />
      </div>

      {vazio ? <SlideVazio texto={VAZIO} /> : totalSemPo === 0 ? <SlideVazio texto="Todos os itens do período já têm pedido." /> : (
        <PainelSlide
          titulo={titulo}
          legenda={(
            <>
              <ChipSlide cor={COR.normal} texto="Normal" />
              <ChipSlide cor={COR.urgente} texto="Urgente" />
              {temMaqParada && <ChipSlide cor={COR.maqParada} texto="Máq. parada" />}
              {temSemCriticidade && <ChipSlide cor={COR.semCriticidade} texto="Sem classif." />}
              <span className="inline-flex items-center" style={{ gap: 5 }}>
                <span style={{ width: 16, height: 0, borderTop: `2px dashed ${COR.foraDaMeta}` }} /> Fora da meta
              </span>
            </>
          )}
          style={{ flex: 1 }}
        >
          <ComposedChart width={1486} height={496} data={evolucao} margin={{ top: 24, right: 8, bottom: 0, left: -12 }} barCategoryGap={muitos ? '18%' : '28%'}>
            <CartesianGrid vertical={false} stroke={COR.grade} />
            <XAxis
              dataKey="rotulo"
              tick={tickPeriodo(evolucao, det ? p => abrirPonto(det, 'semPo', p) : null, muitos)}
              axisLine={false}
              tickLine={false}
              interval={0}
              height={muitos ? 40 : 24}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: COR_SLIDE.suave }} axisLine={false} tickLine={false} />
            {SEGMENTOS_SEM_PO.map(seg => (
              <Bar
                key={seg.chave}
                dataKey={seg.chave}
                stackId="sempo"
                fill={COR[seg.cor]}
                isAnimationActive={false}
                cursor={det ? 'pointer' : undefined}
                onClick={(d: any) => abrirPonto(det, 'semPo', pontoDoClique(d), seg.criticidade)}
              >
                <LabelList dataKey={seg.chave} content={rotuloSegmento(seg.texto)} />
              </Bar>
            ))}
            {barraDoTotal('sempo', 'semPo', muitos)}
            <Line
              type="monotone"
              dataKey="semPoForaDaMeta"
              stroke={COR.foraDaMeta}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 3, fill: COR.foraDaMeta, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </PainelSlide>
      )}
    </Slide>
  );
}

function BlocoSisten({ rotulo, valor, detalhe, cor, fundo }: { rotulo: string; valor: string; detalhe: string; cor?: string; fundo?: string }) {
  return (
    <div className="flex flex-col justify-center rounded-xl" style={{ background: fundo ?? '#f8fafc', padding: '10px 16px', minWidth: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: COR_SLIDE.tinta2 }}>{rotulo}</span>
      <span className="font-display tabular-nums" style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1, color: cor ?? COR_SLIDE.tinta }}>{valor}</span>
      <span className="truncate" style={{ fontSize: 12.5, color: COR_SLIDE.tinta2 }}>{detalhe}</span>
    </div>
  );
}

/** Valor pedido não tem direção "boa": a seta fica, a cor sai. */
function neutra(v: { texto: string; bom: boolean } | null) {
  return v ? { ...v, bom: true } : null;
}

/* ─────────────────────────────── 2. Demandas ─────────────────────────────── */

function SlideDemandas({ periodo, subtitulo, numero, vazio, records, sisten }: BaseSlide & {
  records: EnrichedSAPRecord[];
  sisten: ResumoSolicitacoesSisten;
}) {
  const det = useContext(DetalharCtx);
  const itens = useMemo(() => umRegistroPorItem(records), [records]);
  const areas = useMemo(() => demandaPorArea(records, 12), [records]);
  const areasVisiveis = useMemo(() => new Set(areas.map(a => a.area)), [areas]);
  const abrirArea = (area: string | undefined, comPedido: boolean) => {
    if (!det || !area) return;
    const outras = area.startsWith('Outras (');
    const daArea = itens.filter(r => {
      const a = r.area_solicitante?.trim() || 'Não informada';
      return (outras ? !areasVisiveis.has(a) : a === area) && temPO(r) === comPedido;
    });
    det.abrir(`${comPedido ? 'Com pedido' : 'Sem pedido'} — ${area}`, area, daArea);
  };
  const criticidades = useMemo(() => porCriticidade(records), [records]);
  const tipos = useMemo(() => materialServico(records), [records]);
  const comPO = itens.filter(r => r.status_requisicao === 'Processado').length;
  const urgentes = criticidades.filter(c => c.chave === 'urgente' || c.chave === 'maquina_parada').reduce((s, c) => s + c.itens, 0);
  const alturaGrafico = 480;
  const barra = Math.max(14, Math.min(30, Math.floor((alturaGrafico - 20) / Math.max(areas.length, 1)) - 12));

  return (
    <Slide
      rotuloSecao={secao('Demandas')}
      titulo="Da requisição ao pedido"
      ladoDireito={periodo}
      subtituloDireito={subtitulo}
      numero={numero}
      rodape="Itens de RM contados uma vez (item comprado em vários pedidos conta 1) · Criticidade pela natureza da RM · Lead time = pedido − solicitação · Solicitações SISTEN: compras criadas no período (sem rascunho); só o período vale para elas"
    >
      <div className="grid grid-cols-5" style={{ gap: 14, height: 118 }}>
        <KpiSlide rotulo="Itens de RM" valor={formatInt(itens.length)} detalhe={`${formatInt(comPO)} já com pedido`} />
        <KpiSlide rotulo="Materiais" valor={formatInt(tipos.materiais)} detalhe={itens.length ? `${formatPctInt((tipos.materiais / itens.length) * 100)} dos itens` : ''} cor={COR.requisitado} fundo="#eef2ff" />
        <KpiSlide rotulo="Serviços" valor={formatInt(tipos.servicos)} detalhe={itens.length ? `${formatPctInt((tipos.servicos / itens.length) * 100)} dos itens` : ''} cor="#0369a1" fundo="#f0f9ff" />
        <KpiSlide rotulo="Urgente + máq. parada" valor={formatInt(urgentes)} detalhe={itens.length ? `${formatPctInt((urgentes / itens.length) * 100)} da demanda` : ''} cor="#b45309" fundo="#fffbeb" />
        <KpiSlide rotulo="Áreas solicitantes" valor={formatInt(new Set(itens.map(r => r.area_solicitante?.trim() || 'Não informada')).size)} detalhe="com itens no período" />
      </div>

      {vazio ? <SlideVazio texto={VAZIO} /> : (
        <div className="flex flex-1" style={{ gap: 18, minHeight: 0 }}>
          <PainelSlide
            titulo="Itens por área solicitante"
            legenda={<><ChipSlide cor={COR.pedido} texto="Com pedido" /><ChipSlide cor={COR.aberto} texto="Sem pedido" /></>}
            style={{ width: 896 }}
          >
            <BarChart layout="vertical" width={856} height={alturaGrafico} data={areas} margin={{ top: 4, right: 52, bottom: 4, left: 4 }} barSize={barra}>
              <CartesianGrid horizontal={false} stroke={COR_SLIDE.linha} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: COR_SLIDE.suave }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="area" width={220} tick={{ fontSize: 13, fill: COR_SLIDE.tinta, fontWeight: 600 }} axisLine={false} tickLine={false} interval={0} />
              <Bar dataKey="comPO" stackId="a" fill={COR.pedido} isAnimationActive={false} cursor={det ? 'pointer' : undefined}
                onClick={(d: any) => abrirArea(d?.payload?.area ?? d?.area, true)}>
                <LabelList dataKey="comPO" content={rotuloDentroDaBarra} />
              </Bar>
              <Bar dataKey="abertos" stackId="a" fill={COR.aberto} radius={[0, 6, 6, 0]} isAnimationActive={false} cursor={det ? 'pointer' : undefined}
                onClick={(d: any) => abrirArea(d?.payload?.area ?? d?.area, false)}>
                <LabelList dataKey="abertos" content={rotuloDentroDaBarra} />
                <LabelList dataKey="total" position="right" style={{ fontSize: 15, fontWeight: 800, fill: COR_SLIDE.tinta }} />
              </Bar>
            </BarChart>
          </PainelSlide>

          <div className="flex flex-col" style={{ flex: 1, gap: 18, minWidth: 0 }}>
          <PainelSlide titulo="Por criticidade" style={{ flexShrink: 0 }}>
            <table data-no-cards className="w-full" style={{ fontSize: 14, borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr style={{ color: COR_SLIDE.tinta2, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th className="text-left" style={{ padding: '4px 6px' }}>Criticidade</th>
                  <th className="text-right" style={{ padding: '4px 6px' }}>Itens</th>
                  <th className="text-right" style={{ padding: '4px 6px' }}>Com PO</th>
                  <th className="text-right" style={{ padding: '4px 6px' }}>Conversão</th>
                  <th className="text-right" style={{ padding: '4px 6px' }}>Lead time</th>
                </tr>
              </thead>
              <tbody>
                {criticidades.map(c => (
                  <tr
                    key={c.chave}
                    style={{ borderTop: `1px solid ${COR_SLIDE.linha}` }}
                    className={det ? 'cursor-pointer hover:bg-slate-50' : undefined}
                    onClick={det ? () => det.abrir(
                      `Criticidade — ${c.rotulo}`, c.rotulo,
                      itens.filter(r => criticidadeDoItem(r) === c.chave),
                      { cabecalho: 'Situação', chave: r => (temPO(r) ? 'Com pedido' : 'Sem pedido') },
                    ) : undefined}
                  >
                    <td style={{ padding: '8px 6px', fontWeight: 700, borderTop: `1px solid ${COR_SLIDE.linha}` }}>
                      <span style={{
                        display: 'inline-block', width: 10, height: 10, borderRadius: 3, marginRight: 8,
                        background: corDaCriticidade(c.chave),
                      }} />
                      {c.rotulo}
                    </td>
                    <td className="text-right tabular-nums" style={{ padding: '8px 6px', borderTop: `1px solid ${COR_SLIDE.linha}` }}>{formatInt(c.itens)}</td>
                    <td className="text-right tabular-nums" style={{ padding: '8px 6px', borderTop: `1px solid ${COR_SLIDE.linha}` }}>{formatInt(c.comPO)}</td>
                    <td className="text-right tabular-nums" style={{ padding: '8px 6px', fontWeight: 800, borderTop: `1px solid ${COR_SLIDE.linha}` }}>{formatPctInt(c.conversao)}</td>
                    <td className="text-right tabular-nums" style={{ padding: '8px 6px', borderTop: `1px solid ${COR_SLIDE.linha}` }}>{c.comPO ? `${um(c.leadTime)} d` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PainelSlide>

          <PainelSlide titulo="Solicitações de compra no SISTEN" style={{ flex: 1 }}>
            <div className="grid grid-cols-2" style={{ gap: 12, flex: 1 }}>
              <BlocoSisten
                rotulo="Abertas no período"
                valor={formatInt(sisten.abertas)}
                detalhe={sisten.canceladasOuRejeitadas ? `${formatInt(sisten.canceladasOuRejeitadas)} canceladas/rejeitadas` : 'nenhuma cancelada'}
              />
              <BlocoSisten
                rotulo="Já com RM no SAP"
                valor={formatInt(sisten.comRm)}
                detalhe={sisten.abertas ? `${formatPctInt((sisten.comRm / sisten.abertas) * 100)} das abertas` : '—'}
                cor="#0369a1"
                fundo="#f0f9ff"
              />
              <BlocoSisten
                rotulo="Com item genérico"
                valor={formatInt(sisten.comItemGenerico)}
                detalhe={sisten.abertas ? `${formatPctInt((sisten.comItemGenerico / sisten.abertas) * 100)} das solicitações` : '—'}
                cor="#b45309"
                fundo="#fffbeb"
              />
              <BlocoSisten
                rotulo="Itens genéricos"
                valor={formatInt(sisten.itensGenericos)}
                detalhe={sisten.itens ? `de ${formatInt(sisten.itens)} itens (${formatPctInt((sisten.itensGenericos / sisten.itens) * 100)})` : '—'}
                cor="#b45309"
              />
            </div>
          </PainelSlide>
          </div>
        </div>
      )}
    </Slide>
  );
}

/* ────────────────────────── 3. Carteira & Compradores ────────────────────────── */

const MAX_COMPRADORES = 10;

function SlideCarteira({ periodo, subtitulo, numero, vazio, records, compradores }: BaseSlide & {
  records: EnrichedSAPRecord[];
  compradores: CompradorInfo[];
}) {
  const det = useContext(DetalharCtx);
  const linhas = useMemo(() => calcCarteiraPorComprador(records, compradores), [records, compradores]);
  const totais = useMemo(() => {
    const abertos = linhas.reduce((s, l) => s + l.abertos, 0);
    const processados = linhas.reduce((s, l) => s + l.processados, 0);
    return {
      abertos,
      processados,
      total: abertos + processados,
      conversao: abertos + processados ? (processados / (abertos + processados)) * 100 : 0,
      criticos: linhas.reduce((s, l) => s + l.criticos, 0),
      spend: linhas.reduce((s, l) => s + l.spend, 0),
    };
  }, [linhas]);
  const otdForn = useMemo(() => calcOtd(records, 'fornecedor'), [records]);
  const visiveis = linhas.slice(0, MAX_COMPRADORES);
  const maiorAberto = Math.max(1, ...visiveis.map(l => l.abertos));
  // Idade média = data do PO − data da solicitação, de todos os POs colocados no
  // período (mesma conta do lead time RM → PO), cada PO no comprador que o lançou.
  const idadePO = useMemo(() => {
    const porComprador = new Map<string, EnrichedSAPRecord[]>();
    for (const r of records) {
      if (!temPO(r)) continue;
      const nome = resolveComprador(r, compradores);
      const lista = porComprador.get(nome);
      if (lista) lista.push(r); else porComprador.set(nome, [r]);
    }
    return {
      total: calcLeadTimeRmPo(records),
      de: (comprador: string) => calcLeadTimeRmPo(porComprador.get(comprador) ?? []),
    };
  }, [records, compradores]);

  const celula: React.CSSProperties = { padding: '10px 10px', borderTop: `1px solid ${COR_SLIDE.linha}` };

  return (
    <Slide
      rotuloSecao={secao('Carteira & Compradores')}
      titulo="Quem está com a carteira"
      ladoDireito={periodo}
      subtituloDireito={subtitulo}
      numero={numero}
      rodape={`Comprador = quem lançou o PO (ou o grupo da RM, sem PO) · Itens de RM contados uma vez · Idade média do PO = data do PO − data da solicitação, todos os POs do período · Crítico = aberto há + de 30 dias · OTD = recebido até a data do pedido${linhas.length > MAX_COMPRADORES ? ` · ${MAX_COMPRADORES} maiores carteiras de ${linhas.length}` : ''}`}
    >
      <div className="grid grid-cols-5" style={{ gap: 14, height: 118 }}>
        <KpiSlide rotulo="Carteira aberta" valor={formatInt(totais.abertos)} cor="#e11d48" fundo="#fff1f2" detalhe={`${formatInt(totais.criticos)} críticos`} />
        <KpiSlide rotulo="Itens com pedido" valor={formatInt(totais.processados)} cor="#059669" fundo="#ecfdf5" detalhe={`${formatPctInt(totais.conversao)} de conversão`} />
        <KpiSlide rotulo="Idade média do PO" valor={idadePO.total.base ? `${um(idadePO.total.valor)} d` : '—'} detalhe={`PO − solicitação · ${formatInt(idadePO.total.base)} POs`} />
        <KpiSlide rotulo="Valor pedido" valor={formatBRLCompacto(totais.spend)} cor="#0369a1" fundo="#f0f9ff" detalhe={`${formatInt(linhas.length)} compradores`} />
        <KpiSlide rotulo="OTD fornecedor" valor={otdForn.base ? formatPctInt(otdForn.valor) : '—'} detalhe={`${formatInt(otdForn.base)} entregas medidas`} />
      </div>

      {vazio ? <SlideVazio texto={VAZIO} /> : (
        <PainelSlide titulo="Carteira por comprador" style={{ flex: 1 }}>
          <table data-no-cards className="w-full" style={{ fontSize: 15, borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr style={{ color: COR_SLIDE.tinta2, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th className="text-left" style={{ padding: '6px 10px', width: 260 }}>Comprador</th>
                <th className="text-left" style={{ padding: '6px 10px' }}>Carteira aberta</th>
                <th className="text-right" style={{ padding: '6px 10px' }}>Com pedido</th>
                <th className="text-right" style={{ padding: '6px 10px' }}>Conversão</th>
                <th className="text-right" style={{ padding: '6px 10px' }}>Idade média do PO</th>
                <th className="text-right" style={{ padding: '6px 10px' }}>Críticos</th>
                <th className="text-right" style={{ padding: '6px 10px' }}>Valor pedido</th>
                <th className="text-right" style={{ padding: '6px 10px' }}>OTD</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(l => (
                <tr
                  key={l.comprador}
                  className={det ? 'cursor-pointer hover:bg-slate-50' : undefined}
                  onClick={det ? () => det.abrir(
                    `Carteira — ${l.comprador}`, l.comprador,
                    umRegistroPorItem(records).filter(r => resolveComprador(r, compradores) === l.comprador),
                    { cabecalho: 'Situação', chave: r => (temPO(r) ? 'Com pedido' : 'Sem pedido') },
                  ) : undefined}
                >
                  <td style={{ ...celula, fontWeight: 700 }}>{l.comprador}</td>
                  <td style={celula}>
                    <div className="flex items-center" style={{ gap: 10 }}>
                      <div style={{ width: 220, height: 12, borderRadius: 6, background: '#f1f5f9' }}>
                        <div style={{ width: `${(l.abertos / maiorAberto) * 100}%`, height: '100%', borderRadius: 6, background: COR.aberto }} />
                      </div>
                      <span className="tabular-nums" style={{ fontWeight: 800 }}>{formatInt(l.abertos)}</span>
                    </div>
                  </td>
                  <td className="text-right tabular-nums" style={celula}>{formatInt(l.processados)}</td>
                  <td className="text-right tabular-nums" style={{ ...celula, fontWeight: 700 }}>{formatPctInt(l.conversao)}</td>
                  <td className="text-right tabular-nums" style={celula}>{(() => { const m = idadePO.de(l.comprador); return m.base ? `${um(m.valor)} d` : '—'; })()}</td>
                  <td className="text-right tabular-nums" style={{ ...celula, fontWeight: 800, color: l.criticos ? '#e11d48' : COR_SLIDE.suave }}>{formatInt(l.criticos)}</td>
                  <td className="text-right tabular-nums" style={celula}>{formatBRLCompacto(l.spend)}</td>
                  <td className="text-right tabular-nums" style={celula}>{l.otd === null ? '—' : formatPctInt(l.otd)}</td>
                </tr>
              ))}
              <tr style={{ background: '#f8fafc' }}>
                <td style={{ ...celula, fontWeight: 800, borderTop: `2px solid ${COR_SLIDE.tinta2}` }}>Total</td>
                <td className="tabular-nums" style={{ ...celula, fontWeight: 800, borderTop: `2px solid ${COR_SLIDE.tinta2}` }}>{formatInt(totais.abertos)}</td>
                <td className="text-right tabular-nums" style={{ ...celula, fontWeight: 800, borderTop: `2px solid ${COR_SLIDE.tinta2}` }}>{formatInt(totais.processados)}</td>
                <td className="text-right tabular-nums" style={{ ...celula, fontWeight: 800, borderTop: `2px solid ${COR_SLIDE.tinta2}` }}>{formatPctInt(totais.conversao)}</td>
                <td className="text-right tabular-nums" style={{ ...celula, fontWeight: 800, borderTop: `2px solid ${COR_SLIDE.tinta2}` }}>{idadePO.total.base ? `${um(idadePO.total.valor)} d` : '—'}</td>
                <td className="text-right tabular-nums" style={{ ...celula, fontWeight: 800, borderTop: `2px solid ${COR_SLIDE.tinta2}` }}>{formatInt(totais.criticos)}</td>
                <td className="text-right tabular-nums" style={{ ...celula, fontWeight: 800, borderTop: `2px solid ${COR_SLIDE.tinta2}` }}>{formatBRLCompacto(totais.spend)}</td>
                <td className="text-right tabular-nums" style={{ ...celula, fontWeight: 800, borderTop: `2px solid ${COR_SLIDE.tinta2}` }}>{otdForn.base ? formatPctInt(otdForn.valor) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </PainelSlide>
      )}
    </Slide>
  );
}

/* ────────────────────────── 4. Fornecedores & Spend ────────────────────────── */

function SlideFornecedores({ periodo, subtitulo, numero, vazio, records }: BaseSlide & { records: EnrichedSAPRecord[] }) {
  const det = useContext(DetalharCtx);
  const linhas = useMemo(() => calcFornecedores(records), [records]);
  const abrirFornecedor = (fornecedor: string) => det?.abrir(
    `Fornecedor — ${fornecedor}`, fornecedor,
    records.filter(r => temPO(r) && (r.fornecedor_name?.trim() || 'Não informado') === fornecedor),
    { cabecalho: 'Material', chave: r => r.texto_breve?.trim() || 'Sem descrição' },
  );
  const otd = useMemo(() => calcOtd(records, 'fornecedor'), [records]);
  const totalSpend = linhas.reduce((s, l) => s + l.spend, 0);
  const itensComValor = records.filter(r => r.status_requisicao === 'Processado' && typeof r.valor_total === 'number' && Number.isFinite(r.valor_total)).length;
  const ticket = itensComValor ? totalSpend / itensComValor : 0;
  const top = linhas.slice(0, 10);
  // Prazo: os 10 de maior valor entre os que têm entrega com prazo medido.
  const prazo = linhas.filter(l => l.otd !== null).slice(0, 10);

  const corOtd = (v: number) => (v >= 90 ? COR_SLIDE.verde : v >= 70 ? COR_SLIDE.ambar : '#e11d48');

  return (
    <Slide
      rotuloSecao={secao('Fornecedores & Spend')}
      titulo="Para onde vai o dinheiro"
      ladoDireito={periodo}
      subtituloDireito={subtitulo}
      numero={numero}
      rodape="Só itens com pedido · Valor = valor do item no PO · OTD = recebido (MIGO) até a data de entrega do pedido, sem tolerância · Atraso médio só dos entregues com atraso"
    >
      <div className="grid grid-cols-5" style={{ gap: 14, height: 118 }}>
        <KpiSlide rotulo="Valor pedido" valor={formatBRLCompacto(totalSpend)} cor="#0369a1" fundo="#f0f9ff" detalhe={`${formatInt(itensComValor)} itens com valor`} />
        <KpiSlide rotulo="Fornecedores" valor={formatInt(linhas.length)} detalhe="com pedido no período" />
        <KpiSlide rotulo="Concentração top 10" valor={formatPctInt(concentracaoTop(linhas, 10))} detalhe="do valor em 10 fornecedores" />
        <KpiSlide rotulo="Ticket médio" valor={formatBRLCompacto(ticket)} detalhe="por item pedido" />
        <KpiSlide rotulo="OTD fornecedor" valor={otd.base ? formatPctInt(otd.valor) : '—'} cor={otd.base ? corOtd(otd.valor) : undefined}
          detalhe={otd.base ? `atraso médio ${um(otd.atrasoMedioDias)} d` : 'sem entrega medida'} />
      </div>

      {vazio || linhas.length === 0 ? <SlideVazio texto={vazio ? VAZIO : 'Nenhum pedido colocado no período.'} /> : (
        <div className="flex flex-1" style={{ gap: 18, minHeight: 0 }}>
          <PainelSlide titulo="10 maiores fornecedores por valor" style={{ width: 896 }}>
            <RankingSlide
              gap={14}
              corPadrao="#0369a1"
              itens={top.map(l => ({
                onClick: det ? () => abrirFornecedor(l.fornecedor) : undefined,
                chave: l.fornecedor,
                nome: l.fornecedor,
                valor: l.spend,
                texto: formatBRLCompacto(l.spend),
                complemento: `${formatPctInt(l.participacao)} · ${formatInt(l.pedidos)} PO`,
              }))}
            />
          </PainelSlide>
          <PainelSlide
            titulo="Prazo de entrega (OTD)"
            legenda={<><ChipSlide cor={COR_SLIDE.verde} texto="≥ 90%" /><ChipSlide cor={COR_SLIDE.ambar} texto="70–89%" /><ChipSlide cor="#e11d48" texto="< 70%" /></>}
            style={{ flex: 1 }}
          >
            <RankingSlide
              gap={14}
              vazio="Nenhuma entrega com prazo medido no período."
              itens={prazo.map(l => ({
                onClick: det ? () => abrirFornecedor(l.fornecedor) : undefined,
                chave: l.fornecedor,
                nome: l.fornecedor,
                valor: l.otd ?? 0,
                texto: formatPctInt(l.otd ?? 0),
                complemento: l.atrasoMedioDias ? `atraso ${um(l.atrasoMedioDias)} d` : 'sem atraso',
                cor: corOtd(l.otd ?? 0),
              }))}
            />
          </PainelSlide>
        </div>
      )}
    </Slide>
  );
}
