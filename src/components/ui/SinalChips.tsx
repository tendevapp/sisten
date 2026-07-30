/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chips de sinal do catálogo SAP (estoque, RM aberta, pedido a caminho, uso).
 * Extraído de NewRequest.tsx para ser reaproveitado também em Approvals.tsx.
 */

import { SinalChip } from '../../lib/materiais';

export function SinalChips({ chips, className = '' }: { chips: SinalChip[]; className?: string }) {
  if (chips.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {chips.map(chip => (
        <span
          key={chip.texto}
          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{
            // "estoque" e "demanda" usam tons de status (verde/âmbar, sinal
            // de decisão). "pedido" e "uso" são informativos, não decisão —
            // por isso ficam neutros e sem colorir o texto, para não competir
            // visualmente com "estoque" (que é o sinal mais relevante: "tem
            // agora" pesa mais que "já foi pedido").
            background: chip.tom === 'estoque'
              ? 'color-mix(in srgb, var(--status-good) 14%, transparent)'
              : chip.tom === 'demanda'
              ? 'color-mix(in srgb, var(--status-warning) 18%, transparent)'
              : 'var(--surface-sunken)',
            color: 'var(--ink-secondary)',
          }}
        >
          {chip.texto}
        </span>
      ))}
    </div>
  );
}
