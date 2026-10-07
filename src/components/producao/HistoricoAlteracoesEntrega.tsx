/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Histórico de alterações do Controle de Entrega (prod_tramos_entrega_log).
 *
 * - completo: lista de todas as mudanças por dia, com filtros (período, série,
 *   autor, tipo) e exportação XLSX — aberto pelo botão "Histórico" da página;
 * - compacto: as últimas mudanças de um tramo, dentro do modal do tramo.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, History, Loader2, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '../ui/Toast';
import { hojeLocal, adicionarDias, formatarDataBR } from '../../lib/producaoApontamentos';
import {
  autorRegistro,
  dataHoraBR,
  diaLocal,
  filtrarRegistros,
  identificacaoTramo,
  linhasAlteracao,
  listarLogEntrega,
  resumoRegistro,
  type FiltroTela,
  type RegistroLogEntrega,
} from '../../lib/producaoEntregaLog';
import type { TramoEntrega } from '../../lib/producaoEntrega';

interface Props {
  /** Só as mudanças deste tramo (modo compacto). */
  tramoId?: string;
  /** Tramos atuais, para identificar torre/posição/série no checklist. */
  tramos?: TramoEntrega[];
  compacto?: boolean;
}

const inputCls =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

function Registro({ r, porId, mostrarTramo, mostrarData = false }: { r: RegistroLogEntrega; porId: Map<string, TramoEntrega>; mostrarTramo: boolean; mostrarData?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const linhas = linhasAlteracao(r);
  const expansivel = linhas.length > 0;
  return (
    <li className="py-2">
      <button
        type="button"
        onClick={() => expansivel && setAberto(a => !a)}
        className={`flex w-full items-start gap-2 text-left ${expansivel ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span className="mt-0.5 shrink-0 text-slate-400">
          {expansivel ? aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" /> : <span className="inline-block w-3.5" />}
        </span>
        <span className={`${mostrarData ? 'w-24' : 'w-11'} shrink-0 font-mono text-[11px] text-slate-500`}>
          {mostrarData ? dataHoraBR(r.createdAt) : dataHoraBR(r.createdAt).slice(9)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">
            {mostrarTramo && <span className="mr-1.5 font-mono text-slate-600 dark:text-slate-300">{identificacaoTramo(r, porId)}</span>}
            {resumoRegistro(r)}
          </span>
          <span className="block text-[11px] text-slate-500">
            {autorRegistro(r)}
            {r.origem === 'sistema' ? ' · alteração sem usuário (script/rotina)' : ''}
            {r.tabela === 'checklist' ? ' · checklist de expedição' : ''}
          </span>
        </span>
      </button>
      {aberto && (
        <table className={`${mostrarData ? 'ml-[7.75rem]' : 'ml-[4.5rem]'} mt-1.5 text-[11px]`}>
          <tbody>
            {linhas.map(l => (
              <tr key={l.campo}>
                <td className="py-0.5 pr-3 font-semibold text-slate-600 dark:text-slate-300">{l.rotulo}</td>
                <td className="py-0.5 pr-2 text-rose-700 line-through decoration-rose-300 dark:text-rose-300">{l.de}</td>
                <td className="py-0.5 pr-2 text-slate-400">→</td>
                <td className="py-0.5 text-emerald-700 dark:text-emerald-300">{l.para}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  );
}

function exportarXlsx(registros: RegistroLogEntrega[], porId: Map<string, TramoEntrega>, arquivo: string) {
  const linhas: unknown[][] = [['Data/hora', 'Autor', 'Origem', 'Tramo (id)', 'Torre · posição · série', 'Tipo', 'Resumo', 'Campo', 'De', 'Para']];
  for (const r of registros) {
    const base = [dataHoraBR(r.createdAt), autorRegistro(r), r.origem, r.tramoId, identificacaoTramo(r, porId), r.tabela === 'checklist' ? 'Checklist' : 'Tramo', resumoRegistro(r)];
    const campos = linhasAlteracao(r);
    if (!campos.length) linhas.push([...base, '', '', '']);
    for (const c of campos) linhas.push([...base, c.rotulo, c.de, c.para]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(linhas);
  sheet['!cols'] = [16, 24, 8, 12, 22, 10, 40, 18, 28, 28].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Histórico');
  XLSX.writeFile(wb, arquivo);
}

export default function HistoricoAlteracoesEntrega({ tramoId, tramos = [], compacto = false }: Props) {
  const toast = useToast();
  const hoje = hojeLocal();
  const [de, setDe] = useState(adicionarDias(hoje, -6));
  const [ate, setAte] = useState(hoje);
  const [filtro, setFiltro] = useState<FiltroTela>({ busca: '', autor: '', tipo: '' });
  const [registros, setRegistros] = useState<RegistroLogEntrega[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [abertoCompacto, setAbertoCompacto] = useState(false);

  const porId = useMemo(() => new Map(tramos.map(t => [t.id, t])), [tramos]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setRegistros(
        await listarLogEntrega(
          compacto ? { tramoId, incluirEstadoInicial: true, limite: 50 } : { de, ate, limite: 2000 },
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível ler o histórico.');
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compacto, tramoId, de, ate]);

  useEffect(() => {
    if (!compacto || abertoCompacto) void carregar();
  }, [carregar, compacto, abertoCompacto]);

  const autores = useMemo(() => [...new Set((registros ?? []).map(autorRegistro))].sort(), [registros]);
  // Com a lista de tramos da página, o histórico mostra só as torres exibidas (hoje, a 1ª fase).
  const doEscopo = useMemo(() => (registros ?? []).filter(r => !porId.size || porId.has(r.tramoId)), [registros, porId]);
  const visiveis = useMemo(() => (compacto ? registros ?? [] : filtrarRegistros(doEscopo, filtro, porId)), [registros, doEscopo, filtro, porId, compacto]);
  const porDia = useMemo(() => {
    const grupos = new Map<string, RegistroLogEntrega[]>();
    for (const r of visiveis) grupos.set(diaLocal(r.createdAt), [...(grupos.get(diaLocal(r.createdAt)) ?? []), r]);
    return [...grupos.entries()];
  }, [visiveis]);

  if (compacto) {
    return (
      <section className="rounded-xl border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setAbertoCompacto(a => !a)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-500"
        >
          <span className="flex items-center gap-1.5">
            <History className="h-4 w-4" /> Histórico de alterações deste tramo
          </span>
          {abertoCompacto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {abertoCompacto && (
          <div className="border-t border-slate-100 px-3 pb-2 dark:border-slate-800">
            {carregando || !registros ? (
              <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
            ) : registros.length === 0 ? (
              <p className="py-3 text-xs text-slate-500">Nenhuma alteração registrada.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {registros.map(r => <Registro key={r.id} r={r} porId={porId} mostrarTramo={false} mostrarData />)}
              </ul>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] font-semibold text-slate-500">
          De
          <input type="date" value={de} max={ate} onChange={e => setDe(e.target.value)} className={`${inputCls} mt-0.5 block`} />
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          Até
          <input type="date" value={ate} min={de} max={hoje} onChange={e => setAte(e.target.value)} className={`${inputCls} mt-0.5 block`} />
        </label>
        <input
          value={filtro.busca}
          onChange={e => setFiltro(f => ({ ...f, busca: e.target.value }))}
          placeholder="Série, torre, etapa…"
          className={`${inputCls} min-w-[10rem] flex-1`}
          aria-label="Buscar no histórico"
        />
        <select value={filtro.autor} onChange={e => setFiltro(f => ({ ...f, autor: e.target.value }))} className={inputCls} aria-label="Autor">
          <option value="">Todos os autores</option>
          {autores.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filtro.tipo} onChange={e => setFiltro(f => ({ ...f, tipo: e.target.value as FiltroTela['tipo'] }))} className={inputCls} aria-label="Tipo">
          <option value="">Tramo e checklist</option>
          <option value="tramo">Só tramo</option>
          <option value="checklist">Só checklist</option>
        </select>
        <button type="button" onClick={() => void carregar()} className={`${inputCls} inline-flex items-center gap-1.5 font-semibold`} title="Atualizar">
          <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => exportarXlsx(visiveis, porId, `Historico-Controle-Entrega-${de}-a-${ate}.xlsx`)}
          disabled={!visiveis.length}
          className={`${inputCls} inline-flex items-center gap-1.5 font-semibold disabled:opacity-50`}
        >
          <Download className="h-3.5 w-3.5" /> XLSX
        </button>
      </div>

      <p className="text-[11px] text-slate-500">
        {visiveis.length} alteração(ões) no período. O registro começou em 07/10/2026; antes disso não há histórico. Clique numa linha para ver
        o "de → para" de cada campo.
      </p>

      {!registros ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : porDia.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-700">
          Nenhuma alteração no período e filtros escolhidos.
        </p>
      ) : (
        <div className="space-y-4">
          {porDia.map(([dia, lista]) => (
            <section key={dia}>
              <h4 className="sticky top-0 z-10 bg-white py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-900">
                {formatarDataBR(dia)} · {lista.length}
              </h4>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {lista.map(r => <Registro key={r.id} r={r} porId={porId} mostrarTramo />)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
