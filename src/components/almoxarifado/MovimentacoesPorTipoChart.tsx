/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ResponsiveContainer } from 'recharts';
import { ArrowLeftRight } from 'lucide-react';
import { AgregadoMovimentacao } from '../../lib/movimentacoes';
import { formatBRL, formatBRLCompacto } from '../../lib/almoxarifado';
import { formatInt } from '../../lib/format';
import { useChartConfig } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface MovimentacoesPorTipoChartProps {
  dados: AgregadoMovimentacao[];
  onSelecionar?: (chave: string) => void;
  loading?: boolean;
}

function TooltipConteudo({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as AgregadoMovimentacao;
  return (
    <div className="space-y-1">
      <ChartTooltip
        title={row.rotulo || row.chave}
        rows={[
          { label: 'Movimentações', value: formatInt(row.qtdMovimentacoes) },
          { label: 'Entradas', value: formatBRL(row.valorEntradas) },
          { label: 'Saídas', value: formatBRL(row.valorSaidas) },
        ]}
      />
      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-0.5 text-center">
        💡 Clique para filtrar por este tipo
      </p>
    </div>
  );
}

export default function MovimentacoesPorTipoChart({ dados, onSelecionar, loading }: MovimentacoesPorTipoChartProps) {
  const c = useChartConfig();
  const altura = Math.max(240, dados.length * 32 + 40);

  return (
    <ChartCard
      title="Movimentações por Tipo (TMV)"
      icon={ArrowLeftRight}
      description="Top 10 tipos de movimento por valor movimentado (entrada + saída, sem cancelamento de sinal). Clique numa barra para filtrar."
      height={altura}
      loading={loading}
      empty={dados.length === 0}
      emptyMessage="Nenhuma movimentação no filtro selecionado."
    >
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 88, left: 8, bottom: 4 }}>
          <CartesianGrid {...c.grid} vertical horizontal={false} />
          <XAxis type="number" tickFormatter={formatBRLCompacto} {...c.yAxis} />
          <YAxis
            type="category"
            dataKey={(d: AgregadoMovimentacao) => d.rotulo || d.chave}
            tick={{ fontSize: 11, fill: c.tokens.labelStrong, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            width={160}
          />
          <Tooltip content={<TooltipConteudo />} cursor={c.cursor} />
          <Bar
            dataKey="valorAbsoluto"
            fill={c.tokens.series[0]}
            radius={c.radius.right}
            maxBarSize={22}
            cursor={onSelecionar ? 'pointer' : undefined}
            onClick={(d: any) => onSelecionar?.(d?.payload?.chave)}
            {...c.animation}
          >
            <LabelList
              dataKey="valorAbsoluto"
              position="right"
              formatter={formatBRLCompacto}
              style={{ fontSize: 11, fontWeight: 600, fill: c.tokens.inkSecondary }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
