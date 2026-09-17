/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Série temporal de um material/item selecionado no ranking de recorrência.
 *
 * Não existe hoje um gráfico de linha no design system de Suprimentos (o
 * único AreaChart do projeto, em UsageDashboard, usa cores cruas fora do
 * tema) — este segue o mesmo molde de ParetoValorChart: ChartCard por fora,
 * useChartConfig() para grid/eixos, um ComposedChart por dentro. Linha de
 * valor no eixo esquerdo, barras de pedidos distintos no direito — a mesma
 * separação "contínuo vs. discreto" que o Pareto já usa entre valor e
 * participação.
 */

import React, { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { LucideIcon } from 'lucide-react';
import { PontoSerieRecorrencia } from '../../lib/historicoAnalytics';
import { formatInt, formatBRLCompacto } from '../../lib/format';
import { useChartConfig, estimateCategoryChartWidth } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface SerieTemporalChartProps {
  pontos: PontoSerieRecorrencia[];
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  loading?: boolean;
  height?: number;
}

export default function SerieTemporalChart({
  pontos,
  title,
  description,
  icon,
  loading = false,
  height = 280,
}: SerieTemporalChartProps) {
  const c = useChartConfig();

  const data = useMemo(() => pontos.map(p => ({ ...p })), [pontos]);

  function TooltipConteudo({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as PontoSerieRecorrencia;
    return (
      <ChartTooltip
        title={label}
        rows={[
          { color: c.tokens.series[0], label: 'Valor', value: formatBRLCompacto(row.valor) },
          { color: c.tokens.series[6], label: 'Pedidos', value: formatInt(row.pedidos) },
          { label: 'Quantidade', value: formatInt(row.qtd) },
        ]}
      />
    );
  }

  return (
    <ChartCard
      title={title}
      icon={icon}
      description={description}
      height={height}
      loading={loading}
      minPlotWidth={estimateCategoryChartWidth(data.length, 48, 380)}
      empty={data.length === 0}
      emptyMessage="Sem datas de pedido no filtro selecionado para desenhar a série."
    >
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid {...c.grid} />
          <XAxis dataKey="periodo" {...c.xAxis} tick={{ ...c.xAxis.tick, fontSize: 10 }} />
          <YAxis yAxisId="valor" {...c.yAxis} width={66} tickFormatter={(v: number) => formatBRLCompacto(v)} />
          <YAxis yAxisId="pedidos" orientation="right" {...c.yAxis} width={36} allowDecimals={false} />
          <Tooltip content={<TooltipConteudo />} cursor={c.cursor} />
          <Bar
            yAxisId="pedidos"
            dataKey="pedidos"
            fill={c.tokens.series[6]}
            radius={c.radius.top}
            maxBarSize={28}
            {...c.animation}
          />
          <Line
            yAxisId="valor"
            type="monotone"
            dataKey="valor"
            stroke={c.tokens.series[0]}
            strokeWidth={2}
            dot={{ r: 3, fill: c.tokens.series[0] }}
            {...c.animation}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
