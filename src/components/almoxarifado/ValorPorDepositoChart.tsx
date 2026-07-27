/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ResponsiveContainer } from 'recharts';
import { Warehouse } from 'lucide-react';
import { Agregado, formatBRL, formatBRLCompacto, formatQtd } from '../../lib/almoxarifado';
import { formatInt } from '../../lib/format';
import { useChartConfig } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface ValorPorDepositoChartProps {
  dados: Agregado[];
  onSelecionar?: (deposito: string) => void;
  loading?: boolean;
}

function TooltipConteudo({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Agregado;
  return (
    <ChartTooltip
      title={`Depósito ${row.chave}`}
      rows={[
        { label: 'Valor', value: formatBRL(row.valor) },
        { label: 'Itens', value: formatInt(row.itens) },
        { label: 'Materiais', value: formatInt(row.materiais) },
        { label: 'Quantidade', value: formatQtd(row.quantidade) },
      ]}
    />
  );
}

export default function ValorPorDepositoChart({ dados, onSelecionar, loading }: ValorPorDepositoChartProps) {
  const c = useChartConfig();
  const altura = Math.max(240, dados.length * 32 + 40);

  return (
    <ChartCard
      title="Valor por Depósito"
      icon={Warehouse}
      description="Onde o capital está fisicamente parado. Clique num depósito para ver seus itens."
      height={altura}
      loading={loading}
      empty={dados.length === 0}
      emptyMessage="Nenhum item no filtro selecionado."
    >
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 88, left: 8, bottom: 4 }}>
          {/* Barra horizontal: a grade útil é a vertical, então os eixos trocam
              de papel em relação ao padrão. */}
          <CartesianGrid {...c.grid} vertical horizontal={false} />
          <XAxis type="number" tickFormatter={formatBRLCompacto} {...c.yAxis} />
          <YAxis
            type="category"
            dataKey="chave"
            tick={{ fontSize: 11, fill: c.tokens.labelStrong, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip content={<TooltipConteudo />} cursor={c.cursor} />
          {/* Série única, categorias nominais: todas as barras usam o mesmo
              matiz. Colorir cada depósito gastaria o canal de identidade
              recodificando o que o comprimento da barra já mostra. */}
          <Bar
            dataKey="valor"
            fill={c.tokens.series[0]}
            radius={c.radius.right}
            maxBarSize={22}
            cursor={onSelecionar ? 'pointer' : undefined}
            onClick={(d: any) => onSelecionar?.(d?.payload?.chave)}
            {...c.animation}
          >
            <LabelList
              dataKey="valor"
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
