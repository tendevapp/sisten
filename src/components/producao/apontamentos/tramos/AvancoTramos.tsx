/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Avanço por marco — substitui o resumo mensal e o acompanhamento do Jato da
 * planilha: cartões com ritmo necessário × real e previsão, tabela Plan × Real
 * por mês, gráfico mensal, curva S semanal com projeção e grade de torres.
 */

import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';
import ChartCard from '../../../charts/ChartCard';
import ChartTooltip from '../../../charts/ChartTooltip';
import { estimateCategoryChartWidth, useChartConfig } from '../../../charts/chartDefaults';
import { semanaISO } from '../../../../lib/producaoApontamentos';
import {
  CONFIG_ETAPA,
  ETAPAS_TRAMO,
  INDICADOR_MARCO,
  ROTULO_MARCO,
  chaveMes,
  curvaSemanal,
  dataCurta,
  indicadoresMarco,
  linhaMensal,
  mesesDoPainel,
  nomeMesCurto,
  resumoTorres,
  type MarcoTramo,
  type MetaMarco,
  type PrazoMarco,
  type SituacaoMes,
  type TramoAtual,
} from '../../../../lib/producaoTramos';
import { cardCls } from '../estilos';
import { COR_ETAPA, fmtNum, fmtPct } from './visual';

/** Os três indicadores da planilha + Expedido. */
const MARCOS_PAINEL: MarcoTramo[] = ['liberado_nav02', 'liberado_jato', 'liberado_patio', 'expedido'];

const CLASSE_SITUACAO: Record<SituacaoMes, string> = {
  atingido: 'text-emerald-700 dark:text-emerald-400',
  abaixo: 'text-rose-600 dark:text-rose-400',
  andamento: 'text-amber-600 dark:text-amber-400',
  vazio: 'text-slate-400',
};

interface Props {
  tramos: TramoAtual[];
  metas: MetaMarco[];
  prazos: PrazoMarco[];
  hoje: string;
}

function CartaoMarco({ tramos, marco, prazo, hoje }: { tramos: TramoAtual[]; marco: MarcoTramo; prazo?: PrazoMarco; hoje: string }) {
  const ind = indicadoresMarco(tramos, marco, prazo, hoje);
  const corBarra = ind.atrasado ? 'bg-rose-500' : 'bg-emerald-500';
  return (
    <div className={`${cardCls} p-4 ${ind.atrasado ? 'border-rose-300 dark:border-rose-900' : ''}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{INDICADOR_MARCO[marco]}</h3>
        <span className="text-[11px] text-slate-400">{ROTULO_MARCO[marco]}</span>
      </div>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
        {ind.realizado}
        <span className="text-base font-semibold text-slate-400">/{ind.total}</span>
        <span className="ml-2 text-sm font-semibold text-slate-500">{fmtPct(ind.percentual)}</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full ${corBarra}`} style={{ width: `${Math.min(100, ind.percentual * 100)}%` }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-500">Saldo</dt>
        <dd className="text-right font-semibold tabular-nums">{ind.saldo}</dd>
        <dt className="text-slate-500">Ritmo necessário</dt>
        <dd className="text-right font-semibold tabular-nums">
          {ind.ritmoNecessario === null ? '—' : ind.ritmoNecessario === Infinity ? 'prazo vencido' : `${fmtNum(ind.ritmoNecessario, 2)}/dia`}
        </dd>
        <dt className="text-slate-500">Ritmo real (4 sem.)</dt>
        <dd className="text-right font-semibold tabular-nums">{fmtNum(ind.ritmoReal, 2)}/dia</dd>
        <dt className="text-slate-500">Previsão de término</dt>
        <dd className={`text-right font-semibold tabular-nums ${ind.atrasado ? 'text-rose-600 dark:text-rose-400' : ''}`}>
          {ind.saldo === 0 ? 'concluído' : ind.previsao ? dataCurta(ind.previsao) : 'sem ritmo'}
        </dd>
        <dt className="text-slate-500">Prazo</dt>
        <dd className="text-right tabular-nums text-slate-600 dark:text-slate-300">{ind.prazo ? dataCurta(ind.prazo) : 'não definido'}</dd>
      </dl>
    </div>
  );
}

function TabelaMensal({ tramos, metas, prazos, hoje }: Props) {
  const mesAtual = chaveMes(hoje);
  const meses = useMemo(() => mesesDoPainel(tramos, metas, MARCOS_PAINEL, mesAtual), [tramos, metas, mesAtual]);
  const linhas = useMemo(
    () => Object.fromEntries(MARCOS_PAINEL.map(m => [m, linhaMensal(tramos, metas, m, meses, mesAtual)])) as Record<MarcoTramo, ReturnType<typeof linhaMensal>>,
    [tramos, metas, meses, mesAtual],
  );
  const th = 'px-2 py-2 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500';
  return (
    <div className={`${cardCls} overflow-x-auto`}>
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 dark:border-slate-800">
          <tr>
            <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500" rowSpan={2}>Mês</th>
            {MARCOS_PAINEL.map(m => (
              <th key={m} colSpan={2} className="border-l border-slate-100 px-2 pt-2 text-center text-xs font-bold text-slate-700 dark:border-slate-800 dark:text-slate-200">
                {INDICADOR_MARCO[m]}
              </th>
            ))}
          </tr>
          <tr>
            {MARCOS_PAINEL.map(m => (
              <React.Fragment key={m}>
                <th className={`${th} border-l border-slate-100 dark:border-slate-800`}>Plan</th>
                <th className={th}>Real</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {meses.map((mes, i) => (
            <tr key={mes} className={mes === mesAtual ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}>
              <td className="px-3 py-1.5 font-semibold">{nomeMesCurto(mes)}/{mes.slice(2, 4)}</td>
              {MARCOS_PAINEL.map(m => {
                const c = linhas[m][i];
                return (
                  <React.Fragment key={m}>
                    <td className="border-l border-slate-100 px-2 py-1.5 text-right tabular-nums text-slate-500 dark:border-slate-800">{c.plan ?? ''}</td>
                    <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${CLASSE_SITUACAO[c.situacao]}`}>{mes > mesAtual ? '' : c.real}</td>
                  </React.Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-slate-300 font-bold dark:border-slate-700">
          <tr>
            <td className="px-3 py-2">TOTAL</td>
            {MARCOS_PAINEL.map(m => {
              const plan = linhas[m].reduce((s, c) => s + (c.plan ?? 0), 0);
              const real = linhas[m].reduce((s, c) => s + c.real, 0);
              return (
                <React.Fragment key={m}>
                  <td className="border-l border-slate-100 px-2 py-2 text-right tabular-nums dark:border-slate-800">{plan || ''}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{real}</td>
                </React.Fragment>
              );
            })}
          </tr>
          <tr className="text-xs font-semibold text-slate-500">
            <td className="px-3 pb-2">Saldo</td>
            {MARCOS_PAINEL.map(m => {
              const total = prazos.find(p => p.marco === m)?.total ?? tramos.length;
              const real = linhas[m].reduce((s, c) => s + c.real, 0);
              return (
                <React.Fragment key={m}>
                  <td className="border-l border-slate-100 dark:border-slate-800" />
                  <td className="px-2 pb-2 text-right tabular-nums">{Math.max(0, total - real)}</td>
                </React.Fragment>
              );
            })}
          </tr>
        </tfoot>
      </table>
      <p className="px-3 pb-3 text-[11px] text-slate-500">
        Verde = bateu a meta; vermelho = mês fechado abaixo; âmbar = mês corrente ainda abaixo. NAV01 conta a liberação para a NAV02.
      </p>
    </div>
  );
}

function GraficoMensal({ tramos, metas, marco, hoje }: { tramos: TramoAtual[]; metas: MetaMarco[]; marco: MarcoTramo; hoje: string }) {
  const c = useChartConfig();
  const mesAtual = chaveMes(hoje);
  const dados = useMemo(() => {
    const meses = mesesDoPainel(tramos, metas, [marco], mesAtual);
    return linhaMensal(tramos, metas, marco, meses, mesAtual).map(x => ({
      rotulo: nomeMesCurto(x.mes),
      plan: x.plan,
      real: x.mes > mesAtual ? null : x.real,
    }));
  }, [tramos, metas, marco, mesAtual]);
  return (
    <ChartCard title={`${INDICADOR_MARCO[marco]} — Plan × Real por mês`} icon={BarChart3} height={280} empty={!dados.length}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={dados} margin={{ top: 20, right: 12, left: 0, bottom: 4 }} barGap={c.stackGap}>
          <CartesianGrid {...c.grid} />
          <XAxis dataKey="rotulo" {...c.xAxis} />
          <YAxis {...c.yAxis} width={36} allowDecimals={false} />
          <Tooltip content={<ChartTooltipPadrao />} cursor={c.cursor} />
          <Legend {...c.legend} />
          <Bar dataKey="plan" name="Plan" fill={c.tokens.series[1]} radius={c.radius.top} maxBarSize={32} {...c.animation}>
            <LabelList dataKey="plan" position="top" {...c.labelOnSurface} />
          </Bar>
          <Bar dataKey="real" name="Real" fill={c.tokens.series[0]} radius={c.radius.top} maxBarSize={32} {...c.animation}>
            <LabelList dataKey="real" position="top" {...c.labelOnSurface} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function ChartTooltipPadrao({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <ChartTooltip
      title={label}
      rows={payload.filter((p: any) => p.value !== null && p.value !== undefined).map((p: any) => ({ label: p.name, value: fmtNum(p.value, Number.isInteger(p.value) ? 0 : 1), color: p.color }))}
    />
  );
}

function CurvaS({ tramos, metas, marco, total, hoje }: { tramos: TramoAtual[]; metas: MetaMarco[]; marco: MarcoTramo; total: number; hoje: string }) {
  const c = useChartConfig();
  const semanaAtual = semanaISO(hoje);
  const pontos = useMemo(
    () => curvaSemanal({ tramos, metas, marco, total, ano: semanaAtual.ano, semanaAtual }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tramos, metas, marco, total, semanaAtual.ano, semanaAtual.semana],
  );
  const temSemanal = metas.some(m => m.marco === marco && m.granularidade === 'semana');
  return (
    <ChartCard
      title={`${INDICADOR_MARCO[marco]} — Acompanhamento semanal e acumulado`}
      icon={TrendingUp}
      description={
        temSemanal
          ? 'Barras: plano e realizado da semana. Linhas: acumulado; tracejado = projeção no ritmo das últimas 4 semanas.'
          : 'Barras: realizado da semana. Sem meta semanal, o plano acumulado sobe na semana em que o mês fecha. Tracejado = projeção no ritmo das últimas 4 semanas.'
      }
      height={340}
      minPlotWidth={estimateCategoryChartWidth(pontos.length, 40, 520)}
      empty={!pontos.length}
      emptyMessage="Sem metas nem realizado para este marco no ano."
    >
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={pontos} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid {...c.grid} />
          <XAxis dataKey="rotulo" {...c.xAxis} interval="preserveStartEnd" />
          <YAxis yAxisId="sem" {...c.yAxis} width={30} allowDecimals={false} />
          <YAxis yAxisId="acum" orientation="right" {...c.yAxis} width={36} domain={[0, total]} allowDecimals={false} />
          <Tooltip content={<ChartTooltipPadrao />} cursor={c.cursor} />
          <Legend {...c.legend} />
          {/* Plano da semana só existe com meta semanal; a mensal numa semana só viraria uma barra de 25. */}
          {temSemanal && (
            <Bar yAxisId="sem" dataKey="plan" name="Plano semana" fill={c.tokens.series[1]} fillOpacity={0.45} radius={c.radius.top} maxBarSize={14} {...c.animation} />
          )}
          <Bar yAxisId="sem" dataKey="real" name="Real semana" fill={c.tokens.series[0]} fillOpacity={0.45} radius={c.radius.top} maxBarSize={14} {...c.animation} />
          <Line yAxisId="acum" type="stepAfter" dataKey="planAcum" name="Plano acumulado" stroke={c.tokens.series[1]} strokeWidth={2.5} dot={false} {...c.animation} />
          <Line yAxisId="acum" dataKey="realAcum" name="Real acumulado" stroke={c.tokens.series[0]} strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls={false} {...c.animation} />
          <Line yAxisId="acum" dataKey="projecao" name="Projeção" stroke={c.tokens.inkMuted} strokeDasharray="6 4" strokeWidth={2} dot={false} {...c.animation} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function GradeTorres({ tramos }: { tramos: TramoAtual[] }) {
  const torres = useMemo(() => resumoTorres(tramos), [tramos]);
  const prontas = torres.filter(t => t.prontaParaExpedir).length;
  const expedidas = torres.filter(t => t.expedida).length;
  return (
    <section className={`${cardCls} p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-50">Torres</h3>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          <strong className="text-emerald-700 dark:text-emerald-400">{prontas}</strong> completa(s) no pátio, prontas para expedir ·{' '}
          <strong>{expedidas}</strong> expedida(s)
        </p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <div className="flex min-w-max gap-1">
          {torres.map(torre => (
            <div key={torre.torre} className={`flex flex-col items-center gap-1 rounded-lg p-0.5 ${torre.prontaParaExpedir ? 'ring-2 ring-emerald-500' : ''}`}>
              {[...torre.tramos].reverse().map(t => (
                <div
                  key={t.tramoId}
                  className="flex h-6 w-10 items-center justify-center rounded text-[10px] font-bold tabular-nums"
                  style={{ background: COR_ETAPA[t.etapa].fundo, color: COR_ETAPA[t.etapa].texto, border: `1px solid ${COR_ETAPA[t.etapa].borda}` }}
                  title={`${t.serie} · ${t.tramo} · ${CONFIG_ETAPA[t.etapa].rotulo}${t.atividadeAtual ? ` — ${t.atividadeAtual}` : ''}`}
                >
                  {t.serie}
                </div>
              ))}
              <span className="text-[11px] font-bold text-slate-500">{torre.torre}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-600 dark:text-slate-300">
        {ETAPAS_TRAMO.map(e => (
          <span key={e} className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm" style={{ background: COR_ETAPA[e].fundo, border: `1px solid ${COR_ETAPA[e].borda}` }} /> {CONFIG_ETAPA[e].rotulo}
          </span>
        ))}
        <span className="text-slate-400">· T5 no topo, T1 na base</span>
      </div>
    </section>
  );
}

export default function AvancoTramos({ tramos, metas, prazos, hoje }: Props) {
  const [marco, setMarco] = useState<MarcoTramo>('liberado_jato');
  const total = prazos.find(p => p.marco === marco)?.total ?? tramos.length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {MARCOS_PAINEL.map(m => (
          <CartaoMarco key={m} tramos={tramos} marco={m} prazo={prazos.find(p => p.marco === m)} hoje={hoje} />
        ))}
      </div>
      <TabelaMensal tramos={tramos} metas={metas} prazos={prazos} hoje={hoje} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold text-slate-500">Gráficos de</span>
        {MARCOS_PAINEL.map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMarco(m)}
            className={`min-h-[36px] rounded-xl px-3 text-xs font-bold ${
              marco === m ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {INDICADOR_MARCO[m]}
          </button>
        ))}
      </div>
      {/* Empilhados: lado a lado, a curva S (30+ semanas) ficava estreita e rolava. */}
      <div className="space-y-4">
        <GraficoMensal tramos={tramos} metas={metas} marco={marco} hoje={hoje} />
        <CurvaS tramos={tramos} metas={metas} marco={marco} total={total} hoje={hoje} />
      </div>
      <GradeTorres tramos={tramos} />
    </div>
  );
}
