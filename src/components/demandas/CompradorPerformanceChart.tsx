/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer } from 'recharts';
import { UserCheck } from 'lucide-react';
import { EnrichedSAPRecord } from '../../types';
import { demandaColor, CompradorInfo, resolveComprador } from '../../lib/demandas';
import { formatInt, formatPctInt } from '../../lib/format';
import { useChartConfig } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface CompradorPerformanceChartProps {
  records: EnrichedSAPRecord[];
  compradores: CompradorInfo[];
  loading?: boolean;
  /** Drill-down: comprador da barra clicada. */
  onSelecionar?: (comprador: string) => void;
}

export default function CompradorPerformanceChart({ records, compradores, loading, onSelecionar }: CompradorPerformanceChartProps) {
  const c = useChartConfig();
  const corPedido = demandaColor(c.tokens, 'pedido');
  const corAberto = demandaColor(c.tokens, 'aberto');

  const data = useMemo(() => {
    const byBuyer = new Map<string, { comprador: string; requisitadas: number; pedidos: number }>();
    records.forEach(r => {
      const nome = resolveComprador(r, compradores);
      if (!byBuyer.has(nome)) byBuyer.set(nome, { comprador: nome, requisitadas: 0, pedidos: 0 });
      const entry = byBuyer.get(nome)!;
      entry.requisitadas += 1;
      if (r.status_requisicao === 'Processado') entry.pedidos += 1;
    });
    return Array.from(byBuyer.values())
      .map(v => ({ ...v, aberto: v.requisitadas - v.pedidos }))
      .sort((a, b) => b.requisitadas - a.requisitadas);
  }, [records, compradores]);

  function TooltipConteudo({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const conversao = row.requisitadas > 0 ? (row.pedidos / row.requisitadas) * 100 : 0;
    return (
      <ChartTooltip
        title={row.comprador}
        subtitle={`${formatInt(row.requisitadas)} RM atribuídas`}
        rows={[
          { label: 'Pedidos colocados', value: formatInt(row.pedidos), color: corPedido },
          { label: 'Em aberto', value: formatInt(row.aberto), color: corAberto },
        ]}
        footer={`Conversão: ${formatPctInt(conversao)}`}
      />
    );
  }

  return (
    <ChartCard
      title="Desempenho por Comprador"
      icon={UserCheck}
      description="RM atribuídas repartidas entre pedidos já colocados e o que segue em aberto. A altura total da barra é a carga do comprador."
      height={320}
      loading={loading}
      empty={data.length === 0}
      emptyMessage="Nenhuma demanda no período/filtro selecionado."
    >
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid {...c.grid} />
          <XAxis dataKey="comprador" {...c.xAxis} tick={{ ...c.xAxis.tick, fontSize: 11, fontWeight: 500 }} />
          <YAxis allowDecimals={false} {...c.yAxis} width={36} />
          <Tooltip content={<TooltipConteudo />} cursor={c.cursor} />
          <Legend {...c.legend} />
          {/* Empilhado, não agrupado: "RM atribuídas" é a soma de pedidos +
              aberto, então plotar as três lado a lado desenhava o total duas
              vezes e fazia a carga do comprador parecer o dobro. Empilhando, a
              altura total é a carga e os segmentos são a repartição. */}
          <Bar
            dataKey="pedidos"
            name="Pedidos colocados"
            stackId="rm"
            fill={corPedido}
            barSize={26}
            stroke={c.tokens.surface}
            strokeWidth={c.stackGap}
            cursor={onSelecionar ? 'pointer' : undefined}
            onClick={(d: any) => onSelecionar?.(d?.comprador)}
            {...c.animation}
          />
          <Bar
            dataKey="aberto"
            name="Em aberto"
            stackId="rm"
            fill={corAberto}
            radius={c.radius.top}
            barSize={26}
            stroke={c.tokens.surface}
            strokeWidth={c.stackGap}
            cursor={onSelecionar ? 'pointer' : undefined}
            onClick={(d: any) => onSelecionar?.(d?.comprador)}
            {...c.animation}
          >
            {/* Só o total ganha rótulo direto: um número em cada segmento
                transformaria o gráfico numa tabela mal formatada. */}
            <LabelList dataKey="requisitadas" position="top" formatter={formatInt} style={c.labelOnSurface} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
