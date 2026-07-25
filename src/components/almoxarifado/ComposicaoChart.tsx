/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Agregado, formatBRL } from '../../lib/almoxarifado';

interface ComposicaoChartProps {
  porTipo: Agregado[];
  porClasse: Agregado[];
  onSelecionarTipo?: (tipo: string) => void;
  onSelecionarClasse?: (classe: string) => void;
}

const CORES = ['#059669', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#94a3b8'];

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Agregado;
  return (
    <div style={{ borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', padding: '8px 10px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{row.chave}</div>
      <div style={{ color: '#0f172a' }}>{formatBRL(row.valor)}</div>
      <div style={{ color: '#475569' }}>{row.itens.toLocaleString('pt-BR')} itens · {row.materiais.toLocaleString('pt-BR')} materiais</div>
    </div>
  );
}

function Rosca({ titulo, dados, onSelecionar }: { titulo: string; dados: Agregado[]; onSelecionar?: (chave: string) => void }) {
  const total = dados.reduce((a, d) => a + d.valor, 0);
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center">{titulo}</p>
      {total <= 0 ? (
        <div className="flex items-center justify-center h-56 text-sm text-slate-400 dark:text-slate-500">Sem dados.</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={dados}
              dataKey="valor"
              nameKey="chave"
              innerRadius={52}
              outerRadius={82}
              paddingAngle={2}
              cursor={onSelecionar ? 'pointer' : undefined}
              onClick={(d: any) => onSelecionar?.(d?.payload?.chave)}
            >
              {dados.map((d, i) => <Cell key={d.chave} fill={CORES[i % CORES.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default function ComposicaoChart({ porTipo, porClasse, onSelecionarTipo, onSelecionarClasse }: ComposicaoChartProps) {
  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Composição do Valor</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          Natureza do material e classificação contábil do item. Clique numa fatia para ver os itens.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Rosca titulo="Por tipo de material" dados={porTipo} onSelecionar={onSelecionarTipo} />
        <Rosca titulo="Por classe de item" dados={porClasse} onSelecionar={onSelecionarClasse} />
      </div>
    </div>
  );
}
