import { describe, expect, it } from 'vitest';
import {
  chaveMaterialSap, chavePedidoMaterial, compraPelaNf, fatorGrossPorPedido, menorPrecoPorMaterial, notasPorPedidoMaterial,
  type NotaPedido,
} from './menorPrecoComprado';
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

describe('fatorGrossPorPedido', () => {
  it('é valor efetivo ÷ líquido — o pedido 4100455518 (HM, ICMS 4%) volta ao preço da nota', () => {
    const f = fatorGrossPorPedido([{ doc_compra: '4100455518', material: '1417369', valor_liquido: 786.24, valor_efetivo: 819 }]);
    const fator = f.get(chavePedidoMaterial('4100455518', '0001417369'))!;
    expect(157.248 * fator).toBeCloseTo(163.8, 2);
  });

  it('soma as linhas do mesmo material no pedido e ignora linha sem valor', () => {
    const f = fatorGrossPorPedido([
      { doc_compra: 'P', material: '1', valor_liquido: 100, valor_efetivo: 110 },
      { doc_compra: 'P', material: '1', valor_liquido: 100, valor_efetivo: 130 },
      { doc_compra: 'P', material: '2', valor_liquido: 0, valor_efetivo: 50 },
    ]);
    expect(f.get(chavePedidoMaterial('P', '1'))).toBeCloseTo(1.2, 6);
    expect(f.has(chavePedidoMaterial('P', '2'))).toBe(false);
  });
});

describe('notas da menor compra', () => {
  const nota = (p: Partial<NotaPedido>): NotaPedido => ({
    pedido: '4100455518', material: '1417369', nota: '000035340', serie: '1', modelo: '55', data_documento: '2026-09-03',
    quantidade: 5, total: 819, valor_icms: 32.76, valor_ipi: 0, valor_pis: 12.97, valor_cofins: 59.75, valor_difal: 135.14,
    cfop: '2556/AA', codigo_imposto: 'HM', uf_origem: 'SP', ...p,
  });

  it('agrupa por pedido × material, tira zeros do número e ordena pela data', () => {
    const m = notasPorPedidoMaterial([nota({ nota: '000267812', data_documento: '2026-09-05' }), nota({})]);
    expect(m.get(chavePedidoMaterial('4100455518', '1417369'))!.map(n => n.nota)).toEqual(['35340', '267812']);
  });

  it('custo da compra passada: NF + DIFAL + frete do CT-e − crédito PIS/COFINS (sem crédito de ICMS)', () => {
    const c = compraPelaNf([nota({}), nota({ nota: '267812', modelo: '57', quantidade: 5, total: 20, valor_icms: 0, valor_difal: 0 })])!;
    expect(c.unitarioNota).toBeCloseTo(163.8, 2);
    expect(c.frete).toBe(20);
    expect(c.creditoPisCofins).toBeCloseTo((819 - 32.76) * 0.0925, 4);
    expect(c.custoUnitario).toBeCloseTo((819 + 135.14 + 20 - c.creditoPisCofins) / 5, 4);
  });

  it('sem NF-e da mercadoria não há custo', () => {
    expect(compraPelaNf([nota({ modelo: '57' })])).toBeNull();
  });
});
