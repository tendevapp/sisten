/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSyncExternalStore } from 'react';

// Alinhado ao breakpoint `sm` do Tailwind: abaixo disso é celular em retrato.
const QUERY = '(max-width: 640px)';

function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', listener);
  return () => mql.removeEventListener('change', listener);
}

const getSnapshot = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;

const getServerSnapshot = () => false;

/**
 * `true` numa tela estreita (celular). Para decisões que dependem do espaço
 * disponível, não do tipo de ponteiro — esconder um tooltip que não cabe,
 * simplificar um cabeçalho. Largura, não `pointer: coarse`: um tablet largo
 * mostra o tooltip normalmente.
 */
export function useTelaEstreita(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Abaixo do breakpoint `lg` (1024px): celular em pé ou deitado e tablet. É onde
// as telas de duas colunas (lista + detalhe) empilham e precisam de outro arranjo.
const QUERY_CELULAR = '(max-width: 1023px)';

function subscribeCelular(listener: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY_CELULAR);
  mql.addEventListener('change', listener);
  return () => mql.removeEventListener('change', listener);
}

const getSnapshotCelular = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY_CELULAR).matches;

/** `true` abaixo de `lg` — o mesmo corte das classes `lg:hidden` / `hidden lg:block`. */
export function useTelaCelular(): boolean {
  return useSyncExternalStore(subscribeCelular, getSnapshotCelular, getServerSnapshot);
}

/** Leitura pontual (sem assinar), para valor inicial de estado. */
export function ehTelaCelular(): boolean {
  return getSnapshotCelular();
}
