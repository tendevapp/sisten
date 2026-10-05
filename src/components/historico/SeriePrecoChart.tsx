/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Linha do tempo do preço unitário: preço médio ponderado de cada período
 * (linha) sobre a faixa entre o menor e o maior preço observado no período
 * (área sombreada) — a largura da faixa é a flutuação de preço naquele mês.
 * Período sem preço fica como buraco na linha, não é interpolado.
 *
 * O único rótulo de dado é a mediana, marcada por um ponto vazado próprio: a
 * média e os extremos já saem na leitura da linha e da faixa, e rotular os
 * três empilhava texto sobre texto. Clicar num período chama
 * `onSelecionarPeriodo` — quem usa abre o detalhe dos preços daquele período.
 *
 * Mesmo molde de SerieTemporalChart — ChartCard por fora, useChartConfig()
 * para grid e eixos.
 */

import React, { useMemo } from 'react';
import { ComposedChart, Area, Line, LabelList, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { LucideIcon } from 'lucide-react';
import { PontoSeriePreco } from '../../lib/precoMedio';
import { formatBRL, formatInt } from '../../lib/format';
import { useChartConfig, estimateCategoryChartWidth } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface SeriePrecoChartProps {
  pontos: PontoSeriePreco[];
  /** Preço médio do recorte inteiro — vira a linha de referência horizontal. */
  precoMedioGeral?: number;
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  height?: number;
  /** Clique no gráfico: recebe o período ('AAAA-MM' ou 'AAAA-Wnn') sob o cursor. */
  onSelecionarPeriodo?: (periodo: string) => void;
}

function formatVariacao(pct: number): string {
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1).replace('.', ',')}%`;
}

export default function SeriePrecoChart({
  pontos,
  precoMedioGeral,
  title,
  description,
  icon,
  actions,
  height = 320,
  onSelecionarPeriodo,
}: SeriePrecoChartProps) {
  const c = useChartConfig();

  // A faixa vira um par [menor, maior] para a área; mês sem dado fica null.
  const data = useMemo(
    () => pontos.map(p => ({ ...p, faixa: p.menor !== null && p.maior !== null ? [p.menor, p.maior] : null })),
    [pontos]
  );

  // Com muitos períodos os rótulos se atropelam: aparecem até 24 pontos (o
  // tooltip cobre o resto).
  const rotulosMediana = data.length <= 24;

  /** Valor da mediana sobre o ponto, em tinta de texto (a série é identificada pelo marcador, não pela cor do número). */
  function RotuloMediana(p: any) {
    if (typeof p.value !== 'number' || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
    return (
      <text x={p.x} y={p.y + 17} textAnchor="middle" fontSize={11} fontWeight={700} fill={c.tokens.value}>
        {formatBRL(p.value)}
      </text>
    );
  }

  // Recharts entrega o período sob o cursor em activeLabel; activeIndex cobre versões que só o trazem como índice.
  const aoClicar = (estado: any) => {
    if (!onSelecionarPeriodo) return;
    const periodo = estado?.activeLabel ?? data[Number(estado?.activeIndex ?? estado?.activeTooltipIndex)]?.periodo;
    if (typeof periodo === 'string') onSelecionarPeriodo(periodo);
  };

  function TooltipConteudo({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as PontoSeriePreco;
    if (row.n === 0 || row.precoMedio === null) {
      return <ChartTooltip title={label} subtitle="Sem compra ou cotação neste período." />;
    }
    const rows = [
      { color: c.tokens.series[0], label: 'Preço médio', value: formatBRL(row.precoMedio) },
      { label: 'Mediana', value: formatBRL(row.mediana) },
      { label: 'Menor preço', value: formatBRL(row.menor) },
      { label: 'Maior preço', value: formatBRL(row.maior) },
    ];
    if (row.variacaoPct !== null) rows.push({ label: 'Variação vs. anterior', value: formatVariacao(row.variacaoPct) });
    rows.push({ label: 'Observações', value: formatInt(row.n) });
    return (
      <ChartTooltip
        title={label}
        rows={rows}
        footer={onSelecionarPeriodo ? 'Clique para ver os preços do período' : undefined}
      />
    );
  }

  return (
    <ChartCard
      title={title}
      icon={icon}
      description={description}
      actions={actions}
      height={height}
      minPlotWidth={estimateCategoryChartWidth(data.length, 56, 380)}
      empty={data.length === 0}
      emptyMessage="Sem preços no filtro selecionado para desenhar a evolução."
    >
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={data}
          margin={{ top: 28, right: 16, left: 0, bottom: 20 }}
          onClick={aoClicar}
          style={onSelecionarPeriodo ? { cursor: 'pointer' } : undefined}
        >
          <CartesianGrid {...c.grid} />
          <XAxis dataKey="periodo" {...c.xAxis} tick={{ ...c.xAxis.tick, fontSize: 10 }} />
          <YAxis
            {...c.yAxis}
            width={72}
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => formatBRL(v)}
          />
          <Tooltip content={<TooltipConteudo />} cursor={c.cursor} />
          {precoMedioGeral ? (
            <ReferenceLine y={precoMedioGeral} stroke={c.tokens.label} strokeDasharray="2 4" />
          ) : null}
          <Area
            type="monotone"
            dataKey="faixa"
            stroke="none"
            fill={c.tokens.series[0]}
            fillOpacity={0.16}
            connectNulls={false}
            activeDot={false}
            {...c.animation}
          />
          <Line
            type="monotone"
            dataKey="precoMedio"
            stroke={c.tokens.series[0]}
            strokeWidth={2}
            connectNulls={false}
            dot={{ r: 3.5, fill: c.tokens.series[0] }}
            {...c.animation}
          />
          {/* Mediana: ponto vazado sem traço, que carrega o único rótulo do gráfico. */}
          <Line
            dataKey="mediana"
            stroke="none"
            connectNulls={false}
            dot={{ r: 4, fill: 'var(--surface-card)', stroke: c.tokens.series[0], strokeWidth: 2 }}
            activeDot={false}
            isAnimationActive={false}
            legendType="none"
          >
            {rotulosMediana && <LabelList dataKey="mediana" content={RotuloMediana} />}
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
