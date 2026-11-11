/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Selo ao lado de "SISTEN #número" na Central de Compras: a solicitação de
 * origem foi cancelada, editada ou excluída depois de virar RM. Cheio quando
 * ainda falta mexer no SAP; contornado com ✓ quando já foi tratado em Abrir RM.
 * O texto completo (quem, quando, o que mudou) fica no title.
 */

import React from 'react';
import { Ban, Check, Pencil, Trash2 } from 'lucide-react';

export type TipoTagSisten = 'cancelada' | 'editada' | 'excluida';

const ROTULO: Record<TipoTagSisten, string> = { cancelada: 'Cancelada', editada: 'Editada', excluida: 'Excluída' };
const ICONE = { cancelada: Ban, editada: Pencil, excluida: Trash2 } as const;
const COR: Record<TipoTagSisten, string> = {
  cancelada: 'var(--status-critical)',
  excluida: 'var(--status-critical)',
  editada: 'var(--status-serious)',
};

export default function TagSituacaoSisten({ tipo, pendenteSap, detalhe }: {
  tipo: TipoTagSisten;
  pendenteSap: boolean;
  detalhe: string;
}) {
  const Icone = ICONE[tipo];
  const cor = COR[tipo];
  return (
    <span
      title={detalhe}
      aria-label={detalhe}
      role="note"
      className="inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] font-extrabold uppercase tracking-wide border whitespace-nowrap"
      style={pendenteSap
        ? { color: '#fff', background: cor, borderColor: cor }
        : { color: cor, borderColor: cor, background: 'transparent' }}
    >
      <Icone className="h-2.5 w-2.5" aria-hidden />
      {ROTULO[tipo]}
      {!pendenteSap && <Check className="h-2.5 w-2.5" aria-hidden />}
    </span>
  );
}
