/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pareto genérico sobre uma dimensão de gasto.
 *
 * Barras de valor no eixo esquerdo, curva de participação acumulada no
 * direito, linha de referência nos 80%. A pergunta que responde não é "quem é
 * o maior" — um ranking bastaria — e sim "quão concentrado está", que é o que
 * define poder de negociação e risco de dependência.
 */

import React, { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { LucideIcon } from 'lucide-react';
import { FatiaValor } from '../../lib/historicoAnalytics';
import { formatInt, formatPct, formatBRLCompacto } from '../../lib/format';
import { useChartConfig } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface ParetoValorChartProps {
  fatias: FatiaValor[];
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** Quantas barras mostrar. A curva acumulada usa a série inteira. */
  top?: number;
  /** Nome da unidade contada, para o tooltip ("fornecedor", "grupo"). */
  unidade?: string;
  onSelecionar?: (chave: string) => void;
  height?: number;
}

/** Encurta rótulo longo para o eixo; o tooltip mantém o texto completo. */
const curto = (s: string, max = 18) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export default function ParetoValorChart({
  fatias,
  title,
  description,
  icon,
  top = 12,
  unidade = 'item',
  onSelecionar,
  height = 320,
}: ParetoValorChartProps) {
  const c = useChartConfig();

  const data = useMemo(
    () => fatias.slice(0, top).map(f => ({ ...f, rotulo: curto(f.chave) })),
    [fatias, top]
  );

  const total = useMemo(() => fatias.reduce((s, f) => s + f.valor, 0), [fatias]);

  function TooltipConteudo({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as FatiaValor;
    return (
      <ChartTooltip
        title={row.chave}
        subtitle={`${formatInt(row.itens)} itens em ${formatInt(row.pedidos)} pedidos`}
        rows={[
          { color: c.tokens.series[0], label: 'Valor', value: formatBRLCompacto(row.valor) },
          { label: 'Participação', value: formatPct(row.participacao) },
          { color: c.tokens.series[6], label: 'Acumulado', value: formatPct(row.acumulado) },
        ]}
        footer={onSelecionar ? 'Clique para filtrar' : undefined}
      />
    );
  }

  return (
    <ChartCard
      title={title}
      icon={icon}
      description={description}
      height={height}
      empty={data.length === 0 || total <= 0}
      emptyMessage={`Nenhum ${unidade} com valor no filtro selecionado.`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 52 }}>
          <CartesianGrid {...c.grid} />
          <XAxis
            dataKey="rotulo"
            {...c.xAxis}
            angle={-35}
            textAnchor="end"
            interval={0}
            height={64}
            tick={{ ...c.xAxis.tick, fontSize: 10 }}
          />
          <YAxis yAxisId="valor" {...c.yAxis} width={66} tickFormatter={(v: number) => formatBRLCompacto(v)} />
          <YAxis
            yAxisId="pct"
            orientation="right"
            domain={[0, 100]}
            {...c.yAxis}
            width={40}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip content={<TooltipConteudo />} cursor={c.cursor} />
          <ReferenceLine
            yAxisId="pct"
            y={80}
            stroke={c.tokens.inkMuted}
            strokeDasharray="4 4"
            label={{ value: '80%', position: 'right', fontSize: 10, fill: c.tokens.inkMuted }}
          />
          <Bar
            yAxisId="valor"
            dataKey="valor"
            fill={c.tokens.series[0]}
            radius={c.radius.top}
            maxBarSize={44}
            cursor={onSelecionar ? 'pointer' : undefined}
            onClick={(d: any) => onSelecionar?.(d?.chave)}
            {...c.animation}
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="acumulado"
            stroke={c.tokens.series[6]}
            strokeWidth={2}
            dot={{ r: 3, fill: c.tokens.series[6] }}
            {...c.animation}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
