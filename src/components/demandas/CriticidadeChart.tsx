/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer } from 'recharts';
import { EnrichedSAPRecord } from '../../types';
import { classifyTipoDemanda, classifyCriticidadeNatureza, CRITICIDADE_LABEL, DEMANDA_COLORS, Criticidade } from '../../lib/demandas';

interface CriticidadeChartProps {
  // Deve receber materiais + serviços (ex.: `filtered`); o próprio gráfico separa
  // por tipo e classifica a criticidade a partir da natureza (serve para ambos).
  records: EnrichedSAPRecord[];
}

const ORDER: Criticidade[] = ['normal', 'urgente', 'maquina_parada'];
const COLOR: Record<Criticidade, string> = {
  normal: DEMANDA_COLORS.normal,
  urgente: DEMANDA_COLORS.urgente,
  maquina_parada: DEMANDA_COLORS.maquinaParada,
};

interface Row {
  tipo: string;
  normal: number;
  urgente: number;
  maquina_parada: number;
  total: number;
}

// Tooltip próprio: com o total carregado numa linha invisível (ver abaixo), o
// tooltip padrão do Recharts mostraria uma linha extra "total" solta no meio
// das criticidades. Aqui organizamos total no topo e cada criticidade abaixo.
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  const rows = ORDER.map(c => ({ color: COLOR[c], label: CRITICIDADE_LABEL[c], value: row[c] }));
  return (
    <div style={{ borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', padding: '8px 10px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{row.tipo} — {row.total} no total</div>
      {rows.map(r => {
        const pct = row.total > 0 ? Math.round((r.value / row.total) * 100) : 0;
        return (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, display: 'inline-block' }} />
            <span style={{ color: '#475569', flex: 1 }}>{r.label}</span>
            <span style={{ fontWeight: 500, color: '#0f172a' }}>{r.value} ({pct}%)</span>
          </div>
        );
      })}
    </div>
  );
}

export default function CriticidadeChart({ records }: CriticidadeChartProps) {
  const { data, total } = useMemo(() => {
    const base: Record<'material' | 'servico', Row> = {
      material: { tipo: 'Materiais', normal: 0, urgente: 0, maquina_parada: 0, total: 0 },
      servico: { tipo: 'Serviços', normal: 0, urgente: 0, maquina_parada: 0, total: 0 },
    };
    let t = 0;
    records.forEach(r => {
      const tipo = classifyTipoDemanda(r.requisicao_de_compra);
      if (tipo !== 'material' && tipo !== 'servico') return;
      const c = classifyCriticidadeNatureza((r as any).natureza);
      if (!c) return;
      base[tipo][c] += 1;
      base[tipo].total += 1;
      t += 1;
    });
    return { data: [base.material, base.servico] as Row[], total: t };
  }, [records]);

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Requisições por Criticidade</h3>
        <p className="text-xs text-slate-400 mt-0.5">Materiais e serviços por natureza (Normal, Urgente, Máquina Parada) — total e composição no mesmo eixo — {total} requisições</p>
      </div>

      {total === 0 ? (
        <div className="flex items-center justify-center h-64 text-sm text-slate-400">
          Nenhuma requisição no período/filtro selecionado.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data} margin={{ top: 28, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="tipo" tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<ChartTooltip />} />
            <Legend
              formatter={(value: string) => CRITICIDADE_LABEL[value as Criticidade]}
              wrapperStyle={{ fontSize: 12 }}
              iconType="circle"
            />
            {ORDER.map((c, i) => (
              <Bar key={c} dataKey={c} stackId="crit" fill={COLOR[c]} maxBarSize={96} radius={i === ORDER.length - 1 ? [4, 4, 0, 0] : undefined}>
                <LabelList dataKey={c} position="center" formatter={(v: number) => (v > 0 ? v : '')} style={{ fontSize: 12, fontWeight: 700, fill: '#fff' }} />
              </Bar>
            ))}
            {/* Linha invisível só para posicionar o rótulo do TOTAL no topo da
                pilha — não depende do último segmento (Máquina Parada) ter valor
                > 0, que era o problema quando esse segmento ficava em zero. */}
            <Line dataKey="total" stroke="transparent" dot={false} activeDot={false} legendType="none" isAnimationActive={false}>
              <LabelList dataKey="total" position="top" formatter={(v: number) => (v > 0 ? v : '')} style={{ fontSize: 13, fontWeight: 700, fill: '#0f172a' }} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
