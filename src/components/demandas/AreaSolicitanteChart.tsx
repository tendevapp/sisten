/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer } from 'recharts';
import { Building2 } from 'lucide-react';
import { EnrichedSAPRecord } from '../../types';
import { classifyCriticidadeNatureza, classifyCriticidade, demandaColor, Criticidade } from '../../lib/demandas';
import { formatInt } from '../../lib/format';
import { useChartConfig } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface AreaSolicitanteChartProps {
  records: EnrichedSAPRecord[];
  loading?: boolean;
  /** Drill-down: área solicitante da barra clicada e criticidade. */
  onSelecionar?: (area: string, criticidade?: Criticidade) => void;
}

const TOP_N = 10;

export default function AreaSolicitanteChart({ records, loading, onSelecionar }: AreaSolicitanteChartProps) {
  const c = useChartConfig();
  const corNormal = demandaColor(c.tokens, 'normal');
  const corUrgente = demandaColor(c.tokens, 'urgente');
  const corMaquinaParada = demandaColor(c.tokens, 'maquinaParada');

  const data = useMemo(() => {
    const byArea = new Map<string, { area: string; normal: number; urgente: number; maquina_parada: number }>();
    records.forEach(r => {
      const area = (r as any).area_solicitante?.trim() || 'Não informada';
      const crit = classifyCriticidadeNatureza((r as any).natureza) || classifyCriticidade(r.requisicao_de_compra) || 'normal';
      if (!byArea.has(area)) byArea.set(area, { area, normal: 0, urgente: 0, maquina_parada: 0 });
      const entry = byArea.get(area)!;
      if (crit === 'urgente') entry.urgente += 1;
      else if (crit === 'maquina_parada') entry.maquina_parada += 1;
      else entry.normal += 1;
    });
    return Array.from(byArea.values())
      .map(v => ({ ...v, total: v.normal + v.urgente + v.maquina_parada }))
      .sort((a, b) => b.total - a.total)
      .slice(0, TOP_N)
      .reverse(); // maior no topo em barra horizontal
  }, [records]);

  const hasMaquinaParada = useMemo(() => data.some(d => d.maquina_parada > 0), [data]);

  function TooltipConteudo({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const rows = [
      { label: 'Normal', value: formatInt(row.normal), color: corNormal },
      { label: 'Urgente', value: formatInt(row.urgente), color: corUrgente },
    ];
    if (row.maquina_parada > 0) {
      rows.push({ label: 'Máquina Parada', value: formatInt(row.maquina_parada), color: corMaquinaParada });
    }
    return (
      <ChartTooltip
        title={row.area}
        subtitle={`${formatInt(row.total)} requisições`}
        rows={rows}
      />
    );
  }

  return (
    <ChartCard
      title="Volume por Área Solicitante"
      icon={Building2}
      description={`Top ${TOP_N} áreas por status da requisição (Normal e Urgente)`}
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
          {/* Segmentos empilhados por status/criticidade */}
          <Bar
            dataKey="normal"
            name="Normal"
            stackId="a"
            fill={corNormal}
            barSize={18}
            stroke={c.tokens.surface}
            strokeWidth={c.stackGap}
            cursor={onSelecionar ? 'pointer' : undefined}
            onClick={(d: any) => onSelecionar?.(d?.area, 'normal')}
            {...c.animation}
          />
          <Bar
            dataKey="urgente"
            name="Urgente"
            stackId="a"
            fill={corUrgente}
            radius={!hasMaquinaParada ? c.radius.right : undefined}
            barSize={18}
            stroke={c.tokens.surface}
            strokeWidth={c.stackGap}
            cursor={onSelecionar ? 'pointer' : undefined}
            onClick={(d: any) => onSelecionar?.(d?.area, 'urgente')}
            {...c.animation}
          >
            {!hasMaquinaParada && (
              <LabelList
                dataKey="total"
                position="right"
                formatter={formatInt}
                style={{ ...c.labelOnSurface, fontSize: 10 }}
              />
            )}
          </Bar>
          {hasMaquinaParada && (
            <Bar
              dataKey="maquina_parada"
              name="Máquina Parada"
              stackId="a"
              fill={corMaquinaParada}
              radius={c.radius.right}
              barSize={18}
              stroke={c.tokens.surface}
              strokeWidth={c.stackGap}
              cursor={onSelecionar ? 'pointer' : undefined}
              onClick={(d: any) => onSelecionar?.(d?.area, 'maquina_parada')}
              {...c.animation}
            >
              <LabelList
                dataKey="total"
                position="right"
                formatter={formatInt}
                style={{ ...c.labelOnSurface, fontSize: 10 }}
              />
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
