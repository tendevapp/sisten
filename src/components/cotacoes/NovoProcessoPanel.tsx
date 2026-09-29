/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Confirma o escopo de RM/itens vindo da Central de Compras (via
 * sessionStorage) antes de criar o processo de cotação. O título já vem com
 * o número da(s) RM(s) e aceita um texto complementar — o número do
 * processo é gerado automaticamente.
 */

import React, { useState } from 'react';
import { PackageSearch, Loader2, ArrowRight } from 'lucide-react';
import { montarTituloProcesso, prefixoTituloRm } from '../../lib/cotacoes';
import type { CotacaoProcessoItemDraft } from '../../types';

interface NovoProcessoPanelProps {
  itens: CotacaoProcessoItemDraft[];
  criando: boolean;
  onCriar: (titulo: string | null, observacoes: string | null) => void;
  onCancelar: () => void;
}

export default function NovoProcessoPanel({ itens, criando, onCriar, onCancelar }: NovoProcessoPanelProps) {
  const [complemento, setComplemento] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const rms = Array.from(new Set(itens.map(i => i.rm).filter(Boolean)));
  // Com RM no escopo, o número dela já é o título — o comprador só acrescenta
  // o que quiser. Sem RM (cotação avulsa), o campo é livre como sempre foi.
  const prefixoRm = prefixoTituloRm(itens.map(i => i.rm));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
          <PackageSearch className="h-4 w-4 text-indigo-500" />
          Novo processo de cotação
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {itens.length > 0 ? (
            <>
              {itens.length} {itens.length === 1 ? 'item' : 'itens'} selecionado(s) na Central de Compras
              {rms.length > 0 && ` · ${rms.length} ${rms.length === 1 ? 'RM' : 'RMs'}`}.
              Envie as propostas dos fornecedores depois de criar o processo.
            </>
          ) : (
            'Cotação avulsa, sem itens de RM vinculados — as propostas ficam registradas no processo, sem exigir vínculo com uma requisição.'
          )}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {prefixoRm ? 'Título' : 'Título (opcional)'}
            </label>
            <div className="mt-1 flex w-full items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950">
              {prefixoRm && (
                <span
                  className="max-w-[55%] shrink-0 truncate border-r border-slate-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 dark:border-slate-700 dark:bg-indigo-950/40 dark:text-indigo-300"
                  title={`${prefixoRm} — preenchido pela RM do escopo`}
                >
                  {prefixoRm}
                </span>
              )}
              <input
                value={complemento}
                onChange={e => setComplemento(e.target.value)}
                placeholder={prefixoRm ? 'Texto complementar (opcional)' : 'Ex.: Parafusos e porcas — obra X'}
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none dark:text-slate-100"
              />
            </div>
            {prefixoRm && complemento.trim() && (
              <p className="mt-1 truncate text-[11px] text-slate-400" title={montarTituloProcesso(prefixoRm, complemento) ?? undefined}>
                Fica: {montarTituloProcesso(prefixoRm, complemento)}
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Observações (opcional)</label>
            <input
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>
        </div>

        {itens.length > 0 && (
          <div className="mt-4 max-h-64 overflow-auto rounded-lg border border-slate-100 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">RM</th>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2 text-right">Qtd.</th>
                </tr>
              </thead>
              <tbody>
                {itens.map(it => (
                  <tr key={it.ri} className="border-t border-slate-100 dark:border-slate-800/60">
                    <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{it.rm || '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-700 dark:text-slate-200">{it.material_code || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">{it.texto_breve || '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{it.qtd_solicitada ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            disabled={criando}
            className="rounded-xl px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onCriar(montarTituloProcesso(prefixoRm, complemento), observacoes.trim() || null)}
            disabled={criando}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-40"
          >
            {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {criando ? 'Criando...' : 'Criar processo'}
          </button>
        </div>
      </div>
    </div>
  );
}
