import { describe, it, expect } from 'vitest';
import { montarPedidosCompra, risSemPedido } from './pedidoCompra';
import type { CotacaoPropostaDraft, CotacaoPropostaItemDraft } from '../types';

let seq = 0;
function item(p: Partial<CotacaoPropostaItemDraft> & { descricao_produto: string }): CotacaoPropostaItemDraft {
  seq += 1;
  return {
    _key: p._key ?? `it${seq}`,
    processo_item_id: null, fora_escopo: false, vinculo_origem: 'manual', vinculo_score: null,
    ri: null, material_code: null, item_numero: null, codigo_produto: null,
    marca_fabricante: null, unidade_medida: 'UN', ncm: null, cst: null, cfop: null,
    quantidade: 1, preco_unitario: 10, preco_total_item: null,
    aliquota_icms_pct: null, aliquota_pis_pct: null, aliquota_cofins_pct: null, aliquota_ipi_pct: null,
    mapa_selecionado: false,
    extraido_raw: {} as any,
    ...p,
  };
}

function proposta(key: string, itens: CotacaoPropostaItemDraft[], p: Partial<CotacaoPropostaDraft> = {}): CotacaoPropostaDraft {
  return {
    _key: key, _salvo: true, _extraido_em: null, id: key,
    arquivo_origem: null, numero_proposta: null, data_emissao: null,
    validade_data: null, validade_texto: null,
    fornecedor_razao_social: key, fornecedor_cnpj: null, fornecedor_inscricao_estadual: null,
    fornecedor_cidade: null, fornecedor_uf: null, fornecedor_telefone: null,
    cod_vendor: null, contato_id: null, fornecedor_match: 'nao_encontrado',
    vendedor_nome: null, vendedor_email: null, vendedor_telefone: null,
    cliente_razao_social: null, cliente_cnpj: null, cliente_inscricao_estadual: null,
    cliente_cidade: null, cliente_uf: null,
    condicao_pagamento: null, forma_pagamento: null, prazo_entrega_texto: null, prazo_entrega_dias: null,
    frete_modalidade: null, transportadora_indicada: null, faturamento_minimo: null,
    dados_bancarios_pix: null, valor_total_orcamento: null, valor_frete: null, observacoes_gerais: null,
    campos_faltantes: [], revisado: true, extracao_id: null, extraido_raw: {} as any,
    itens,
    ...p,
  } as CotacaoPropostaDraft;
}

describe('montarPedidosCompra', () => {
  it('ignora proposta não salva, mesmo com item marcado', () => {
    const p = proposta('A', [item({ descricao_produto: 'X', mapa_selecionado: true })], { _salvo: false });
    expect(montarPedidosCompra([p])).toHaveLength(0);
  });

  it('ignora proposta salva sem nenhum item marcado', () => {
    const p = proposta('A', [item({ descricao_produto: 'X', mapa_selecionado: false })]);
    expect(montarPedidosCompra([p])).toHaveLength(0);
  });

  it('monta um pedido só com os itens marcados, não a proposta inteira', () => {
    const p = proposta('A', [
      item({ descricao_produto: 'MARCADO', mapa_selecionado: true, quantidade: 2, preco_unitario: 50 }),
      item({ descricao_produto: 'NAO MARCADO', mapa_selecionado: false }),
    ]);
    const [pedido] = montarPedidosCompra([p]);
    expect(pedido.itens).toHaveLength(1);
    expect(pedido.itens[0].descricaoProduto).toBe('MARCADO');
    expect(pedido.subtotal).toBe(100);
  });

  it('usa preco_total_item quando informado, senão preço × quantidade', () => {
    const p = proposta('A', [
      item({ descricao_produto: 'A', mapa_selecionado: true, quantidade: 3, preco_unitario: 10, preco_total_item: 29.9 }),
      item({ descricao_produto: 'B', mapa_selecionado: true, quantidade: 3, preco_unitario: 10, preco_total_item: null }),
    ]);
    const [pedido] = montarPedidosCompra([p]);
    expect(pedido.itens[0].precoTotal).toBe(29.9);
    expect(pedido.itens[1].precoTotal).toBe(30);
    expect(pedido.subtotal).toBeCloseTo(59.9, 6);
  });

  it('soma o frete ao subtotal para compor o total do pedido', () => {
    const p = proposta('A', [item({ descricao_produto: 'X', mapa_selecionado: true, quantidade: 1, preco_unitario: 100 })], { valor_frete: 25 });
    const [pedido] = montarPedidosCompra([p]);
    expect(pedido.subtotal).toBe(100);
    expect(pedido.total).toBe(125);
  });

  it('marca item sem vínculo de RM como fora do escopo', () => {
    const p = proposta('A', [
      item({ descricao_produto: 'COM RM', mapa_selecionado: true, processo_item_id: 'e1', ri: 'RI-1' }),
      item({ descricao_produto: 'SEM RM', mapa_selecionado: true, processo_item_id: null }),
    ]);
    const [pedido] = montarPedidosCompra([p]);
    expect(pedido.itens.find(i => i.descricaoProduto === 'COM RM')?.foraDoEscopo).toBe(false);
    expect(pedido.itens.find(i => i.descricaoProduto === 'SEM RM')?.foraDoEscopo).toBe(true);
  });

  it('acusa faturamento mínimo não atingido só pelo subtotal do que foi marcado', () => {
    const p = proposta('A', [
      item({ descricao_produto: 'X', mapa_selecionado: true, quantidade: 1, preco_unitario: 100 }),
      item({ descricao_produto: 'Y', mapa_selecionado: false, quantidade: 1, preco_unitario: 900 }),
    ], { faturamento_minimo: 500 });
    const [pedido] = montarPedidosCompra([p]);
    expect(pedido.subtotal).toBe(100);
    expect(pedido.atingeFaturamentoMinimo).toBe(false);
  });

  it('não impõe mínimo quando o fornecedor não informou', () => {
    const p = proposta('A', [item({ descricao_produto: 'X', mapa_selecionado: true })], { faturamento_minimo: null });
    const [pedido] = montarPedidosCompra([p]);
    expect(pedido.atingeFaturamentoMinimo).toBeNull();
  });

  it('monta um pedido por fornecedor, ordenados por razão social', () => {
    const zeta = proposta('z', [item({ descricao_produto: 'X', mapa_selecionado: true })], { fornecedor_razao_social: 'ZETA LTDA' });
    const alfa = proposta('a', [item({ descricao_produto: 'Y', mapa_selecionado: true })], { fornecedor_razao_social: 'ALFA LTDA' });
    const pedidos = montarPedidosCompra([zeta, alfa]);
    expect(pedidos.map(p => p.fornecedorRazaoSocial)).toEqual(['ALFA LTDA', 'ZETA LTDA']);
  });

  it('calcula dias até a validade da proposta', () => {
    const p = proposta('A', [item({ descricao_produto: 'X', mapa_selecionado: true })], { validade_data: '2026-09-10' });
    const [pedido] = montarPedidosCompra([p], '2026-09-05');
    expect(pedido.validadeDias).toBe(5);
  });
});

describe('risSemPedido', () => {
  it('aponta RI do escopo que não entrou em nenhum pedido', () => {
    const p = proposta('A', [item({ descricao_produto: 'X', mapa_selecionado: true, ri: 'RI-1' })]);
    const pedidos = montarPedidosCompra([p]);
    expect(risSemPedido(['RI-1', 'RI-2'], pedidos)).toEqual(['RI-2']);
  });

  it('não aponta nada quando todo o escopo foi coberto', () => {
    const p = proposta('A', [item({ descricao_produto: 'X', mapa_selecionado: true, ri: 'RI-1' })]);
    const pedidos = montarPedidosCompra([p]);
    expect(risSemPedido(['RI-1'], pedidos)).toEqual([]);
  });
});
