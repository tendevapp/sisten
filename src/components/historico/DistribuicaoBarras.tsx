/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Distribuição de gasto por uma dimensão categórica, em barras horizontais
 * com valor e participação.
 *
 * Horizontal porque os rótulos são texto de comprimento irregular (nomes de
 * cidade, códigos de grupo) e girá-los no eixo x custa legibilidade. Uma cor
 * só: as categorias aqui são identidade sem ordem intrínseca, e o comprimento
 * da barra já carrega a comparação — pintar cada uma de um matiz diferente
 * gastaria a escala categórica sem acrescentar informação.
 */

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ResponsiveContainer } from 'recharts';
import { LucideIcon } from 'lucide-react';
import { FatiaValor } from '../../lib/historicoAnalytics';
import { formatInt, formatPct, formatBRLCompacto } from '../../lib/format';
import { useChartConfig } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface DistribuicaoBarrasProps {
  fatias: FatiaValor[];
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  top?: number;
  /** Largura reservada aos rótulos do eixo. */
  larguraRotulo?: number;
  cor?: string;
  onSelecionar?: (chave: string) => void;
  height?: number;
}

const curto = (s: string, max = 24) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export default function DistribuicaoBarras({
  fatias,
  title,
  description,
  icon,
  top = 10,
  larguraRotulo = 150,
  cor,
  onSelecionar,
  height = 300,
}: DistribuicaoBarrasProps) {
  const c = useChartConfig();
  const corBarra = cor ?? c.tokens.series[0];

  const data = useMemo(
    () => fatias.slice(0, top).map(f => ({ ...f, rotulo: curto(f.chave) })),
    [fatias, top]
  );

  const total = useMemo(() => fatias.reduce((s, f) => s + f.valor, 0), [fatias]);

  function TooltipConteudo({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as FatiaValor;
    return (
      <ChartTooltip
        title={row.chave}
        subtitle={`${formatInt(row.itens)} itens em ${formatInt(row.pedidos)} pedidos`}
        rows={[
          { color: corBarra, label: 'Valor', value: formatBRLCompacto(row.valor) },
          { label: 'Participação', value: formatPct(row.participacao) },
        ]}
        footer={onSelecionar ? 'Clique para filtrar' : undefined}
      />
    );
  }

  return (
    <ChartCard
      title={title}
      icon={icon}
      description={description}
      height={height}
      empty={data.length === 0 || total <= 0}
      emptyMessage="Nenhum valor no filtro selecionado."
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 88, left: 0, bottom: 4 }}>
          <CartesianGrid {...c.grid} vertical horizontal={false} />
          <XAxis type="number" {...c.yAxis} tickFormatter={(v: number) => formatBRLCompacto(v)} />
          <YAxis type="category" dataKey="rotulo" {...c.xAxis} width={larguraRotulo} tick={{ ...c.xAxis.tick, fontSize: 11 }} />
          <Tooltip content={<TooltipConteudo />} cursor={c.cursor} />
          <Bar
            dataKey="valor"
            fill={corBarra}
            radius={c.radius.right}
            maxBarSize={26}
            cursor={onSelecionar ? 'pointer' : undefined}
            onClick={(d: any) => onSelecionar?.(d?.chave)}
            {...c.animation}
          >
            {/* Valor e participação juntos no rótulo: a barra dá a comparação,
                o número dá a grandeza, e o percentual poupa o leitor de
                calcular a fração de cabeça.

                Renderizador explícito em vez de `formatter`: o formatter do
                LabelList não recebe o registro completo de forma estável entre
                versões do Recharts, e a participação vive no registro, não no
                valor plotado. Aqui o índice indexa os próprios dados. */}
            <LabelList
              dataKey="valor"
              position="right"
              content={(props: any) => {
                const { x, y, width, height, index } = props;
                const row = data[index];
                if (!row || typeof x !== 'number') return null;
                return (
                  <text
                    x={x + width + 6}
                    y={y + height / 2}
                    dominantBaseline="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill={c.tokens.value}
                  >
                    {`${formatBRLCompacto(row.valor)} · ${formatPct(row.participacao)}`}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
