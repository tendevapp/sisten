/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer } from 'recharts';
import { EnrichedSAPRecord } from '../../types';
import { classifyTipoDemanda, DEMANDA_COLORS } from '../../lib/demandas';

interface AreaSolicitanteChartProps {
  records: EnrichedSAPRecord[];
}

const TOP_N = 10;

export default function AreaSolicitanteChart({ records }: AreaSolicitanteChartProps) {
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

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Volume por Área Solicitante</h3>
        <p className="text-xs text-slate-400 mt-0.5">Top {TOP_N} áreas por requisições de materiais e serviços</p>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-sm text-slate-400">
          Nenhuma demanda no período/filtro selecionado.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(280, data.length * 34)}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
            <YAxis type="category" dataKey="area" tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} tickLine={false} width={140} />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="material" name="Materiais" stackId="a" fill={DEMANDA_COLORS.material} radius={[0, 0, 0, 0]} barSize={18} />
            <Bar dataKey="servico" name="Serviços" stackId="a" fill={DEMANDA_COLORS.servico} radius={[0, 4, 4, 0]} barSize={18}>
              <LabelList dataKey="total" position="right" style={{ fontSize: 10, fontWeight: 600, fill: '#334155' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
