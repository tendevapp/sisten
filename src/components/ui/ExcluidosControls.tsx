/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Controles compartilhados da exclusão lógica dos formulários (ver
 * `src/lib/softDelete.ts`). O "Excluir" de cada tela apenas oculta o registro;
 * um administrador liga o toggle abaixo para revê-los e restaurá-los.
 */

import React from 'react';
import { RotateCcw, EyeOff } from 'lucide-react';

interface ToggleProps {
  /** Só renderiza para quem pode ver/restaurar (tipicamente admin). */
  visivel: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}

/** Checkbox "Mostrar excluídos" para a barra de filtros das listagens. */
export function MostrarExcluidosToggle({ visivel, checked, onChange, className = '' }: ToggleProps) {
  if (!visivel) return null;
  return (
    <label
      className={`inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        checked
          ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
          : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
      } ${className}`}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <EyeOff className="h-3.5 w-3.5" />
      Mostrar excluídos
    </label>
  );
}

/** Selo discreto na linha de um registro ocultado. */
export function BadgeExcluido({ em, className = '' }: { em?: string | null; className?: string }) {
  const data = em
    ? new Date(em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 ${className}`}
      title={data ? `Excluído em ${data}` : 'Registro excluído'}
    >
      Excluído{data ? ` ${data}` : ''}
    </span>
  );
}

/** Botão de restaurar (reverte a exclusão lógica). */
export function RestaurarButton({
  onClick,
  className = '',
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Restaurar registro"
      className={`rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-400 ${className}`}
    >
      <RotateCcw className="h-4 w-4" />
    </button>
  );
}

/** Classe utilitária para esmaecer a linha/cartão de um registro excluído. */
export const classeLinhaExcluida = (excluido?: string | null) =>
  excluido ? 'opacity-55 grayscale-[0.3]' : '';
