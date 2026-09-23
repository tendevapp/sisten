/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Série temporal do realizado (Realizado por Rubrica) — barras por período
 * (mensal ou semanal) pela data de LANÇAMENTO da NF, com o valor impresso no
 * topo, mesmo padrão dos gráficos de dashboard do app (ver
 * `src/components/suprimentos/AgingCarteiraChart.tsx`). Clicar numa barra
 * abre a composição daquele período (e daquela série, quando há mais de uma).
 *
 * Filtros (combinados por E): Rubrica, Natureza fiscal, Classificação Nível 2
 * e Fornecedor. "Comparar por" empilha as barras por rubrica/natureza/nível.
 *
 * Recebe as linhas já carregadas pela tela (`vw_fin_nf_realizado_rubrica`,
 * ~4 mil itens) e só considera o que entra no realizado.
 */

import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Layers, Boxes, Building2, Scale } from 'lucide-react';
import ChartCard from '../charts/ChartCard';
import ChartTooltip from '../charts/ChartTooltip';
import { useChartConfig, estimateCategoryChartWidth } from '../charts/chartDefaults';
import { seriesColor } from '../../lib/chartTokens';
import MultiSelectFilter from '../ui/MultiSelectFilter';
import { formatBRL, formatBRLCompacto } from '../../lib/format';
import { LinhaNfRealizado, NATUREZAS } from '../../lib/realizadoRubricaNf';

type Granularidade = 'mensal' | 'semanal';
type Dimensao = 'total' | 'rubrica' | 'natureza' | 'nivel2';

const OPCOES_DIMENSAO: { valor: Dimensao; rotulo: string }[] = [
  { valor: 'total', rotulo: 'Total' },
  { valor: 'rubrica', rotulo: 'Rubrica' },
  { valor: 'natureza', rotulo: 'Natureza' },
  { valor: 'nivel2', rotulo: 'Nível 2' },
];

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Chave de mês por fatiamento de string (nunca `new Date(iso)` — ver CLAUDE.md, foge do fuso). */
function chaveMes(dataISO: string): string {
  return dataISO.slice(0, 7); // YYYY-MM
}

function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split('-');
  return `${MESES[Number(mes) - 1] ?? mes}/${ano.slice(2)}`;
}

/**
 * Chave + rótulo da semana ISO (segunda a domingo). Usa getters UTC porque a
 * string `YYYY-MM-DD` é interpretada como meia-noite UTC — getters locais em
 * UTC-3 devolveriam o dia anterior (mesma armadilha do `new Date(iso)` que o
 * CLAUDE.md pede para evitar, só que dentro de aritmética de data em vez de
 * exibição direta).
 */
function chaveSemana(dataISO: string): { chave: string; segundaISO: string } {
  const d = new Date(`${dataISO}T00:00:00Z`);
  const diaSemanaIso = (d.getUTCDay() + 6) % 7; // segunda=0 .. domingo=6
  const segunda = new Date(d);
  segunda.setUTCDate(d.getUTCDate() - diaSemanaIso);
  const segundaISO = segunda.toISOString().slice(0, 10);
  return { chave: segundaISO, segundaISO };
}

function rotuloSemana(segundaISO: string): string {
  const [, mes, dia] = segundaISO.split('-');
  return `${dia}/${mes}`;
}

const nomeRubrica = (l: LinhaNfRealizado) =>
  l.rubrica_nome || (l.natureza === 'MATERIAL_PRODUCAO' ? 'Material de produção (sem rubrica)' : 'Sem rubrica');
const nomeNatureza = (l: LinhaNfRealizado) => NATUREZAS[l.natureza]?.rotulo ?? l.natureza;
const nomeNivel2 = (l: LinhaNfRealizado) => l.classificacao_nivel2 || 'Sem classificação';
const nomeFornecedor = (l: LinhaNfRealizado) => l.fornecedor_nome || l.fornecedor_codigo;

function nomeDimensao(l: LinhaNfRealizado, dimensao: Dimensao): string {
  switch (dimensao) {
    case 'rubrica': return nomeRubrica(l);
    case 'natureza': return nomeNatureza(l);
    case 'nivel2': return nomeNivel2(l);
    default: return 'Total';
  }
}

const chavePeriodo = (dataISO: string, g: Granularidade) => (g === 'mensal' ? chaveMes(dataISO) : chaveSemana(dataISO).chave);

interface SerieAgregada {
  periodos: string[];
  rotulos: Record<string, string>;
  /** nome da série -> chave de período -> valor somado. */
  series: Map<string, Map<string, number>>;
}

function agregarSerie(linhas: LinhaNfRealizado[], granularidade: Granularidade, dimensao: Dimensao): SerieAgregada {
  const rotulos: Record<string, string> = {};
  const series = new Map<string, Map<string, number>>();
  const periodosSet = new Set<string>();

  for (const l of linhas) {
    if (!l.data_lancamento) continue;
    let chave: string;
    if (granularidade === 'mensal') {
      chave = chaveMes(l.data_lancamento);
      rotulos[chave] = rotuloMes(chave);
    } else {
      const { chave: c, segundaISO } = chaveSemana(l.data_lancamento);
      chave = c;
      rotulos[chave] = rotuloSemana(segundaISO);
    }
    periodosSet.add(chave);

    const nomeSerie = nomeDimensao(l, dimensao);
    if (!series.has(nomeSerie)) series.set(nomeSerie, new Map());
    const mapaSerie = series.get(nomeSerie)!;
    mapaSerie.set(chave, (mapaSerie.get(chave) || 0) + (l.valor || 0));
  }

  return { periodos: Array.from(periodosSet).sort(), rotulos, series };
}

function opcoesUnicas(linhas: LinhaNfRealizado[], extrator: (l: LinhaNfRealizado) => string): string[] {
  return Array.from(new Set(linhas.map(extrator))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

interface Props {
  linhas: LinhaNfRealizado[];
  carregando: boolean;
  onAbrirDetalhe: (titulo: string, linhas: LinhaNfRealizado[]) => void;
}

export default function RubricaSerieTemporalChart({ linhas, carregando, onAbrirDetalhe }: Props) {
  const config = useChartConfig();
  const [granularidade, setGranularidade] = useState<Granularidade>('mensal');
  const [dimensao, setDimensao] = useState<Dimensao>('total');

  const [rubricasSel, setRubricasSel] = useState<Set<string>>(new Set());
  const [naturezasSel, setNaturezasSel] = useState<Set<string>>(new Set());
  const [nivel2Sel, setNivel2Sel] = useState<Set<string>>(new Set());
  const [fornecedoresSel, setFornecedoresSel] = useState<Set<string>>(new Set());

  const realizado = useMemo(() => linhas.filter(l => l.entra_realizado), [linhas]);

  const opcoesRubrica = useMemo(() => opcoesUnicas(realizado, nomeRubrica), [realizado]);
  const opcoesNatureza = useMemo(() => opcoesUnicas(realizado, nomeNatureza), [realizado]);
  const opcoesNivel2 = useMemo(() => opcoesUnicas(realizado, nomeNivel2), [realizado]);
  const opcoesFornecedor = useMemo(() => opcoesUnicas(realizado, nomeFornecedor), [realizado]);

  const linhasFiltradas = useMemo(() => realizado.filter(l => {
    if (rubricasSel.size > 0 && !rubricasSel.has(nomeRubrica(l))) return false;
    if (naturezasSel.size > 0 && !naturezasSel.has(nomeNatureza(l))) return false;
    if (nivel2Sel.size > 0 && !nivel2Sel.has(nomeNivel2(l))) return false;
    if (fornecedoresSel.size > 0 && !fornecedoresSel.has(nomeFornecedor(l))) return false;
    return true;
  }), [realizado, rubricasSel, naturezasSel, nivel2Sel, fornecedoresSel]);

  const agregado = useMemo(
    () => agregarSerie(linhasFiltradas, granularidade, dimensao),
    [linhasFiltradas, granularidade, dimensao],
  );

  const nomesSeries = useMemo(() => Array.from(agregado.series.keys()).sort(), [agregado]);

  const dadosGrafico = useMemo(() => agregado.periodos.map(periodo => {
    const ponto: Record<string, number | string> = { periodo, rotulo: agregado.rotulos[periodo] };
    for (const nome of nomesSeries) ponto[nome] = agregado.series.get(nome)?.get(periodo) || 0;
    return ponto;
  }), [agregado, nomesSeries]);

  const vazio = !carregando && dadosGrafico.length === 0;
  const minPlotWidth = estimateCategoryChartWidth(dadosGrafico.length, granularidade === 'semanal' ? 44 : 84, 480);

  const abrirDetalhe = (periodoChave: string, serieNome: string, rotuloPeriodo: string) => {
    const doPeriodo = linhasFiltradas.filter(l => {
      if (!l.data_lancamento || chavePeriodo(l.data_lancamento, granularidade) !== periodoChave) return false;
      return dimensao === 'total' || nomeDimensao(l, dimensao) === serieNome;
    });
    onAbrirDetalhe(dimensao === 'total' ? rotuloPeriodo : `${rotuloPeriodo} — ${serieNome}`, doPeriodo);
  };

  return (
    <ChartCard
      title="Realizado ao Longo do Tempo"
      description="Valor das notas fiscais que entram no realizado, pela data de lançamento. Combine os filtros para recortar e escolha o que comparar."
      icon={TrendingUp}
      loading={carregando}
      empty={vazio}
      emptyMessage="Nenhuma nota fiscal no filtro selecionado."
      minPlotWidth={dadosGrafico.length > 0 ? minPlotWidth : undefined}
      actions={
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
          {(['mensal', 'semanal'] as const).map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularidade(g)}
              className="px-3 py-1.5 text-xs font-bold capitalize transition-colors"
              style={{
                background: granularidade === g ? 'var(--brand)' : 'var(--surface-card)',
                color: granularidade === g ? '#fff' : 'var(--ink-secondary)',
              }}
            >
              {g}
            </button>
          ))}
        </div>
      }
      footer={
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectFilter label="Rubrica" icon={Layers} options={opcoesRubrica} selected={rubricasSel} onChange={setRubricasSel} searchable className="shrink-0 w-52" />
            <MultiSelectFilter label="Natureza fiscal" icon={Scale} options={opcoesNatureza} selected={naturezasSel} onChange={setNaturezasSel} className="shrink-0 w-48" />
            <MultiSelectFilter label="Classificação Nível 2" icon={Boxes} options={opcoesNivel2} selected={nivel2Sel} onChange={setNivel2Sel} searchable className="shrink-0 w-56" />
            <MultiSelectFilter label="Fornecedor" icon={Building2} options={opcoesFornecedor} selected={fornecedoresSel} onChange={setFornecedoresSel} searchable className="shrink-0 w-64" />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider mr-1" style={{ color: 'var(--ink-muted)' }}>
              Comparar por:
            </span>
            {OPCOES_DIMENSAO.map(o => (
              <button
                key={o.valor}
                type="button"
                onClick={() => setDimensao(o.valor)}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors"
                style={{
                  background: dimensao === o.valor ? 'var(--brand)' : 'var(--surface-raised)',
                  color: dimensao === o.valor ? '#fff' : 'var(--ink-secondary)',
                }}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={dadosGrafico} margin={{ top: 40, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid {...config.grid} />
          <XAxis dataKey="rotulo" {...config.xAxis} interval={0} minTickGap={8} />
          <YAxis {...config.yAxis} tickFormatter={(v: number) => formatBRLCompacto(v)} width={64} />
          <Tooltip
            cursor={config.cursor}
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              const linhasOrdenadas = [...payload]
                .filter(p => (p.value as number) !== 0)
                .sort((a, b) => (b.value as number) - (a.value as number));
              return (
                <ChartTooltip
                  title={label}
                  subtitle="Clique numa barra para abrir as notas fiscais"
                  rows={linhasOrdenadas.map(p => ({
                    label: p.name as string,
                    value: formatBRL(p.value as number),
                    color: p.color as string,
                  }))}
                />
              );
            }}
          />
          {nomesSeries.length > 1 && <Legend {...config.legend} />}
          {nomesSeries.map((nome, idx) => (
            <Bar
              key={nome}
              dataKey={nome}
              name={nome}
              stackId={dimensao === 'total' ? undefined : 'realizado'}
              fill={seriesColor(config.tokens, idx)}
              radius={dimensao === 'total' ? config.radius.top : undefined}
              maxBarSize={granularidade === 'semanal' ? 20 : 36}
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(entry: any) => abrirDetalhe(entry.periodo, nome, entry.rotulo)}
              {...config.animation}
            >
              {dimensao === 'total' && (
                <LabelList
                  dataKey={nome}
                  position="top"
                  formatter={(v: number) => (v > 0 ? formatBRLCompacto(v) : '')}
                  style={config.labelOnSurface}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
