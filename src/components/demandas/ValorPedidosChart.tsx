/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer,
} from 'recharts';
import { DollarSign } from 'lucide-react';
import { EnrichedSAPRecord } from '../../types';
import { demandaColor, Granularidade, bucketDate, resolveDataCorte } from '../../lib/demandas';
import { temPO } from '../../lib/suprimentos';
import { formatInt, formatBRL, formatBRLCompacto } from '../../lib/format';
import { useChartConfig, estimateCategoryChartWidth } from '../charts/chartDefaults';
import { useTelaEstreita } from '../../lib/useTelaEstreita';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface ValorPedidosChartProps {
  records: EnrichedSAPRecord[];
  granularidade: Granularidade;
  title: string;
  subtitle: string;
  loading?: boolean;
  /** Drill-down: chave do bucket clicado (mesma `key` de `bucketDate`). */
  onSelecionarPeriodo?: (bucketKey: string) => void;
}

interface Bucket {
  key: string;
  label: string;
  rangeLabel?: string;
  /** Soma de `valor_total` dos itens com PO colocado no período. */
  valor: number;
  /** Itens com PO no período (denominador do ticket médio). */
  pedidos: number;
  /** Itens com PO mas sem valor na base — o valor da barra não os cobre. */
  semValor: number;
}

export default function ValorPedidosChart({ records, granularidade, title, subtitle, loading, onSelecionarPeriodo }: ValorPedidosChartProps) {
  const c = useChartConfig();
  const telaEstreita = useTelaEstreita();
  const handleBarClick = (d: any) => onSelecionarPeriodo?.(d?.key);

  const corValor = demandaColor(c.tokens, 'pedido');
  const corAcumulado = demandaColor(c.tokens, 'acumulado');

  const data = useMemo(() => {
    // Mesmo corte do gráfico de quantidades (`resolveDataCorte`), mas somando
    // dinheiro em vez de contar linhas: o item entra no período em que o PO foi
    // colocado. Item sem PO não entra — só existe valor onde existe pedido.
    const buckets = new Map<string, Bucket>();
    records.forEach(r => {
      if (!temPO(r)) return;
      const b = bucketDate(resolveDataCorte(r), granularidade);
      if (!b) return;
      if (!buckets.has(b.key)) buckets.set(b.key, {
        key: b.key, label: b.label, rangeLabel: b.rangeLabel, valor: 0, pedidos: 0, semValor: 0,
      });
      const entry = buckets.get(b.key)!;
      entry.pedidos += 1;
      if (typeof r.valor_total === 'number' && Number.isFinite(r.valor_total)) entry.valor += r.valor_total;
      else entry.semValor += 1;
    });

    let acumulado = 0;
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => {
        acumulado += v.valor;
        return { ...v, acumulado };
      });
  }, [records, granularidade]);

  function TooltipConteudo({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const b = payload[0].payload as Bucket & { acumulado: number };
    const ticket = b.pedidos > b.semValor ? b.valor / (b.pedidos - b.semValor) : 0;
    const rows = [
      { color: corValor, label: 'Valor em pedidos', value: formatBRL(b.valor) },
      { label: 'Pedidos colocados', value: formatInt(b.pedidos), indent: true },
      { label: 'Ticket médio', value: formatBRL(ticket), indent: true },
      ...(b.semValor > 0
        ? [{ label: 'Sem valor na base', value: formatInt(b.semValor), indent: true }]
        : []),
      { color: corAcumulado, label: 'Valor acumulado', value: formatBRL(b.acumulado) },
    ];

    return (
      <ChartTooltip
        title={b.label}
        subtitle={b.rangeLabel}
        rows={rows}
        footer={onSelecionarPeriodo ? 'Clique na barra para ver a composição' : undefined}
      />
    );
  }

  return (
    <ChartCard
      title={title}
      icon={DollarSign}
      description={subtitle}
      height={320}
      // Uma barra por categoria, mas o rótulo é um valor em reais ("R$ 1,2 M"),
      // bem mais largo que um inteiro — daí o mesmo passo do gráfico de itens.
      minPlotWidth={estimateCategoryChartWidth(data.length, 64, 480)}
      scrollToEnd
      loading={loading}
      empty={data.length === 0}
      emptyMessage="Nenhum pedido colocado no período/filtro selecionado."
    >
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid {...c.grid} />
            <XAxis dataKey="label" {...c.xAxis} tick={{ ...c.xAxis.tick, fontSize: 11, fontWeight: 500 }} />
            <YAxis
              yAxisId="left"
              {...c.yAxis}
              width={64}
              tickFormatter={(v: number) => formatBRLCompacto(v)}
              label={{ value: 'Valor no período', angle: -90, position: 'insideLeft', fontSize: 11, fill: c.tokens.inkMuted }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              {...c.yAxis}
              tick={{ fontSize: 11, fill: corAcumulado }}
              width={64}
              tickFormatter={(v: number) => formatBRLCompacto(v)}
              label={{ value: 'Acumulado', angle: 90, position: 'insideRight', fontSize: 11, fill: corAcumulado }}
            />
            {!telaEstreita && <Tooltip content={<TooltipConteudo />} cursor={c.cursor} />}
            <Legend {...c.legend} />
            <Bar
              yAxisId="left" dataKey="valor" name="Valor em pedidos" fill={corValor} radius={c.radius.top} barSize={22}
              cursor={onSelecionarPeriodo ? 'pointer' : undefined}
              onClick={handleBarClick}
              {...c.animation}
            >
              <LabelList dataKey="valor" position="top" formatter={(v: number) => (v > 0 ? formatBRLCompacto(v) : '')} style={{ ...c.labelOnSurface, fontSize: 11 }} />
            </Bar>
            <Line yAxisId="right" dataKey="acumulado" name="Valor acumulado" stroke={corAcumulado} strokeWidth={2} dot={false} {...c.animation} />
          </ComposedChart>
        </ResponsiveContainer>
    </ChartCard>
  );
}
