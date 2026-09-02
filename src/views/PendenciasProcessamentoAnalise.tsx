/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Painel de análise embutido na aba "Análise" de Pendências de Processamento.
 *
 * Recebe os mesmos grupos já carregados pela tela de baixa e os resume para o
 * comprador enxergar o quadro geral: volume aberto, idade das pendências, causa
 * provável, área responsável, impacto, fornecedores e compradores mais
 * recorrentes, além da evolução mês a mês (abertas x baixadas).
 */

import React, { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  RefreshCw, ClipboardList, Wallet, Clock,
  TimerReset, CircleCheck, AlertTriangle, Building2, UserRound, Layers, Repeat2,
  CalendarClock, ListFilter, FileSpreadsheet, Search, Calendar,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, Legend, ResponsiveContainer,
} from 'recharts';
import { formatBRL, formatInt, formatPct } from '../lib/format';
import { useChartTokens, type ChartTokens } from '../lib/chartTokens';
import { useChartConfig, estimateCategoryChartWidth } from '../components/charts/chartDefaults';
import ChartCard from '../components/charts/ChartCard';
import ChartTooltip from '../components/charts/ChartTooltip';
import KpiCard from '../components/charts/KpiCard';
import MultiSelectFilter from '../components/ui/MultiSelectFilter';
import DateRangeFilter, { type DateRangeValue } from '../components/ui/DateRangeFilter';
import { rotuloModelo } from '../lib/supPendenciasProcessamento';
import type { GrupoPendencia } from '../lib/supPendenciasApi';

interface Props {
  /** Grupos já carregados pela tela pai (`listarPendenciasAgrupadas(false)`). */
  grupos: GrupoPendencia[];
  carregando: boolean;
  onRecarregar: () => void;
}

/** Uma linha da fila, achatada e enriquecida com os campos do chamado. */
interface LinhaAnalise {
  id: string;
  request_id: string;
  modelo: GrupoPendencia['modelo'];
  created_at: string;
  concluida: boolean;
  resolvido_em: string | null;
  valor_nfse: number | null;
  fornecedor: string;
  comprador: string;
  causa: string;
  responsavel: string;
  impacto: string;
  recorrencia: string;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIA_MS = 86_400_000;
const SEM_CLASSIF = 'Sem classificação';
const MODELO_OPCOES = ['NFS-e', 'Lançamentos SAP', 'Ajuste de Pedido'];
const ORDEM_AGING = ['0-3 dias', '4-7 dias', '8-15 dias', '16-30 dias', '31+ dias'];

const umaCasa = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const fmtDias = (v: number) => `${umaCasa.format(v)} d`;

function rotuloMes(key: string): string {
  const [y, m] = key.split('-');
  return `${MESES[Number(m) - 1] || m}/${y.slice(2)}`;
}

function diasEntre(deISO?: string | null, ateISO?: string | null): number | null {
  if (!deISO || !ateISO) return null;
  const de = new Date(deISO).getTime();
  const ate = new Date(ateISO).getTime();
  if (Number.isNaN(de) || Number.isNaN(ate)) return null;
  return Math.max(0, (ate - de) / DIA_MS);
}

function agingBucket(dias: number): string {
  if (dias <= 3) return '0-3 dias';
  if (dias <= 7) return '4-7 dias';
  if (dias <= 15) return '8-15 dias';
  if (dias <= 30) return '16-30 dias';
  return '31+ dias';
}

function impactoCor(tokens: ChartTokens, label: string): string {
  const n = label.toLowerCase();
  if (n.startsWith('alto')) return tokens.status.critical;
  if (n.startsWith('méd') || n.startsWith('med')) return tokens.status.serious;
  if (n.startsWith('baixo')) return tokens.status.good;
  return tokens.inkMuted;
}

/** Agrega uma contagem de linhas por chave, já ordenada da maior para a menor. */
function contarPor(linhas: LinhaAnalise[], chave: (l: LinhaAnalise) => string, limite?: number) {
  const m = new Map<string, number>();
  linhas.forEach(l => {
    const k = chave(l);
    m.set(k, (m.get(k) || 0) + 1);
  });
  const arr = Array.from(m, ([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  return limite ? arr.slice(0, limite) : arr;
}

/* -------------------------------------------------------------------------- */

export default function PendenciasProcessamentoAnalise({ grupos, carregando, onRecarregar }: Props) {
  const [statusFiltro, setStatusFiltro] = useState<'pendentes' | 'todos' | 'concluidos'>('pendentes');
  const [modeloFiltro, setModeloFiltro] = useState<Set<string>>(new Set());
  const [causaFiltro, setCausaFiltro] = useState<Set<string>>(new Set());
  const [dataFiltro, setDataFiltro] = useState<DateRangeValue>({ from: '', to: '', preset: 'all' });

  const tokens = useChartTokens();

  const linhas = useMemo<LinhaAnalise[]>(() => {
    const out: LinhaAnalise[] = [];
    grupos.forEach(g => {
      g.linhas.forEach(l => {
        out.push({
          id: l.id,
          request_id: g.request_id,
          modelo: l.modelo,
          created_at: l.created_at || g.created_at,
          concluida: l.status === 'concluido',
          resolvido_em: l.resolvido_em ?? null,
          valor_nfse: l.valor_nfse ?? null,
          fornecedor: (l.nome_fornecedor || l.fornecedor || '').trim() || 'Sem fornecedor',
          comprador: (l.comprador || '').trim(),
          causa: g.classif_causa || SEM_CLASSIF,
          responsavel: g.classif_responsavel || SEM_CLASSIF,
          impacto: g.classif_impacto || SEM_CLASSIF,
          recorrencia: g.classif_recorrencia || SEM_CLASSIF,
        });
      });
    });
    return out;
  }, [grupos]);

  const causaOpcoes = useMemo(
    () => Array.from(new Set(linhas.map(l => l.causa))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [linhas],
  );

  /** Filtros que valem para a página inteira (modelo, causa, janela de abertura). */
  const linhasFiltradas = useMemo(() => {
    return linhas.filter(l => {
      if (modeloFiltro.size > 0 && !modeloFiltro.has(rotuloModelo(l.modelo))) return false;
      if (causaFiltro.size > 0 && !causaFiltro.has(l.causa)) return false;
      const dia = l.created_at ? l.created_at.slice(0, 10) : '';
      if (dataFiltro.preset === 'sem_data' || dataFiltro.preset === 'no_date') {
        if (dia) return false;
      } else {
        if (dataFiltro.from && dia < dataFiltro.from) return false;
        if (dataFiltro.to && dia > dataFiltro.to) return false;
      }
      return true;
    });
  }, [linhas, modeloFiltro, causaFiltro, dataFiltro]);

  const pendentes = useMemo(() => linhasFiltradas.filter(l => !l.concluida), [linhasFiltradas]);
  const concluidas = useMemo(() => linhasFiltradas.filter(l => l.concluida), [linhasFiltradas]);

  /** Base dos gráficos por categoria — respeita o botão Pendentes / Todos / Concluídos. */
  const baseCategorias = useMemo(() => {
    if (statusFiltro === 'pendentes') return pendentes;
    if (statusFiltro === 'concluidos') return concluidas;
    return linhasFiltradas;
  }, [statusFiltro, pendentes, concluidas, linhasFiltradas]);

  const kpis = useMemo(() => {
    const agoraISO = new Date().toISOString();
    const valorPendente = pendentes.reduce((s, l) => s + (l.modelo === 'nfse' ? (l.valor_nfse ?? 0) : 0), 0);
    const chamadosComPendencia = new Set(pendentes.map(l => l.request_id)).size;

    const idades = pendentes
      .map(l => diasEntre(l.created_at, agoraISO))
      .filter((n): n is number => n != null);
    const idadeMedia = idades.length ? idades.reduce((a, b) => a + b, 0) / idades.length : 0;

    const tempos = concluidas
      .map(l => diasEntre(l.created_at, l.resolvido_em))
      .filter((n): n is number => n != null);
    const tempoMedioBaixa = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : 0;

    const taxaConclusao = linhasFiltradas.length ? (concluidas.length / linhasFiltradas.length) * 100 : 0;

    return {
      notasPendentes: pendentes.length,
      chamadosComPendencia,
      valorPendente,
      idadeMedia,
      tempoMedioBaixa,
      taxaConclusao,
    };
  }, [pendentes, concluidas, linhasFiltradas]);

  const evolucaoData = useMemo(() => {
    const m = new Map<string, { key: string; label: string; abertas: number; baixadas: number }>();
    const bump = (iso: string | null | undefined, campo: 'abertas' | 'baixadas') => {
      if (!iso) return;
      const key = iso.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(key)) return;
      let e = m.get(key);
      if (!e) { e = { key, label: rotuloMes(key), abertas: 0, baixadas: 0 }; m.set(key, e); }
      e[campo] += 1;
    };
    linhasFiltradas.forEach(l => {
      bump(l.created_at, 'abertas');
      if (l.concluida) bump(l.resolvido_em, 'baixadas');
    });
    return Array.from(m.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [linhasFiltradas]);

  const agingData = useMemo(() => {
    const agoraISO = new Date().toISOString();
    const contagem = new Map(ORDEM_AGING.map(b => [b, 0]));
    pendentes.forEach(l => {
      const d = diasEntre(l.created_at, agoraISO);
      if (d == null) return;
      const b = agingBucket(d);
      contagem.set(b, (contagem.get(b) || 0) + 1);
    });
    return ORDEM_AGING.map((nome, i) => ({ nome, valor: contagem.get(nome) || 0, cor: tokens.atraso[i] }));
  }, [pendentes, tokens]);

  const causaData = useMemo(() => contarPor(baseCategorias, l => l.causa), [baseCategorias]);
  const responsavelData = useMemo(() => contarPor(baseCategorias, l => l.responsavel), [baseCategorias]);
  const impactoData = useMemo(
    () => contarPor(baseCategorias, l => l.impacto).map(d => ({ ...d, cor: impactoCor(tokens, d.nome) })),
    [baseCategorias, tokens],
  );
  const fornecedorData = useMemo(() => contarPor(baseCategorias, l => l.fornecedor, 12), [baseCategorias]);
  const compradorData = useMemo(
    () => contarPor(baseCategorias.filter(l => l.comprador), l => l.comprador, 12),
    [baseCategorias],
  );
  const modeloData = useMemo(() => contarPor(baseCategorias, l => rotuloModelo(l.modelo)), [baseCategorias]);
  const recorrenciaData = useMemo(() => contarPor(baseCategorias, l => l.recorrencia), [baseCategorias]);

  const filtrosAtivos =
    statusFiltro !== 'pendentes' ||
    modeloFiltro.size > 0 ||
    causaFiltro.size > 0 ||
    Boolean(dataFiltro.from) ||
    Boolean(dataFiltro.to) ||
    (dataFiltro.preset && dataFiltro.preset !== 'all');

  const limparFiltros = () => {
    setStatusFiltro('pendentes');
    setModeloFiltro(new Set());
    setCausaFiltro(new Set());
    setDataFiltro({ from: '', to: '', preset: 'all' });
  };

  const unidadeBase =
    statusFiltro === 'pendentes' ? 'Notas pendentes' : statusFiltro === 'concluidos' ? 'Notas baixadas' : 'Notas';

  return (
    <div className="space-y-6 text-left w-full">
      {/* Cabeçalho do painel */}
      <div className="flex items-start justify-between flex-wrap gap-3 reveal">
        <p className="text-sm max-w-2xl" style={{ color: 'var(--ink-secondary)' }}>
          Volume aberto, idade das pendências, causa provável, área responsável, impacto e evolução mês a mês.
          Os dados são os mesmos da aba Fila.
        </p>
        <button
          type="button"
          onClick={onRecarregar}
          disabled={carregando}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-bold cursor-pointer transition-colors hover:bg-[var(--surface-raised)] disabled:opacity-50 shrink-0"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border p-4 space-y-3 reveal" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.04)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-xl p-1 shrink-0 border border-slate-200/50 dark:border-slate-800">
            {(['pendentes', 'todos', 'concluidos'] as const).map(op => (
              <button
                key={op}
                type="button"
                onClick={() => setStatusFiltro(op)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer capitalize ${
                  statusFiltro === op
                    ? 'bg-white dark:bg-slate-800 text-[#0056c6] dark:text-[#3b82f6] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                }`}
              >
                {op === 'pendentes' ? 'Pendentes' : op === 'todos' ? 'Todos' : 'Concluídos'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-visible">
            <MultiSelectFilter
              label="Modelo"
              icon={FileSpreadsheet}
              options={MODELO_OPCOES}
              selected={modeloFiltro}
              onChange={setModeloFiltro}
              className="shrink-0 w-[150px] sm:w-auto sm:min-w-[150px]"
            />
            <MultiSelectFilter
              label="Causa"
              icon={Search}
              options={causaOpcoes}
              selected={causaFiltro}
              onChange={setCausaFiltro}
              panelClassName="w-80"
              className="shrink-0 w-[150px] sm:w-auto sm:min-w-[150px]"
            />
            <DateRangeFilter
              label="Abertura"
              icon={Calendar}
              value={dataFiltro}
              onChange={setDataFiltro}
              className="shrink-0 w-[160px] sm:w-auto sm:min-w-[160px]"
            />
            {filtrosAtivos && (
              <button
                type="button"
                onClick={limparFiltros}
                className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline px-2 py-1.5 cursor-pointer shrink-0"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>
        <p className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--ink-muted)' }}>
          <ListFilter className="h-3 w-3" />
          Os gráficos por categoria seguem o botão de status. Evolução mensal e aging usam sempre as notas ainda pendentes / o fluxo completo.
        </p>
      </div>

      {carregando && linhas.length === 0 ? (
        <div className="flex items-center justify-center py-20" style={{ color: 'var(--ink-muted)' }}>
          <RefreshCw className="animate-spin h-6 w-6" />
        </div>
      ) : linhas.length === 0 ? (
        <div className="rounded-xl border p-10 text-center reveal" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          <CircleCheck className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--status-good)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>Nenhuma pendência registrada ainda.</p>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
            Assim que chamados de pendência de processamento forem abertos, os indicadores aparecem aqui.
          </p>
        </div>
      ) : (
        <>
          {/* Indicadores */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
            <KpiCard label="Notas pendentes" value={kpis.notasPendentes} format={v => formatInt(v)} icon={ClipboardList} accent="var(--status-serious)" emphasize />
            <KpiCard label="Chamados com pendência" value={kpis.chamadosComPendencia} format={v => formatInt(v)} icon={Layers} accent="#0891b2" />
            <KpiCard label="Valor pendente (NFS-e)" value={kpis.valorPendente} format={formatBRL} icon={Wallet} accent="var(--brand)" />
            <KpiCard label="Idade média em aberto" value={kpis.idadeMedia} format={fmtDias} icon={Clock} accent="var(--status-warning)" />
            <KpiCard label="Tempo médio de baixa" value={kpis.tempoMedioBaixa} format={fmtDias} icon={TimerReset} accent="#7c3aed" />
            <KpiCard label="Taxa de conclusão" value={kpis.taxaConclusao} format={v => formatPct(v)} icon={CircleCheck} accent="var(--status-good)" />
          </div>

          {/* Evolução mensal */}
          <ChartCard
            title="Evolução mensal: abertas x baixadas"
            icon={CalendarClock}
            description="Notas abertas pela data do chamado e notas baixadas pela data da conclusão, mês a mês. Barras acima da linha de base."
            height={340}
            minPlotWidth={estimateCategoryChartWidth(evolucaoData.length, 72, 460)}
            empty={evolucaoData.length === 0}
            emptyMessage="Sem registros no período filtrado."
          >
            <ResponsiveContainer width="100%" height={340}>
              <EvolucaoChart data={evolucaoData} tokens={tokens} />
            </ResponsiveContainer>
          </ChartCard>

          {/* Aging + Impacto */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <GraficoBarras
              titulo="Aging das pendências em aberto"
              icone={AlertTriangle}
              descricao="Notas ainda pendentes por tempo decorrido desde a abertura do chamado."
              data={agingData}
              coresSemanticas
              unidade="Notas pendentes"
              ordemFixa
            />
            <GraficoBarras
              titulo="Pendências por impacto"
              icone={AlertTriangle}
              descricao="Grau de impacto informado no chamado. Alto bloqueia pagamento ou vencimento próximo."
              data={impactoData}
              coresSemanticas
              unidade={unidadeBase}
            />
          </div>

          {/* Causa + Responsável */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <GraficoBarras
              titulo="Pendências por causa provável"
              icone={Search}
              descricao="Motivo registrado na abertura do chamado. É o eixo principal para atacar a recorrência."
              data={causaData}
              unidade={unidadeBase}
            />
            <GraficoBarras
              titulo="Pendências por área responsável"
              icone={UserRound}
              descricao="Quem precisa agir para resolver a pendência."
              data={responsavelData}
              unidade={unidadeBase}
            />
          </div>

          {/* Fornecedor + Comprador */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <GraficoBarras
              titulo="Fornecedores com mais pendências"
              icone={Building2}
              descricao="Top 12 fornecedores por número de notas na seleção atual."
              data={fornecedorData}
              unidade={unidadeBase}
            />
            <GraficoBarras
              titulo="Pendências por comprador"
              icone={UserRound}
              descricao="Comprador informado nos lançamentos SAP. Notas sem comprador ficam de fora."
              data={compradorData}
              unidade={unidadeBase}
              vazioMsg="Nenhum comprador informado nas notas da seleção."
            />
          </div>

          {/* Modelo + Recorrência */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <GraficoBarras
              titulo="Pendências por modelo de planilha"
              icone={FileSpreadsheet}
              descricao="NFS-e, lançamentos SAP ou ajuste de pedido."
              data={modeloData}
              unidade={unidadeBase}
            />
            <GraficoBarras
              titulo="Pendências por recorrência"
              icone={Repeat2}
              descricao="Se o problema é a primeira ocorrência ou já se repete com o fornecedor / tipo de item."
              data={recorrenciaData}
              unidade={unidadeBase}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Gráficos                                                                    */
/* -------------------------------------------------------------------------- */

interface ItemBarra {
  nome: string;
  valor: number;
  cor?: string;
}

/** Encurta rótulo de categoria para caber em uma linha do eixo — o nome completo
 *  fica no tooltip. Sem isto o Recharts quebra em 3 linhas e os rótulos vizinhos
 *  se sobrepõem. */
function encurtar(texto: string, max = 26): string {
  const t = texto.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function GraficoBarras({
  titulo,
  icone,
  descricao,
  data,
  unidade,
  coresSemanticas = false,
  ordemFixa = false,
  vazioMsg,
}: {
  titulo: string;
  icone: LucideIcon;
  descricao: string;
  data: ItemBarra[];
  unidade: string;
  /** true = usa a cor de cada item (impacto, aging). false = tom único da marca
   *  com opacidade proporcional ao valor, para ler como ranking e não arco-íris. */
  coresSemanticas?: boolean;
  ordemFixa?: boolean;
  vazioMsg?: string;
}) {
  const c = useChartConfig();
  const semDados = data.length === 0 || data.every(d => d.valor === 0);
  const altura = Math.max(160, data.length * 30 + 42);
  const corBase = c.tokens.brand;
  const maxValor = Math.max(1, ...data.map(d => d.valor));

  const Tip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as ItemBarra;
    return <ChartTooltip title={row.nome} rows={[{ color: row.cor || corBase, label: unidade, value: formatInt(row.valor) }]} />;
  };

  return (
    <ChartCard
      title={titulo}
      icon={icone}
      description={descricao}
      height={altura}
      empty={semDados}
      emptyMessage={vazioMsg || 'Sem dados na seleção atual.'}
    >
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, left: 0, bottom: 4 }}>
          <CartesianGrid {...c.grid} vertical horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...c.yAxis} />
          <YAxis
            type="category"
            dataKey="nome"
            {...c.xAxis}
            tick={{ fontSize: 11, fill: c.tokens.labelStrong, fontWeight: 600 }}
            tickFormatter={(v: string) => encurtar(v)}
            tickMargin={8}
            width={186}
            interval={0}
            reversed={ordemFixa}
          />
          <Tooltip content={<Tip />} cursor={c.cursor} />
          <Bar dataKey="valor" radius={c.radius.right} maxBarSize={24} {...c.animation}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={coresSemanticas ? d.cor || corBase : corBase}
                fillOpacity={coresSemanticas ? 1 : 0.5 + 0.5 * (d.valor / maxValor)}
              />
            ))}
            <LabelList dataKey="valor" position="right" formatter={(v: number) => (v > 0 ? formatInt(v) : '')} style={c.labelOnSurface} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function EvolucaoChart({
  data,
  tokens,
}: {
  data: { key: string; label: string; abertas: number; baixadas: number }[];
  tokens: ChartTokens;
}) {
  const c = useChartConfig();

  const Tip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as { label: string; abertas: number; baixadas: number };
    return (
      <ChartTooltip
        title={`Mês: ${row.label}`}
        rows={[
          { color: tokens.status.serious, label: 'Notas abertas', value: formatInt(row.abertas) },
          { color: tokens.status.good, label: 'Notas baixadas', value: formatInt(row.baixadas) },
        ]}
      />
    );
  };

  return (
    <BarChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
      <CartesianGrid {...c.grid} horizontal vertical={false} />
      <XAxis dataKey="label" {...c.xAxis} interval={0} minTickGap={6} />
      <YAxis allowDecimals={false} {...c.yAxis} width={44} />
      <Tooltip content={<Tip />} cursor={c.cursor} />
      <Legend
        wrapperStyle={{ paddingTop: 10, fontSize: 12 }}
        formatter={v => <span className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>{v}</span>}
      />
      <Bar dataKey="abertas" name="Abertas" fill={tokens.status.serious} radius={c.radius.top} maxBarSize={26} {...c.animation}>
        <LabelList dataKey="abertas" position="top" formatter={(v: number) => (v > 0 ? formatInt(v) : '')} style={c.labelOnSurface} />
      </Bar>
      <Bar dataKey="baixadas" name="Baixadas" fill={tokens.status.good} radius={c.radius.top} maxBarSize={26} {...c.animation}>
        <LabelList dataKey="baixadas" position="top" formatter={(v: number) => (v > 0 ? formatInt(v) : '')} style={c.labelOnSurface} />
      </Bar>
    </BarChart>
  );
}
