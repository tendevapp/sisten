/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Popover de gestão das colunas (buckets) de um quadro: adicionar, renomear,
 * mudar a cor, reordenar (↑/↓) e excluir. `@dnd-kit/sortable` não está no
 * projeto, então a reordenação é por botão.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import type { DemBucket } from '../../types';
import { reordenarComOrdem } from '../../lib/demandasQuadro';
import { SeletorCorColuna } from './shared';

interface Props {
  buckets: DemBucket[];
  onCriar: (nome: string) => void;
  onAtualizar: (id: string, patch: { nome?: string; cor?: string | null }) => void;
  onReordenar: (itens: { id: string; ordem: number }[]) => void;
  onExcluir: (id: string) => void;
  onClose: () => void;
}

export default function PainelBuckets({ buckets, onCriar, onAtualizar, onReordenar, onExcluir, onClose }: Props) {
  const [novo, setNovo] = useState('');

  const mover = (idx: number, dir: -1 | 1) => {
    const alvo = idx + dir;
    if (alvo < 0 || alvo >= buckets.length) return;
    const reordenados = reordenarComOrdem(buckets, idx, alvo);
    onReordenar(reordenados.map(b => ({ id: b.id, ordem: b.ordem })));
  };

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 z-40 mt-1.5 w-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xl">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Colunas do quadro</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {buckets.map((b, idx) => (
            <div key={b.id} className="rounded-lg border border-slate-100 dark:border-slate-800 p-1.5 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className="flex flex-col shrink-0">
                  <button type="button" disabled={idx === 0} onClick={() => mover(idx, -1)} className="disabled:opacity-25 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" disabled={idx === buckets.length - 1} onClick={() => mover(idx, 1)} className="disabled:opacity-25 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  defaultValue={b.nome}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== b.nome) onAtualizar(b.id, { nome: v }); }}
                  className="flex-1 min-w-0 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => onExcluir(b.id)}
                  title="Excluir coluna (as tarefas ficam sem coluna)"
                  className="shrink-0 text-slate-400 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="pl-6">
                <SeletorCorColuna valor={b.cor} onChange={cor => onAtualizar(b.id, { cor })} />
              </div>
            </div>
          ))}
          {buckets.length === 0 && <p className="text-xs italic text-slate-400 py-2 text-center">Nenhuma coluna ainda.</p>}
        </div>

        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <input
            value={novo}
            onChange={e => setNovo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && novo.trim()) { onCriar(novo.trim()); setNovo(''); } }}
            placeholder="Nova coluna"
            className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-[var(--brand)]"
          />
          <button
            type="button"
            onClick={() => { if (novo.trim()) { onCriar(novo.trim()); setNovo(''); } }}
            className="shrink-0 rounded-md p-1.5"
            style={{ background: 'var(--brand)', color: '#fff' }}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
