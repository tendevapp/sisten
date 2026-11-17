import { describe, expect, it } from 'vitest';
import { foraDaCentralDeCompras, itemComPedidoEliminado, itemConcluidoNaMe5a } from './requisicaoConcluida';

describe('itemComPedidoEliminado', () => {
  it('só a marca da view (true) conta', () => {
    expect(itemComPedidoEliminado({ po_eliminado: true })).toBe(true);
    expect(itemComPedidoEliminado({ po_eliminado: false })).toBe(false);
    expect(itemComPedidoEliminado({ po_eliminado: null })).toBe(false);
    expect(itemComPedidoEliminado({})).toBe(false);
  });
});

describe('foraDaCentralDeCompras', () => {
  it('sai quando concluída ou com pedido eliminado', () => {
    expect(foraDaCentralDeCompras({ concluida: 'X' })).toBe(true);
    expect(foraDaCentralDeCompras({ po_eliminado: true })).toBe(true);
    expect(foraDaCentralDeCompras({ concluida: null, po_eliminado: false })).toBe(false);
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
