/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Distribuição do valor em estoque por faixa de idade das camadas FIFO.
 *
 * A faixa "anterior à reabertura" usa tinta neutra, não o próximo passo da
 * rampa de idade: ela não é "mais velha que 180 dias" na mesma escala — é uma
 * medida de natureza diferente (piso conhecido, topo desconhecido). Pintá-la
 * como continuação da rampa sugeriria uma precisão que o dado não tem.
 */

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ResponsiveContainer } from 'recharts';
import { Hourglass } from 'lucide-react';
import { ResumoIdade, NOTA_LEGADO } from '../../lib/giroEstoque';
import { formatBRL, formatBRLCompacto, formatQtd } from '../../lib/almoxarifado';
import { formatInt } from '../../lib/format';
import { useChartConfig } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface IdadeEstoqueChartProps {
  dados: ResumoIdade[];
  onSelecionar?: (faixa: string) => void;
  loading?: boolean;
}

function TooltipConteudo({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as ResumoIdade;
  return (
    <ChartTooltip
      title={row.rotulo}
      rows={[
        { label: 'Valor em estoque', value: formatBRL(row.valor) },
        { label: 'Materiais', value: formatInt(row.materiais) },
        { label: 'Quantidade', value: formatQtd(row.quantidade) },
      ]}
      footer={row.legado ? NOTA_LEGADO : undefined}
    />
  );
}

export default function IdadeEstoqueChart({ dados, onSelecionar, loading }: IdadeEstoqueChartProps) {
  const c = useChartConfig();
  const comValor = dados.filter(d => d.valor > 0 || d.camadas > 0);

  return (
    <ChartCard
      title="Idade do Estoque"
      icon={Hourglass}
      description="Valor parado por tempo de permanência da camada de entrada. A última faixa é o saldo que atravessou a parada da fábrica."
      height={300}
      loading={loading}
      empty={comValor.length === 0}
      emptyMessage="Nenhuma camada com saldo no filtro selecionado."
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={dados} margin={{ top: 16, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid {...c.grid} />
          <XAxis dataKey="rotulo" {...c.xAxis} tick={{ fontSize: 10, fill: c.tokens.labelStrong, fontWeight: 600 }} />
          <YAxis tickFormatter={formatBRLCompacto} {...c.yAxis} />
          <Tooltip content={<TooltipConteudo />} cursor={c.cursor} />
          <Bar
            dataKey="valor"
            radius={c.radius.top}
            maxBarSize={64}
            cursor={onSelecionar ? 'pointer' : undefined}
            onClick={(d: any) => onSelecionar?.(d?.payload?.faixa)}
            {...c.animation}
          >
            {dados.map(d => (
              <Cell
                key={d.faixa}
                // Rampa de um matiz para as faixas medidas; o legado é neutro
                // porque não pertence à mesma escala.
                fill={d.legado ? c.tokens.inkMuted : c.tokens.series[0]}
                fillOpacity={d.legado ? 1 : 0.45 + 0.55 * (['0-30', '31-60', '61-90', '91-180', '180+'].indexOf(d.faixa) / 4)}
              />
            ))}
            <LabelList
              dataKey="valor"
              position="top"
              formatter={(v: number) => (v > 0 ? formatBRLCompacto(v) : '')}
              style={{ fontSize: 11, fontWeight: 700, fill: c.tokens.value }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
