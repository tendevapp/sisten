/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Prazos e gargalos — as colunas "Dias" da planilha viram indicador: lead
 * time por trecho (mediana e P80 por mês de conclusão), envelhecimento do
 * que está em processo agora e a lista dos tramos mais parados.
 */

import React, { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Timer } from 'lucide-react';
import ChartCard from '../../../charts/ChartCard';
import ChartTooltip from '../../../charts/ChartTooltip';
import { useChartConfig } from '../../../charts/chartDefaults';
import {
  CONFIG_ETAPA,
  FAIXAS_ENVELHECIMENTO,
  TRECHOS,
  diasNaEtapa,
  duracoesTrecho,
  envelhecimento,
  faixaEspera,
  leadTimePorMes,
  nomeMesCurto,
  referenciasEspera,
  resumoDuracoes,
  type TramoAtual,
} from '../../../../lib/producaoTramos';
import { cardCls } from '../estilos';
import { CLASSE_FAIXA, COR_ETAPA, fmtNum } from './visual';

interface Props {
  tramos: TramoAtual[];
  hoje: string;
  onAbrir: (t: TramoAtual) => void;
}

function TooltipLead({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <ChartTooltip
      title={label}
      subtitle={`${p.n} tramo(s) concluído(s)`}
      rows={[
        { label: 'Mediana', value: `${fmtNum(p.mediana)} dias`, color: payload[0].color },
        { label: 'P80', value: `${fmtNum(p.p80)} dias` },
        { label: 'Máximo', value: `${fmtNum(p.maximo)} dias` },
      ]}
    />
  );
}

export default function GargalosTramos({ tramos, hoje, onAbrir }: Props) {
  const c = useChartConfig();
  const [trechoId, setTrechoId] = useState('nav02');
  const trecho = TRECHOS.find(t => t.id === trechoId)!;
  const resumos = useMemo(() => TRECHOS.map(t => ({ trecho: t, ...resumoDuracoes(duracoesTrecho(tramos, t).map(d => d.dias)) })), [tramos]);
  const porMes = useMemo(() => leadTimePorMes(tramos, trecho).map(l => ({ ...l, rotulo: `${nomeMesCurto(l.mes)}/${l.mes.slice(2, 4)}` })), [tramos, trecho]);
  const wip = useMemo(() => envelhecimento(tramos, hoje), [tramos, hoje]);
  const refs = useMemo(() => referenciasEspera(tramos), [tramos]);
  const parados = useMemo(
    () =>
      tramos
        .map(t => ({ t, dias: diasNaEtapa(t, hoje) }))
        .filter((x): x is { t: TramoAtual; dias: number } => x.dias !== null && x.t.etapa !== 'corte')
        .sort((a, b) => b.dias - a.dias)
        .slice(0, 15),
    [tramos, hoje],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {resumos.map(r => (
          <button
            key={r.trecho.id}
            type="button"
            onClick={() => setTrechoId(r.trecho.id)}
            className={`${cardCls} p-3 text-left transition ${trechoId === r.trecho.id ? 'ring-2 ring-blue-600' : 'hover:border-slate-400'}`}
          >
            <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">{r.trecho.rotulo}</span>
            <span className="mt-1 block font-display text-xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
              {fmtNum(r.mediana)} <span className="text-xs font-semibold text-slate-500">dias (mediana)</span>
            </span>
            <span className="block text-[11px] text-slate-500">
              P80 {fmtNum(r.p80)} · máx {fmtNum(r.maximo)} · {r.n} tramos
            </span>
          </button>
        ))}
      </div>

      <ChartCard
        title={`Lead time — ${trecho.rotulo}`}
        icon={Timer}
        description="Por mês em que o trecho terminou. Barra = mediana; linha = P80 (8 em cada 10 tramos levaram até isso)."
        height={280}
        empty={!porMes.length}
        emptyMessage="Nenhum tramo concluiu este trecho ainda."
      >
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={porMes} margin={{ top: 20, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid {...c.grid} />
            <XAxis dataKey="rotulo" {...c.xAxis} />
            <YAxis {...c.yAxis} width={36} allowDecimals={false} />
            <Tooltip content={<TooltipLead />} cursor={c.cursor} />
            <Legend {...c.legend} />
            <Bar dataKey="mediana" name="Mediana (dias)" fill={c.tokens.series[0]} radius={c.radius.top} maxBarSize={40} {...c.animation}>
              <LabelList dataKey="mediana" position="top" formatter={(v: number) => fmtNum(v)} {...c.labelOnSurface} />
            </Bar>
            <Line dataKey="p80" name="P80 (dias)" stroke={c.tokens.series[3] ?? c.tokens.inkPrimary} strokeWidth={2} dot={{ r: 3 }} {...c.animation} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={`${cardCls} overflow-x-auto p-4`}>
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-50">Em processo agora — dias na etapa</h3>
          <p className="text-xs text-slate-500">Quanto tempo os tramos estão parados na etapa atual. A planilha só mostrava isso depois que o tramo saía.</p>
          <table className="mt-3 min-w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1.5 text-left">Etapa</th>
                {FAIXAS_ENVELHECIMENTO.map(f => (
                  <th key={f.id} className="px-2 py-1.5 text-right">{f.rotulo}</th>
                ))}
                <th className="px-2 py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {wip.map(l => (
                <tr key={l.etapa}>
                  <td className="py-1.5 font-semibold">
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR_ETAPA[l.etapa].fundo }} />
                    {CONFIG_ETAPA[l.etapa].rotulo}
                  </td>
                  {FAIXAS_ENVELHECIMENTO.map(f => (
                    <td key={f.id} className={`px-2 py-1.5 text-right tabular-nums ${f.id === 'mais60' && l[f.id] ? 'font-bold text-rose-600 dark:text-rose-400' : ''}`}>
                      {l[f.id] || ''}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-bold tabular-nums">{l.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={`${cardCls} p-4`}>
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-50">Mais parados</h3>
          <p className="text-xs text-slate-500">Âmbar acima da mediana da etapa; vermelho acima do P80. Toque para apontar.</p>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {parados.map(({ t, dias }) => (
              <li key={t.tramoId}>
                <button type="button" onClick={() => onAbrir(t)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <span className="w-12 font-mono text-sm font-bold">{t.serie}</span>
                  <span className="w-24 shrink-0 text-xs text-slate-500">{t.tramo} · Torre {t.torreNumero}</span>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    <span className="mr-1 rounded px-1 py-0.5 text-[10px] font-bold" style={{ background: COR_ETAPA[t.etapa].fundo, color: COR_ETAPA[t.etapa].texto }}>
                      {CONFIG_ETAPA[t.etapa].rotulo}
                    </span>
                    {t.atividadeAtual}
                  </span>
                  <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${CLASSE_FAIXA[faixaEspera(dias, refs[t.etapa])]}`}>{dias}d</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
