import { describe, expect, it } from 'vitest';
import {
  ESCALA_MINIMA,
  FOLGA_CQW,
  PILULA_ALTURA_CQW,
  PILULA_LARGURA_CQW,
  RETANGULO_ZONA,
  TOPO_AREA_PILULAS,
  escalaPilulas,
} from './producaoWipLayout';
import { ORDEM_ZONAS_WIP, type ZonaWipId } from './producaoWip';

function capacidade(zona: ZonaWipId, escala: number): number {
  const [x1, y1, x2, y2] = RETANGULO_ZONA[zona];
  const largura = (x2 - x1) * 0.05 - 2 * FOLGA_CQW;
  const altura = (y2 - y1) * 0.05 * (1 - TOPO_AREA_PILULAS) - FOLGA_CQW;
  const colunas = Math.floor((largura + FOLGA_CQW) / (PILULA_LARGURA_CQW * escala + FOLGA_CQW));
  const linhas = Math.floor((altura + FOLGA_CQW) / (PILULA_ALTURA_CQW * escala + FOLGA_CQW));
  return colunas * linhas;
}

describe('producaoWipLayout - escala das pílulas', () => {
  it('mantém tamanho cheio quando poucas pílulas cabem', () => {
    expect(escalaPilulas('acabamento', 3)).toBe(1);
    expect(escalaPilulas('montagem', 0)).toBe(1);
  });

  it('encolhe até todas caberem sem rolagem', () => {
    for (const zona of ORDEM_ZONAS_WIP) {
      for (const n of [5, 12, 30, 60]) {
        const escala = escalaPilulas(zona, n);
        if (escala > ESCALA_MINIMA) expect(capacidade(zona, escala)).toBeGreaterThanOrEqual(n);
      }
    }
  });

  it('é a maior escala possível: um passo acima já não cabe', () => {
    const n = 20;
    const escala = escalaPilulas('montagem', n);
    expect(escala).toBeLessThan(1);
    expect(capacidade('montagem', escala + 0.02)).toBeLessThan(n);
  });

  it('zona mais estreita encolhe mais que a larga para a mesma quantidade', () => {
    expect(escalaPilulas('montagem', 12)).toBeLessThan(escalaPilulas('acabamento', 12));
  });

  it('nunca passa do piso', () => {
    expect(escalaPilulas('montagem', 5000)).toBe(ESCALA_MINIMA);
  });
});
