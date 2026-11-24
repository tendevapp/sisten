/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Espalha o rebaixamento das bases SAP depois de uma importação.
 *
 * Em 28/10 e 24/11/2026 o banco travou do mesmo jeito: a importação subia a
 * versão das bases (`bump_dataset_version`) e todo aparelho logado rebaixava
 * requisições e pedidos no mesmo minuto — uma vez por planilha importada.
 *
 * Agora cada aparelho só baixa a versão nova depois de:
 *  1. `SILENCIO_MS` sem nova importação — ME5A, ZL0132 e ME2L importadas em
 *     seguida viram um download só (o relógio recomeça a cada versão nova);
 *  2. mais uma fração aleatória da `JANELA_MS`, sorteada por aparelho — os
 *     downloads se espalham pela janela em vez de cair juntos.
 * `ESPERA_MAXIMA_MS` limita a espera se as importações não pararem.
 *
 * Download pedido pelo usuário (sincronização forçada) e primeiro download do
 * aparelho não esperam.
 */

export const SILENCIO_MS = 3 * 60_000;
export const JANELA_MS = 10 * 60_000;
export const ESPERA_MAXIMA_MS = 25 * 60_000;

export interface AdiamentoDownload {
  /** Sorteada uma vez por aparelho e base, em [0, 1). */
  fracao: number;
  /** Quando este aparelho viu a primeira versão nova ainda não baixada (ms). */
  vistoEm: number;
}

/**
 * Momento (ms) a partir do qual o aparelho pode baixar a versão publicada em
 * `atualizadoEmISO` (o `updated_at` do carimbo, que muda a cada importação).
 * `null` = sem data no carimbo: baixa já.
 */
export function liberadoEm(atualizadoEmISO: string | null, adiamento: AdiamentoDownload): number | null {
  const base = atualizadoEmISO ? Date.parse(atualizadoEmISO) : NaN;
  if (!Number.isFinite(base)) return null;
  const alvo = base + SILENCIO_MS + adiamento.fracao * JANELA_MS;
  return Math.min(alvo, adiamento.vistoEm + ESPERA_MAXIMA_MS);
}
