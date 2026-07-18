/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ResponsiveContainer } from 'recharts';
import { EnrichedSAPRecord } from '../../types';
import { classifyCriticidade, CRITICIDADE_LABEL, DEMANDA_COLORS, Criticidade } from '../../lib/demandas';

interface CriticidadeChartProps {
  records: EnrichedSAPRecord[];
}

const ORDER: Criticidade[] = ['normal', 'urgente', 'maquina_parada'];
const COLOR: Record<Criticidade, string> = {
  normal: DEMANDA_COLORS.normal,
  urgente: DEMANDA_COLORS.urgente,
  maquina_parada: DEMANDA_COLORS.maquinaParada,
};

export default function CriticidadeChart({ records }: CriticidadeChartProps) {
  const { data, total } = useMemo(() => {
    const counts: Record<Criticidade, number> = { normal: 0, urgente: 0, maquina_parada: 0 };
    let t = 0;
    records.forEach(r => {
      const c = classifyCriticidade(r.requisicao_de_compra);
      if (!c) return;
      counts[c] += 1;
      t += 1;
    });
    const data = ORDER.map(c => ({
      criticidade: c,
      label: CRITICIDADE_LABEL[c],
      count: counts[c],
      pct: t > 0 ? Math.round((counts[c] / t) * 100) : 0,
    }));
    return { data, total: t };
  }, [records]);

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Requisições por Criticidade</h3>
        <p className="text-xs text-slate-400 mt-0.5">Materiais classificados por natureza (RI 11 Normal, 12 Urgente, 13 Máquina Parada) — {total} requisições</p>
      </div>

      {total === 0 ? (
        <div className="flex items-center justify-center h-64 text-sm text-slate-400">
          Nenhuma requisição de material no período/filtro selecionado.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={36} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              formatter={(value: number, _name, item) => [`${value} (${item.payload.pct}%)`, 'Requisições']}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={64}>
              {data.map(d => <Cell key={d.criticidade} fill={COLOR[d.criticidade]} />)}
              <LabelList dataKey="pct" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 12, fontWeight: 700, fill: '#0f172a' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
