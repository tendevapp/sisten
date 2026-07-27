/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fragmentação de compra: número de pedidos contra ticket médio, por fornecedor.
 *
 * Cada pedido custa o mesmo processo — cotação, aprovação, recebimento,
 * pagamento — independentemente do valor. Por isso o fornecedor no canto
 * inferior direito (muitos pedidos, ticket baixo) é onde há custo
 * administrativo desproporcional ao gasto, e é o candidato natural a contrato
 * guarda-chuva ou pedido consolidado.
 *
 * Dispersão em vez de duas tabelas porque o achado está na *combinação* das
 * duas grandezas: ordenar por número de pedidos mostra quem compra muito,
 * ordenar por ticket mostra quem compra caro, e nenhuma das duas ordens isola
 * o quadrante que interessa.
 */

import React, { useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine, Cell, ResponsiveContainer,
} from 'recharts';
import { Split } from 'lucide-react';
import { Fragmentacao } from '../../lib/historicoAnalytics';
import { formatInt, formatBRLCompacto } from '../../lib/format';
import { useChartConfig } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface FragmentacaoChartProps {
  dados: Fragmentacao[];
  /** Mínimo de pedidos para um fornecedor ser considerado fragmentado. */
  minPedidos?: number;
}

export default function FragmentacaoChart({ dados, minPedidos = 4 }: FragmentacaoChartProps) {
  const c = useChartConfig();

  const { pontos, medianaTicket, candidatos } = useMemo(() => {
    const validos = dados.filter(d => d.pedidos > 0 && d.valor > 0);
    const tickets = validos.map(d => d.ticketMedio).sort((a, b) => a - b);
    // Mediana, não média: um único pedido de milhões desloca a média para um
    // patamar onde quase todo mundo vira "ticket baixo".
    const mediana = tickets.length > 0
      ? tickets.length % 2 === 1
        ? tickets[(tickets.length - 1) / 2]
        : (tickets[tickets.length / 2 - 1] + tickets[tickets.length / 2]) / 2
      : 0;
    const alvo = validos.filter(d => d.pedidos >= minPedidos && d.ticketMedio < mediana);
    return { pontos: validos, medianaTicket: mediana, candidatos: alvo };
  }, [dados, minPedidos]);

  function TooltipConteudo({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as Fragmentacao;
    const alvo = d.pedidos >= minPedidos && d.ticketMedio < medianaTicket;
    return (
      <ChartTooltip
        title={d.fornecedor}
        subtitle={d.uf}
        rows={[
          { label: 'Pedidos', value: formatInt(d.pedidos) },
          { label: 'Itens', value: formatInt(d.itens) },
          { label: 'Ticket médio', value: formatBRLCompacto(d.ticketMedio) },
          { label: 'Gasto total', value: formatBRLCompacto(d.valor) },
        ]}
        footer={alvo ? 'Candidato a consolidação: muitos pedidos de valor baixo' : undefined}
      />
    );
  }

  return (
    <ChartCard
      title="Fragmentação de Compra"
      icon={Split}
      description={
        pontos.length > 0
          ? `${formatInt(candidatos.length)} fornecedor(es) com ${minPedidos}+ pedidos e ticket abaixo da mediana (${formatBRLCompacto(medianaTicket)}) — candidatos a consolidação.`
          : 'Número de pedidos contra valor médio por pedido, por fornecedor.'
      }
      height={340}
      empty={pontos.length === 0}
      emptyMessage="Nenhum fornecedor com pedido no filtro selecionado."
    >
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 12, right: 24, left: 8, bottom: 32 }}>
          <CartesianGrid {...c.grid} vertical />
          <XAxis
            type="number"
            dataKey="pedidos"
            name="Pedidos"
            {...c.xAxis}
            tick={{ ...c.xAxis.tick, fontSize: 11, fontWeight: 400 }}
            label={{ value: 'Pedidos no período', position: 'insideBottom', offset: -18, fontSize: 11, fill: c.tokens.label }}
          />
          <YAxis
            type="number"
            dataKey="ticketMedio"
            name="Ticket médio"
            {...c.yAxis}
            width={70}
            tickFormatter={(v: number) => formatBRLCompacto(v)}
          />
          {/* Área do ponto acompanha o gasto total: sem isso, o fornecedor de
              R$ 5 mil e o de R$ 500 mil viram o mesmo ponto. */}
          <ZAxis type="number" dataKey="valor" range={[40, 520]} name="Gasto" />
          <Tooltip content={<TooltipConteudo />} cursor={{ strokeDasharray: '3 3', stroke: c.tokens.axis }} />
          <ReferenceLine
            y={medianaTicket}
            stroke={c.tokens.inkMuted}
            strokeDasharray="4 4"
            label={{ value: 'ticket mediano', position: 'insideTopRight', fontSize: 10, fill: c.tokens.inkMuted }}
          />
          <ReferenceLine
            x={minPedidos}
            stroke={c.tokens.inkMuted}
            strokeDasharray="4 4"
          />
          <Scatter data={pontos} {...c.animation}>
            {pontos.map(d => {
              const alvo = d.pedidos >= minPedidos && d.ticketMedio < medianaTicket;
              return (
                <Cell
                  key={d.fornecedor}
                  // Status reservado ao quadrante de ação; o resto fica na cor
                  // de série, sem sugerir gravidade onde não há.
                  fill={alvo ? c.tokens.status.warning : c.tokens.series[0]}
                  fillOpacity={alvo ? 0.85 : 0.5}
                />
              );
            })}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
