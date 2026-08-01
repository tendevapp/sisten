/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer } from 'recharts';
import { Building2 } from 'lucide-react';
import { EnrichedSAPRecord } from '../../types';
import { classifyTipoDemanda, demandaColor } from '../../lib/demandas';
import { formatInt } from '../../lib/format';
import { useChartConfig } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface AreaSolicitanteChartProps {
  records: EnrichedSAPRecord[];
  loading?: boolean;
  /** Drill-down: área solicitante da barra clicada. */
  onSelecionar?: (area: string) => void;
}

const TOP_N = 10;

export default function AreaSolicitanteChart({ records, loading, onSelecionar }: AreaSolicitanteChartProps) {
  const c = useChartConfig();
  const corMaterial = demandaColor(c.tokens, 'material');
  const corServico = demandaColor(c.tokens, 'servico');

  const data = useMemo(() => {
    const byArea = new Map<string, { area: string; material: number; servico: number }>();
    records.forEach(r => {
      const area = (r as any).area_solicitante?.trim() || 'Não informada';
      const tipo = classifyTipoDemanda(r.requisicao_de_compra);
      if (tipo === 'outro') return;
      if (!byArea.has(area)) byArea.set(area, { area, material: 0, servico: 0 });
      byArea.get(area)![tipo] += 1;
    });
    return Array.from(byArea.values())
      .map(v => ({ ...v, total: v.material + v.servico }))
      .sort((a, b) => b.total - a.total)
      .slice(0, TOP_N)
      .reverse(); // maior no topo em barra horizontal
  }, [records]);

  function TooltipConteudo({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <ChartTooltip
        title={row.area}
        subtitle={`${formatInt(row.total)} requisições`}
        rows={[
          { label: 'Materiais', value: formatInt(row.material), color: corMaterial },
          { label: 'Serviços', value: formatInt(row.servico), color: corServico },
        ]}
      />
    );
  }

  return (
    <ChartCard
      title="Volume por Área Solicitante"
      icon={Building2}
      description={`Top ${TOP_N} áreas por requisições de materiais e serviços`}
      height={280}
      loading={loading}
      empty={data.length === 0}
      emptyMessage="Nenhuma demanda no período/filtro selecionado."
    >
      <ResponsiveContainer width="100%" height={Math.max(280, data.length * 34)}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 32, left: 8, bottom: 0 }}>
          <CartesianGrid {...c.grid} vertical horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...c.yAxis} axisLine={{ stroke: c.tokens.axis }} />
          <YAxis
            type="category"
            dataKey="area"
            tick={{ fontSize: 11, fill: c.tokens.labelStrong }}
            axisLine={false}
            tickLine={false}
            width={140}
          />
          <Tooltip content={<TooltipConteudo />} cursor={c.cursor} />
          <Legend {...c.legend} />
          {/* O vão de 2px entre os dois segmentos é a superfície aparecendo —
              separa as cores sem precisar de contorno. */}
          <Bar
            dataKey="material"
            name="Materiais"
            stackId="a"
            fill={corMaterial}
            barSize={18}
            stroke={c.tokens.surface}
            strokeWidth={c.stackGap}
            cursor={onSelecionar ? 'pointer' : undefined}
            onClick={(d: any) => onSelecionar?.(d?.area)}
            {...c.animation}
          />
          <Bar
            dataKey="servico"
            name="Serviços"
            stackId="a"
            fill={corServico}
            radius={c.radius.right}
            barSize={18}
            stroke={c.tokens.surface}
            strokeWidth={c.stackGap}
            cursor={onSelecionar ? 'pointer' : undefined}
            onClick={(d: any) => onSelecionar?.(d?.area)}
            {...c.animation}
          >
            <LabelList
              dataKey="total"
              position="right"
              formatter={formatInt}
              style={{ ...c.labelOnSurface, fontSize: 10 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
