/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer } from 'recharts';
import { Siren } from 'lucide-react';
import { EnrichedSAPRecord } from '../../types';
import { classifyTipoDemanda, classifyCriticidadeNatureza, CRITICIDADE_LABEL, demandaColor, Criticidade } from '../../lib/demandas';
import { formatInt, formatPctInt } from '../../lib/format';
import { ChartTokens } from '../../lib/chartTokens';
import { useChartConfig } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface CriticidadeChartProps {
  // Deve receber materiais + serviços (ex.: `filtered`); o próprio gráfico separa
  // por tipo e classifica a criticidade a partir da natureza (serve para ambos).
  records: EnrichedSAPRecord[];
  loading?: boolean;
  /** Drill-down: tipo ("Materiais"/"Serviços") e criticidade do segmento clicado. */
  onSelecionar?: (tipo: string, criticidade: Criticidade) => void;
}

const ORDER: Criticidade[] = ['normal', 'urgente', 'maquina_parada'];

// Criticidade significa gravidade, não identidade: usa a escala de *status*
// (bom → crítico), que é reservada e nunca vira "série 4" de outro gráfico. A
// gravidade também aparece no rótulo, nunca só na cor.
function criticidadeColor(tokens: ChartTokens, k: Criticidade): string {
  if (k === 'normal') return demandaColor(tokens, 'normal');
  if (k === 'urgente') return demandaColor(tokens, 'urgente');
  return demandaColor(tokens, 'maquinaParada');
}

interface Row {
  tipo: string;
  normal: number;
  urgente: number;
  maquina_parada: number;
  total: number;
}

export default function CriticidadeChart({ records, loading, onSelecionar }: CriticidadeChartProps) {
  const c = useChartConfig();

  const { data, total } = useMemo(() => {
    const base: Record<'material' | 'servico', Row> = {
      material: { tipo: 'Materiais', normal: 0, urgente: 0, maquina_parada: 0, total: 0 },
      servico: { tipo: 'Serviços', normal: 0, urgente: 0, maquina_parada: 0, total: 0 },
    };
    let t = 0;
    records.forEach(r => {
      const tipo = classifyTipoDemanda(r.requisicao_de_compra);
      if (tipo !== 'material' && tipo !== 'servico') return;
      const k = classifyCriticidadeNatureza((r as any).natureza);
      if (!k) return;
      base[tipo][k] += 1;
      base[tipo].total += 1;
      t += 1;
    });
    return { data: [base.material, base.servico] as Row[], total: t };
  }, [records]);

  // Tooltip próprio: com o total carregado numa linha invisível (ver abaixo), o
  // tooltip padrão do Recharts mostraria uma linha "total" solta no meio das
  // criticidades. Aqui o total vai no topo e as criticidades abaixo.
  function TooltipConteudo({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as Row;
    return (
      <ChartTooltip
        title={row.tipo}
        subtitle={`${formatInt(row.total)} requisições no total`}
        rows={ORDER.map(k => ({
          color: criticidadeColor(c.tokens, k),
          label: CRITICIDADE_LABEL[k],
          value: `${formatInt(row[k])} (${formatPctInt(row.total > 0 ? (row[k] / row.total) * 100 : 0)})`,
        }))}
      />
    );
  }

  return (
    <ChartCard
      title="Requisições por Criticidade"
      icon={Siren}
      description={`Materiais e serviços por natureza (Normal, Urgente, Máquina Parada) — total e composição no mesmo eixo — ${formatInt(total)} requisições`}
      height={300}
      loading={loading}
      empty={total === 0}
      emptyMessage="Nenhuma requisição no período/filtro selecionado."
    >
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 28, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid {...c.grid} />
          <XAxis dataKey="tipo" {...c.xAxis} />
          <YAxis allowDecimals={false} {...c.yAxis} width={36} />
          <Tooltip content={<TooltipConteudo />} cursor={c.cursor} />
          <Legend
            {...c.legend}
            formatter={(value: string) => CRITICIDADE_LABEL[value as Criticidade]}
          />
          {ORDER.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              stackId="crit"
              fill={criticidadeColor(c.tokens, k)}
              maxBarSize={96}
              radius={i === ORDER.length - 1 ? c.radius.top : undefined}
              stroke={c.tokens.surface}
              strokeWidth={c.stackGap}
              cursor={onSelecionar ? 'pointer' : undefined}
              onClick={(d: any) => onSelecionar?.(d?.tipo, k)}
              {...c.animation}
            >
              <LabelList
                dataKey={k}
                position="center"
                formatter={(v: number) => (v > 0 ? formatInt(v) : '')}
                style={c.labelOnMark}
              />
            </Bar>
          ))}
          {/* Linha invisível só para posicionar o rótulo do TOTAL no topo da
              pilha — não depende do último segmento (Máquina Parada) ter valor
              > 0, que era o problema quando esse segmento ficava em zero. */}
          <Line dataKey="total" stroke="transparent" dot={false} activeDot={false} legendType="none" isAnimationActive={false}>
            <LabelList
              dataKey="total"
              position="top"
              formatter={(v: number) => (v > 0 ? formatInt(v) : '')}
              style={{ ...c.labelOnSurface, fontSize: 13 }}
            />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
