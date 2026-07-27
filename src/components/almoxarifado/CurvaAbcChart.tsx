/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell, ResponsiveContainer } from 'recharts';
import { Layers } from 'lucide-react';
import { AbcResumo, ClasseAbc, formatBRL, formatBRLCompacto } from '../../lib/almoxarifado';
import { formatInt, formatPct, formatPctInt } from '../../lib/format';
import { useChartConfig } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface CurvaAbcChartProps {
  resumo: AbcResumo[];
  onSelecionar?: (classe: ClasseAbc) => void;
  loading?: boolean;
}

const DESCRICAO: Record<ClasseAbc, string> = {
  A: 'Alto valor — contagem frequente e negociação',
  B: 'Valor intermediário — controle periódico',
  C: 'Baixo valor — controle simplificado',
};

function TooltipConteudo({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as AbcResumo;
  return (
    <ChartTooltip
      title={`Classe ${row.classe}`}
      subtitle={DESCRICAO[row.classe]}
      rows={[
        { label: 'Valor imobilizado', value: formatBRL(row.valor) },
        { label: 'Participação', value: formatPct(row.pctValor) },
        { label: 'Materiais', value: formatInt(row.materiais) },
      ]}
      footer={`Acumulado até esta classe: ${formatPct(row.pctAcumulado)}`}
    />
  );
}

export default function CurvaAbcChart({ resumo, onSelecionar, loading }: CurvaAbcChartProps) {
  const c = useChartConfig();
  const total = resumo.reduce((a, r) => a + r.valor, 0);

  return (
    <ChartCard
      title="Curva ABC"
      icon={Layers}
      description="Classificação por valor imobilizado acumulado — A até 80%, B até 95%, C o restante. Clique numa classe para ver os itens."
      loading={loading}
      empty={total <= 0}
      emptyMessage="Nenhum item no filtro selecionado."
      footer={
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 stagger">
          {resumo.map(r => (
            <button
              key={r.classe}
              onClick={() => onSelecionar?.(r.classe)}
              className="rounded-lg border p-3 text-left transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 cursor-pointer group focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ borderColor: 'var(--hairline)', outlineColor: c.tokens.abc[r.classe] }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--surface-raised)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-black" style={{ color: 'var(--ink-primary)' }}>
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c.tokens.abc[r.classe] }} aria-hidden="true" />
                  Classe {r.classe}
                </span>
                <span className="text-[10px] font-bold tabular" style={{ color: 'var(--ink-muted)' }}>
                  {formatPct(r.pctValor)} do valor
                </span>
              </div>
              <p className="text-base font-black mt-1.5 tabular" style={{ color: 'var(--ink-primary)' }}>
                {formatInt(r.materiais)} materiais
              </p>
              <p className="text-[11px] tabular" style={{ color: 'var(--ink-secondary)' }}>{formatBRL(r.valor)}</p>
              <p className="text-[10px] mt-1 group-hover:underline" style={{ color: 'var(--ink-muted)' }}>
                {DESCRICAO[r.classe]}
              </p>
            </button>
          ))}
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={resumo} margin={{ top: 28, right: 48, left: 0, bottom: 0 }}>
          <CartesianGrid {...c.grid} />
          <XAxis dataKey="classe" {...c.xAxis} tick={{ ...c.xAxis.tick, fontWeight: 700 }} />
          <YAxis yAxisId="valor" {...c.yAxis} tickFormatter={formatBRLCompacto} width={72} />
          <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} unit="%" {...c.yAxis} width={44} />
          <Tooltip content={<TooltipConteudo />} cursor={c.cursor} />
          <Legend
            {...c.legend}
            formatter={(v: string) => (v === 'valor' ? 'Valor imobilizado' : '% acumulado')}
          />
          <Bar
            yAxisId="valor"
            dataKey="valor"
            // A cor real de cada barra vem das <Cell>, mas a legenda lê o fill
            // da própria <Bar> — sem ele o marcador da legenda saía preto nos
            // dois temas. O passo do meio da rampa representa o conjunto.
            fill={c.tokens.abc.B}
            maxBarSize={96}
            radius={c.radius.top}
            cursor={onSelecionar ? 'pointer' : undefined}
            onClick={(d: any) => onSelecionar?.(d?.payload?.classe)}
            {...c.animation}
          >
            {resumo.map(r => <Cell key={r.classe} fill={c.tokens.abc[r.classe]} />)}
            {/* Rótulo direto: as três classes cabem, e ele é o canal de leitura
                que dispensa o leitor de comparar alturas de barra. */}
            <LabelList
              dataKey="pctValor"
              position="top"
              formatter={(v: number) => (v > 0 ? formatPctInt(v) : '')}
              style={c.labelOnSurface}
            />
          </Bar>
          <Line
            yAxisId="pct"
            dataKey="pctAcumulado"
            stroke={c.tokens.inkPrimary}
            strokeWidth={2}
            dot={{ r: 4, fill: c.tokens.inkPrimary, stroke: c.tokens.surface, strokeWidth: 2 }}
            {...c.animation}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
