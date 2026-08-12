/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * `ErrorBoundary` é uma classe montada numa subárvore que pode estar quebrada;
 * o botão/modal de reporte vivem fora dela, no layout persistente do App. Um
 * pub-sub simples evita passar Context por uma árvore que pode não existir
 * mais no momento do crash.
 */
export interface BugPrefill {
  message: string;
  stack?: string;
  pagePath: string;
}

type Listener = (prefill: BugPrefill) => void;

const listeners = new Set<Listener>();

export function emitBugPrefill(prefill: BugPrefill): void {
  listeners.forEach(listener => listener(prefill));
}

export function onBugPrefill(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
