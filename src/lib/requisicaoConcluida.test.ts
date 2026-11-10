import { describe, expect, it } from 'vitest';
import { itemConcluidoNaMe5a } from './requisicaoConcluida';

describe('itemConcluidoNaMe5a', () => {
  it('X (com espaço ou minúsculo) é concluído', () => {
    expect(itemConcluidoNaMe5a({ concluida: 'X' })).toBe(true);
    expect(itemConcluidoNaMe5a({ concluida: ' x ' })).toBe(true);
  });
  it('vazio, nulo ou ausente não é', () => {
    expect(itemConcluidoNaMe5a({ concluida: null })).toBe(false);
    expect(itemConcluidoNaMe5a({ concluida: '' })).toBe(false);
    expect(itemConcluidoNaMe5a({})).toBe(false);
  });
});
