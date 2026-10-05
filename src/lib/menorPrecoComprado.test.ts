import { describe, expect, it } from 'vitest';
import { chaveMaterialSap, menorPrecoPorMaterial } from './menorPrecoComprado';
import type { HistoricoPedidoView } from '../types';

function linha(over: Partial<HistoricoPedidoView>): HistoricoPedidoView {
  return {
    material: '110033890300030',
    txt_breve: 'CALCA SOLD M VAQ M',
    grp_mercads: 'B01',
    doc_compra: 'PO1',
    data_doc: '2026-03-10',
    qtd_pedido: 10,
    valor_liquido: 1000,
    fornecedor: 'FORN A',
    ...over,
  };
}

describe('menorPrecoPorMaterial', () => {
  it('fica com o menor preço unitário (valor ÷ quantidade) do material', () => {
    const r = menorPrecoPorMaterial([
      linha({ doc_compra: 'PO1', valor_liquido: 1000, qtd_pedido: 10 }), // 100
      linha({ doc_compra: 'PO2', valor_liquido: 640, qtd_pedido: 10, fornecedor: 'FORN B' }), // 64
      linha({ doc_compra: 'PO3', valor_liquido: 900, qtd_pedido: 10 }), // 90
    ]).get('110033890300030');
    expect(r).toMatchObject({ preco: 64, fornecedor: 'FORN B', pedido: 'PO2', compras: 3 });
  });

  it('ignora compras anteriores a 2026', () => {
    const r = menorPrecoPorMaterial([
      linha({ doc_compra: 'PO-VELHO', data_doc: '2025-12-31', valor_liquido: 10 }),
      linha({ doc_compra: 'PO-NOVO', data_doc: '2026-01-01', valor_liquido: 500 }),
    ]).get('110033890300030');
    expect(r).toMatchObject({ pedido: 'PO-NOVO', preco: 50, compras: 1 });
  });

  it('casa o código com e sem zeros à esquerda', () => {
    const m = menorPrecoPorMaterial([linha({ material: '000000110033890300030' })]);
    expect(m.get(chaveMaterialSap('110033890300030'))).toBeDefined();
  });

  it('não devolve material genérico, serviço nem linha sem valor', () => {
    const m = menorPrecoPorMaterial(
      [
        linha({ material: 'GEN1' }),
        linha({ material: 'SERV', tipo_doc_compra: 'ZP06' }),
        linha({ material: 'ZERO', valor_liquido: 0 }),
      ],
      new Set(['GEN1']),
    );
    expect(m.size).toBe(0);
  });

  it('em empate de preço, prefere a compra mais recente', () => {
    const r = menorPrecoPorMaterial([
      linha({ doc_compra: 'PO-A', data_doc: '2026-02-01' }),
      linha({ doc_compra: 'PO-B', data_doc: '2026-05-01' }),
    ]).get('110033890300030');
    expect(r?.pedido).toBe('PO-B');
  });
});
