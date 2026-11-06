/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Navegação entre dias / livros da Portaria no celular.
 *
 * No desktop as telas têm duas colunas: a lista de dias (ou livros de plantão)
 * à esquerda e os registros do dia escolhido à direita. No celular as colunas
 * empilhavam — a lista inteira de dias anteriores vinha primeiro e o vigilante
 * rolava várias telas até chegar aos registros de hoje, que é o que ele abre a
 * tela para ver. Aqui o dia escolhido ocupa a tela; esta barra fica presa no
 * topo com ◀ ▶ para o dia anterior/seguinte e um botão que abre a lista
 * completa num painel.
 */

import React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import Modal, { ModalBody, ModalHeader } from '../ui/Modal';
import { rotuloDia } from '../../lib/alcoolemiaPeriodo';

/** "Hoje, 06/11", "Ontem, 05/11" ou "sexta, 30/10". */
export function rotuloDiaCompleto(iso: string, hoje: string): string {
  const r = rotuloDia(iso, hoje);
  return r === 'Hoje' || r === 'Ontem' ? `${r}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}` : r;
}

type Tom = 'blue' | 'purple';

const COR: Record<Tom, { link: string }> = {
  blue: { link: 'text-blue-700 dark:text-blue-400' },
  purple: { link: 'text-purple-700 dark:text-purple-400' },
};

const SETA =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 active:bg-slate-100 disabled:opacity-30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:active:bg-slate-800';

interface NavegadorRegistrosProps {
  /** Ex.: "Hoje", "Ontem · Turno Noite", "sexta, 30/10". */
  rotulo: string;
  /** Linha de apoio: contagens do dia. */
  detalhe?: React.ReactNode;
  /** Registro mais antigo (◀). Sem função = desabilitado. */
  onAnterior?: () => void;
  /** Registro mais novo (▶). Sem função = desabilitado. */
  onProximo?: () => void;
  /** Mostra "Ir para hoje" quando o dia exibido não é hoje. */
  onHoje?: () => void;
  /** Texto do botão que abre a lista, ex.: "Dias (24)". */
  rotuloLista: string;
  onAbrirLista: () => void;
  rotuloAnterior?: string;
  rotuloProximo?: string;
  tom?: Tom;
}

export default function NavegadorRegistros({
  rotulo, detalhe, onAnterior, onProximo, onHoje, rotuloLista, onAbrirLista,
  rotuloAnterior = 'Dia anterior', rotuloProximo = 'Dia seguinte', tom = 'blue',
}: NavegadorRegistrosProps) {
  return (
    <div className="sticky top-0 z-20 -mx-3 bg-[var(--surface-page)] px-3 pb-2 pt-2 sm:-mx-6 sm:px-6 lg:hidden">
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onAnterior} disabled={!onAnterior} aria-label={rotuloAnterior} className={SETA}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          {/* Tocar na data abre a lista completa — como um seletor de data. */}
          <button
            type="button"
            onClick={onAbrirLista}
            aria-label={`${rotulo}. ${rotuloLista}`}
            className="min-w-0 flex-1 rounded-xl px-1 py-0.5 text-center active:bg-slate-100 dark:active:bg-slate-800"
          >
            <span className="flex items-center justify-center gap-1.5" aria-live="polite">
              <span className="truncate text-[15px] font-bold text-slate-900 first-letter:uppercase dark:text-slate-50">{rotulo}</span>
              <CalendarDays className={`h-4 w-4 shrink-0 ${COR[tom].link}`} aria-hidden="true" />
            </span>
            {detalhe && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{detalhe}</span>}
          </button>
          <button type="button" onClick={onProximo} disabled={!onProximo} aria-label={rotuloProximo} className={SETA}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-center gap-3 border-t border-slate-100 pt-1.5 text-xs font-bold dark:border-slate-800">
          <button type="button" onClick={onAbrirLista} className={`inline-flex min-h-8 items-center ${COR[tom].link}`}>
            {rotuloLista}
          </button>
          {onHoje && (
            <>
              <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
              <button type="button" onClick={onHoje} className={`inline-flex min-h-8 items-center ${COR[tom].link}`}>
                Ir para hoje
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Painel (bottom sheet) com a lista completa de dias / livros. */
export function ListaRegistrosSheet({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal onClose={onClose} ariaLabel={titulo} maxWidth="max-w-lg">
      <ModalHeader onClose={onClose}>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">{titulo}</h3>
      </ModalHeader>
      <ModalBody className="space-y-3">{children}</ModalBody>
    </Modal>
  );
}

/**
 * Anterior / seguinte numa lista ordenada do mais novo para o mais antigo
 * (a ordem das colunas da esquerda): "anterior" é o próximo índice.
 */
export function vizinhos<T>(lista: T[], indice: number): { anterior: T | null; proximo: T | null } {
  if (indice < 0) return { anterior: null, proximo: null };
  return {
    anterior: indice + 1 < lista.length ? lista[indice + 1] : null,
    proximo: indice > 0 ? lista[indice - 1] : null,
  };
}
