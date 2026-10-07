/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Metas por marco (flag prod_apt_programar): total e prazo de cada marco,
 * meta mensal (a da planilha) e meta semanal opcional. Nada é rateado de mês
 * para semana — a semanal só existe onde o Planejamento lança.
 */

import React, { useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '../../../ui/Toast';
import { INDICADOR_MARCO, ROTULO_MARCO, nomeMesCurto, type MarcoTramo, type MetaMarco, type PrazoMarco } from '../../../../lib/producaoTramos';
import { semanasNoAno } from '../../../../lib/producaoApontamentos';
import { salvarMetasMarco, salvarPrazoMarco } from '../../../../lib/producaoTramosApi';
import { btnPrimario, cardCls, inputCls, labelCls } from '../estilos';

const MARCOS: MarcoTramo[] = ['liberado_nav02', 'liberado_jato', 'liberado_patio', 'expedido'];

interface Props {
  metas: MetaMarco[];
  prazos: PrazoMarco[];
  podeEditar: boolean;
  anoInicial: number;
  onSalvo: () => void;
}

const chave = (marco: string, gran: string, ano: number, periodo: number) => `${marco}|${gran}|${ano}|${periodo}`;

// inputCls traz w-full, que vence o w-auto: o seletor ocupava a linha inteira.
const selectCls =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export default function MetasMarco({ metas, prazos, podeEditar, anoInicial, onSalvo }: Props) {
  const toast = useToast();
  const [ano, setAno] = useState(anoInicial);
  const [marcoSemanal, setMarcoSemanal] = useState<MarcoTramo>('liberado_jato');
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [rascunhoPrazos, setRascunhoPrazos] = useState<Record<string, { total: string; prazo: string }>>({});
  const [salvando, setSalvando] = useState(false);

  const atuais = useMemo(() => new Map(metas.map(m => [chave(m.marco, m.granularidade, m.ano, m.periodo), m.quantidade])), [metas]);
  const valor = (k: string) => (k in rascunho ? rascunho[k] : String(atuais.get(k) ?? ''));
  const alterar = (k: string, v: string) => setRascunho(r => ({ ...r, [k]: v.replace(/\D/g, '') }));
  const prazoDe = (m: MarcoTramo) => prazos.find(p => p.marco === m);
  const sujo = Object.keys(rascunho).some(k => valor(k) !== String(atuais.get(k) ?? '')) || Object.keys(rascunhoPrazos).length > 0;

  const salvar = async () => {
    setSalvando(true);
    try {
      const alteracoes = Object.keys(rascunho)
        .filter(k => valor(k) !== String(atuais.get(k) ?? ''))
        .map(k => {
          const [marco, granularidade, a, periodo] = k.split('|');
          return {
            marco: marco as MarcoTramo,
            granularidade: granularidade as 'mes' | 'semana',
            ano: Number(a),
            periodo: Number(periodo),
            quantidade: rascunho[k] === '' ? null : Number(rascunho[k]),
          };
        });
      await salvarMetasMarco(alteracoes);
      for (const [marco, p] of Object.entries(rascunhoPrazos)) {
        await salvarPrazoMarco({ marco: marco as MarcoTramo, total: Math.max(1, Number(p.total) || 115), prazo: p.prazo || null });
      }
      setRascunho({});
      setRascunhoPrazos({});
      toast.success('Metas salvas.');
      onSalvo();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar as metas.');
    } finally {
      setSalvando(false);
    }
  };

  const celula = (k: string) => (
    <input
      value={valor(k)}
      onChange={e => alterar(k, e.target.value)}
      disabled={!podeEditar}
      inputMode="numeric"
      className="w-12 rounded-lg border border-slate-200 bg-white px-1 py-1 text-center text-sm tabular-nums focus:border-blue-500 focus:outline-none disabled:bg-transparent disabled:text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:disabled:text-slate-300"
    />
  );

  const meses = Array.from({ length: 12 }, (_, i) => i + 1);
  const semanas = Array.from({ length: semanasNoAno(ano) }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      {!podeEditar && (
        <p className="rounded-xl bg-slate-100 px-4 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Somente leitura: quem lança metas é o Planejamento (acesso "Programar apontamentos").
        </p>
      )}

      <section className={`${cardCls} p-4`}>
        <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-50">Total e prazo por marco</h3>
        <p className="text-xs text-slate-500">O prazo é a base do ritmo necessário (saldo ÷ dias úteis até o prazo).</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {MARCOS.map(m => {
            const atual = prazoDe(m);
            const r = rascunhoPrazos[m] ?? { total: String(atual?.total ?? 115), prazo: atual?.prazo ?? '' };
            const mudar = (campo: 'total' | 'prazo', v: string) => setRascunhoPrazos(x => ({ ...x, [m]: { ...r, [campo]: v } }));
            return (
              <div key={m} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{INDICADOR_MARCO[m]} <span className="font-normal text-slate-400">({ROTULO_MARCO[m]})</span></p>
                <div className="mt-2 grid grid-cols-[5rem_1fr] gap-2">
                  <div>
                    <span className={labelCls}>Total</span>
                    <input value={r.total} onChange={e => mudar('total', e.target.value.replace(/\D/g, ''))} disabled={!podeEditar} inputMode="numeric" className={inputCls} />
                  </div>
                  <div>
                    <span className={labelCls}>Prazo</span>
                    <input type="date" value={r.prazo} onChange={e => mudar('prazo', e.target.value)} disabled={!podeEditar} className={inputCls} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={`${cardCls} overflow-x-auto p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-50">Meta mensal</h3>
          <select value={ano} onChange={e => setAno(Number(e.target.value))} className={selectCls} aria-label="Ano">
            {[anoInicial - 1, anoInicial, anoInicial + 1].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <table className="mt-3 text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1.5 pr-3 text-left">Marco</th>
              {meses.map(m => <th key={m} className="px-0.5 py-1.5 text-center">{nomeMesCurto(`${ano}-${String(m).padStart(2, '0')}`)}</th>)}
              <th className="px-2 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {MARCOS.map(marco => (
              <tr key={marco}>
                <td className="whitespace-nowrap py-1 pr-3 text-xs font-semibold">{INDICADOR_MARCO[marco]}</td>
                {meses.map(m => <td key={m} className="px-0.5 py-1">{celula(chave(marco, 'mes', ano, m))}</td>)}
                <td className="px-2 py-1 text-right font-bold tabular-nums">{meses.reduce((s, m) => s + (Number(valor(chave(marco, 'mes', ano, m))) || 0), 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={`${cardCls} overflow-x-auto p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-50">Meta semanal (opcional)</h3>
            <p className="text-xs text-slate-500">A partir da 1ª semana preenchida, a curva S usa a meta semanal em vez da mensal.</p>
          </div>
          <select value={marcoSemanal} onChange={e => setMarcoSemanal(e.target.value as MarcoTramo)} className={selectCls} aria-label="Marco">
            {MARCOS.map(m => <option key={m} value={m}>{INDICADOR_MARCO[m]}</option>)}
          </select>
        </div>
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5">
          {semanas.map(s => (
            <label key={s} className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-slate-500">
              W{String(s).padStart(2, '0')}
              {celula(chave(marcoSemanal, 'semana', ano, s))}
            </label>
          ))}
        </div>
        <p className="mt-2 text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
          Soma das semanas: {semanas.reduce((t, s) => t + (Number(valor(chave(marcoSemanal, 'semana', ano, s))) || 0), 0)}
        </p>
      </section>

      {podeEditar && (
        <div className="sticky bottom-3 flex justify-end">
          <button type="button" onClick={salvar} disabled={!sujo || salvando} className={`${btnPrimario} min-h-[44px] shadow-lg`}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar metas
          </button>
        </div>
      )}
    </div>
  );
}
