/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { EnrichedSAPRecord } from '../../types';
import { demandaColor, Granularidade, bucketDate, resolveDataCorte, classifyCriticidadeNatureza } from '../../lib/demandas';
import { formatInt } from '../../lib/format';
import { useChartConfig, estimateCategoryChartWidth } from '../charts/chartDefaults';
import { useTelaEstreita } from '../../lib/useTelaEstreita';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

export type { Granularidade };

interface RequisitadoVsPedidoChartProps {
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
  requisitado: number;
  pedido: number;
  aberto: number;
  // Composição do requisitado por criticidade (empilhada na barra de requisitado).
  crit_normal: number;
  crit_urgente: number;
  crit_maquina_parada: number;
  crit_outros: number;
}

export default function RequisitadoVsPedidoChart({ records, granularidade, title, subtitle, loading, onSelecionarPeriodo }: RequisitadoVsPedidoChartProps) {
  const c = useChartConfig();
  // No celular o balão de detalhes cobre metade do gráfico e some ao soltar o
  // dedo — o toque abre o drill-down, que já mostra a composição.
  const telaEstreita = useTelaEstreita();
  const handleBarClick = (d: any) => onSelecionarPeriodo?.(d?.key);

  // "Pedido Colocado" toma o slot 1 aqui porque a pilha de Requisitado usa a
  // escala de status (Normal em verde) — reaproveitar o verde de pedido faria
  // duas coisas diferentes terem a mesma cor no mesmo gráfico.
  const corPedido = demandaColor(c.tokens, 'requisitado');
  const corAberto = demandaColor(c.tokens, 'aberto');
  const corAcumulado = demandaColor(c.tokens, 'acumulado');

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

  // Tooltip próprio: o gráfico usa uma linha invisível só para posicionar o
  // rótulo do total, que poluiria o tooltip padrão. Aqui as linhas são montadas
  // a partir do bucket — total requisitado, composição por criticidade, status.
  function TooltipConteudo({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const b = payload[0].payload as Bucket & { acumulado: number };
    const rows = [
      { label: 'Requisitado', value: b.requisitado, always: true },
      { color: demandaColor(c.tokens, 'normal'), label: 'Normal', value: b.crit_normal, indent: true },
      { color: demandaColor(c.tokens, 'urgente'), label: 'Urgente', value: b.crit_urgente, indent: true },
      { color: demandaColor(c.tokens, 'maquinaParada'), label: 'Máquina Parada', value: b.crit_maquina_parada, indent: true },
      { color: c.tokens.inkMuted, label: 'Outros', value: b.crit_outros, indent: true },
      { color: corPedido, label: 'Pedido colocado', value: b.pedido },
      { color: corAberto, label: 'Aberto', value: b.aberto },
      { color: corAcumulado, label: 'Volume acumulado', value: b.acumulado },
    ].filter(r => r.value > 0 || (r as any).always);

    return (
      <ChartTooltip
        title={b.label}
        subtitle={b.rangeLabel}
        rows={rows.map(r => ({
          color: (r as any).color,
          label: r.label,
          value: formatInt(r.value),
          indent: (r as any).indent,
        }))}
        footer={onSelecionarPeriodo ? 'Clique na barra para ver a composição' : undefined}
      />
    );
  }

  return (
    <ChartCard
      title={title}
      icon={TrendingUp}
      description={subtitle}
      height={320}
      // Três barras por categoria (requisitado empilhado, pedido, aberto)
      // mais os rótulos numéricos no topo de cada uma: abaixo de ~64px por
      // categoria os números começam a se sobrepor. Uma série semanal de um
      // período longo passa fácil de 30 categorias — melhor rolar do que
      // espremer até ilegível.
      minPlotWidth={estimateCategoryChartWidth(data.length, 64, 480)}
      scrollToEnd
      loading={loading}
      empty={data.length === 0}
      emptyMessage="Nenhuma demanda no período/filtro selecionado."
    >
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid {...c.grid} />
            <XAxis dataKey="label" {...c.xAxis} tick={{ ...c.xAxis.tick, fontSize: 11, fontWeight: 500 }} />
            <YAxis
              yAxisId="left"
              allowDecimals={false}
              {...c.yAxis}
              width={36}
              label={{ value: 'Itens no período', angle: -90, position: 'insideLeft', fontSize: 11, fill: c.tokens.inkMuted }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              allowDecimals={false}
              {...c.yAxis}
              tick={{ fontSize: 11, fill: corAcumulado }}
              width={44}
              label={{ value: 'Acumulado', angle: 90, position: 'insideRight', fontSize: 11, fill: corAcumulado }}
            />
            {!telaEstreita && <Tooltip content={<TooltipConteudo />} cursor={c.cursor} />}
            <Legend {...c.legend} />
            {/* Barra de requisitado empilhada por criticidade: a altura total é o
                requisitado do período e os segmentos mostram a composição
                Normal/Urgente/Máquina Parada. O rótulo com o total vai numa linha
                invisível (abaixo), pra ficar sempre no topo da pilha mesmo quando
                o segmento superior (ex.: Máquina Parada) é zero. */}
            <Bar yAxisId="left" dataKey="crit_normal" name="Requisitado · Normal" stackId="req" fill={demandaColor(c.tokens, 'normal')} barSize={18} stroke={c.tokens.surface} strokeWidth={c.stackGap} cursor={onSelecionarPeriodo ? 'pointer' : undefined} onClick={handleBarClick} {...c.animation} />
            <Bar yAxisId="left" dataKey="crit_urgente" name="Requisitado · Urgente" stackId="req" fill={demandaColor(c.tokens, 'urgente')} barSize={18} stroke={c.tokens.surface} strokeWidth={c.stackGap} cursor={onSelecionarPeriodo ? 'pointer' : undefined} onClick={handleBarClick} {...c.animation} />
            <Bar yAxisId="left" dataKey="crit_maquina_parada" name="Requisitado · Máquina Parada" stackId="req" fill={demandaColor(c.tokens, 'maquinaParada')} barSize={18} radius={c.radius.top} stroke={c.tokens.surface} strokeWidth={c.stackGap} cursor={onSelecionarPeriodo ? 'pointer' : undefined} onClick={handleBarClick} {...c.animation} />
            {hasOutros && (
              <Bar yAxisId="left" dataKey="crit_outros" name="Requisitado · Outros" stackId="req" fill={c.tokens.inkMuted} barSize={18} radius={c.radius.top} stroke={c.tokens.surface} strokeWidth={c.stackGap} cursor={onSelecionarPeriodo ? 'pointer' : undefined} onClick={handleBarClick} {...c.animation} />
            )}
            {/* Rótulo direto no topo de pedido e aberto, em tinta de texto: o
                número herdava a cor da série e ficava ilegível justamente nos
                tons mais claros. A identidade fica na barra, não no número. */}
            <Bar
              yAxisId="left" dataKey="pedido" name="Pedido colocado" fill={corPedido} radius={c.radius.top} barSize={18}
              cursor={onSelecionarPeriodo ? 'pointer' : undefined}
              onClick={handleBarClick}
              {...c.animation}
            >
              <LabelList dataKey="pedido" position="top" formatter={(v: number) => (v > 0 ? formatInt(v) : '')} style={{ ...c.labelOnSurface, fontSize: 11 }} />
            </Bar>
            <Bar
              yAxisId="left" dataKey="aberto" name="Aberto" fill={corAberto} radius={c.radius.top} barSize={18}
              cursor={onSelecionarPeriodo ? 'pointer' : undefined}
              onClick={handleBarClick}
              {...c.animation}
            >
              <LabelList dataKey="aberto" position="top" formatter={(v: number) => (v > 0 ? formatInt(v) : '')} style={{ ...c.labelOnSurface, fontSize: 11 }} />
            </Bar>
            {/* Linha invisível só para carregar o rótulo do TOTAL requisitado no
                topo da pilha. dx desloca o rótulo para cima da barra de requisitado
                (1ª de 3 barras de 18px + 4px de gap → ~-22px do centro do grupo). */}
            <Line yAxisId="left" dataKey="requisitado" stroke="transparent" dot={false} activeDot={false} legendType="none" isAnimationActive={false}>
              <LabelList dataKey="requisitado" position="top" dx={-22} formatter={(v: number) => (v > 0 ? formatInt(v) : '')} style={{ ...c.labelOnSurface, fontSize: 11 }} />
            </Line>
            <Line yAxisId="right" dataKey="acumulado" name="Volume acumulado" stroke={corAcumulado} strokeWidth={2} dot={false} {...c.animation} />
          </ComposedChart>
        </ResponsiveContainer>
    </ChartCard>
  );
}
