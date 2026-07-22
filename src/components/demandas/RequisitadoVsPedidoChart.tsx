/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer,
} from 'recharts';
import { EnrichedSAPRecord } from '../../types';
import { DEMANDA_COLORS, Granularidade, bucketDate, resolveDataCorte, classifyCriticidadeNatureza } from '../../lib/demandas';

export type { Granularidade };

// Pedido em azul (pedido do usuário): neste gráfico o "Requisitado" virou pilha
// por criticidade (Normal em verde), então o verde de "pedido" da paleta
// compartilhada colidiria com o Normal. Azul é local — na tela de Compradores o
// azul segue sendo "RM Atribuídas", por isso não altero DEMANDA_COLORS.pedido.
const PEDIDO_COLOR = DEMANDA_COLORS.requisitado; // blue-600

// Tooltip próprio: o gráfico usa uma linha invisível só para posicionar o rótulo
// do total, que poluiria o tooltip padrão. Aqui montamos as linhas a partir do
// bucket, mostrando o total requisitado, sua composição por criticidade e o
// status (pedido/aberto).
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload as Bucket & { acumulado: number };
  const head = b.rangeLabel ? `${b.label} (${b.rangeLabel})` : b.label;
  const rows: Array<{ color: string; label: string; value: number; bold?: boolean; indent?: boolean }> = [
    { color: '#0f172a', label: 'Requisitado', value: b.requisitado, bold: true },
    { color: DEMANDA_COLORS.normal, label: 'Normal', value: b.crit_normal, indent: true },
    { color: DEMANDA_COLORS.urgente, label: 'Urgente', value: b.crit_urgente, indent: true },
    { color: DEMANDA_COLORS.maquinaParada, label: 'Máquina Parada', value: b.crit_maquina_parada, indent: true },
    { color: '#94a3b8', label: 'Outros', value: b.crit_outros, indent: true },
    { color: PEDIDO_COLOR, label: 'Pedido Colocado', value: b.pedido },
    { color: DEMANDA_COLORS.aberto, label: 'Aberto', value: b.aberto },
    { color: DEMANDA_COLORS.acumulado, label: 'Volume Acumulado', value: b.acumulado },
  ].filter(r => r.value > 0 || r.bold);
  return (
    <div style={{ borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', padding: '8px 10px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{head}</div>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: r.indent ? 12 : 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, display: 'inline-block' }} />
          <span style={{ color: '#475569', flex: 1 }}>{r.label}</span>
          <span style={{ fontWeight: r.bold ? 700 : 500, color: '#0f172a' }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

interface RequisitadoVsPedidoChartProps {
  records: EnrichedSAPRecord[];
  granularidade: Granularidade;
  title: string;
  subtitle: string;
}

interface Bucket {
  key: string;
  label: string;
  rangeLabel?: string;
  requisitado: number;
  pedido: number;
  aberto: number;
  // Composição do requisitado por criticidade (empilhada na barra de requisitado).
  crit_normal: number;
  crit_urgente: number;
  crit_maquina_parada: number;
  crit_outros: number;
}

export default function RequisitadoVsPedidoChart({ records, granularidade, title, subtitle }: RequisitadoVsPedidoChartProps) {
  const { data, hasOutros } = useMemo(() => {
    // Registro é contado no período do corte (resolveDataCorte): a data do
    // pedido quando já há PO colocado, senão a data de solicitação — assim
    // uma RM antiga que só ganha PO no período filtrado passa a contar nesse
    // período (requisitado + pedido), em vez de reaparecer com a data de
    // solicitação, fora da janela selecionada. Aberto segue o mesmo corte:
    // é a contagem de itens ainda sem pedido colocado naquele período.
    const buckets = new Map<string, Bucket>();
    let outros = 0;
    records.forEach(r => {
      const b = bucketDate(resolveDataCorte(r), granularidade);
      if (!b) return;
      if (!buckets.has(b.key)) buckets.set(b.key, {
        key: b.key, label: b.label, rangeLabel: b.rangeLabel,
        requisitado: 0, pedido: 0, aberto: 0,
        crit_normal: 0, crit_urgente: 0, crit_maquina_parada: 0, crit_outros: 0,
      });
      const entry = buckets.get(b.key)!;
      entry.requisitado += 1;
      if (r.status_requisicao === 'Processado') entry.pedido += 1;
      else entry.aberto += 1;
      const c = classifyCriticidadeNatureza((r as any).natureza);
      if (c === 'normal') entry.crit_normal += 1;
      else if (c === 'urgente') entry.crit_urgente += 1;
      else if (c === 'maquina_parada') entry.crit_maquina_parada += 1;
      else { entry.crit_outros += 1; outros += 1; }
    });

    let acumulado = 0;
    const data = Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => {
        acumulado += v.requisitado;
        return { ...v, acumulado };
      });
    return { data, hasOutros: outros > 0 };
  }, [records, granularidade]);

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{title}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      </div>

      {data.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-sm text-slate-400">
          Nenhuma demanda no período/filtro selecionado.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
            <YAxis
              yAxisId="left"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              width={36}
              label={{ value: 'Itens no período', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94a3b8' }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: DEMANDA_COLORS.acumulado }}
              axisLine={false}
              tickLine={false}
              width={44}
              label={{ value: 'Acumulado', angle: 90, position: 'insideRight', fontSize: 11, fill: DEMANDA_COLORS.acumulado }}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {/* Barra de requisitado empilhada por criticidade: a altura total é o
                requisitado do período e os segmentos mostram a composição
                Normal/Urgente/Máquina Parada. O rótulo com o total vai numa linha
                invisível (abaixo), pra ficar sempre no topo da pilha mesmo quando
                o segmento superior (ex.: Máquina Parada) é zero. */}
            <Bar yAxisId="left" dataKey="crit_normal" name="Requisitado · Normal" stackId="req" fill={DEMANDA_COLORS.normal} barSize={18} />
            <Bar yAxisId="left" dataKey="crit_urgente" name="Requisitado · Urgente" stackId="req" fill={DEMANDA_COLORS.urgente} barSize={18} />
            <Bar yAxisId="left" dataKey="crit_maquina_parada" name="Requisitado · Máquina Parada" stackId="req" fill={DEMANDA_COLORS.maquinaParada} barSize={18} radius={[4, 4, 0, 0]} />
            {hasOutros && (
              <Bar yAxisId="left" dataKey="crit_outros" name="Requisitado · Outros" stackId="req" fill="#94a3b8" barSize={18} radius={[4, 4, 0, 0]} />
            )}
            <Bar yAxisId="left" dataKey="pedido" name="Pedido Colocado" fill={PEDIDO_COLOR} radius={[4, 4, 0, 0]} barSize={18}>
              <LabelList dataKey="pedido" position="top" formatter={(v: number) => (v > 0 ? v : '')} style={{ fontSize: 11, fontWeight: 700, fill: PEDIDO_COLOR }} />
            </Bar>
            <Bar yAxisId="left" dataKey="aberto" name="Aberto" fill={DEMANDA_COLORS.aberto} radius={[4, 4, 0, 0]} barSize={18}>
              <LabelList dataKey="aberto" position="top" formatter={(v: number) => (v > 0 ? v : '')} style={{ fontSize: 11, fontWeight: 700, fill: DEMANDA_COLORS.aberto }} />
            </Bar>
            {/* Linha invisível só para carregar o rótulo do TOTAL requisitado no
                topo da pilha. dx desloca o rótulo para cima da barra de requisitado
                (1ª de 3 barras de 18px + 4px de gap → ~-22px do centro do grupo). */}
            <Line yAxisId="left" dataKey="requisitado" stroke="transparent" dot={false} activeDot={false} legendType="none" isAnimationActive={false}>
              <LabelList dataKey="requisitado" position="top" dx={-22} formatter={(v: number) => (v > 0 ? v : '')} style={{ fontSize: 11, fontWeight: 700, fill: '#0f172a' }} />
            </Line>
            <Line yAxisId="right" dataKey="acumulado" name="Volume Acumulado" stroke={DEMANDA_COLORS.acumulado} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
