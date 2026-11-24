/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tag "Baixa pendente" do Cadastro de Itens e o quadro do detalhe com as
 * requisições do balcão (normal ou extraordinária) que ainda não têm
 * documento no SAP. Ver `lib/baixasPendentesCatalogo.ts`.
 */

import { AlertTriangle } from 'lucide-react';
import { formatDateBR } from '../../lib/format';
import {
  codigosDistintos, detalheBaixaPendente, resumoBaixaPendente, rotuloMovimento, type BaixaPendenteMaterial,
} from '../../lib/baixasPendentesCatalogo';

export function BaixaPendenteTag({ baixa, className = '' }: { baixa: BaixaPendenteMaterial; className?: string }) {
  const n = codigosDistintos(baixa).length;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold text-white ${className}`}
      title={detalheBaixaPendente(baixa)}
      aria-label={`Baixa pendente: ${resumoBaixaPendente(baixa)} sem documento SAP`}
    >
      <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden />
      Baixa pendente{n > 1 ? ` (${n})` : ''}
    </span>
  );
}

export function BaixaPendenteQuadro({ baixa }: { baixa: BaixaPendenteMaterial }) {
  return (
    <div className="rounded-xl border border-orange-300 bg-orange-50 px-3 py-2.5 dark:border-orange-800 dark:bg-orange-950/40">
      <p className="flex items-center gap-1.5 text-xs font-extrabold text-orange-800 dark:text-orange-300">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Baixa pendente no SAP · {resumoBaixaPendente(baixa)}
      </p>
      <p className="mt-0.5 text-[11px] text-orange-900 dark:text-orange-200">
        Saiu do balcão e ainda não foi lançado no SAP: a contagem vai divergir da ZL0024 até a baixa.
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {baixa.movimentos.map((m, i) => (
          <li
            key={`${m.codigo}-${m.deposito ?? ''}-${i}`}
            className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] text-slate-700 dark:text-slate-200"
          >
            <span>
              <span className="font-mono font-bold">{m.codigo}</span>
              <span className="text-slate-600 dark:text-slate-300"> · {formatDateBR(m.data)} · {rotuloMovimento(m)}</span>
              {m.aguardando_confirmacao && (
                <span className="text-orange-800 dark:text-orange-300"> · aguardando confirmação</span>
              )}
            </span>
            {m.quantidade != null && (
              <span className="font-mono font-bold tabular-nums">
                {Number(m.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {m.unidade ?? ''}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
