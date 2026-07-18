/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer } from 'recharts';
import { EnrichedSAPRecord } from '../../types';
import { DEMANDA_COLORS, CompradorInfo, resolveComprador } from '../../lib/demandas';

interface CompradorPerformanceChartProps {
  records: EnrichedSAPRecord[];
  compradores: CompradorInfo[];
}

export default function CompradorPerformanceChart({ records, compradores }: CompradorPerformanceChartProps) {
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

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Desempenho por Comprador</h3>
        <p className="text-xs text-slate-400 mt-0.5">Requisições de material atribuídas x pedidos colocados</p>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-sm text-slate-400">
          Nenhuma demanda no período/filtro selecionado.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="comprador" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={36} />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="requisitadas" name="RM Atribuídas" fill={DEMANDA_COLORS.requisitado} radius={[4, 4, 0, 0]} barSize={18}>
              <LabelList dataKey="requisitadas" position="top" style={{ fontSize: 10, fill: '#334155' }} />
            </Bar>
            <Bar dataKey="pedidos" name="Pedidos Colocados" fill={DEMANDA_COLORS.pedido} radius={[4, 4, 0, 0]} barSize={18}>
              <LabelList dataKey="pedidos" position="top" style={{ fontSize: 10, fill: '#334155' }} />
            </Bar>
            <Bar dataKey="aberto" name="Aberto" fill={DEMANDA_COLORS.aberto} radius={[4, 4, 0, 0]} barSize={18}>
              <LabelList dataKey="aberto" position="top" style={{ fontSize: 10, fill: '#334155' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
