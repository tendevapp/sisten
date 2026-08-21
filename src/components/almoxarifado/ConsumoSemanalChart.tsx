/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Perfil semanal de consumo e entrada de um material.
 *
 * Duas séries num eixo só, de propósito: consumo e entrada estão na mesma
 * unidade de medida, então compartilham escala e a comparação é legítima. Um
 * segundo eixo (para valor, ou para saldo acumulado) inventaria correlação —
 * o alinhamento entre duas escalas é arbitrário. O saldo acumulado fica no
 * tooltip e na tabela, não numa segunda escala.
 *
 * Semanas sem movimento entram como zero. Omiti-las comprimiria o eixo e faria
 * saídas espalhadas por meses parecerem semanas consecutivas de consumo — que é
 * exatamente a leitura errada num catálogo de demanda intermitente.
 */

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts';
import { CalendarDays } from 'lucide-react';
import { PontoSemanal, rotuloSemana, intervaloSemana } from '../../lib/consumoSemanal';
import { formatQtd } from '../../lib/almoxarifado';
import { formatInt } from '../../lib/format';
import { useChartConfig, estimateCategoryChartWidth } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface ConsumoSemanalChartProps {
  dados: PontoSemanal[];
  material: string;
  descricao?: string;
  umb?: string;
  /** Semana em que a produção começou, marcada como referência. */
  semanaProducao?: string;
  loading?: boolean;
}

function TooltipConteudo({ active, payload, cores, umb }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as PontoSemanal & { rotulo: string; intervalo: string };
  return (
    <ChartTooltip
      title={p.rotulo}
      // O número da semana sozinho não situa no calendário; o intervalo situa.
      subtitle={p.intervalo}
      rows={[
        { label: 'Consumo', value: `${formatQtd(p.consumo)} ${umb || ''}`, color: cores[0] },
        { label: 'Entrada', value: `${formatQtd(p.entrada)} ${umb || ''}`, color: cores[1] },
        { label: 'Saídas registradas', value: formatInt(p.eventosConsumo) },
        { label: 'Saldo acumulado', value: `${formatQtd(p.acumulado)} ${umb || ''}` },
      ]}
      footer={p.consumo === 0 && p.entrada === 0 ? 'Sem movimento nesta semana.' : undefined}
    />
  );
}

export default function ConsumoSemanalChart({
  dados, material, descricao, umb, semanaProducao, loading,
}: ConsumoSemanalChartProps) {
  const c = useChartConfig();
  const cores = [c.tokens.series[0], c.tokens.series[2]];
  const formatados = dados.map(d => ({
    ...d,
    rotulo: rotuloSemana(d.semana),
    intervalo: intervaloSemana(d.semana),
  }));

  // Em 25 semanas todo rótulo cabe; acima disso, um sim outro não, para o
  // eixo não virar uma faixa preta de texto sobreposto.
  const intervalo = formatados.length > 30 ? 1 : 0;

  return (
    <ChartCard
      title={`Consumo semanal — ${material}`}
      icon={CalendarDays}
      description={descricao || 'Consumo e entrada por semana. Semanas sem movimento aparecem como zero.'}
      height={320}
      // Duas barras por semana; um material com longo histórico passa
      // fácil de 30-40 semanas — o intervalo salteado (acima) já reduz a
      // poluição do eixo, mas rolar continua melhor do que barras finas
      // demais para clicar/ler.
      minPlotWidth={estimateCategoryChartWidth(formatados.length, 40, 480)}
      loading={loading}
      empty={dados.length === 0}
      emptyMessage="Selecione um material na lista para ver o perfil semanal."
    >
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={formatados} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barGap={2}>
          <CartesianGrid {...c.grid} />
          <XAxis
            dataKey="rotulo"
            {...c.xAxis}
            tick={{ fontSize: 10, fill: c.tokens.labelStrong, fontWeight: 600 }}
            interval={intervalo}
          />
          <YAxis tickFormatter={(v: number) => formatQtd(v)} {...c.yAxis} width={64} />
          <Tooltip content={<TooltipConteudo cores={cores} umb={umb} />} cursor={c.cursor} />
          <Legend {...c.legend} formatter={(v: string) => (v === 'consumo' ? 'Consumo' : 'Entrada')} />

          {/* Início da produção: antes disso o consumo é comissionamento, não
              demanda — a linha evita comparar os dois regimes sem perceber. */}
          {semanaProducao && (
            <ReferenceLine
              x={rotuloSemana(semanaProducao)}
              stroke={c.tokens.inkMuted}
              strokeWidth={1}
              label={{
                value: 'início da produção',
                position: 'insideTopLeft',
                fontSize: 10,
                fill: c.tokens.inkMuted,
              }}
            />
          )}

          <Bar dataKey="consumo" fill={cores[0]} radius={c.radius.top} maxBarSize={26} {...c.animation} />
          <Bar dataKey="entrada" fill={cores[1]} radius={c.radius.top} maxBarSize={26} {...c.animation} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
