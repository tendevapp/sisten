/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sparkline de consumo semanal, para a lista de seleção de material.
 *
 * Barras e não linha: a demanda aqui é intermitente — mais da metade dos
 * materiais sai numa única semana de 25 — e uma linha ligaria os pontos,
 * desenhando consumo contínuo onde houve um pico isolado cercado de zeros.
 * Barra mostra o vazio como vazio.
 *
 * SVG inline sem biblioteca: a lista renderiza centenas destes de uma vez, e
 * uma instância de Recharts por linha travaria a rolagem.
 */

import React from 'react';

interface SparklineProps {
  /** Consumo por semana, já alinhado ao período (zeros inclusive). */
  serie: number[];
  /** Escala compartilhada entre linhas. Sem ela, cada sparkline se
   *  normalizaria pelo próprio máximo e barras de alturas iguais
   *  representariam quantidades de ordens de grandeza diferentes. */
  maximo?: number;
  largura?: number;
  altura?: number;
  cor?: string;
  /** Descrição para leitor de tela; sem ela o gráfico é ruído. */
  rotulo?: string;
}

export default function Sparkline({
  serie, maximo, largura = 96, altura = 24,
  cor = 'var(--series-1)', rotulo,
}: SparklineProps) {
  if (serie.length === 0) {
    return <div style={{ width: largura, height: altura }} aria-hidden="true" />;
  }

  const topo = maximo && maximo > 0 ? maximo : Math.max(...serie, 1);
  const vao = 1;
  const larguraBarra = Math.max((largura - vao * (serie.length - 1)) / serie.length, 0.5);

  return (
    <svg
      width={largura}
      height={altura}
      viewBox={`0 0 ${largura} ${altura}`}
      role="img"
      aria-label={rotulo}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* Linha de base: sem ela, uma série quase toda zerada some e o
          espaço fica ambíguo entre "sem dado" e "sem consumo". */}
      <line
        x1={0} y1={altura - 0.5} x2={largura} y2={altura - 0.5}
        stroke="var(--hairline)" strokeWidth={1}
      />
      {serie.map((v, i) => {
        if (v <= 0) return null;
        // Piso de 2px: uma barra de 0,3px seria indistinguível de zero, e a
        // diferença entre "saiu pouco" e "não saiu" é justamente o ponto.
        const h = Math.max((v / topo) * (altura - 2), 2);
        return (
          <rect
            key={i}
            x={i * (larguraBarra + vao)}
            y={altura - h}
            width={larguraBarra}
            height={h}
            fill={cor}
            rx={larguraBarra > 3 ? 1 : 0}
          />
        );
      })}
    </svg>
  );
}
