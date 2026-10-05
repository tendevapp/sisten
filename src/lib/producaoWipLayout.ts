/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Geometria da Visão WIP sobre a planta da fábrica e escala das pílulas.
 * Unidade `cqw` = 1% da largura do mapa, então o cálculo vale em qualquer tamanho.
 */

import type { ZonaWipId } from './producaoWip';

/** Dimensões da imagem da planta; os retângulos abaixo estão nesse mesmo espaço (px). */
export const PLANTA_LARGURA = 2000;
export const PLANTA_ALTURA = 581;

/** Retângulo [x1, y1, x2, y2] de cada zona sobre a planta. */
export const RETANGULO_ZONA: Record<ZonaWipId, [number, number, number, number]> = {
  montagem: [2, 117, 232, 305],
  acabamento: [232, 117, 940, 305],
  internos: [940, 117, 1425, 305],
  saw: [1425, 117, 2000, 305],
  corte: [920, 305, 1340, 488],
  calandra_saw1: [1340, 305, 2000, 488],
};

/** Tamanho da pílula na escala 1, em cqw. */
export const PILULA_LARGURA_CQW = 4.8;
export const PILULA_ALTURA_CQW = 2.6;
/** Espaço entre pílulas e recuo da área de pílulas dentro da zona, em cqw. */
export const FOLGA_CQW = 0.4;
/** A área de pílulas começa abaixo do nome impresso na planta (fração da altura da zona). */
export const TOPO_AREA_PILULAS = 0.3;

export const ESCALA_MINIMA = 0.25;

const PX_PARA_CQW = 100 / PLANTA_LARGURA;

/**
 * Maior escala (≤ 1) em que `quantidade` pílulas cabem na zona sem rolagem.
 * Devolve `ESCALA_MINIMA` quando nem assim cabem.
 */
export function escalaPilulas(zona: ZonaWipId, quantidade: number): number {
  if (quantidade <= 0) return 1;
  const [x1, y1, x2, y2] = RETANGULO_ZONA[zona];
  const largura = (x2 - x1) * PX_PARA_CQW - 2 * FOLGA_CQW;
  const altura = (y2 - y1) * PX_PARA_CQW * (1 - TOPO_AREA_PILULAS) - FOLGA_CQW;

  for (let escala = 1; escala >= ESCALA_MINIMA; escala = Math.round((escala - 0.02) * 100) / 100) {
    const colunas = Math.floor((largura + FOLGA_CQW) / (PILULA_LARGURA_CQW * escala + FOLGA_CQW));
    const linhas = Math.floor((altura + FOLGA_CQW) / (PILULA_ALTURA_CQW * escala + FOLGA_CQW));
    if (colunas * linhas >= quantidade) return escala;
  }
  return ESCALA_MINIMA;
}
