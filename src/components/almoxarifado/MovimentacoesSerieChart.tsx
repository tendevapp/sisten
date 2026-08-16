/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CalendarRange } from 'lucide-react';
import { SeriePeriodo } from '../../lib/movimentacoes';
import { formatBRL, formatBRLCompacto } from '../../lib/almoxarifado';
import { formatInt } from '../../lib/format';
import { useChartConfig } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface MovimentacoesSerieChartProps {
  dados: SeriePeriodo[];
  loading?: boolean;
}

function mesLabel(mes: string): string {
  const [ano, m] = mes.split('-');
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${nomes[idx]}/${ano.slice(2)}` : mes;
}

function TooltipConteudo({ active, payload, cores }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as SeriePeriodo;
  return (
    <ChartTooltip
      title={mesLabel(row.mes)}
      rows={[
        { label: 'Entradas', value: formatBRL(row.valorEntradas), color: cores[0] },
        { label: 'Saídas', value: formatBRL(row.valorSaidas), color: cores[1] },
        { label: 'Movimentações', value: formatInt(row.qtdMovimentacoes) },
      ]}
    />
  );
}

export default function MovimentacoesSerieChart({ dados, loading }: MovimentacoesSerieChartProps) {
  const c = useChartConfig();
  const dadosFormatados = dados.map(d => ({ ...d, mesLabel: mesLabel(d.mes) }));
  const cores = [c.tokens.series[0], c.tokens.series[2]];

  return (
    <ChartCard
      title="Entradas x Saídas por Mês"
      icon={CalendarRange}
      description="Valor movimentado (moeda interna) por mês de lançamento, separado por entrada e saída."
      height={300}
      loading={loading}
      empty={dados.length === 0}
      emptyMessage="Nenhuma movimentação no filtro selecionado."
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={dadosFormatados} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid {...c.grid} />
          <XAxis dataKey="mesLabel" {...c.xAxis} />
          <YAxis tickFormatter={formatBRLCompacto} {...c.yAxis} />
          <Tooltip content={<TooltipConteudo cores={cores} />} cursor={c.cursor} />
          <Legend {...c.legend} formatter={(v: string) => (v === 'valorEntradas' ? 'Entradas' : 'Saídas')} />
          <Bar dataKey="valorEntradas" fill={cores[0]} radius={c.radius.top} maxBarSize={28} {...c.animation} />
          <Bar dataKey="valorSaidas" fill={cores[1]} radius={c.radius.top} maxBarSize={28} {...c.animation} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
