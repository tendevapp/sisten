/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Props padrão dos eixos, grid, legenda e animação do Recharts.
 *
 * São objetos de props, não componentes de wrapper: o Recharts inspeciona o
 * tipo dos filhos diretos do gráfico, então envolver `<XAxis>` em um
 * componente próprio faz o eixo sumir. Espalhe: `<XAxis {...c.xAxis} />`.
 */

import { useMemo } from 'react';
import { useChartTokens, ChartTokens } from '../../lib/chartTokens';
import { useReducedMotion } from '../../lib/useReducedMotion';

export interface ChartConfig {
  tokens: ChartTokens;
  /** Grid recessivo: só horizontais, tracejado, na cor de hairline. */
  grid: Record<string, any>;
  /** Eixo de categoria — rótulo com mais peso que os ticks numéricos. */
  xAxis: Record<string, any>;
  /** Eixo de valor — sem linha de eixo, sem tick mark; a grid já orienta. */
  yAxis: Record<string, any>;
  legend: Record<string, any>;
  /** Realce sob o cursor: um véu neutro, nunca a cor da série. */
  cursor: Record<string, any>;
  /** Rótulo direto impresso sobre a superfície do card. */
  labelOnSurface: Record<string, any>;
  /** Rótulo direto impresso dentro da marca colorida. */
  labelOnMark: Record<string, any>;
  /** Animação de entrada das marcas, desligada sob movimento reduzido. */
  animation: { isAnimationActive: boolean; animationDuration: number; animationEasing: 'ease-out' };
  /** Raio das pontas de dado, ancorado na linha de base. */
  radius: { top: [number, number, number, number]; right: [number, number, number, number] };
  /** Vão de superfície entre segmentos empilhados e barras vizinhas. */
  stackGap: number;
}

/**
 * Largura mínima de plotagem para gráficos de categoria (séries temporais,
 * rankings) com contagem de categorias variável. Usada com `ChartCard`'s
 * `minPlotWidth`: abaixo dela o gráfico ganha um trilho com rolagem
 * horizontal em vez de espremer barras e rótulos até ficarem ilegíveis —
 * squeeze automático do Recharts quebra números/rótulos sobrepostos assim
 * que o período filtrado cresce (ex.: uma série semanal com 30+ pontos).
 */
export function estimateCategoryChartWidth(categoryCount: number, pxPerCategory = 44, min = 420): number {
  return Math.max(min, categoryCount * pxPerCategory);
}

export function useChartConfig(): ChartConfig {
  const tokens = useChartTokens();
  const reduced = useReducedMotion();

  return useMemo(() => ({
    tokens,
    grid: {
      strokeDasharray: '3 3',
      stroke: tokens.grid,
      vertical: false,
    },
    xAxis: {
      tick: { fontSize: 12, fill: tokens.labelStrong, fontWeight: 600 },
      axisLine: { stroke: tokens.axis },
      tickLine: false,
    },
    yAxis: {
      tick: { fontSize: 11, fill: tokens.label },
      axisLine: false,
      tickLine: false,
    },
    legend: {
      wrapperStyle: { fontSize: 12, color: tokens.inkSecondary },
      iconType: 'circle' as const,
      iconSize: 8,
    },
    cursor: { fill: tokens.cursor },
    labelOnSurface: { fontSize: 12, fontWeight: 700, fill: tokens.value },
    labelOnMark: { fontSize: 12, fontWeight: 700, fill: tokens.valueOnMark },
    animation: {
      isAnimationActive: !reduced,
      animationDuration: 600,
      animationEasing: 'ease-out' as const,
    },
    radius: {
      top: [4, 4, 0, 0] as [number, number, number, number],
      right: [0, 4, 4, 0] as [number, number, number, number],
    },
    stackGap: 2,
  }), [tokens, reduced]);
}
