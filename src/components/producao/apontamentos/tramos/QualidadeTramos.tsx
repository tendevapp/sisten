/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reparos de solda e retrabalhos. Na planilha era um número por linha; aqui
 * cada reparo é um lançamento datado, então dá para ver por mês, por tipo de
 * tramo e quem mais concentra.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Wrench } from 'lucide-react';
import ChartCard from '../../../charts/ChartCard';
import ChartTooltip from '../../../charts/ChartTooltip';
import { useChartConfig } from '../../../charts/chartDefaults';
import { useToast } from '../../../ui/Toast';
import { CONFIG_ETAPA, nomeMesCurto, reparosPorMes, reparosPorTipo, type EventoTramo, type TramoAtual } from '../../../../lib/producaoTramos';
import { listarEventosPorTipo } from '../../../../lib/producaoTramosApi';
import { cardCls } from '../estilos';
import { COR_ETAPA, fmtNum } from './visual';

interface Props {
  tramos: TramoAtual[];
  onAbrir: (t: TramoAtual) => void;
}

function TooltipSimples({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return <ChartTooltip title={label} rows={[{ label: 'Reparos', value: fmtNum(payload[0].value), color: payload[0].color }]} />;
}

export default function QualidadeTramos({ tramos, onAbrir }: Props) {
  const c = useChartConfig();
  const toast = useToast();
  const [eventos, setEventos] = useState<EventoTramo[] | null>(null);

  useEffect(() => {
    listarEventosPorTipo('reparo')
      .then(setEventos)
      .catch(e => toast.error(e instanceof Error ? e.message : 'Não foi possível ler os reparos.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tramos]);

  const porMes = useMemo(
    () => [...reparosPorMes(eventos ?? []).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, reparos]) => ({ rotulo: `${nomeMesCurto(mes)}/${mes.slice(2, 4)}`, reparos })),
    [eventos],
  );
  const porTipo = useMemo(() => reparosPorTipo(tramos), [tramos]);
  const total = tramos.reduce((s, t) => s + t.reparosSolda, 0);
  const comReparo = tramos.filter(t => t.reparosSolda > 0).length;
  const soldados = tramos.filter(t => t.marcos.liberado_jato).length;
  const top = useMemo(() => [...tramos].filter(t => t.reparosSolda > 0).sort((a, b) => b.reparosSolda - a.reparosSolda).slice(0, 10), [tramos]);
  const retrabalhos = useMemo(() => tramos.filter(t => /retrabalho|reparo/i.test(t.atividadeAtual ?? '') && t.etapa !== 'expedido'), [tramos]);
  const maxTop = top[0]?.reparosSolda ?? 1;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Reparos de solda', fmtNum(total)],
          ['Tramos com reparo', `${comReparo} de ${tramos.filter(t => t.etapa !== 'corte').length}`],
          ['Média por tramo liberado p/ Jato', soldados ? fmtNum(tramos.filter(t => t.marcos.liberado_jato).reduce((s, t) => s + t.reparosSolda, 0) / soldados, 1) : '—'],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className={`${cardCls} p-4`}>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{rotulo}</span>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{valor}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Reparos de solda por mês"
          icon={Wrench}
          description="Os reparos importados da planilha entram no mês da liberação para o Jato; os novos, na data do lançamento."
          height={260}
          loading={!eventos}
          empty={!!eventos && !porMes.length}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porMes} margin={{ top: 20, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid {...c.grid} />
              <XAxis dataKey="rotulo" {...c.xAxis} />
              <YAxis {...c.yAxis} width={36} allowDecimals={false} />
              <Tooltip content={<TooltipSimples />} cursor={c.cursor} />
              <Bar dataKey="reparos" fill={c.tokens.series[0]} radius={c.radius.top} maxBarSize={40} {...c.animation}>
                <LabelList dataKey="reparos" position="top" {...c.labelOnSurface} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <section className={`${cardCls} p-4`}>
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-50">Por tipo de tramo</h3>
          <table className="mt-3 min-w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1.5 text-left">Tipo</th>
                <th className="px-2 py-1.5 text-right">Tramos iniciados</th>
                <th className="px-2 py-1.5 text-right">Reparos</th>
                <th className="px-2 py-1.5 text-right">Média</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {porTipo.map(l => (
                <tr key={l.tipo}>
                  <td className="py-1.5 font-semibold">{l.tipo}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{l.tramos}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{l.reparos}</td>
                  <td className="px-2 py-1.5 text-right font-bold tabular-nums">{fmtNum(l.media, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={`${cardCls} p-4`}>
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-50">Tramos com mais reparos</h3>
          <ul className="mt-3 space-y-1.5">
            {top.map(t => (
              <li key={t.tramoId}>
                <button type="button" onClick={() => onAbrir(t)} className="flex w-full items-center gap-3 text-left">
                  <span className="w-12 font-mono text-sm font-bold">{t.serie}</span>
                  <span className="w-8 text-xs text-slate-500">{t.tramo}</span>
                  <span className="h-4 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                    <span className="block h-full rounded bg-rose-500" style={{ width: `${(t.reparosSolda / maxTop) * 100}%` }} />
                  </span>
                  <span className="w-8 text-right text-sm font-bold tabular-nums">{t.reparosSolda}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className={`${cardCls} p-4`}>
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-50">Em retrabalho agora</h3>
          <p className="text-xs text-slate-500">Situação atual com "reparo" ou "retrabalho".</p>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {retrabalhos.map(t => (
              <li key={t.tramoId}>
                <button type="button" onClick={() => onAbrir(t)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <span className="w-12 font-mono text-sm font-bold">{t.serie}</span>
                  <span className="rounded px-1 py-0.5 text-[10px] font-bold" style={{ background: COR_ETAPA[t.etapa].fundo, color: COR_ETAPA[t.etapa].texto }}>
                    {CONFIG_ETAPA[t.etapa].rotulo}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs">{t.atividadeAtual}</span>
                </button>
              </li>
            ))}
            {!retrabalhos.length && <li className="py-2 text-xs text-slate-500">Nenhum tramo em retrabalho.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
