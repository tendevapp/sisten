/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ResponsiveContainer } from 'recharts';
import { Agregado, formatBRL, formatBRLCompacto, formatQtd } from '../../lib/almoxarifado';

interface ValorPorDepositoChartProps {
  dados: Agregado[];
  onSelecionar?: (deposito: string) => void;
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Agregado;
  return (
    <div style={{ borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', padding: '8px 10px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Depósito {row.chave}</div>
      <div style={{ color: '#0f172a' }}>{formatBRL(row.valor)}</div>
      <div style={{ color: '#475569' }}>{row.itens.toLocaleString('pt-BR')} itens · {row.materiais.toLocaleString('pt-BR')} materiais</div>
      <div style={{ color: '#475569' }}>Quantidade: {formatQtd(row.quantidade)}</div>
    </div>
  );
}

export default function ValorPorDepositoChart({ dados, onSelecionar }: ValorPorDepositoChartProps) {
  const altura = Math.max(240, dados.length * 32 + 40);

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Valor por Depósito</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          Onde o capital está fisicamente parado. Clique num depósito para ver seus itens.
        </p>
      </div>

      {dados.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-slate-400 dark:text-slate-500">
          Nenhum item no filtro selecionado.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={altura}>
          <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 88, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" tickFormatter={(v: number) => formatBRLCompacto(v)} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="chave" tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} axisLine={false} tickLine={false} width={56} />
            <Tooltip content={<ChartTooltip />} />
            <Bar
              dataKey="valor"
              fill="#059669"
              radius={[0, 4, 4, 0]}
              maxBarSize={22}
              cursor={onSelecionar ? 'pointer' : undefined}
              onClick={(d: any) => onSelecionar?.(d?.payload?.chave)}
            >
              <LabelList
                dataKey="valor"
                position="right"
                formatter={(v: number) => formatBRLCompacto(v)}
                style={{ fontSize: 11, fontWeight: 600, fill: '#475569' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
