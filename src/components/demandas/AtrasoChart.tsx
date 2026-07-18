/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ResponsiveContainer } from 'recharts';
import { EnrichedSAPRecord } from '../../types';
import { FAIXA_ATRASO_ORDER, FAIXA_ATRASO_COLOR, CompradorInfo, resolveComprador } from '../../lib/demandas';

interface AtrasoChartProps {
  records: EnrichedSAPRecord[];
  compradores: CompradorInfo[];
}

const TOP_N_COMPRADORES = 8;

function severityColor(atrasoMedio: number): string {
  if (atrasoMedio > 30) return FAIXA_ATRASO_COLOR['Acima 30 dias'];
  if (atrasoMedio > 15) return FAIXA_ATRASO_COLOR['16-30 dias'];
  if (atrasoMedio > 7) return FAIXA_ATRASO_COLOR['8-15 dias'];
  if (atrasoMedio > 0) return FAIXA_ATRASO_COLOR['1-7 dias'];
  return FAIXA_ATRASO_COLOR['Sem Atraso'];
}

export default function AtrasoChart({ records, compradores }: AtrasoChartProps) {
  const backlog = useMemo(() => records.filter(r => r.status_requisicao !== 'Processado'), [records]);

  const faixaData = useMemo(() => {
    const counts = new Map<string, number>(FAIXA_ATRASO_ORDER.map(f => [f, 0]));
    backlog.forEach(r => {
      const f = r.faixa_atraso || 'Sem Atraso';
      counts.set(f, (counts.get(f) || 0) + 1);
    });
    return FAIXA_ATRASO_ORDER.map(f => ({ faixa: f, count: counts.get(f) || 0 }));
  }, [backlog]);

  const compradorData = useMemo(() => {
    const byBuyer = new Map<string, { comprador: string; somaAtraso: number; qtd: number }>();
    backlog.forEach(r => {
      const nome = resolveComprador(r, compradores);
      if (!byBuyer.has(nome)) byBuyer.set(nome, { comprador: nome, somaAtraso: 0, qtd: 0 });
      const entry = byBuyer.get(nome)!;
      entry.somaAtraso += r.atraso_comprador || 0;
      entry.qtd += 1;
    });
    return Array.from(byBuyer.values())
      .map(v => ({ comprador: v.comprador, atrasoMedio: v.qtd > 0 ? Math.round(v.somaAtraso / v.qtd) : 0, qtd: v.qtd }))
      .sort((a, b) => b.atrasoMedio - a.atrasoMedio)
      .slice(0, TOP_N_COMPRADORES)
      .reverse();
  }, [backlog, compradores]);

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Atraso do Backlog (SLA)</h3>
        <p className="text-xs text-slate-400 mt-0.5">Itens ainda sem pedido (Sem PO) — {backlog.length} em aberto no filtro</p>
      </div>

      {backlog.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-sm text-slate-400">
          Nenhum item em aberto no período/filtro selecionado.
        </div>
      ) : (
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Distribuição por faixa de atraso</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={faixaData} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="faixa" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={36}>
                  {faixaData.map(d => <Cell key={d.faixa} fill={FAIXA_ATRASO_COLOR[d.faixa]} />)}
                  <LabelList dataKey="count" position="top" style={{ fontSize: 11, fontWeight: 600, fill: '#0f172a' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Atraso médio por comprador (dias, piores no topo)</p>
            {compradorData.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-sm text-slate-400">Sem dados de comprador.</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(260, compradorData.length * 32)}>
                <BarChart data={compradorData} layout="vertical" margin={{ top: 8, right: 32, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
                  <YAxis type="category" dataKey="comprador" tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} tickLine={false} width={110} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(value: number, _name, item) => [`${value} dias (${item.payload.qtd} itens)`, 'Atraso médio']}
                  />
                  <Bar dataKey="atrasoMedio" radius={[0, 4, 4, 0]} barSize={18}>
                    {compradorData.map(d => <Cell key={d.comprador} fill={severityColor(d.atrasoMedio)} />)}
                    <LabelList dataKey="atrasoMedio" position="right" formatter={(v: number) => `${v}d`} style={{ fontSize: 10, fontWeight: 600, fill: '#0f172a' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
