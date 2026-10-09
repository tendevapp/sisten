/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Geral › Relatórios — "Prazo por etapa": quantos dos 115 tramos da 1ª fase
 * já passaram por cada etapa e quanto falta até a data final de cada uma, para
 * todos ficarem prontos na W49.
 *
 * Fonte: apontamentos por tramo da Produção (sem lançamento próprio). As datas
 * finais são do Planejamento (Produção › Apontamentos › Programação).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, RefreshCw } from 'lucide-react';
import {
  buscarRelatorioEtapas,
  dataDiaMes,
  JANELA_RITMO_DIAS_UTEIS,
  montarLinhas,
  semanaMeta,
  type LinhaRelatorioEtapa,
  type StatusEtapa,
} from '../../lib/producaoRelatorioEtapas';

const PILULA: Record<StatusEtapa, string> = {
  concluida: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  no_prazo: 'bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100',
  risco: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100',
  atrasada: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
};

const ROTULO_STATUS: Record<StatusEtapa, string> = {
  concluida: 'Concluída',
  no_prazo: 'No ritmo',
  risco: 'Ritmo abaixo do necessário',
  atrasada: 'Data final vencida',
};

const fmt = (v: number, casas = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

function Linha({ l, par }: { l: LinhaRelatorioEtapa; par: boolean }) {
  const pct = Math.round(l.percentual * 100);
  return (
    <tr className={par ? 'bg-slate-50/80 dark:bg-slate-800/40' : ''}>
      <td className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
        {l.nome}
        {l.escopo === 'T1' && <span className="ml-1.5 text-[10px] font-medium text-slate-400">(T1, 1 por torre)</span>}
        {!l.regraValida && <span className="ml-1.5 text-[10px] font-medium text-rose-500">regra sem situação cadastrada</span>}
      </td>
      <td className="px-3 py-3 text-center text-sm tabular-nums text-slate-600 dark:text-slate-300">{l.prontos}</td>
      <td className="px-3 py-3 text-center font-display text-lg font-extrabold tabular-nums text-slate-900 dark:text-slate-50">{l.falta}</td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="h-2.5 min-w-[6rem] flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <span className="w-10 text-right text-xs font-bold tabular-nums text-blue-700 dark:text-blue-300">{pct}%</span>
        </div>
      </td>
      <td className="px-3 py-3 text-center text-sm tabular-nums text-slate-600 dark:text-slate-300">{l.dataFinal ? dataDiaMes(l.dataFinal) : '—'}</td>
      <td className="hidden px-3 py-3 text-center text-xs tabular-nums text-slate-600 md:table-cell dark:text-slate-300">
        {l.falta === 0 ? '—' : (
          <>
            <span className={l.status === 'risco' || l.status === 'atrasada' ? 'font-bold text-amber-700 dark:text-amber-300' : ''}>
              {l.ritmoNecessario === null ? '—' : l.ritmoNecessario === Infinity ? 'vencido' : fmt(l.ritmoNecessario)}
            </span>
            <span className="text-slate-400"> / {fmt(l.ritmoReal)}</span>
          </>
        )}
      </td>
      <td className="hidden px-3 py-3 text-center text-xs tabular-nums text-slate-600 lg:table-cell dark:text-slate-300">
        {l.falta === 0 ? 'pronto' : l.previsao ? dataDiaMes(l.previsao) : 'sem ritmo'}
      </td>
      <td className="px-3 py-3 text-center">
        <span
          title={ROTULO_STATUS[l.status]}
          className={`inline-flex min-w-[2.75rem] justify-center rounded-full px-2.5 py-1 font-display text-base font-extrabold tabular-nums ${PILULA[l.status]}`}
        >
          {l.status === 'concluida' ? '✓' : l.diasRestantes ?? '—'}
        </span>
      </td>
    </tr>
  );
}

/** Celular: um cartão por etapa (a tabela larga não cabe). */
function CartaoEtapa({ l }: { l: LinhaRelatorioEtapa }) {
  const pct = Math.round(l.percentual * 100);
  return (
    <li className="space-y-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-50">
            {l.nome}
            {l.escopo === 'T1' && <span className="ml-1 text-[10px] font-medium text-slate-400">(só T1)</span>}
          </p>
          <p className="text-xs text-slate-500">
            {l.prontos} prontos · falta <strong className="text-slate-900 dark:text-slate-100">{l.falta}</strong>
            {l.dataFinal && <> · até {dataDiaMes(l.dataFinal)}</>}
          </p>
        </div>
        <span className={`inline-flex shrink-0 flex-col items-center rounded-2xl px-3 py-1 ${PILULA[l.status]}`} title={ROTULO_STATUS[l.status]}>
          <span className="font-display text-lg font-extrabold leading-none tabular-nums">{l.status === 'concluida' ? '✓' : l.diasRestantes ?? '—'}</span>
          <span className="text-[9px] font-semibold uppercase">dias</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <span className="w-9 text-right text-xs font-bold tabular-nums text-blue-700 dark:text-blue-300">{pct}%</span>
      </div>
      {l.falta > 0 && (
        <p className="text-[11px] text-slate-500">
          Ritmo necessário{' '}
          <strong className={l.status === 'risco' || l.status === 'atrasada' ? 'text-amber-700 dark:text-amber-300' : ''}>
            {l.ritmoNecessario === null ? '—' : l.ritmoNecessario === Infinity ? 'vencido' : fmt(l.ritmoNecessario)}
          </strong>{' '}
          × real {fmt(l.ritmoReal)} tramo/dia · previsão {l.previsao ? dataDiaMes(l.previsao) : 'sem ritmo'}
        </p>
      )}
    </li>
  );
}

export default function RelatorioPrazoEtapas() {
  const [linhas, setLinhas] = useState<LinhaRelatorioEtapa[] | null>(null);
  const [hoje, setHoje] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const dados = await buscarRelatorioEtapas();
      setHoje(dados.hoje);
      setLinhas(montarLinhas(dados));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o relatório.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const meta = useMemo(() => (linhas ? semanaMeta(linhas) : null), [linhas]);
  const contagem = useMemo(() => {
    const c: Record<StatusEtapa, number> = { concluida: 0, no_prazo: 0, risco: 0, atrasada: 0 };
    for (const l of linhas ?? []) c[l.status] += 1;
    return c;
  }, [linhas]);
  const th = 'px-3 py-2.5 text-center text-[11px] font-bold uppercase leading-tight tracking-wide text-white';

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-50">
            <CalendarClock className="h-5 w-5 text-blue-600" /> Prazo por etapa — 115 tramos prontos {meta ? `na ${meta}` : ''}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            1ª fase (torres 1 a 23). Cada etapa precisa terminar na data final para a montagem fechar no prazo.
            {hoje && ` Posição de ${hoje.slice(8, 10)}/${hoje.slice(5, 7)}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          {(['atrasada', 'risco', 'no_prazo', 'concluida'] as StatusEtapa[]).map(s => (
            <span key={s} className={`rounded-full px-2.5 py-1 ${PILULA[s]}`}>
              {contagem[s]} {ROTULO_STATUS[s].toLowerCase()}
            </span>
          ))}
          <button
            type="button"
            onClick={() => void carregar()}
            className="rounded-xl border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {erro ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{erro}</p>
      ) : !linhas ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : (
        <>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:hidden dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {linhas.map(l => <CartaoEtapa key={l.codigo} l={l} />)}
        </ul>
        <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block dark:border-slate-800 dark:bg-slate-900">
          {/* data-no-cards: a tabela tem versão própria para celular (cartões acima). */}
          <table data-no-cards className="w-full min-w-[40rem]">
            <thead className="bg-[#1e3a5f]">
              <tr>
                <th className={`${th} text-left`}>Atividade</th>
                <th className={th}>Tramos<br />prontos</th>
                <th className={th}>Falta<br /><span className="text-[9px] font-medium normal-case">(tramos)</span></th>
                <th className={th}>Progresso</th>
                <th className={th}>Data<br />final</th>
                <th className={`${th} hidden md:table-cell`}>Ritmo<br /><span className="text-[9px] font-medium normal-case">(necessário / real, tramos/dia)</span></th>
                <th className={`${th} hidden lg:table-cell`}>Previsão<br /><span className="text-[9px] font-medium normal-case">(no ritmo real)</span></th>
                <th className={th}>Faltam<br /><span className="text-[9px] font-medium normal-case">(dias)</span></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => <Linha key={l.codigo} l={l} par={i % 2 === 1} />)}
            </tbody>
          </table>
        </div>
        </>
      )}

      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        <strong>Fonte:</strong> apontamentos por tramo da Produção (Produção › Apontamentos). A etapa conta como pronta quando o tramo chega à
        etapa seguinte — ex.: o Jato está pronto quando o tramo entra em Pintura; Internos, na liberação para o Jato. Marco Porta conta só os
        T1 (um por torre). <strong>Faltam (dias):</strong> segunda a sábado, sem os feriados do calendário do Planejamento, de hoje até a data
        final. <strong>Ritmo real:</strong> média dos últimos {JANELA_RITMO_DIAS_UTEIS} dias úteis. Cor do número: azul no ritmo, âmbar
        ritmo abaixo do necessário, vermelho data vencida, verde concluída.
      </p>
    </section>
  );
}
