/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell, ResponsiveContainer } from 'recharts';
import { AbcResumo, ClasseAbc, CLASSE_ABC_COR, formatBRL, formatBRLCompacto } from '../../lib/almoxarifado';

interface CurvaAbcChartProps {
  resumo: AbcResumo[];
  onSelecionar?: (classe: ClasseAbc) => void;
}

const DESCRICAO: Record<ClasseAbc, string> = {
  A: 'Alto valor — contagem frequente e negociação',
  B: 'Valor intermediário — controle periódico',
  C: 'Baixo valor — controle simplificado',
};

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as AbcResumo;
  return (
    <div style={{ borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', padding: '8px 10px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Classe {row.classe}</div>
      <div style={{ color: '#475569' }}>{DESCRICAO[row.classe]}</div>
      <div style={{ marginTop: 4, color: '#0f172a' }}>{formatBRL(row.valor)} — {row.pctValor.toFixed(1)}% do valor</div>
      <div style={{ color: '#475569' }}>{row.materiais.toLocaleString('pt-BR')} materiais</div>
      <div style={{ color: '#475569' }}>Acumulado: {row.pctAcumulado.toFixed(1)}%</div>
    </div>
  );
}

export default function CurvaAbcChart({ resumo, onSelecionar }: CurvaAbcChartProps) {
  const total = resumo.reduce((a, r) => a + r.valor, 0);

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Curva ABC</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          Classificação por valor imobilizado acumulado — A até 80%, B até 95%, C o restante. Clique numa classe para ver os itens.
        </p>
      </div>

      {total <= 0 ? (
        <div className="flex items-center justify-center h-64 text-sm text-slate-400 dark:text-slate-500">
          Nenhum item no filtro selecionado.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={resumo} margin={{ top: 28, right: 48, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="classe" tick={{ fontSize: 12, fill: '#334155', fontWeight: 700 }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
              <YAxis yAxisId="valor" tickFormatter={(v: number) => formatBRLCompacto(v)} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={72} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={44} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" formatter={(v: string) => (v === 'valor' ? 'Valor imobilizado' : '% acumulado')} />
              <Bar
                yAxisId="valor"
                dataKey="valor"
                maxBarSize={96}
                radius={[4, 4, 0, 0]}
                cursor={onSelecionar ? 'pointer' : undefined}
                onClick={(d: any) => onSelecionar?.(d?.payload?.classe)}
              >
                {resumo.map(r => <Cell key={r.classe} fill={CLASSE_ABC_COR[r.classe]} />)}
                <LabelList
                  dataKey="pctValor"
                  position="top"
                  formatter={(v: number) => (v > 0 ? `${v.toFixed(0)}%` : '')}
                  style={{ fontSize: 12, fontWeight: 700, fill: '#0f172a' }}
                />
              </Bar>
              <Line yAxisId="pct" dataKey="pctAcumulado" stroke="#0f172a" strokeWidth={2} dot={{ r: 4, fill: '#0f172a' }} />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {resumo.map(r => (
              <button
                key={r.classe}
                onClick={() => onSelecionar?.(r.classe)}
                className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-left hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black" style={{ color: CLASSE_ABC_COR[r.classe] }}>Classe {r.classe}</span>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{r.pctValor.toFixed(1)}% do valor</span>
                </div>
                <p className="text-base font-black text-slate-800 dark:text-slate-100 mt-1">{r.materiais.toLocaleString('pt-BR')} materiais</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatBRL(r.valor)}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 group-hover:underline">{DESCRICAO[r.classe]}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
