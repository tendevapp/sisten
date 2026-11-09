import { describe, it, expect } from 'vitest';
import { transbordaHorizontal } from './rolagemSuperiorTabelas';

describe('transbordaHorizontal', () => {
  it('acende quando o conteúdo passa da largura visível', () => {
    expect(transbordaHorizontal(1600, 1200)).toBe(true);
  });

  it('não acende quando cabe', () => {
    expect(transbordaHorizontal(1200, 1200)).toBe(false);
    expect(transbordaHorizontal(900, 1200)).toBe(false);
  });

  it('ignora 1px de arredondamento de subpixel', () => {
    expect(transbordaHorizontal(1201, 1200)).toBe(false);
    expect(transbordaHorizontal(1202, 1200)).toBe(true);
  });
});
