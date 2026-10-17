/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Gráficos da Análise de Inventário Cíclico.
 *
 * Cor segue o significado: verde = bateu, vermelho = divergiu (tokens de
 * status). Barras de categoria nominal (depósito, classe, faixa de idade) usam
 * um matiz só — o comprimento já diz o valor.
 */

import React from 'react';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CalendarClock, Layers, LineChart, Warehouse } from 'lucide-react';
import { formatBRL } from '../../../lib/almoxarifado';
import { formatInt } from '../../../lib/format';
import { ORDEM_FAIXA_IDADE, ROTULO_FAIXA_IDADE, type CoberturaAnalise, type GrupoAnalise } from '../../../lib/inventarioAnalise';
import { estimateCategoryChartWidth, useChartConfig } from '../../charts/chartDefaults';
import ChartCard from '../../charts/ChartCard';
import ChartTooltip from '../../charts/ChartTooltip';

const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`);
const dataCurta = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/* ------------------------------------------------------------------ */
/* Evolução por dia                                                     */
/* ------------------------------------------------------------------ */

function TooltipDia({ active, payload, interativo }: any) {
  if (!active || !payload?.length) return null;
  const g = payload[0].payload as GrupoAnalise;
  return (
    <ChartTooltip
      title={dataBR(g.chave)}
      rows={[
        { label: 'Itens encerrados', value: formatInt(g.encerrados) },
        { label: 'Conferidos', value: formatInt(g.conferidos), color: 'var(--status-good)' },
        { label: 'Divergentes', value: formatInt(g.divergentes), color: 'var(--status-critical)' },
        { label: 'Acuracidade', value: pct(g.acuracidade) },
        { label: 'Valor do erro', value: formatBRL(g.valor) },
      ]}
      footer={interativo ? 'Clique para ver todos os dados do dia' : undefined}
    />
  );
}

export function EvolucaoDiariaChart({
  dados,
  loading,
  onSelecionarDia,
}: {
  dados: GrupoAnalise[];
  loading?: boolean;
  onSelecionarDia?: (dia: string) => void;
}) {
  const c = useChartConfig();
  return (
    <ChartCard
      title="Evolução por dia"
      icon={LineChart}
      description="Itens encerrados em cada dia de inventário (barras) e a acuracidade do dia (linha). Clique em um dia para ver os itens detalhados."
      height={300}
      minPlotWidth={estimateCategoryChartWidth(dados.length, 52)}
      scrollToEnd
      loading={loading}
      empty={dados.length === 0}
      emptyMessage="Nenhum inventário encerrado no filtro selecionado."
    >
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          data={dados}
          margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
          onClick={(state: any) => {
            const chave = state?.activePayload?.[0]?.payload?.chave;
            if (chave && onSelecionarDia) onSelecionarDia(chave);
          }}
        >
          <CartesianGrid {...c.grid} />
          <XAxis dataKey="chave" tickFormatter={dataCurta} {...c.xAxis} />
          <YAxis yAxisId="itens" allowDecimals={false} {...c.yAxis} width={40} />
          <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} unit="%" {...c.yAxis} width={44} />
          <Tooltip content={<TooltipDia interativo={!!onSelecionarDia} />} cursor={c.cursor} />
          <Legend {...c.legend} />
          <Bar
            yAxisId="itens"
            dataKey="conferidos"
            name="Conferidos"
            stackId="itens"
            fill={c.tokens.status.good}
            maxBarSize={36}
            cursor={onSelecionarDia ? 'pointer' : undefined}
            onClick={(d: any) => {
              const chave = d?.payload?.chave ?? d?.chave;
              if (chave && onSelecionarDia) onSelecionarDia(chave);
            }}
            {...c.animation}
          />
          <Bar
            yAxisId="itens"
            dataKey="divergentes"
            name="Divergentes"
            stackId="itens"
            fill={c.tokens.status.critical}
            maxBarSize={36}
            radius={c.radius.top}
            cursor={onSelecionarDia ? 'pointer' : undefined}
            onClick={(d: any) => {
              const chave = d?.payload?.chave ?? d?.chave;
              if (chave && onSelecionarDia) onSelecionarDia(chave);
            }}
            {...c.animation}
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="acuracidade"
            name="Acuracidade (%)"
            stroke={c.tokens.inkPrimary}
            strokeWidth={2}
            dot={{ r: 3, fill: c.tokens.inkPrimary }}
            connectNulls
            cursor={onSelecionarDia ? 'pointer' : undefined}
            onClick={(d: any) => {
              const chave = d?.payload?.chave ?? d?.chave;
              if (chave && onSelecionarDia) onSelecionarDia(chave);
            }}
            {...c.animation}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Acuracidade por depósito / classe                                    */
/* ------------------------------------------------------------------ */

function TooltipGrupo({ active, payload, rotulo, interativo }: any) {
  if (!active || !payload?.length) return null;
  const g = payload[0].payload as GrupoAnalise;
  return (
    <ChartTooltip
      title={rotulo(g.chave)}
      rows={[
        { label: 'Acuracidade', value: pct(g.acuracidade) },
        { label: 'Itens encerrados', value: formatInt(g.encerrados) },
        { label: 'Divergentes', value: formatInt(g.divergentes) },
        { label: 'Valor do erro', value: formatBRL(g.valor) },
      ]}
      footer={interativo ? 'Clique para ver os dados detalhados' : undefined}
    />
  );
}

export function AcuraciaPorGrupoChart({
  titulo, descricao, dados, rotulo, depositos, loading, onSelecionar,
}: {
  titulo: string;
  descricao: string;
  dados: GrupoAnalise[];
  rotulo: (chave: string) => string;
  /** Troca o ícone: depósito usa o armazém, classe usa as camadas. */
  depositos?: boolean;
  loading?: boolean;
  onSelecionar?: (chave: string) => void;
}) {
  const c = useChartConfig();
  const altura = Math.max(180, dados.length * 40 + 40);
  return (
    <ChartCard
      title={titulo}
      icon={depositos ? Warehouse : Layers}
      description={descricao}
      height={altura}
      loading={loading}
      empty={dados.length === 0}
      emptyMessage="Nenhum item encerrado no filtro selecionado."
    >
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart
          data={dados}
          layout="vertical"
          margin={{ top: 4, right: 96, left: 8, bottom: 4 }}
          onClick={(state: any) => {
            const chave = state?.activePayload?.[0]?.payload?.chave;
            if (chave && onSelecionar) onSelecionar(chave);
          }}
        >
          <CartesianGrid {...c.grid} vertical horizontal={false} />
          <XAxis type="number" domain={[0, 100]} unit="%" {...c.yAxis} />
          <YAxis
            type="category"
            dataKey="chave"
            tickFormatter={rotulo}
            tick={{ fontSize: 11, fill: c.tokens.labelStrong, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            width={depositos ? 56 : 84}
          />
          <Tooltip content={<TooltipGrupo rotulo={rotulo} interativo={!!onSelecionar} />} cursor={c.cursor} />
          <Bar
            dataKey="acuracidade"
            fill={c.tokens.series[0]}
            radius={c.radius.right}
            maxBarSize={22}
            cursor={onSelecionar ? 'pointer' : undefined}
            onClick={(d: any) => {
              const chave = d?.payload?.chave ?? d?.chave;
              if (chave && onSelecionar) onSelecionar(chave);
            }}
            {...c.animation}
          >
            <LabelList
              dataKey="acuracidade"
              position="right"
              formatter={(v: number) => pct(v)}
              style={{ fontSize: 11, fontWeight: 600, fill: c.tokens.inkSecondary }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Idade da última contagem                                             */
/* ------------------------------------------------------------------ */

function TooltipIdade({ active, payload, interativo }: any) {
  if (!active || !payload?.length) return null;
  const f = payload[0].payload as CoberturaAnalise['idade'][number];
  return (
    <ChartTooltip
      title={ROTULO_FAIXA_IDADE[f.faixa]}
      rows={[
        { label: 'Itens na ZL0024', value: formatInt(f.itens) },
        { label: 'Valor em estoque', value: formatBRL(f.valor) },
      ]}
      footer={interativo ? 'Clique para ver os dados detalhados' : undefined}
    />
  );
}

export function IdadeContagemChart({
  cobertura,
  loading,
  onSelecionarFaixa,
}: {
  cobertura: CoberturaAnalise;
  loading?: boolean;
  onSelecionarFaixa?: (faixa: FaixaIdade) => void;
}) {
  const c = useChartConfig();
  const dados = ORDEM_FAIXA_IDADE.map((f) => cobertura.idade.find((i) => i.faixa === f)!);
  return (
    <ChartCard
      title="Tempo desde a última contagem"
      icon={CalendarClock}
      description="Itens da ZL0024 (material × depósito) pela data da última vez em que foram contados. Clique em uma faixa para ver os itens."
      height={260}
      loading={loading}
      empty={cobertura.total === 0}
      emptyMessage="Sem posição de estoque carregada."
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={dados}
          margin={{ top: 20, right: 8, left: 0, bottom: 0 }}
          onClick={(state: any) => {
            const faixa = state?.activePayload?.[0]?.payload?.faixa as FaixaIdade | undefined;
            if (faixa && onSelecionarFaixa) onSelecionarFaixa(faixa);
          }}
        >
          <CartesianGrid {...c.grid} />
          <XAxis dataKey="faixa" tickFormatter={(f: keyof typeof ROTULO_FAIXA_IDADE) => ROTULO_FAIXA_IDADE[f]} {...c.xAxis} />
          <YAxis allowDecimals={false} {...c.yAxis} width={48} tickFormatter={(v: number) => formatInt(v)} />
          <Tooltip content={<TooltipIdade interativo={!!onSelecionarFaixa} />} cursor={c.cursor} />
          <Bar
            dataKey="itens"
            fill={c.tokens.series[0]}
            radius={c.radius.top}
            maxBarSize={72}
            cursor={onSelecionarFaixa ? 'pointer' : undefined}
            onClick={(d: any) => {
              const faixa = (d?.payload?.faixa ?? d?.faixa) as FaixaIdade | undefined;
              if (faixa && onSelecionarFaixa) onSelecionarFaixa(faixa);
            }}
            {...c.animation}
          >
            <LabelList dataKey="itens" position="top" formatter={(v: number) => formatInt(v)} style={{ fontSize: 11, fontWeight: 600, fill: c.tokens.inkSecondary }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
