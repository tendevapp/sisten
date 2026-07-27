/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ResponsiveContainer } from 'recharts';
import { Timer, AlertTriangle } from 'lucide-react';
import { EnrichedSAPRecord } from '../../types';
import { FAIXA_ATRASO_ORDER, FAIXA_ATRASO_INDEX, CompradorInfo, resolveComprador } from '../../lib/demandas';
import { formatInt } from '../../lib/format';
import { useChartConfig } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface AtrasoChartProps {
  records: EnrichedSAPRecord[];
  compradores: CompradorInfo[];
  loading?: boolean;
}

const TOP_N_COMPRADORES = 8;

/** Posição do atraso médio na mesma rampa ordinal das faixas. */
function faixaDoAtraso(atrasoMedio: number): number {
  if (atrasoMedio > 30) return 4;
  if (atrasoMedio > 15) return 3;
  if (atrasoMedio > 7) return 2;
  if (atrasoMedio > 0) return 1;
  return 0;
}

const FAIXA_LABEL = FAIXA_ATRASO_ORDER;

export default function AtrasoChart({ records, compradores, loading }: AtrasoChartProps) {
  const c = useChartConfig();
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

  const criticos = faixaData.find(f => f.faixa === 'Acima 30 dias')?.count ?? 0;

  function TooltipFaixa({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const pct = backlog.length > 0 ? (row.count / backlog.length) * 100 : 0;
    return (
      <ChartTooltip
        title={row.faixa}
        rows={[
          { label: 'Itens em aberto', value: formatInt(row.count), color: c.tokens.atraso[FAIXA_ATRASO_INDEX[row.faixa]] },
          { label: 'Do backlog', value: `${pct.toFixed(1)}%` },
        ]}
      />
    );
  }

  function TooltipComprador({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <ChartTooltip
        title={row.comprador}
        rows={[
          { label: 'Atraso médio', value: `${formatInt(row.atrasoMedio)} dias`, color: c.tokens.atraso[faixaDoAtraso(row.atrasoMedio)] },
          { label: 'Itens em aberto', value: formatInt(row.qtd) },
        ]}
      />
    );
  }

  return (
    <ChartCard
      title="Atraso do Backlog (SLA)"
      icon={Timer}
      description={`Itens ainda sem pedido (Sem PO) — ${formatInt(backlog.length)} em aberto no filtro`}
      loading={loading}
      empty={backlog.length === 0}
      emptyMessage="Nenhum item em aberto no período/filtro selecionado."
      actions={
        criticos > 0 ? (
          // A gravidade não fica só na cor da barra: sai também como número,
          // com ícone e rótulo, no topo do painel.
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{
              background: 'color-mix(in srgb, var(--status-critical) 12%, transparent)',
              color: 'var(--ink-primary)',
            }}
          >
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: 'var(--status-critical)' }} aria-hidden="true" />
            {formatInt(criticos)} acima de 30 dias
          </span>
        ) : undefined
      }
    >
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-secondary)' }}>
            Distribuição por faixa de atraso
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={faixaData} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...c.grid} />
              <XAxis dataKey="faixa" {...c.xAxis} tick={{ ...c.xAxis.tick, fontSize: 10, fontWeight: 500 }} />
              <YAxis allowDecimals={false} {...c.yAxis} width={30} />
              <Tooltip content={<TooltipFaixa />} cursor={c.cursor} />
              {/* Rampa ordinal: a faixa mais grave é o passo mais forte, então a
                  ordem das faixas se lê na própria cor. */}
              <Bar dataKey="count" radius={c.radius.top} barSize={36} {...c.animation}>
                {faixaData.map(d => (
                  <Cell key={d.faixa} fill={c.tokens.atraso[FAIXA_ATRASO_INDEX[d.faixa]]} />
                ))}
                <LabelList dataKey="count" position="top" formatter={formatInt} style={c.labelOnSurface} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-secondary)' }}>
            Atraso médio por comprador (dias, piores no topo)
          </p>
          {compradorData.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-sm" style={{ color: 'var(--ink-muted)' }}>
              Sem dados de comprador.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(260, compradorData.length * 32)}>
              <BarChart data={compradorData} layout="vertical" margin={{ top: 8, right: 32, left: 8, bottom: 0 }}>
                <CartesianGrid {...c.grid} vertical horizontal={false} />
                <XAxis type="number" allowDecimals={false} {...c.yAxis} axisLine={{ stroke: c.tokens.axis }} />
                <YAxis
                  type="category"
                  dataKey="comprador"
                  tick={{ fontSize: 11, fill: c.tokens.labelStrong }}
                  axisLine={false}
                  tickLine={false}
                  width={110}
                />
                <Tooltip content={<TooltipComprador />} cursor={c.cursor} />
                <Bar dataKey="atrasoMedio" radius={c.radius.right} barSize={18} {...c.animation}>
                  {compradorData.map(d => (
                    <Cell key={d.comprador} fill={c.tokens.atraso[faixaDoAtraso(d.atrasoMedio)]} />
                  ))}
                  <LabelList
                    dataKey="atrasoMedio"
                    position="right"
                    formatter={(v: number) => `${v}d`}
                    style={{ ...c.labelOnSurface, fontSize: 10 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* A rampa precisa de chave de leitura: sem ela o tom sozinho não diz qual
          faixa é qual. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
        {FAIXA_LABEL.map(f => (
          <span key={f} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
            <span
              className="h-2.5 w-2.5 rounded-[3px]"
              style={{ background: c.tokens.atraso[FAIXA_ATRASO_INDEX[f]] }}
              aria-hidden="true"
            />
            {f}
          </span>
        ))}
      </div>
    </ChartCard>
  );
}
