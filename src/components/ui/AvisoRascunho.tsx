/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Faixa no topo do formulário quando o preenchimento foi recuperado do
 * rascunho do aparelho (`hooks/useRascunhoFormulario.ts`).
 */

import { History } from 'lucide-react';

function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const hoje = new Date();
  const mesmoDia = d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth() && d.getDate() === hoje.getDate();
  return mesmoDia ? `às ${hora}` : `em ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`;
}

export default function AvisoRascunho({ salvoEm, onDescartar }: { salvoEm: string | null; onDescartar: () => void }) {
  if (!salvoEm) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <History className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-[12rem]">
        Preenchimento recuperado deste aparelho (salvo {quando(salvoEm)}). Confira e finalize.
      </span>
      <button
        type="button"
        onClick={onDescartar}
        className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 font-bold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-amber-950"
      >
        Descartar e começar de novo
      </button>
    </div>
  );
}
