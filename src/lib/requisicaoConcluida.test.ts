import { describe, expect, it } from 'vitest';
import { foraDaCentralDeCompras, itemConcluidoNaMe5a, itemForaDaUltimaMe5a } from './requisicaoConcluida';

describe('itemForaDaUltimaMe5a', () => {
  it('só false explícito tira o item (cache antigo sem o campo fica)', () => {
    expect(itemForaDaUltimaMe5a({ presente_ultima_carga: false })).toBe(true);
    expect(itemForaDaUltimaMe5a({ presente_ultima_carga: true })).toBe(false);
    expect(itemForaDaUltimaMe5a({ presente_ultima_carga: null })).toBe(false);
    expect(itemForaDaUltimaMe5a({})).toBe(false);
  });
});

describe('foraDaCentralDeCompras', () => {
  it('sai quando concluída ou fora da última ME5A', () => {
    expect(foraDaCentralDeCompras({ concluida: 'X' })).toBe(true);
    expect(foraDaCentralDeCompras({ presente_ultima_carga: false })).toBe(true);
    expect(foraDaCentralDeCompras({ concluida: null, presente_ultima_carga: true })).toBe(false);
  });
  it('pedido eliminado não tira o item da Central (volta a Sem PO)', () => {
    expect(foraDaCentralDeCompras({ presente_ultima_carga: true, po_eliminado: true } as any)).toBe(false);
  });
});

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
