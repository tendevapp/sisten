/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Detecção de falha de conectividade — fonte única para os fluxos
 * offline-first (outbox da Produção, checklists da Qualidade, boot do App).
 *
 * Distingue "não chegou ao servidor" (vale guardar no aparelho e tentar de
 * novo) de "o servidor recusou" (validação, RLS, trigger — tentar de novo não
 * resolve; o usuário precisa ver o erro).
 */

/** `TypeError: Failed to fetch` (Chrome/Edge) e afins — falha de conectividade, não de validação. */
export function pareceFalhaDeRede(erro: unknown): boolean {
  if (estaOffline()) return true;
  const msg = erro instanceof Error ? erro.message : typeof erro === 'object' && erro && 'message' in erro ? String((erro as { message: unknown }).message) : String(erro);
  return /failed to fetch|networkerror|network request failed|load failed|err_internet|err_network|fetch failed|network error/i.test(msg);
}

/** `navigator.onLine === false` — só o "com certeza offline"; `true` não garante rede de verdade. */
export function estaOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
