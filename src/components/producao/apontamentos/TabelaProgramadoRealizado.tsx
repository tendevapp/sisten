/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tabela Programado × Realizado no layout da planilha da fábrica: TOTAL do ano
 * (Program., Realizado, Aderência) e, por semana, Program. e Realizado. O
 * realizado fica verde quando atinge o programado e vermelho quando fica
 * abaixo — com o sinal ▲/▼ junto, para não depender só da cor.
 *
 * No celular vira um cartão por etapa (TableCards), como o resto do SISTEN.
 */

import React, { useEffect, useRef } from 'react';
import { TableCards, TableDesktop } from '../../ui/DataTable';
import {
  formatarPercentual,
  intervaloSemana,
  mesmaSemana,
  rotuloSemana,
  semanaAteOuIgual,
  situacao,
  type Celula,
  type Matriz,
  type SemanaRef,
  type TotalLinha,
} from '../../../lib/producaoApontamentos';

interface Props {
  matriz: Matriz;
  semanaAtual: SemanaRef;
}

const COR: Record<'atingido' | 'abaixo' | 'vazio', string> = {
  atingido: 'var(--status-good)',
  abaixo: 'var(--status-critical)',
  vazio: 'var(--ink-muted)',
};

function Realizado({ programado, realizado, futura = false }: { programado: number | null; realizado: number; futura?: boolean }) {
  // Semana que ainda não chegou: sem realizado não é "abaixo", é "ainda não".
  const s = futura && realizado === 0 ? 'vazio' : situacao(programado, realizado);
  return (
    <span className="font-bold tabular-nums" style={{ color: COR[s] }} title={s === 'atingido' ? 'Atingiu o programado' : s === 'abaixo' ? 'Abaixo do programado' : undefined}>
      {s === 'vazio' ? '—' : realizado}
      {s === 'abaixo' && <span className="ml-0.5 text-[9px]">▼</span>}
    </span>
  );
}

function Aderencia({ total }: { total: TotalLinha }) {
  const s = situacao(total.programado, total.realizado);
  return (
    <span className="font-bold tabular-nums" style={{ color: COR[s] }}>
      {formatarPercentual(total.aderencia)}
    </span>
  );
}

const thBase = 'px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide';
const tdNum = 'px-2 py-2 text-center text-sm tabular-nums';
// Cabeçalhos com o amarelo/verde da planilha, discretos no tema do app.
const thProg = `${thBase} bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200`;
const thReal = `${thBase} bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200`;

function Celulas({ c, atual, futura }: { c: Celula; atual: boolean; futura: boolean }) {
  const fundo = atual ? 'bg-blue-50/60 dark:bg-blue-950/20' : futura ? 'bg-slate-50/70 dark:bg-slate-800/20' : '';
  return (
    <>
      <td className={`${tdNum} border-l border-slate-200 font-semibold text-slate-800 dark:border-slate-800 dark:text-slate-100 ${fundo}`}>{c.programado ?? '—'}</td>
      <td className={`${tdNum} ${fundo}`}>
        <Realizado programado={c.programado} realizado={c.realizado} futura={futura} />
      </td>
    </>
  );
}

export default function TabelaProgramadoRealizado({ matriz, semanaAtual }: Props) {
  const grupos = matriz.grupos.filter(g => g.linhas.length > 0);
  const futura = matriz.semanas.map(s => !semanaAteOuIgual(s, semanaAtual));
  // Celular: as últimas 5 semanas que já aconteceram.
  const indicesCartao = matriz.semanas
    .map((s, i) => ({ s, i }))
    .filter(x => !futura[x.i])
    .slice(-5);

  // Com a janela até a W52, abre já rolado para a semana atual.
  const rolagem = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rolagem.current;
    const th = el?.querySelector<HTMLElement>('[data-atual]');
    if (el && th) el.scrollLeft = Math.max(0, th.offsetLeft - el.clientWidth * 0.55);
  }, [matriz.semanas]);

  return (
    <>
      <TableDesktop>
        <div ref={rolagem} className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white dark:bg-slate-950">
                <th rowSpan={2} className="sticky left-0 z-10 bg-slate-900 px-3 py-2 text-left text-xs font-bold uppercase dark:bg-slate-950">
                  Etapa
                </th>
                <th colSpan={3} className="border-l border-slate-700 px-2 py-1.5 text-center text-xs font-bold">
                  TOTAL {matriz.anoTotal}
                  <span className="block text-[10px] font-normal text-slate-300">até {rotuloSemana(matriz.totalAte)}</span>
                </th>
                {matriz.semanas.map(s => (
                  <th
                    key={`${s.ano}-${s.semana}`}
                    colSpan={2}
                    title={intervaloSemana(s)}
                    data-atual={mesmaSemana(s, semanaAtual) ? '' : undefined}
                    className={`border-l border-slate-700 px-2 py-1.5 text-center text-xs font-bold ${mesmaSemana(s, semanaAtual) ? 'bg-blue-700' : ''}`}
                  >
                    {rotuloSemana(s)}
                    {mesmaSemana(s, semanaAtual) && <span className="ml-1 rounded bg-blue-500 px-1 text-[9px]">atual</span>}
                    <span className="block text-[10px] font-normal text-slate-300">{intervaloSemana(s)}</span>
                  </th>
                ))}
              </tr>
              <tr>
                <th className={thProg}>Program.</th>
                <th className={thReal}>Realizado</th>
                <th className={`${thBase} bg-lime-100 text-lime-900 dark:bg-lime-950/50 dark:text-lime-200`}>Ader.</th>
                {matriz.semanas.map(s => (
                  <React.Fragment key={`${s.ano}-${s.semana}`}>
                    <th className={thProg}>Program.</th>
                    <th className={thReal}>Realizado</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map(g => (
                <React.Fragment key={g.nave.id}>
                  <tr className="border-t-2 border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/70">
                    <td className="sticky left-0 z-10 bg-slate-100 px-3 py-2 text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {g.nave.titulo}
                    </td>
                    <td className={`${tdNum} border-l border-slate-200 font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200`}>{g.total.programado}</td>
                    <td className={tdNum}>
                      <Realizado programado={g.total.programado} realizado={g.total.realizado} />
                    </td>
                    <td className={tdNum}>
                      <Aderencia total={g.total} />
                    </td>
                    {g.semanas.map((c, i) => (
                      <Celulas key={i} c={c} atual={mesmaSemana(matriz.semanas[i], semanaAtual)} futura={futura[i]} />
                    ))}
                  </tr>
                  {g.linhas.map(l => (
                    <tr key={l.etapa.id} className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 text-sm font-semibold text-slate-800 dark:bg-slate-900 dark:text-slate-100">{l.etapa.nome}</td>
                      <td className={`${tdNum} border-l border-slate-200 font-semibold text-slate-800 dark:border-slate-800 dark:text-slate-100`}>{l.total.programado}</td>
                      <td className={tdNum}>
                        <Realizado programado={l.total.programado} realizado={l.total.realizado} />
                      </td>
                      <td className={tdNum}>
                        <Aderencia total={l.total} />
                      </td>
                      {l.semanas.map((c, i) => (
                        <Celulas key={i} c={c} atual={mesmaSemana(matriz.semanas[i], semanaAtual)} futura={futura[i]} />
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </TableDesktop>

      <TableCards className="space-y-4">
        {grupos.map(g => (
          <div key={g.nave.id} className="space-y-2">
            <div className="flex items-baseline justify-between px-1">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">{g.nave.titulo}</h3>
              <span className="text-xs">
                <Aderencia total={g.total} />
              </span>
            </div>
            {g.linhas.map(l => (
              <div key={l.etapa.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-50">{l.etapa.nome}</p>
                  <Aderencia total={l.total} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Total até {rotuloSemana(matriz.totalAte)}: {l.total.programado} programado ·{' '}
                  <Realizado programado={l.total.programado} realizado={l.total.realizado} /> realizado
                </p>
                <div className="mt-2 grid grid-cols-5 gap-1 text-center">
                  {indicesCartao.map(({ s, i }) => {
                    const c = l.semanas[i];
                    return (
                      <div key={`${s.ano}-${s.semana}`} className={`rounded-lg px-1 py-1 ${mesmaSemana(s, semanaAtual) ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
                        <p className="text-[10px] font-bold text-slate-500">{rotuloSemana(s)}</p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">{c.programado ?? '—'}</p>
                        <p className="text-xs">
                          <Realizado programado={c.programado} realizado={c.realizado} />
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </TableCards>
    </>
  );
}
