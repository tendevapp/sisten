import { describe, expect, it } from 'vitest';
import {
  casarItemComAnterior,
  mesclarPropostaRenegociacao,
  calcularComparativoRenegociacao,
  construirHistoricoRodadas,
  calcularSavingPedido,
} from './renegociacaoCotacao';
import { montarPedidosCompra } from './pedidoCompra';
import type { CotacaoPropostaDraft, CotacaoPropostaItemDraft } from '../types';

function criarItem(overrides: Partial<CotacaoPropostaItemDraft> = {}): CotacaoPropostaItemDraft {
  return {
    _key: overrides._key ?? 'item-1',
    processo_item_id: null,
    fora_escopo: false,
    vinculo_origem: 'manual',
    vinculo_score: null,
    ri: null,
    material_code: null,
    item_numero: 1,
    codigo_produto: null,
    descricao_produto: 'PARAFUSO SEXTAVADO M12 X 40 INOX',
    marca_fabricante: null,
    unidade_medida: 'PC',
    ncm: null,
    cst: null,
    cfop: null,
    quantidade: 10,
    preco_unitario: 100,
    preco_total_item: 1000,
    aliquota_icms_pct: 18,
    aliquota_pis_pct: null,
    aliquota_cofins_pct: null,
    aliquota_ipi_pct: null,
    desconsiderado: false,
    vinculo_divergencias: [],
    peso_unitario_kg: 0.2,
    peso_origem: 'ia',
    frete_teorico: null,
    codigo_fiscal: null,
    preco_liquido_unitario: null,
    preco_liquido_total: null,
    custo_total_item: null,
    mapa_selecionado: false,
    mapa_observacao: null,
    extraido_raw: {} as any,
    ...overrides,
  };
}

function criarProposta(overrides: Partial<CotacaoPropostaDraft> = {}): CotacaoPropostaDraft {
  return {
    _key: overrides._key ?? 'prop-1',
    _salvo: true,
    _extraido_em: '2026-11-20T10:00:00.000Z',
    arquivo_origem: 'orcamento-r1.pdf',
    numero_proposta: 'ORC-001',
    data_emissao: '2026-11-20',
    validade_data: '2026-12-20',
    validade_texto: null,
    fornecedor_razao_social: 'FORNECEDOR ALPHA LTDA',
    fornecedor_cnpj: '12345678000199',
    fornecedor_inscricao_estadual: '123456',
    fornecedor_cidade: 'SALVADOR',
    fornecedor_uf: 'BA',
    fornecedor_telefone: '7199999999',
    cod_vendor: '100200',
    contato_id: 'contato-1',
    fornecedor_match: 'cnpj',
    vendedor_nome: 'Carlos',
    vendedor_email: 'carlos@alpha.com',
    vendedor_telefone: '7199999999',
    cliente_razao_social: 'TEN',
    cliente_cnpj: null,
    cliente_inscricao_estadual: null,
    cliente_cidade: null,
    cliente_uf: null,
    condicao_pagamento: '30 DDL',
    forma_pagamento: 'Boleto',
    prazo_entrega_texto: '15 dias',
    prazo_entrega_dias: 15,
    frete_modalidade: 'FOB',
    transportadora_indicada: null,
    faturamento_minimo: null,
    dados_bancarios_pix: null,
    valor_total_orcamento: 1000,
    valor_frete: 150,
    valor_desconto: null,
    observacoes_gerais: null,
    campos_faltantes: [],
    revisado: true,
    extracao_id: null,
    extraido_raw: {} as any,
    arquivo_storage_path: 'proc/r1.pdf',
    arquivo_mime_type: 'application/pdf',
    arquivo_tamanho_bytes: 12000,
    arquivos_originais: [],
    arquivo_markdown: '# R1',
    arquivo_markdown_editado_em: null,
    arquivo_markdown_editado_por: null,
    rodada: 1,
    ativa: true,
    proposta_origem_id: null,
    substituida_por_id: null,
    renegociada_em: null,
    renegociada_por: null,
    itens: [criarItem()],
    ...overrides,
  };
}

describe('renegociacaoCotacao', () => {
  it('casa itens por processo_item_id, RI, codigo_produto e similaridade de descricao', () => {
    const anteriores = [
      criarItem({ _key: 'a1', processo_item_id: 'pi-1', ri: '45001-0010', codigo_produto: 'COD-A', descricao_produto: 'CABO FLEXIVEL 2.5MM PRETO' }),
      criarItem({ _key: 'a2', ri: '45001-0020', codigo_produto: 'COD-B', descricao_produto: 'DISJUNTOR DIN 20A' }),
      criarItem({ _key: 'a3', codigo_produto: 'COD-C', descricao_produto: 'FITA ISOLANTE 19MM 20M' }),
      criarItem({ _key: 'a4', descricao_produto: 'LUVA VAQUETA SEGURANCA CA 1234' }),
    ];
    const usados = new Set<string>();

    const m1 = casarItemComAnterior(criarItem({ processo_item_id: 'pi-1', descricao_produto: 'OUTRO TEXTO' }), anteriores, usados);
    expect(m1?._key).toBe('a1');
    usados.add('a1');

    const m2 = casarItemComAnterior(criarItem({ ri: '45001-0020', descricao_produto: 'QUALQUER' }), anteriores, usados);
    expect(m2?._key).toBe('a2');
    usados.add('a2');

    const m3 = casarItemComAnterior(criarItem({ codigo_produto: 'cod-c', descricao_produto: 'QUALQUER' }), anteriores, usados);
    expect(m3?._key).toBe('a3');
    usados.add('a3');

    const m4 = casarItemComAnterior(criarItem({ descricao_produto: 'LUVA DE VAQUETA SEGURANCA' }), anteriores, usados);
    expect(m4?._key).toBe('a4');
  });

  it('mescla renegociacao parcial preservando itens nao citados, vinculos RM e selecao do mapa', () => {
    const r1 = criarProposta({
      _key: 'prop-r1',
      rodada: 1,
      valor_total_orcamento: 3000,
      itens: [
        criarItem({
          _key: 'r1-i1',
          processo_item_id: 'pi-1',
          ri: '45001-0010',
          material_code: '100001',
          descricao_produto: 'PARAFUSO SEXTAVADO M12',
          quantidade: 10,
          preco_unitario: 100,
          preco_total_item: 1000,
          mapa_selecionado: true,
          mapa_observacao: 'Melhor prazo',
        }),
        criarItem({
          _key: 'r1-i2',
          processo_item_id: 'pi-2',
          ri: '45001-0020',
          material_code: '100002',
          descricao_produto: 'ARRUELA LISA M12 INOX',
          quantidade: 20,
          preco_unitario: 100,
          preco_total_item: 2000,
          mapa_selecionado: true,
        }),
      ],
    });

    // Fornecedor renegociou apenas o item 1, baixando de 100 para 85/un
    const extraida = criarProposta({
      _key: 'draft-r2',
      _salvo: false,
      fornecedor_cnpj: null,
      cod_vendor: null,
      fornecedor_match: 'nao_encontrado',
      condicao_pagamento: '45 DDL',
      valor_total_orcamento: 850,
      itens: [
        criarItem({
          _key: 'r2-i1',
          processo_item_id: null,
          descricao_produto: 'PARAFUSO SEXTAVADO M12',
          quantidade: 10,
          preco_unitario: 85,
          preco_total_item: 850,
          peso_unitario_kg: null,
        }),
      ],
    });

    const mesclada = mesclarPropostaRenegociacao(r1, extraida);

    expect(mesclada.rodada).toBe(2);
    expect(mesclada.proposta_origem_id).toBe('prop-r1');
    expect(mesclada.fornecedor_cnpj).toBe('12345678000199');
    expect(mesclada.cod_vendor).toBe('100200');
    expect(mesclada.condicao_pagamento).toBe('45 DDL');
    expect(mesclada.itens).toHaveLength(2);

    const itemReneg = mesclada.itens[0];
    expect(itemReneg._reneg_origem).toBe('renegociado');
    expect(itemReneg.processo_item_id).toBe('pi-1');
    expect(itemReneg.ri).toBe('45001-0010');
    expect(itemReneg.peso_unitario_kg).toBe(0.2);
    expect(itemReneg.mapa_selecionado).toBe(true);
    expect(itemReneg.mapa_observacao).toBe('Melhor prazo');

    const itemMantido = mesclada.itens[1];
    expect(itemMantido._reneg_origem).toBe('mantido');
    expect(itemMantido.processo_item_id).toBe('pi-2');
    expect(itemMantido.preco_unitario).toBe(100);
    expect(itemMantido.preco_total_item).toBe(2000);
    expect(itemMantido.mapa_selecionado).toBe(true);

    expect(mesclada.valor_total_orcamento).toBe(2850);
  });

  it('calcula saving unitario, total, percentual e mudancas comerciais corretamente', () => {
    const r1 = criarProposta({
      _key: 'prop-r1',
      rodada: 1,
      condicao_pagamento: '30 DDL',
      frete_modalidade: 'FOB',
      itens: [
        criarItem({ _key: 'a1', processo_item_id: 'pi-1', quantidade: 10, preco_unitario: 100, preco_total_item: 1000 }),
        criarItem({ _key: 'a2', processo_item_id: 'pi-2', quantidade: 5, preco_unitario: 200, preco_total_item: 1000 }),
      ],
    });

    const r2 = criarProposta({
      _key: 'prop-r2',
      rodada: 2,
      proposta_origem_id: 'prop-r1',
      condicao_pagamento: '45 DDL',
      frete_modalidade: 'CIF',
      valor_frete: null,
      itens: [
        criarItem({ _key: 'b1', processo_item_id: 'pi-1', quantidade: 10, preco_unitario: 80, preco_total_item: 800, _reneg_origem: 'renegociado', _reneg_item_anterior_key: 'a1' }),
        criarItem({ _key: 'b2', processo_item_id: 'pi-2', quantidade: 5, preco_unitario: 210, preco_total_item: 1050, _reneg_origem: 'renegociado', _reneg_item_anterior_key: 'a2' }),
      ],
    });

    const comp = calcularComparativoRenegociacao(r1, r2);

    expect(comp.totalAnterior).toBe(2000);
    expect(comp.totalNovo).toBe(1850);
    expect(comp.diffTotal).toBe(-150);
    expect(comp.savingTotal).toBe(150);
    expect(comp.diffPct).toBeCloseTo(-7.5, 4);
    expect(comp.savingPct).toBeCloseTo(7.5, 4);
    expect(comp.qtdReduzidos).toBe(1);
    expect(comp.qtdAumentados).toBe(1);

    const item1 = comp.porItemKey.get('b1')!;
    expect(item1.diffUnitario).toBe(-20);
    expect(item1.savingUnitario).toBe(20);
    expect(item1.diffUnitarioPct).toBeCloseTo(-20, 4);
    expect(item1.savingTotal).toBe(200);

    const item2 = comp.porItemKey.get('b2')!;
    expect(item2.diffUnitario).toBe(10);
    expect(item2.diffUnitarioPct).toBeCloseTo(5, 4);
    expect(item2.savingTotal).toBe(-50);

    expect(comp.mudancasComerciais.some(m => m.campo === 'Condição de pagamento')).toBe(true);
    expect(comp.mudancasComerciais.some(m => m.campo === 'Modalidade de frete')).toBe(true);
  });

  it('constroi cadeia de historico multi-rodada (R1 -> R2 -> R3) separando ativas e calculando acumulado', () => {
    const r1 = criarProposta({
      _key: 'p1',
      rodada: 1,
      ativa: false,
      substituida_por_id: 'p2',
      itens: [criarItem({ _key: 'i1', processo_item_id: 'pi-1', quantidade: 10, preco_unitario: 100, preco_total_item: 1000 })],
    });
    const r2 = criarProposta({
      _key: 'p2',
      rodada: 2,
      ativa: false,
      proposta_origem_id: 'p1',
      substituida_por_id: 'p3',
      itens: [criarItem({ _key: 'i2', processo_item_id: 'pi-1', quantidade: 10, preco_unitario: 90, preco_total_item: 900 })],
    });
    const r3 = criarProposta({
      _key: 'p3',
      rodada: 3,
      ativa: true,
      proposta_origem_id: 'p2',
      itens: [criarItem({ _key: 'i3', processo_item_id: 'pi-1', quantidade: 10, preco_unitario: 80, preco_total_item: 800, mapa_selecionado: true })],
    });

    const hist = construirHistoricoRodadas([r1, r2, r3]);

    expect(hist.ativas.map(p => p._key)).toEqual(['p3']);
    expect(hist.inativas.map(p => p._key)).toEqual(['p1', 'p2']);

    const h3 = hist.porPropostaKey.get('p3')!;
    expect(h3.rodadaAtual).toBe(3);
    expect(h3.rodadas.map(r => r._key)).toEqual(['p1', 'p2', 'p3']);
    // Contra rodada anterior (R2 -> R3): 900 -> 800 = saving 100 (-11.11%)
    expect(h3.comparativoAnterior?.savingTotal).toBe(100);
    expect(h3.comparativoAnterior?.diffPct).toBeCloseTo(-11.1111, 2);
    // Acumulado contra R1 (R1 -> R3): 1000 -> 800 = saving 200 (-20%)
    expect(h3.comparativoInicial?.savingTotal).toBe(200);
    expect(h3.comparativoInicial?.diffPct).toBeCloseTo(-20, 4);

    // Saving no pedido (apenas itens selecionados)
    const pedidos = montarPedidosCompra(hist.ativas);
    expect(pedidos).toHaveLength(1);
    const savingPedido = calcularSavingPedido(pedidos[0], h3.comparativoAnterior);
    expect(savingPedido?.savingTotal).toBe(100);
    expect(savingPedido?.diffPct).toBeCloseTo(-11.1111, 2);
  });
});
