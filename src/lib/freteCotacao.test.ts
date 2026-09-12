import { describe, it, expect } from 'vitest';
import {
  pesoTotalItem, ratear, simularFreteCotacao, aplicarFreteTeorico,
  itensTransportados, PESO_LIMITE_FRACIONADO_KG,
} from './freteCotacao';
import type { CotacaoPropostaDraft, CotacaoPropostaItemDraft, TabelaFrete } from '../types';

// ---------------------------------------------------------------------
// Fábricas
// ---------------------------------------------------------------------

let seq = 0;
function item(p: Partial<CotacaoPropostaItemDraft> = {}): CotacaoPropostaItemDraft {
  seq += 1;
  return {
    _key: p._key ?? `it${seq}`,
    processo_item_id: null, fora_escopo: false, vinculo_origem: 'manual', vinculo_score: null,
    ri: null, material_code: null, item_numero: null, codigo_produto: null,
    descricao_produto: 'Parafuso M8', marca_fabricante: null, unidade_medida: 'UN',
    ncm: null, cst: null, cfop: null,
    quantidade: 1, preco_unitario: 100, preco_total_item: null,
    aliquota_icms_pct: null, aliquota_pis_pct: null, aliquota_cofins_pct: null, aliquota_ipi_pct: null,
    desconsiderado: false, vinculo_divergencias: [],
    peso_unitario_kg: null, peso_origem: null, frete_teorico: null,
    codigo_fiscal: null, preco_liquido_unitario: null, preco_liquido_total: null, custo_total_item: null,
    extraido_raw: {} as any,
    ...p,
  };
}

function proposta(itens: CotacaoPropostaItemDraft[], p: Partial<CotacaoPropostaDraft> = {}): CotacaoPropostaDraft {
  return {
    _key: 'p1', _salvo: false, _extraido_em: null,
    arquivo_origem: null, numero_proposta: null, data_emissao: null,
    validade_data: null, validade_texto: null,
    fornecedor_razao_social: 'Fornecedor X', fornecedor_cnpj: null, fornecedor_inscricao_estadual: null,
    fornecedor_cidade: 'São Paulo', fornecedor_uf: 'SP', fornecedor_telefone: null,
    cod_vendor: null, contato_id: null, fornecedor_match: 'nao_encontrado',
    vendedor_nome: null, vendedor_email: null, vendedor_telefone: null,
    cliente_razao_social: null, cliente_cnpj: null, cliente_inscricao_estadual: null,
    cliente_cidade: null, cliente_uf: null,
    condicao_pagamento: null, forma_pagamento: null,
    prazo_entrega_texto: null, prazo_entrega_dias: null,
    frete_modalidade: 'FOB', transportadora_indicada: null, faturamento_minimo: null,
    dados_bancarios_pix: null, valor_total_orcamento: null, valor_frete: null,
    observacoes_gerais: null, campos_faltantes: [], revisado: false,
    extracao_id: null, extraido_raw: {} as any,
    itens,
    ...p,
  };
}

const ROTA_SP: TabelaFrete = {
  origem: 'SAO PAULO', uf: 'SP', destino: 'JACOBINA',
  kg_1_10: 80, kg_11_20: 110, kg_21_30: 140, kg_31_50: 190, kg_51_70: 240, kg_71_100: 300,
  kg_acima_100: 3.2,
  ad_valores: 0.3, pedagio_fracao_100kg: 12, gris: 0.5,
  cat: 15, itr_tas: 5, taxa_fixa_itr_redespacho: 0,
  fiorino: 2500, veiculo_3_4_ate_2_5t: 3200, toco_ate_5_5t: 4100,
  truck_ate_14t: 6000, carreta_ate_25t: 8500, carreta_acima_27t: 9500,
  icms_aplicado: '12',
};

const ROTA_CAMPINAS: TabelaFrete = {
  origem: 'CAMPINAS', uf: 'SP', destino: 'JACOBINA',
  kg_1_10: 100, kg_11_20: 130, kg_21_30: 160, kg_31_50: 210, kg_51_70: 260, kg_71_100: 320,
  kg_acima_100: 3.6,
  ad_valores: 0.3, pedagio_fracao_100kg: 14, gris: 0.5,
  cat: 17, itr_tas: 7, taxa_fixa_itr_redespacho: 0,
  fiorino: 2700, veiculo_3_4_ate_2_5t: 3400, toco_ate_5_5t: 4300,
  truck_ate_14t: 6200, carreta_ate_25t: 8700, carreta_acima_27t: 9700,
  icms_aplicado: '12',
};

const TABELA = [ROTA_SP];
const TABELA_COM_MEDIA_UF = [ROTA_SP, ROTA_CAMPINAS];

describe('pesoTotalItem', () => {
  it('multiplica o peso unitário estimado pela quantidade cotada', () => {
    expect(pesoTotalItem(item({ peso_unitario_kg: 2.5, quantidade: 4 }))).toBe(10);
  });

  it('trata quantidade ausente como uma unidade', () => {
    expect(pesoTotalItem(item({ peso_unitario_kg: 3, quantidade: null }))).toBe(3);
  });

  it('devolve null quando a IA não estimou peso', () => {
    expect(pesoTotalItem(item({ peso_unitario_kg: null, quantidade: 10 }))).toBeNull();
  });
});

describe('ratear', () => {
  it('fecha a soma exata no centavo, mesmo com divisão inexata', () => {
    const partes = ratear(100, [
      { key: 'a', peso: 1 },
      { key: 'b', peso: 1 },
      { key: 'c', peso: 1 },
    ]);
    const soma = Object.values(partes).reduce((s, v) => s + v, 0);
    expect(Math.round(soma * 100)).toBe(10000);
  });

  it('reparte proporcionalmente ao peso', () => {
    const partes = ratear(300, [{ key: 'leve', peso: 10 }, { key: 'pesado', peso: 90 }]);
    expect(partes.leve).toBeCloseTo(30, 2);
    expect(partes.pesado).toBeCloseTo(270, 2);
  });

  it('divide igualmente quando não há base de rateio', () => {
    const partes = ratear(10, [{ key: 'a', peso: 0 }, { key: 'b', peso: 0 }]);
    expect(partes.a).toBe(5);
    expect(partes.b).toBe(5);
  });
});

describe('simularFreteCotacao', () => {
  it('não simula proposta CIF — o frete já está no preço do fornecedor', () => {
    const sim = simularFreteCotacao({
      proposta: proposta([item({ peso_unitario_kg: 10 })], { frete_modalidade: 'CIF' }),
      tabela: TABELA,
    });
    expect(sim.motivo).toBe('nao_fob');
    expect(sim.freteTotal).toBeNull();
  });

  it('simula a carga inteira de uma vez e rateia por peso', () => {
    const leve = item({ _key: 'leve', peso_unitario_kg: 1, quantidade: 10, preco_total_item: 500 });
    const pesado = item({ _key: 'pesado', peso_unitario_kg: 10, quantidade: 4, preco_total_item: 1500 });
    const sim = simularFreteCotacao({ proposta: proposta([leve, pesado]), tabela: TABELA });

    expect(sim.motivo).toBeNull();
    expect(sim.pesoTotalKg).toBe(50);
    expect(sim.valorMercadoria).toBe(2000);
    expect(sim.modalidade).toBe('fracionado');
    // Faixa 31-50 kg, mais ad valorem, GRIS, pedágio e taxas, com ICMS por dentro.
    expect(sim.detalhe?.faixaDesc).toBe('Faixa 31 - 50 kg');
    expect(sim.freteTotal).toBeGreaterThan(190);

    const soma = Object.values(sim.fretePorItem).reduce((s, v) => s + v, 0);
    expect(Math.round(soma * 100)).toBe(Math.round((sim.freteTotal ?? 0) * 100));
    expect(sim.fretePorItem.pesado).toBeGreaterThan(sim.fretePorItem.leve);
  });

  it('não transporta item desconsiderado — nem no peso, nem no rateio', () => {
    const fica = item({ _key: 'fica', peso_unitario_kg: 5, quantidade: 2 });
    const sai = item({ _key: 'sai', peso_unitario_kg: 100, quantidade: 5, desconsiderado: true });
    const sim = simularFreteCotacao({ proposta: proposta([fica, sai]), tabela: TABELA });

    expect(sim.pesoTotalKg).toBe(10);
    expect(sim.fretePorItem.sai).toBeUndefined();
    expect(itensTransportados([fica, sai])).toHaveLength(1);
  });

  it('avisa quando nenhum item tem peso estimado', () => {
    const sim = simularFreteCotacao({ proposta: proposta([item({ peso_unitario_kg: null })]), tabela: TABELA });
    expect(sim.motivo).toBe('sem_peso');
    expect(sim.itensSemPeso).toHaveLength(1);
  });

  it('rateia o item sem peso pela densidade média, em vez de deixá-lo de graça', () => {
    const comPeso = item({ _key: 'com', peso_unitario_kg: 20, quantidade: 1, preco_total_item: 1000 });
    const semPeso = item({ _key: 'sem', peso_unitario_kg: null, quantidade: 1, preco_total_item: 1000 });
    const sim = simularFreteCotacao({ proposta: proposta([comPeso, semPeso]), tabela: TABELA });

    expect(sim.itensSemPeso).toEqual(['sem']);
    expect(sim.fretePorItem.sem).toBeGreaterThan(0);
  });

  it('avisa quando nem a cidade nem a UF têm rota cadastrada', () => {
    const sim = simularFreteCotacao({
      proposta: proposta([item({ peso_unitario_kg: 5 })], { fornecedor_cidade: 'Manaus', fornecedor_uf: 'AM' }),
      tabela: TABELA,
    });
    expect(sim.motivo).toBe('rota_nao_encontrada');
    expect(sim.rotaAproximada).toBe(false);
  });

  it('cai para a média das rotas da UF quando a cidade não está cadastrada', () => {
    const sim = simularFreteCotacao({
      proposta: proposta(
        [item({ peso_unitario_kg: 5, quantidade: 2, preco_total_item: 500 })],
        { fornecedor_cidade: 'Sorocaba', fornecedor_uf: 'SP' },
      ),
      tabela: TABELA_COM_MEDIA_UF,
    });

    expect(sim.motivo).toBeNull();
    expect(sim.rotaAproximada).toBe(true);
    expect(sim.rota?.uf).toBe('SP');
    // Faixa 1-10kg: média das duas rotas cadastradas para SP.
    expect(sim.detalhe?.freteBase).toBeCloseTo((ROTA_SP.kg_1_10 + ROTA_CAMPINAS.kg_1_10) / 2, 4);
    expect(sim.freteTotal).toBeGreaterThan(0);
  });

  it('cidade cadastrada tem prioridade sobre a média da UF', () => {
    const sim = simularFreteCotacao({
      proposta: proposta(
        [item({ peso_unitario_kg: 5, quantidade: 2, preco_total_item: 500 })],
        { fornecedor_cidade: 'São Paulo', fornecedor_uf: 'SP' },
      ),
      tabela: TABELA_COM_MEDIA_UF,
    });
    expect(sim.rotaAproximada).toBe(false);
    expect(sim.detalhe?.freteBase).toBe(ROTA_SP.kg_1_10);
  });

  it('avisa quando a proposta não diz a cidade do fornecedor', () => {
    const sim = simularFreteCotacao({
      proposta: proposta([item({ peso_unitario_kg: 5 })], { fornecedor_cidade: null }),
      tabela: TABELA,
    });
    expect(sim.motivo).toBe('sem_origem');
  });

  it('troca para veículo dedicado acima do limite da carga fracionada', () => {
    const pesado = item({ peso_unitario_kg: PESO_LIMITE_FRACIONADO_KG + 1, quantidade: 1, preco_total_item: 50000 });
    const sim = simularFreteCotacao({ proposta: proposta([pesado]), tabela: TABELA });
    expect(sim.modalidade).toBe('dedicado');
    expect(sim.detalhe?.freteBase).toBe(ROTA_SP.fiorino);
  });
});

describe('aplicarFreteTeorico', () => {
  it('grava a parcela em cada item e deixa o desconsiderado sem frete', () => {
    const a = item({ _key: 'a', peso_unitario_kg: 5, quantidade: 2, preco_total_item: 500 });
    const b = item({ _key: 'b', peso_unitario_kg: 5, quantidade: 2, preco_total_item: 500, desconsiderado: true });
    const sim = simularFreteCotacao({ proposta: proposta([a, b]), tabela: TABELA });
    const [novoA, novoB] = aplicarFreteTeorico([a, b], sim);

    expect(novoA.frete_teorico).toBeGreaterThan(0);
    expect(novoB.frete_teorico).toBeNull();
  });
});
