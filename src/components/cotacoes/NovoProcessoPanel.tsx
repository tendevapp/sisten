/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Confirma o escopo de RM/itens vindo da Central de Compras (via
 * sessionStorage) antes de criar o processo de cotação. Pede um título
 * opcional — o número é gerado automaticamente.
 */

import React, { useState } from 'react';
import { PackageSearch, Loader2, ArrowRight } from 'lucide-react';
import type { CotacaoProcessoItemDraft } from '../../types';

interface NovoProcessoPanelProps {
  itens: CotacaoProcessoItemDraft[];
  criando: boolean;
  onCriar: (titulo: string | null, observacoes: string | null) => void;
  onCancelar: () => void;
}

export default function NovoProcessoPanel({ itens, criando, onCriar, onCancelar }: NovoProcessoPanelProps) {
  const [titulo, setTitulo] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const rms = Array.from(new Set(itens.map(i => i.rm).filter(Boolean)));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
          <PackageSearch className="h-4 w-4 text-indigo-500" />
          Novo processo de cotação
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {itens.length} {itens.length === 1 ? 'item' : 'itens'} selecionado(s) na Central de Compras
          {rms.length > 0 && ` · ${rms.length} ${rms.length === 1 ? 'RM' : 'RMs'}`}.
          Cole as propostas dos fornecedores depois de criar o processo.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Título (opcional)</label>
            <input
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Ex.: Parafusos e porcas — obra X"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
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
            onClick={() => onCriar(titulo.trim() || null, observacoes.trim() || null)}
            disabled={criando || itens.length === 0}
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
