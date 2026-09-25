/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Relatórios dos Apontamentos, no espírito dos slides "Indicador Previsto x
 * Realizado":
 *   1. KPIs por nave — aderência acumulada do ano;
 *   2. Previsto × Realizado por etapa (uma figura por nave): barra = realizado,
 *      traço = previsto, aderência sob o nome da etapa (fora da área das
 *      barras, para nunca colidir com o traço);
 *   3. Aderência semanal por nave na janela escolhida;
 *   4. Etapas com menor aderência.
 *
 * A tabela Programado × Realizado é a visão em tabela destes mesmos números.
 */

import React, { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';
import ChartCard from '../../charts/ChartCard';
import ChartTooltip from '../../charts/ChartTooltip';
import { estimateCategoryChartWidth, useChartConfig } from '../../charts/chartDefaults';
import {
  etapasCriticas,
  formatarPercentual,
  intervaloSemana,
  pontosPrevistoRealizado,
  rotuloSemana,
  serieAderenciaSemanal,
  situacao,
  type GrupoNave,
  type Matriz,
  type PontoPrevistoRealizado,
} from '../../../lib/producaoApontamentos';

interface Props {
  matriz: Matriz;
}

const ALTURA = 340;

export default function RelatoriosApontamento({ matriz }: Props) {
  const fim = matriz.totalAte;
  const grupos = matriz.grupos.filter(g => g.linhas.length > 0);
  const criticas = useMemo(() => etapasCriticas(matriz, 6), [matriz]);

  return (
    <div className="space-y-5">
      <Faixa ano={matriz.anoTotal} subtitulo={`Acumulado de ${matriz.anoTotal} até ${rotuloSemana(fim)} (${intervaloSemana(fim)})`} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {grupos.map(g => (
          <KpiNave key={g.nave.id} grupo={g} />
        ))}
      </div>

      {grupos.map(g => (
        <GraficoPrevistoRealizado key={g.nave.id} grupo={g} ano={matriz.anoTotal} />
      ))}

      <GraficoAderenciaSemanal matriz={matriz} />

      <section className="rounded-xl border p-5" style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}>
        <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
          Etapas com menor aderência no ano
        </h3>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          Onde o realizado mais se afasta do programado — ponto de partida da conversa de produção.
        </p>
        {criticas.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: 'var(--ink-muted)' }}>
            Sem programação lançada ainda.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {criticas.map(l => {
              const pct = Math.min(1, l.total.aderencia ?? 0);
              return (
                <li key={l.etapa.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
                  <span style={{ color: 'var(--ink-primary)' }}>
                    <span className="font-semibold">{l.etapa.nome}</span>
                    <span className="ml-1.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
                      {l.nave.titulo} · {l.total.realizado}/{l.total.programado}
                    </span>
                  </span>
                  <span className="font-bold tabular-nums" style={{ color: 'var(--ink-primary)' }}>
                    {formatarPercentual(l.total.aderencia, 1)}
                  </span>
                  <span className="col-span-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--hairline)' }}>
                    <span className="block h-full rounded-full" style={{ width: `${pct * 100}%`, background: 'var(--status-critical)' }} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Faixa({ ano, subtitulo }: { ano: number; subtitulo: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-800 to-blue-600 text-white shadow-sm">
      <div className="flex items-center gap-4 px-5 py-4 pr-28 sm:pr-48">
        <BarChart3 className="hidden h-10 w-10 shrink-0 opacity-90 sm:block" />
        <div className="min-w-0">
          <p className="text-lg font-light leading-none tracking-wide sm:text-2xl">INDICADOR</p>
          <p className="text-xl font-extrabold leading-tight sm:text-3xl">PREVISTO × REALIZADO</p>
          <p className="mt-1 text-[11px] text-blue-100 sm:text-xs">{subtitulo}</p>
        </div>
        <span className="ml-auto hidden rounded-xl bg-white px-4 py-1.5 text-2xl font-extrabold text-blue-900 md:block">{ano}</span>
      </div>
      <div className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-gradient-to-br from-orange-500 to-orange-600 [clip-path:polygon(22%_0,100%_0,100%_100%,0_100%)] sm:w-44">
        <span className="pl-4 text-right leading-none">
          <span className="block text-xl font-black tracking-tight sm:text-3xl">TEN</span>
          <span className="hidden text-[9px] font-semibold uppercase sm:block">Torres Eólicas do Nordeste</span>
        </span>
      </div>
    </div>
  );
}

function KpiNave({ grupo }: { grupo: GrupoNave }) {
  const s = situacao(grupo.total.programado, grupo.total.realizado);
  return (
    <div className="rounded-xl border p-4" style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}>
      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
        {grupo.nave.titulo}
      </p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums" style={{ color: 'var(--ink-primary)' }}>
        {formatarPercentual(grupo.total.aderencia, 1)}
      </p>
      <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
        {s !== 'vazio' && (
          <span className="mr-1 font-bold" style={{ color: s === 'atingido' ? 'var(--status-good)' : 'var(--status-critical)' }}>
            {s === 'atingido' ? '▲ no programado' : '▼ abaixo'}
          </span>
        )}
        {grupo.total.realizado} realizado de {grupo.total.programado} previsto
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Previsto × Realizado por etapa
// ---------------------------------------------------------------------------

function TickEtapa({ x, y, payload, pontos, cor }: any) {
  const ponto: PontoPrevistoRealizado | undefined = pontos.find((p: PontoPrevistoRealizado) => p.nome === payload.value);
  const palavras = String(payload.value).split(' ');
  // Quebra em até duas linhas para caber sob a barra.
  const meio = Math.ceil(palavras.length / 2);
  const linhas = palavras.length > 2 ? [palavras.slice(0, meio).join(' '), palavras.slice(meio).join(' ')] : [String(payload.value)];
  return (
    <g transform={`translate(${x},${y})`}>
      {linhas.map((t, i) => (
        <text key={i} x={0} y={12 + i * 13} textAnchor="middle" fontSize={11} fontWeight={600} fill={cor.labelStrong}>
          {t}
        </text>
      ))}
      <text x={0} y={14 + linhas.length * 13} textAnchor="middle" fontSize={11} fontWeight={700} fill={cor.value}>
        {ponto ? formatarPercentual(ponto.aderencia, 0) : ''}
      </text>
    </g>
  );
}

function TooltipPrevisto({ active, payload, cores }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as PontoPrevistoRealizado;
  return (
    <ChartTooltip
      title={p.nome}
      rows={[
        { label: 'Realizado', value: p.realizado, color: cores.realizado },
        { label: 'Previsto', value: p.previsto, color: cores.previsto },
        { label: 'Aderência', value: formatarPercentual(p.aderencia, 1) },
      ]}
    />
  );
}

function GraficoPrevistoRealizado({ grupo, ano }: { grupo: GrupoNave; ano: number }) {
  const c = useChartConfig();
  const pontos = useMemo(() => pontosPrevistoRealizado(grupo), [grupo]);
  const cores = { realizado: c.tokens.series[0], previsto: c.tokens.inkPrimary };
  const maximo = Math.max(1, ...pontos.map(p => Math.max(p.previsto, p.realizado)));

  // Valor do realizado dentro da barra quando cabe; acima dela quando não.
  const rotuloRealizado = ({ x, y, width, height, value }: any) => {
    if (!value) return null;
    const dentro = height > 22;
    return (
      <text
        x={x + width / 2}
        y={dentro ? y + 15 : y - 5}
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        fill={dentro ? c.tokens.valueOnMark : c.tokens.value}
      >
        {value}
      </text>
    );
  };

  return (
    <ChartCard
      title={`Previsto × Realizado — ${grupo.nave.titulo}`}
      icon={BarChart3}
      description={`Acumulado de ${ano} até a semana atual. Barra = realizado; traço = previsto; aderência sob cada etapa.`}
      height={ALTURA}
      minPlotWidth={estimateCategoryChartWidth(pontos.length, 92, 480)}
      scrollToEnd={false}
      empty={pontos.length === 0}
      emptyMessage="Sem programado nem realizado lançados para esta nave no ano."
      footer={
        <div className="flex items-center justify-center gap-5 text-xs" style={{ color: 'var(--ink-secondary)' }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: cores.realizado }} /> Realizado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-4" style={{ background: cores.previsto }} /> Previsto
          </span>
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={ALTURA}>
        <ComposedChart data={pontos} margin={{ top: 20, right: 28, left: 0, bottom: 8 }}>
          <CartesianGrid {...c.grid} />
          <XAxis dataKey="nome" {...c.xAxis} interval={0} height={56} tick={<TickEtapa pontos={pontos} cor={c.tokens} />} />
          <YAxis {...c.yAxis} width={44} domain={[0, Math.ceil(maximo * 1.1)]} allowDecimals={false} />
          <Tooltip content={<TooltipPrevisto cores={cores} />} cursor={c.cursor} />
          <Bar dataKey="realizado" fill={cores.realizado} radius={c.radius.top} maxBarSize={44} {...c.animation}>
            <LabelList dataKey="realizado" content={rotuloRealizado} />
          </Bar>
          <Scatter
            dataKey="previsto"
            fill={cores.previsto}
            isAnimationActive={false}
            shape={({ cx, cy }: any) => <rect x={cx - 24} y={cy - 2} width={48} height={4} rx={1} fill={cores.previsto} />}
          >
            <LabelList dataKey="previsto" position="right" offset={28} fontSize={11} fontWeight={600} fill={c.tokens.value} />
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Aderência semanal
// ---------------------------------------------------------------------------

function TooltipSemanal({ active, payload, nomes }: any) {
  if (!active || !payload?.length) return null;
  const ponto = payload[0].payload;
  return (
    <ChartTooltip
      title={ponto.rotulo}
      subtitle={ponto.intervalo}
      rows={payload.map((p: any) => ({ label: nomes[p.dataKey], value: formatarPercentual(p.value, 1), color: p.color }))}
    />
  );
}

function GraficoAderenciaSemanal({ matriz }: { matriz: Matriz }) {
  const c = useChartConfig();
  const dados = useMemo(() => serieAderenciaSemanal(matriz), [matriz]);
  const grupos = matriz.grupos.filter(g => g.linhas.length > 0);
  const nomes = Object.fromEntries(grupos.map(g => [g.nave.id, g.nave.titulo]));
  const valores = dados.flatMap(d => grupos.map(g => d[g.nave.id])).filter((v): v is number => typeof v === 'number');
  const teto = Math.max(1.2, ...valores);
  const vazio = valores.length === 0;

  return (
    <ChartCard
      title="Aderência semanal por nave"
      icon={TrendingUp}
      description="Realizado ÷ programado de cada semana, somando as etapas da nave. Semana sem programado fica sem ponto."
      height={300}
      empty={vazio}
      emptyMessage="Sem programação lançada nas semanas selecionadas."
    >
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={dados} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid {...c.grid} />
          <XAxis dataKey="rotulo" {...c.xAxis} />
          <YAxis {...c.yAxis} width={52} domain={[0, Math.ceil(teto * 10) / 10]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
          <ReferenceLine y={1} stroke={c.tokens.inkMuted} strokeDasharray="4 4" label={{ value: '100%', position: 'insideTopRight', fontSize: 10, fill: c.tokens.inkMuted }} />
          <Tooltip content={<TooltipSemanal nomes={nomes} />} cursor={{ stroke: c.tokens.axis }} />
          <Legend {...c.legend} formatter={(v: string) => nomes[v] ?? v} />
          {grupos.map((g, i) => (
            <Line
              key={g.nave.id}
              dataKey={g.nave.id}
              stroke={c.tokens.series[i]}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, stroke: c.tokens.surface, fill: c.tokens.series[i] }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              {...c.animation}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
