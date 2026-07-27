/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Distribuição etária da carteira aberta.
 *
 * O KPI de aging médio esconde a forma da carteira: 20 dias de média tanto
 * pode ser tudo concentrado em 20 quanto metade em 3 e metade em 40 — e as
 * duas situações pedem ações opostas. Aqui a distribuição aparece inteira.
 *
 * Barra horizontal porque os rótulos de faixa são texto e caberiam mal girados
 * no eixo x, e rampa ordinal de um matiz só porque as faixas têm ordem: o
 * leitor vê a gravidade crescer na própria cor, sem gastar cinco matizes numa
 * dimensão só.
 */

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ResponsiveContainer } from 'recharts';
import { Hourglass } from 'lucide-react';
import { EnrichedSAPRecord } from '../../types';
import { calcAging, DIAS_CRITICO } from '../../lib/suprimentos';
import { formatInt, formatPctInt } from '../../lib/format';
import { useChartConfig } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface AgingCarteiraChartProps {
  records: EnrichedSAPRecord[];
  /** Drill-down para o painel filtrado pela faixa clicada. */
  onSelecionarFaixa?: (rotulo: string) => void;
  loading?: boolean;
}

export default function AgingCarteiraChart({ records, onSelecionarFaixa, loading }: AgingCarteiraChartProps) {
  const c = useChartConfig();

  const { data, totalAbertos, envelhecidos } = useMemo(() => {
    const faixas = calcAging(records);
    const total = faixas.reduce((s, f) => s + f.itens, 0);
    // Tudo acima do limite crítico, somado — é o número que vai para a reunião.
    const velhos = faixas.filter(f => f.ate > DIAS_CRITICO).reduce((s, f) => s + f.itens, 0);
    return {
      data: faixas.map(f => ({
        rotulo: f.rotulo,
        itens: f.itens,
        cor: c.tokens.atraso[f.rampa],
        pct: total > 0 ? (f.itens / total) * 100 : 0,
      })),
      totalAbertos: total,
      envelhecidos: velhos,
    };
  }, [records, c.tokens]);

  function TooltipConteudo({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <ChartTooltip
        title={row.rotulo}
        subtitle="Itens ainda sem pedido"
        rows={[
          { color: row.cor, label: 'Itens', value: formatInt(row.itens) },
          { label: 'Da carteira aberta', value: formatPctInt(row.pct) },
        ]}
        footer={onSelecionarFaixa ? 'Clique para filtrar o painel' : undefined}
      />
    );
  }

  return (
    <ChartCard
      title="Aging da Carteira Aberta"
      icon={Hourglass}
      description={
        totalAbertos > 0
          ? `${formatInt(totalAbertos)} itens sem pedido — ${formatInt(envelhecidos)} (${formatPctInt((envelhecidos / totalAbertos) * 100)}) acima de ${DIAS_CRITICO} dias`
          : 'Idade dos itens que ainda não viraram pedido.'
      }
      height={260}
      loading={loading}
      empty={totalAbertos === 0}
      emptyMessage="Nenhum item em aberto no filtro selecionado."
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 0, bottom: 4 }}>
          <CartesianGrid {...c.grid} vertical horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...c.yAxis} />
          <YAxis type="category" dataKey="rotulo" {...c.xAxis} width={124} />
          <Tooltip content={<TooltipConteudo />} cursor={c.cursor} />
          <Bar
            dataKey="itens"
            radius={c.radius.right}
            maxBarSize={30}
            cursor={onSelecionarFaixa ? 'pointer' : undefined}
            onClick={(d: any) => onSelecionarFaixa?.(d?.rotulo)}
            {...c.animation}
          >
            {data.map(d => <Cell key={d.rotulo} fill={d.cor} />)}
            <LabelList
              dataKey="itens"
              position="right"
              formatter={(v: number) => (v > 0 ? formatInt(v) : '')}
              style={c.labelOnSurface}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
