/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Os tramos no layout da aba TRAMOS (somente leitura). Clicar na linha abre o
 * mesmo apontamento do quadro.
 */

import React, { useMemo } from 'react';
import { semanaISO } from '../../../../lib/producaoApontamentos';
import { dataCurta, type TramoAtual } from '../../../../lib/producaoTramos';
import { linhasPlanilhaTramos } from '../../../../lib/producaoTramosExportar';
import { COR_ETAPA } from './visual';

const d = (v?: string) => (v ? dataCurta(v).slice(0, 5) : '');
const w = (v?: string) => (v ? `W${String(semanaISO(v).semana).padStart(2, '0')}` : '');

export default function TabelaTramosPlanilha({ tramos, onAbrir }: { tramos: TramoAtual[]; onAbrir: (t: TramoAtual) => void }) {
  const linhas = useMemo(() => linhasPlanilhaTramos(tramos), [tramos]);
  const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide dark:border-slate-700';
  const grupo = (cor: string) => ({ background: cor, color: '#1e293b' });
  const td = 'whitespace-nowrap px-2 py-1.5 font-mono text-xs tabular-nums';

  return (
    <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="min-w-full bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100">
        <thead>
          <tr className="text-slate-700 dark:text-slate-200">
            <th className={`${th} bg-slate-100 dark:bg-slate-800`}>Item</th>
            <th className={`${th} bg-slate-100 dark:bg-slate-800`}>Setor</th>
            <th className={`${th} bg-slate-100 dark:bg-slate-800`}>Tramo</th>
            <th className={`${th} bg-slate-100 dark:bg-slate-800`}>Seq.</th>
            <th className={`${th} bg-slate-100 dark:bg-slate-800`}>Atividade</th>
            <th className={`${th} bg-slate-100 dark:bg-slate-800`}>Reparo</th>
            <th className={`${th} bg-slate-100 dark:bg-slate-800`}>Início</th>
            <th className={th} style={grupo('#fef08a')}>NAV02</th>
            <th className={th} style={grupo('#fef08a')}>Sem.</th>
            <th className={th} style={grupo('#bae6fd')}>Jato</th>
            <th className={th} style={grupo('#bae6fd')}>Sem.</th>
            <th className={th} style={grupo('#bae6fd')}>Dias</th>
            <th className={th} style={grupo('#bbf7d0')}>Pátio</th>
            <th className={th} style={grupo('#bbf7d0')}>Sem.</th>
            <th className={th} style={grupo('#bbf7d0')}>Dias</th>
            <th className={th} style={grupo('#bbf7d0')}>Em proc.</th>
            <th className={`${th} bg-zinc-800 text-white`}>Expedido</th>
            <th className={`${th} bg-zinc-800 text-white`}>Sem.</th>
            <th className={`${th} bg-zinc-800 text-white`}>Dias</th>
            <th className={`${th} bg-zinc-800 text-white`}>Início×Fim</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {linhas.map(({ item, tramo: t, setor, atividade, dias }) => (
            <tr key={t.tramoId} onClick={() => onAbrir(t)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <td className={td}>{item}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-xs">
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: COR_ETAPA[t.etapa].fundo }} />
                {setor}
              </td>
              <td className={td}>{t.tramo}</td>
              <td className={`${td} font-bold`}>{t.serie}</td>
              <td className="max-w-[16rem] truncate px-2 py-1.5 text-xs" title={atividade}>{atividade}</td>
              <td className={`${td} ${t.reparosSolda >= 10 ? 'font-bold text-rose-600' : ''}`}>{t.reparosSolda || ''}</td>
              <td className={td}>{d(t.marcos.inicio)}</td>
              <td className={td}>{d(t.marcos.liberado_nav02)}</td>
              <td className={td}>{w(t.marcos.liberado_nav02)}</td>
              <td className={td}>{d(t.marcos.liberado_jato)}</td>
              <td className={td}>{w(t.marcos.liberado_jato)}</td>
              <td className={td}>{dias.nav02Jato ?? ''}</td>
              <td className={td}>{d(t.marcos.liberado_patio)}</td>
              <td className={td}>{w(t.marcos.liberado_patio)}</td>
              <td className={td}>{dias.jatoPatio ?? ''}</td>
              <td className={td}>{dias.processo ?? ''}</td>
              <td className={td}>{d(t.marcos.expedido)}</td>
              <td className={td}>{w(t.marcos.expedido)}</td>
              <td className={td}>{dias.patioExpedido ?? ''}</td>
              <td className={td}>{dias.inicioFim ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
