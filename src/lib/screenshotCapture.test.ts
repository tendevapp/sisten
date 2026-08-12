import { describe, it, expect } from 'vitest';
import { computeScaledDimensions } from './screenshotCapture';

describe('computeScaledDimensions', () => {
  it('não amplia imagens menores que o máximo', () => {
    expect(computeScaledDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('reduz proporcionalmente quando a largura excede o máximo', () => {
    expect(computeScaledDimensions(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
  });

  it('reduz proporcionalmente quando a altura excede o máximo', () => {
    expect(computeScaledDimensions(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 });
  });

  it('nunca devolve dimensão zero', () => {
    expect(computeScaledDimensions(1, 10000, 1600)).toEqual({ width: 1, height: 1600 });
  });
});
