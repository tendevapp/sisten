/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer,
} from 'recharts';
import { EnrichedSAPRecord } from '../../types';
import { DEMANDA_COLORS, Granularidade, bucketDate, resolveDataCorte } from '../../lib/demandas';

export type { Granularidade };

interface RequisitadoVsPedidoChartProps {
  records: EnrichedSAPRecord[];
  granularidade: Granularidade;
  title: string;
  subtitle: string;
}

export default function RequisitadoVsPedidoChart({ records, granularidade, title, subtitle }: RequisitadoVsPedidoChartProps) {
  const data = useMemo(() => {
    // Registro é contado no período do corte (resolveDataCorte): a data do
    // pedido quando já há PO colocado, senão a data de solicitação — assim
    // uma RM antiga que só ganha PO no período filtrado passa a contar nesse
    // período (requisitado + pedido), em vez de reaparecer com a data de
    // solicitação, fora da janela selecionada. Aberto segue o mesmo corte:
    // é a contagem de itens ainda sem pedido colocado naquele período.
    const buckets = new Map<string, { label: string; rangeLabel?: string; requisitado: number; pedido: number; aberto: number }>();
    records.forEach(r => {
      const b = bucketDate(resolveDataCorte(r), granularidade);
      if (!b) return;
      if (!buckets.has(b.key)) buckets.set(b.key, { label: b.label, rangeLabel: b.rangeLabel, requisitado: 0, pedido: 0, aberto: 0 });
      const entry = buckets.get(b.key)!;
      entry.requisitado += 1;
      if (r.status_requisicao === 'Processado') entry.pedido += 1;
      else entry.aberto += 1;
    });

    let acumulado = 0;
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, v]) => {
        acumulado += v.requisitado;
        return { key, ...v, acumulado };
      });
  }, [records, granularidade]);

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{title}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-sm text-slate-400">
          Nenhuma demanda no período/filtro selecionado.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
            <YAxis
              yAxisId="left"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              width={36}
              label={{ value: 'Itens no período', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94a3b8' }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: DEMANDA_COLORS.acumulado }}
              axisLine={false}
              tickLine={false}
              width={44}
              label={{ value: 'Acumulado', angle: 90, position: 'insideRight', fontSize: 11, fill: DEMANDA_COLORS.acumulado }}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              labelStyle={{ fontWeight: 600, color: '#0f172a' }}
              labelFormatter={(label, payload) => {
                const range = payload?.[0]?.payload?.rangeLabel;
                return range ? `${label} (${range})` : label;
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="requisitado" name="Requisitado" fill={DEMANDA_COLORS.requisitado} radius={[4, 4, 0, 0]} barSize={16}>
              <LabelList dataKey="requisitado" position="top" style={{ fontSize: 10, fill: '#334155' }} />
            </Bar>
            <Bar yAxisId="left" dataKey="pedido" name="Pedido Colocado" fill={DEMANDA_COLORS.pedido} radius={[4, 4, 0, 0]} barSize={16}>
              <LabelList dataKey="pedido" position="top" style={{ fontSize: 10, fill: '#334155' }} />
            </Bar>
            <Bar yAxisId="left" dataKey="aberto" name="Aberto" fill={DEMANDA_COLORS.aberto} radius={[4, 4, 0, 0]} barSize={16}>
              <LabelList dataKey="aberto" position="top" style={{ fontSize: 10, fill: '#334155' }} />
            </Bar>
            <Line yAxisId="right" dataKey="acumulado" name="Volume Acumulado" stroke={DEMANDA_COLORS.acumulado} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
