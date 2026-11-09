/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Rótulo do eixo de categorias em gráfico de barras horizontais.
 *
 * No celular, um eixo de 180–200px (largura do desktop) deixava menos da
 * metade da tela para a barra. Lá o eixo encolhe para LARGURA_EIXO_CELULAR e
 * o nome é cortado com reticências; o nome inteiro segue no tooltip.
 */

export const LARGURA_EIXO_CELULAR = 120;

/** Corta o texto em `max` caracteres (contando a reticência). */
export const cortarRotulo = (max: number) => (v: string): string =>
  v && v.length > max ? `${v.slice(0, max - 1)}…` : v;

/** Corte que cabe em LARGURA_EIXO_CELULAR com fonte de 11px. */
export const cortarRotuloCelular = cortarRotulo(17);
