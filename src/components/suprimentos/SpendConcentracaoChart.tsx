/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Concentração do spend — Pareto de fornecedores.
 *
 * A pergunta não é "quem é o maior fornecedor" (isso um ranking responde), é
 * "quão dependente o setor está de poucos". 80% do gasto em três fornecedores
 * é uma posição de negociação — e um risco de ruptura — completamente diferente
 * de 80% espalhado em quarenta.
 *
 * Barras de valor e curva de percentual acumulado no mesmo painel, com eixos
 * separados: a curva é o que se lê para achar o ponto de corte.
 */

import React, { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { PieChart } from 'lucide-react';
import { LinhaFornecedor } from '../../lib/suprimentos';
import { formatInt, formatPct, formatBRLCompacto } from '../../lib/format';
import { useChartConfig, estimateCategoryChartWidth } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface SpendConcentracaoChartProps {
  linhas: LinhaFornecedor[];
  /** Quantos fornecedores mostrar. O resto entra na curva mas não vira barra. */
  top?: number;
  loading?: boolean;
  /** Drill-down: fornecedor da barra clicada. */
  onSelecionar?: (fornecedor: string) => void;
}

export default function SpendConcentracaoChart({ linhas, top = 12, loading, onSelecionar }: SpendConcentracaoChartProps) {
  const c = useChartConfig();

  const { data, totalSpend, fornecedoresPara80 } = useMemo(() => {
    const comSpend = linhas.filter(l => l.spend > 0);
    const total = comSpend.reduce((s, l) => s + l.spend, 0);
    // Quantos fornecedores bastam para somar 80% do gasto — a leitura de Pareto
    // em uma frase.
    const idx = comSpend.findIndex(l => l.acumulado >= 80);
    return {
      data: comSpend.slice(0, top).map(l => ({
        // Nome longo de fornecedor não cabe no eixo; o tooltip traz o completo.
        curto: l.fornecedor.length > 18 ? `${l.fornecedor.slice(0, 17)}…` : l.fornecedor,
        fornecedor: l.fornecedor,
        spend: l.spend,
        acumulado: l.acumulado,
        participacao: l.participacao,
        itens: l.itens,
        pedidos: l.pedidos,
      })),
      totalSpend: total,
      fornecedoresPara80: idx >= 0 ? idx + 1 : comSpend.length,
    };
  }, [linhas, top]);

  function TooltipConteudo({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <ChartTooltip
        title={row.fornecedor}
        subtitle={`${formatInt(row.itens)} itens em ${formatInt(row.pedidos)} pedidos`}
        rows={[
          { color: c.tokens.series[0], label: 'Spend', value: formatBRLCompacto(row.spend) },
          { label: 'Participação', value: formatPct(row.participacao) },
          { color: c.tokens.series[6], label: 'Acumulado', value: formatPct(row.acumulado) },
        ]}
      />
    );
  }

  return (
    <ChartCard
      title="Concentração do Spend"
      icon={PieChart}
      description={
        totalSpend > 0
          ? `${formatBRLCompacto(totalSpend)} no período — ${formatInt(fornecedoresPara80)} fornecedor(es) concentram 80% do gasto`
          : 'Participação de cada fornecedor no gasto e curva acumulada.'
      }
      height={320}
      // Top N fornecedores (padrão 12) com rótulo rotacionado a -35°: rótulos
      // longos precisam de mais espaço horizontal por categoria do que uma
      // barra simples, e `top` pode crescer via prop.
      minPlotWidth={estimateCategoryChartWidth(data.length, 56, 480)}
      loading={loading}
      empty={data.length === 0}
      emptyMessage="Nenhum pedido com valor no filtro selecionado."
    >
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 48 }}>
          <CartesianGrid {...c.grid} />
          <XAxis
            dataKey="curto"
            {...c.xAxis}
            angle={-35}
            textAnchor="end"
            interval={0}
            height={60}
            tick={{ ...c.xAxis.tick, fontSize: 10 }}
          />
          <YAxis yAxisId="valor" {...c.yAxis} width={64} tickFormatter={(v: number) => formatBRLCompacto(v)} />
          <YAxis
            yAxisId="pct"
            orientation="right"
            domain={[0, 100]}
            {...c.yAxis}
            width={40}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip content={<TooltipConteudo />} cursor={c.cursor} />
          {/* Marca dos 80%: o ponto onde a curva cruza é a resposta visual. */}
          <ReferenceLine
            yAxisId="pct"
            y={80}
            stroke={c.tokens.inkMuted}
            strokeDasharray="4 4"
            label={{ value: '80%', position: 'right', fontSize: 10, fill: c.tokens.inkMuted }}
          />
          <Bar
            yAxisId="valor"
            dataKey="spend"
            fill={c.tokens.series[0]}
            radius={c.radius.top}
            maxBarSize={44}
            cursor={onSelecionar ? 'pointer' : undefined}
            onClick={(d: any) => onSelecionar?.(d?.fornecedor)}
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
