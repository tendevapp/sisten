/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Filtros no celular: um botão "Filtros (n)" e um painel que sobe da base.
 *
 * A barra de filtros do desktop, levada ao celular, virava uma trilha de
 * rolagem horizontal com 70% dos controles fora da tela e nenhum sinal de que
 * existiam — um filtro ligado lá fora ficava invisível. Aqui os filtros ficam
 * empilhados com rótulo, e o botão diz quantos estão ligados.
 */

import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from './Modal';

export function BotaoFiltros({ ativos, onClick, className = '' }: { ativos: number; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-bold transition-colors active:bg-[var(--surface-raised)] ${className}`}
      style={{
        background: ativos > 0 ? 'color-mix(in srgb, var(--brand) 10%, var(--surface-card))' : 'var(--surface-card)',
        borderColor: ativos > 0 ? 'color-mix(in srgb, var(--brand) 45%, transparent)' : 'var(--hairline)',
        color: ativos > 0 ? 'var(--brand)' : 'var(--ink-secondary)',
      }}
      aria-label={ativos > 0 ? `Filtros, ${ativos} ligado${ativos > 1 ? 's' : ''}` : 'Filtros'}
    >
      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
      Filtros
      {ativos > 0 && (
        <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-emerald-700 px-1 text-[11px] text-white dark:bg-emerald-600">
          {ativos}
        </span>
      )}
    </button>
  );
}

/** Um campo do painel: rótulo visível em cima do controle. */
export function CampoFiltro({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>{rotulo}</span>
      {children}
    </div>
  );
}

export const classeCampoFiltro =
  'h-11 w-full rounded-xl border px-3 text-sm bg-[var(--surface-card)] border-[var(--hairline)] text-[var(--ink-primary)]';

interface FiltrosSheetProps {
  titulo?: string;
  onClose: () => void;
  onLimpar: () => void;
  ativos: number;
  /** Texto do botão principal, ex.: "Ver 12 fornecedores". */
  rotuloAplicar: string;
  children: React.ReactNode;
}

/** Os filtros já valem enquanto o usuário mexe; o botão principal só fecha o painel. */
export default function FiltrosSheet({ titulo = 'Filtros', onClose, onLimpar, ativos, rotuloAplicar, children }: FiltrosSheetProps) {
  return (
    <Modal onClose={onClose} ariaLabel={titulo} maxWidth="max-w-lg">
      <ModalHeader onClose={onClose}>
        <h3 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>{titulo}</h3>
      </ModalHeader>
      <ModalBody className="space-y-5">{children}</ModalBody>
      <ModalFooter className="!flex-nowrap">
        <button
          type="button"
          onClick={onLimpar}
          disabled={ativos === 0}
          className="h-11 rounded-xl px-4 text-sm font-bold disabled:opacity-40"
          style={{ color: 'var(--ink-secondary)' }}
        >
          Limpar
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-11 flex-1 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-700"
        >
          {rotuloAplicar}
        </button>
      </ModalFooter>
    </Modal>
  );
}
