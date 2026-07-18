/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { EnrichedSAPRecord } from '../../types';
import { bucketDate, resolveDataCorte, CompradorInfo, Granularidade, resolveComprador } from '../../lib/demandas';

interface QuantidadesPeriodoTableProps {
  records: EnrichedSAPRecord[];
  compradores: CompradorInfo[];
  granularidade: Granularidade;
}

interface PeriodCounts { rm: number; po: number; aberto: number; }

type Metrica = 'RM' | 'PO' | 'Aberto';
const METRICAS: Metrica[] = ['RM', 'PO', 'Aberto'];
const METRICA_STYLE: Record<Metrica, string> = {
  RM: 'text-slate-700',
  PO: 'text-slate-700',
  Aberto: 'text-red-600',
};

// Agrupamento de colunas segue o toggle dia/semana/mês do dashboard.
export default function QuantidadesPeriodoTable({ records, compradores, granularidade }: QuantidadesPeriodoTableProps) {
  const { columns, byBuyer } = useMemo(() => {
    const colMap = new Map<string, { label: string; rangeLabel?: string }>();
    const buyerMap = new Map<string, Map<string, PeriodCounts>>();

    // Cada registro é contado no período do corte (resolveDataCorte): a data
    // do pedido quando já há PO colocado, senão a data de solicitação — assim
    // uma RM antiga que só ganha PO no período filtrado conta nesse período,
    // não no da solicitação original. Aberto é a contagem de itens ainda sem
    // pedido colocado naquele período.
    records.forEach(r => {
      const nome = resolveComprador(r, compradores);
      if (!buyerMap.has(nome)) buyerMap.set(nome, new Map());
      const periods = buyerMap.get(nome)!;

      const bucket = bucketDate(resolveDataCorte(r), granularidade);
      if (!bucket) return;
      if (!colMap.has(bucket.key)) colMap.set(bucket.key, { label: bucket.label, rangeLabel: bucket.rangeLabel });
      if (!periods.has(bucket.key)) periods.set(bucket.key, { rm: 0, po: 0, aberto: 0 });
      const entry = periods.get(bucket.key)!;
      entry.rm += 1;
      if (r.status_requisicao === 'Processado') entry.po += 1;
      else entry.aberto += 1;
    });

    const columns = Array.from(colMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, v]) => ({ key, ...v }));

    return { columns, byBuyer: buyerMap };
  }, [records, compradores, granularidade]);

  const buyers = useMemo(() => {
    return Array.from(byBuyer.entries())
      .map(([nome, periods]) => {
        const rm = columns.map(c => periods.get(c.key)?.rm || 0);
        const po = columns.map(c => periods.get(c.key)?.po || 0);
        const aberto = columns.map(c => periods.get(c.key)?.aberto || 0);
        const totalRm = rm.reduce((a, b) => a + b, 0);
        const totalPo = po.reduce((a, b) => a + b, 0);
        const totalAberto = aberto.reduce((a, b) => a + b, 0);
        return { nome, rm, po, aberto, totalRm, totalPo, totalAberto };
      })
      .sort((a, b) => b.totalRm - a.totalRm);
  }, [byBuyer, columns]);

  const grandTotal = useMemo(() => buyers.reduce((acc, r) => ({
    rm: acc.rm + r.totalRm,
    po: acc.po + r.totalPo,
    aberto: acc.aberto + r.totalAberto,
  }), { rm: 0, po: 0, aberto: 0 }), [buyers]);

  const valuesFor = (b: typeof buyers[number], metrica: Metrica) =>
    metrica === 'RM' ? b.rm : metrica === 'PO' ? b.po : b.aberto;
  const totalFor = (b: typeof buyers[number], metrica: Metrica) =>
    metrica === 'RM' ? b.totalRm : metrica === 'PO' ? b.totalPo : b.totalAberto;

  const metricaColClass = 'sticky left-0 z-10 bg-white w-20 py-1.5 pr-2';
  const compradorColClass = 'sticky left-20 z-10 bg-white w-40 py-1.5 pr-4';

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
          Quantidades por {granularidade === 'dia' ? 'Dia' : granularidade === 'mes' ? 'Mês' : 'Semana'} e Comprador
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">Agrupado por métrica (RM, PO, Aberto) para comparar todos os compradores na mesma métrica</p>
      </div>

      {buyers.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-slate-400">
          Nenhuma demanda no período/filtro selecionado.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <th className={`${metricaColClass} text-left`}>Métrica</th>
                <th className={`${compradorColClass} text-left`}>Comprador</th>
                {columns.map(c => (
                  <th key={c.key} title={c.rangeLabel} className="py-2 px-3 text-right whitespace-nowrap">{c.label}</th>
                ))}
                <th className="py-2 pl-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {METRICAS.map(metrica => (
                <React.Fragment key={metrica}>
                  {buyers.map((b, i) => (
                    <tr key={`${metrica}-${b.nome}`} className={i === buyers.length - 1 ? 'border-b border-slate-100' : ''}>
                      {i === 0 && (
                        <td rowSpan={buyers.length} className={`${metricaColClass} align-top font-semibold ${METRICA_STYLE[metrica]}`}>
                          {metrica}
                        </td>
                      )}
                      <td className={`${compradorColClass} text-slate-600`}>{b.nome}</td>
                      {valuesFor(b, metrica).map((v, idx) => (
                        <td key={columns[idx].key} className={`py-1.5 px-3 text-right ${metrica === 'Aberto' ? `font-medium ${v > 0 ? 'text-red-600' : 'text-emerald-600'}` : 'text-slate-600'}`}>{v}</td>
                      ))}
                      <td className={`py-1.5 pl-4 text-right font-semibold ${metrica === 'Aberto' ? (totalFor(b, metrica) > 0 ? 'text-red-600' : 'text-emerald-600') : 'text-slate-800'}`}>{totalFor(b, metrica)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 text-xs font-bold text-slate-700">
                <td colSpan={2} className="sticky left-0 z-10 bg-white py-2 pr-4">Total Geral (RM / PO / Aberto)</td>
                {columns.map((c, i) => {
                  const colRm = buyers.reduce((a, b) => a + b.rm[i], 0);
                  const colPo = buyers.reduce((a, b) => a + b.po[i], 0);
                  const colAberto = buyers.reduce((a, b) => a + b.aberto[i], 0);
                  return (
                    <td key={c.key} className="py-2 px-3 text-right whitespace-nowrap">
                      {colRm}/{colPo}/<span className={colAberto > 0 ? 'text-red-600' : 'text-emerald-600'}>{colAberto}</span>
                    </td>
                  );
                })}
                <td className="py-2 pl-4 text-right whitespace-nowrap">
                  {grandTotal.rm}/{grandTotal.po}/<span className={grandTotal.aberto > 0 ? 'text-red-600' : 'text-emerald-600'}>{grandTotal.aberto}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
