/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Desvio de preço contra valor da compra.
 *
 * O achado da auditoria não está no total — no agregado, 2026 comprou
 * praticamente no preço histórico corrigido. Está na linha: quais compras
 * pagaram muito acima da referência E movimentaram dinheiro suficiente para
 * valer uma conversa com o fornecedor.
 *
 * Dispersão porque nenhuma ordenação de coluna isola esse par. Ordenar por Δ%
 * traz no topo a compra 300% cara de R$ 40; ordenar por valor traz a compra
 * grande que foi bem negociada. O quadrante superior direito é o único lugar
 * onde as duas coisas aparecem juntas.
 *
 * Eixo X em escala de log porque o desvio é multiplicativo: −50% e +100% são o
 * mesmo movimento em direções opostas, e numa escala linear o lado caro ocupa
 * todo o espaço enquanto o lado barato se espreme contra o zero.
 */

import React, { useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine, Cell, ResponsiveContainer,
} from 'recharts';
import { Crosshair } from 'lucide-react';
import { AuditoriaCompra } from '../../types';
import { formatBRL, formatBRLCompacto, formatInt } from '../../lib/format';
import { useChartConfig } from '../charts/chartDefaults';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';

interface DispersaoPrecoChartProps {
  compras: readonly AuditoriaCompra[];
  /** Chamado ao clicar num ponto — abre a linha correspondente na tabela. */
  onSelecionar?: (c: AuditoriaCompra) => void;
}

interface Ponto {
  compra: AuditoriaCompra;
  /** Δ% + 1 = razão entre preço pago e referência. Positivo por construção. */
  razao: number;
  valor: number;
  prioritario: boolean;
}

export default function DispersaoPrecoChart({ compras, onSelecionar }: DispersaoPrecoChartProps) {
  const c = useChartConfig();

  const { pontos, corteValor, prioritarios } = useMemo(() => {
    const validos: Ponto[] = [];
    for (const compra of compras) {
      const delta = compra.delta_pct;
      const valor = Number(compra.valor) || 0;
      // Sem referência não há desvio a plotar; a tabela cobre essas linhas.
      if (delta == null || !Number.isFinite(delta) || valor <= 0) continue;
      const razao = delta + 1;
      if (razao <= 0) continue;
      validos.push({ compra, razao, valor, prioritario: false });
    }

    // Corte de relevância pela MEDIANA do valor, não pela média: um pedido de
    // milhões deslocaria a média a ponto de quase nada ser "grande".
    const valores = validos.map(p => p.valor).sort((a, b) => a - b);
    const mediana = valores.length === 0
      ? 0
      : valores.length % 2 === 1
        ? valores[(valores.length - 1) / 2]
        : (valores[valores.length / 2 - 1] + valores[valores.length / 2]) / 2;

    for (const p of validos) {
      p.prioritario = p.compra.veredito === 'Atenção' && p.valor >= mediana;
    }

    return {
      pontos: validos,
      corteValor: mediana,
      prioritarios: validos.filter(p => p.prioritario),
    };
  }, [compras]);

  function TooltipConteudo({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as Ponto;
    const d = p.compra;
    const delta = d.delta_pct ?? 0;
    return (
      <ChartTooltip
        title={d.txt_breve || d.material}
        subtitle={`${d.material} · ${d.fornecedor || 'Fornecedor não informado'}`}
        rows={[
          { label: 'Preço pago', value: formatBRL(d.preco_unit) },
          { label: 'Referência (IPCA)', value: formatBRL(d.ref_p50) },
          { label: 'Desvio', value: `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%` },
          { label: 'Valor da compra', value: formatBRLCompacto(p.valor) },
          { label: 'Confiança', value: d.confianca },
        ]}
        footer={
          d.lote_atipico
            ? 'Lote atípico: parte do desvio pode ser efeito de escala, não de negociação.'
            : p.prioritario
              ? 'Prioridade: acima da faixa esperada e com valor relevante.'
              : undefined
        }
      />
    );
  }

  return (
    <ChartCard
      title="Desvio de Preço × Valor da Compra"
      icon={Crosshair}
      description={
        pontos.length > 0
          ? `${formatInt(prioritarios.length)} compra(s) acima da faixa esperada e com valor acima da mediana (${formatBRLCompacto(corteValor)}) — o quadrante superior direito é a fila de auditoria.`
          : 'Desvio contra a referência corrigida pelo IPCA, por compra.'
      }
      height={360}
      empty={pontos.length === 0}
      emptyMessage="Nenhuma compra com referência histórica no filtro selecionado."
      footer={
        <span>
          Cada ponto é uma compra de 2026. A área acompanha a quantidade comprada.
          A linha vertical marca o preço igual à referência.
        </span>
      }
    >
      <ResponsiveContainer width="100%" height={360}>
        <ScatterChart margin={{ top: 12, right: 24, left: 8, bottom: 32 }}>
          <CartesianGrid {...c.grid} vertical />
          <XAxis
            type="number"
            dataKey="razao"
            name="Desvio"
            scale="log"
            domain={['auto', 'auto']}
            {...c.xAxis}
            tick={{ ...c.xAxis.tick, fontSize: 11, fontWeight: 400 }}
            tickFormatter={(v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`}
            label={{
              value: 'Desvio contra a referência corrigida',
              position: 'insideBottom', offset: -18, fontSize: 11, fill: c.tokens.label,
            }}
          />
          <YAxis
            type="number"
            dataKey="valor"
            name="Valor"
            scale="log"
            domain={['auto', 'auto']}
            {...c.yAxis}
            width={70}
            tickFormatter={(v: number) => formatBRLCompacto(v)}
          />
          {/* Área acompanha a quantidade: sem isso, a compra de uma peça e a de
              mil peças viram o mesmo ponto. */}
          <ZAxis type="number" dataKey="compra.qtd" range={[36, 420]} name="Quantidade" />
          <Tooltip content={<TooltipConteudo />} cursor={{ strokeDasharray: '3 3', stroke: c.tokens.axis }} />
          {/* Preço igual à referência. É a única linha de referência do gráfico:
              a faixa P25–P75 varia por material e não tem posição fixa aqui. */}
          <ReferenceLine
            x={1}
            stroke={c.tokens.inkMuted}
            strokeDasharray="4 4"
            label={{ value: 'no preço', position: 'insideTopLeft', fontSize: 10, fill: c.tokens.inkMuted }}
          />
          <ReferenceLine y={corteValor} stroke={c.tokens.inkMuted} strokeDasharray="4 4" />
          <Scatter
            data={pontos}
            {...c.animation}
            onClick={onSelecionar ? (p: any) => onSelecionar(p?.payload?.compra) : undefined}
            cursor={onSelecionar ? 'pointer' : undefined}
          >
            {pontos.map((p, i) => (
              <Cell
                key={`${p.compra.material}-${p.compra.doc_compra}-${i}`}
                // Status reservado ao quadrante de ação. Compra barata não vira
                // verde: "abaixo da referência" merece conferência tanto quanto
                // "acima" — pode ser produto diferente sob o mesmo código.
                fill={p.prioritario ? c.tokens.status.critical : c.tokens.series[0]}
                fillOpacity={p.prioritario ? 0.85 : 0.45}
                // Lote atípico ganha contorno em vez de cor própria: é uma
                // ressalva sobre o ponto, não uma terceira categoria dele.
                stroke={p.compra.lote_atipico ? c.tokens.status.warning : 'none'}
                strokeWidth={p.compra.lote_atipico ? 1.5 : 0}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
