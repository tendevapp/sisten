import { describe, it, expect } from 'vitest';
import {
  AJUSTES_NEUTROS, ajustesAutomaticos, aplicarAjustesPixels, dimensoesGiradas, dimensoesSaida, girar,
  limitarRecorte, moverRecorte, nomeArquivoEditado, recorteComProporcao, recorteEmPixels,
  redimensionarRecorte, RECORTE_MINIMO,
} from './edicaoImagem';

const px = (...v: number[]) => new Uint8ClampedArray(v);

describe('ajustes de pixel (mesma conta do filtro CSS)', () => {
  it('neutro não mexe', () => {
    const d = px(10, 120, 250, 255);
    aplicarAjustesPixels(d, AJUSTES_NEUTROS);
    expect([...d]).toEqual([10, 120, 250, 255]);
  });

  it('brilho multiplica e limita em 255; alfa fica', () => {
    const d = px(100, 200, 0, 128);
    aplicarAjustesPixels(d, { brilho: 1.5, contraste: 1, saturacao: 1 });
    expect([...d]).toEqual([150, 255, 0, 128]);
  });

  it('contraste afasta do cinza médio', () => {
    const d = px(100, 155, 128, 255);
    aplicarAjustesPixels(d, { brilho: 1, contraste: 2, saturacao: 1 });
    // (100 − 127,5) × 2 + 127,5 = 72,5 — o Uint8ClampedArray arredonda meio para o par.
    expect(d[0]).toBe(72);
    expect(d[1]).toBe(182);
  });

  it('saturação 0 vira cinza', () => {
    const d = px(200, 50, 50, 255);
    aplicarAjustesPixels(d, { brilho: 1, contraste: 1, saturacao: 0 });
    expect(d[0]).toBe(d[1]);
    expect(d[1]).toBe(d[2]);
  });

  it('iluminar automático clareia foto escura e quase não mexe em foto média', () => {
    const escura = new Uint8ClampedArray(4 * 64).fill(40);
    expect(ajustesAutomaticos(escura).brilho).toBeGreaterThan(1.5);
    const media = new Uint8ClampedArray(4 * 64).fill(130);
    expect(ajustesAutomaticos(media).brilho).toBeCloseTo(1, 1);
  });
});

describe('giro', () => {
  it('gira nos dois sentidos e troca largura por altura', () => {
    expect(girar(0, -1)).toBe(270);
    expect(girar(270, 1)).toBe(0);
    expect(dimensoesGiradas(4000, 3000, 90)).toEqual({ w: 3000, h: 4000 });
    expect(dimensoesGiradas(4000, 3000, 180)).toEqual({ w: 4000, h: 3000 });
  });
});

describe('recorte', () => {
  it('não sai da imagem nem fica menor que o mínimo', () => {
    expect(limitarRecorte({ x: 0.9, y: -0.2, w: 0.5, h: 0.01 })).toEqual({ x: 0.5, y: 0, w: 0.5, h: RECORTE_MINIMO });
    expect(moverRecorte({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 0.9, 0)).toMatchObject({ x: 0.5 });
  });

  it('arrastar o canto sudeste cresce para a direita e para baixo, até a borda', () => {
    const r = redimensionarRecorte({ x: 0.1, y: 0.1, w: 0.4, h: 0.4 }, 'se', 0.8, 0.1, null, 4 / 3);
    expect(r.x).toBeCloseTo(0.1);
    expect(r.w).toBeCloseTo(0.9);
    expect(r.h).toBeCloseTo(0.5);
  });

  it('arrastar o canto noroeste mantém o canto oposto parado', () => {
    const r = redimensionarRecorte({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'nw', -0.1, 0.1, null, 1);
    expect(r.x + r.w).toBeCloseTo(0.7);
    expect(r.y + r.h).toBeCloseTo(0.7);
    expect(r.x).toBeCloseTo(0.1);
    expect(r.y).toBeCloseTo(0.3);
  });

  it('com proporção 1:1 numa foto 4:3 o recorte sai quadrado em pixels', () => {
    const r = recorteComProporcao(1, 4 / 3);
    const { sw, sh } = recorteEmPixels(r, 4000, 3000);
    expect(sw).toBe(sh);
    const r2 = redimensionarRecorte(r, 'se', -0.1, 0, 1, 4 / 3);
    const p2 = recorteEmPixels(r2, 4000, 3000);
    expect(Math.abs(p2.sw - p2.sh)).toBeLessThanOrEqual(1);
  });
});

describe('saída', () => {
  it('reduz para o lado máximo sem aumentar foto pequena', () => {
    expect(dimensoesSaida(4000, 3000, 2400)).toEqual({ w: 2400, h: 1800 });
    expect(dimensoesSaida(800, 600, 2400)).toEqual({ w: 800, h: 600 });
  });

  it('nome do arquivo editado', () => {
    expect(nomeArquivoEditado('IMG_1234.HEIC')).toBe('IMG_1234-editada.jpg');
    expect(nomeArquivoEditado('foto-editada.jpg')).toBe('foto-editada.jpg');
    expect(nomeArquivoEditado(null)).toBe('foto-editada.jpg');
  });
});
