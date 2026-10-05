import { describe, expect, it } from 'vitest';
import {
  SEM_VINCULO_SAP,
  amostrasDeCotacoes,
  amostrasDePedidos,
  calcPrecoMedio,
  mediana,
  mediaPonderada,
  serieTemporalPreco,
  type AmostraPreco,
  type ItemCotacaoPreco,
} from './precoMedio';
import type { HistoricoPedidoView } from '../types';

function linha(over: Partial<HistoricoPedidoView>): HistoricoPedidoView {
  return {
    material: 'M1',
    txt_breve: 'LUVA NITRILICA',
    grp_mercads: 'B01',
    grp_mercads_desc: 'EPI',
    doc_compra: 'PO1',
    data_doc: '2026-01-10',
    qtd_pedido: 10,
    valor_liquido: 100,
    fornecedor: 'FORN A',
    ...over,
  };
}

function cot(over: Partial<ItemCotacaoPreco>): ItemCotacaoPreco {
  return {
    id: '1',
    material_code: 'M1',
    descricao_produto: 'LUVA NITRILICA',
    unidade_medida: 'PAR',
    quantidade: 10,
    preco_unitario: 10,
    data: '2026-01-10',
    fornecedor: 'FORN A',
    numero_proposta: 'P1',
    ...over,
  };
}

describe('precoMedio — adaptadores', () => {
  it('pedido: preço unitário é valor ÷ quantidade', () => {
    const [a] = amostrasDePedidos([linha({ qtd_pedido: 4, valor_liquido: 50 })]);
    expect(a.preco).toBe(12.5);
    expect(a.chaveMaterial).toBe('M1');
  });

  it('pedido: descarta serviço, contrato-quadro e linha sem quantidade, valor ou data', () => {
    const amostras = amostrasDePedidos([
      linha({ tipo_doc_compra: 'ZP06' }),
      linha({ txt_breve: 'Contrato de fornecimento' }),
      linha({ qtd_pedido: 0 }),
      linha({ valor_liquido: 0 }),
      linha({ data_doc: undefined }),
      linha({}),
    ]);
    expect(amostras).toHaveLength(1);
  });

  it('cotação: item sem vínculo SAP agrupa pela descrição normalizada', () => {
    const [a] = amostrasDeCotacoes([cot({ material_code: null, descricao_produto: 'Luva Nitrílica (G)' })]);
    expect(a.chaveMaterial).toBe(`${SEM_VINCULO_SAP}LUVA NITRILICA G`);
  });

  it('cotação: descarta preço zerado e sem data; quantidade ausente pesa 1', () => {
    const amostras = amostrasDeCotacoes([
      cot({ preco_unitario: 0 }),
      cot({ data: null }),
      cot({ quantidade: null }),
    ]);
    expect(amostras).toHaveLength(1);
    expect(amostras[0].qtd).toBe(1);
  });
});

describe('precoMedio — estatística', () => {
  it('mediana de quantidade par e ímpar', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 2, 3])).toBe(2.5);
    expect(mediana([])).toBe(0);
  });

  it('média ponderada pesa pela quantidade', () => {
    const a = (preco: number, qtd: number) => ({ preco, qtd }) as AmostraPreco;
    // 1.000 un. a R$ 2 e 1 un. a R$ 20 → ~R$ 2,02, não R$ 11.
    expect(mediaPonderada([a(2, 1000), a(20, 1)])).toBeCloseTo(2.018, 3);
  });
});

describe('precoMedio — calcPrecoMedio', () => {
  const base = amostrasDePedidos([
    linha({ doc_compra: 'PO1', data_doc: '2026-01-10', qtd_pedido: 10, valor_liquido: 100, fornecedor: 'A' }), // 10
    linha({ doc_compra: 'PO2', data_doc: '2026-02-10', qtd_pedido: 10, valor_liquido: 120, fornecedor: 'B' }), // 12
    linha({ doc_compra: 'PO3', data_doc: '2026-03-10', qtd_pedido: 10, valor_liquido: 150, fornecedor: 'A' }), // 15
  ]);

  it('calcula média, extremos, último e variação contra as compras anteriores', () => {
    const [item] = calcPrecoMedio(base, 'material');
    expect(item.n).toBe(3);
    expect(item.precoMedio).toBeCloseTo(12.3333, 3);
    expect(item.menor).toBe(10);
    expect(item.maior).toBe(15);
    expect(item.fornecedorMenor).toBe('A');
    expect(item.amplitudePct).toBeCloseTo(50, 5);
    expect(item.ultimo).toBe(15);
    expect(item.dataUltimo).toBe('2026-03-10');
    // anteriores: 10 e 12 → média 11; 15 / 11 − 1 ≈ 36,4%
    expect(item.variacaoUltimoPct).toBeCloseTo(36.36, 1);
  });

  it('com uma só amostra não há variação', () => {
    const [item] = calcPrecoMedio(base.slice(0, 1), 'material');
    expect(item.variacaoUltimoPct).toBeNull();
  });

  it('ordena as amostras por data mesmo com entrada embaralhada', () => {
    const [item] = calcPrecoMedio([base[2], base[0], base[1]], 'material');
    expect(item.amostras.map(a => a.data)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
    expect(item.ultimo).toBe(15);
  });

  it('quebra por fornecedor, do mais barato para o mais caro', () => {
    const [item] = calcPrecoMedio(base, 'material');
    // A: (10 + 15) / 2 = 12,5 · B: 12
    expect(item.fornecedores.map(f => f.fornecedor)).toEqual(['B', 'A']);
    expect(item.fornecedores[1].n).toBe(2);
  });

  it('minAmostras corta item com pouco histórico', () => {
    const duas = amostrasDePedidos([linha({ material: 'X', doc_compra: 'P9' })]);
    const itens = calcPrecoMedio([...base, ...duas], 'material', 2);
    expect(itens.map(i => i.material)).toEqual(['M1']);
  });

  it('modo similar junta códigos diferentes com a mesma descrição e grupo', () => {
    const amostras = amostrasDePedidos([
      linha({ material: 'M1', doc_compra: 'PO1' }),
      linha({ material: 'M2', doc_compra: 'PO2', txt_breve: 'Luva  Nitrílica' }),
    ]);
    expect(calcPrecoMedio(amostras, 'material')).toHaveLength(2);
    expect(calcPrecoMedio(amostras, 'similar')).toHaveLength(1);
  });

  it('marca como sem vínculo o item cotado sem código SAP', () => {
    const [item] = calcPrecoMedio(amostrasDeCotacoes([cot({ material_code: null })]), 'material');
    expect(item.semVinculo).toBe(true);
    const [vinc] = calcPrecoMedio(amostrasDeCotacoes([cot({})]), 'material');
    expect(vinc.semVinculo).toBe(false);
  });
});

describe('precoMedio — serieTemporalPreco', () => {
  it('agrupa por mês com preço médio ponderado, menor e maior', () => {
    const amostras = amostrasDePedidos([
      linha({ doc_compra: 'PO1', data_doc: '2026-01-05', qtd_pedido: 10, valor_liquido: 100 }), // 10
      linha({ doc_compra: 'PO2', data_doc: '2026-01-25', qtd_pedido: 30, valor_liquido: 540 }), // 18
      linha({ doc_compra: 'PO3', data_doc: '2026-02-03', qtd_pedido: 10, valor_liquido: 110 }), // 11
    ]);
    const serie = serieTemporalPreco(amostras, 'mes');
    expect(serie.map(p => p.periodo)).toEqual(['2026-01', '2026-02']);
    expect(serie[0].precoMedio).toBeCloseTo(16, 5); // (100+540)/40
    expect(serie[0].menor).toBe(10);
    expect(serie[0].maior).toBe(18);
    expect(serie[0].n).toBe(2);
    expect(serie[0].mediana).toBe(14); // mediana de 10 e 18
    expect(serie[0].variacaoPct).toBeNull();
    // fev: 11 contra 16 em jan
    expect(serie[1].variacaoPct).toBeCloseTo((11 / 16 - 1) * 100, 5);
  });

  it('mês sem preço entra como buraco e a variação compara com o último mês com dados', () => {
    const amostras = amostrasDePedidos([
      linha({ doc_compra: 'PO1', data_doc: '2025-11-10', qtd_pedido: 10, valor_liquido: 100 }), // 10
      linha({ doc_compra: 'PO2', data_doc: '2026-02-10', qtd_pedido: 10, valor_liquido: 120 }), // 12
    ]);
    const serie = serieTemporalPreco(amostras, 'mes');
    expect(serie.map(p => p.periodo)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(serie[1]).toMatchObject({ n: 0, precoMedio: null, mediana: null, menor: null, maior: null, variacaoPct: null });
    expect(serie[3].variacaoPct).toBeCloseTo(20, 5);
  });
});
