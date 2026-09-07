import { describe, it, expect } from 'vitest';
import {
  tokensDescricao, similaridadeDescricao, similaridadeItens, LIMIAR_SIMILARIDADE_PADRAO,
  calcularCustoItem, brutoDoItem, OPCOES_CUSTO_PADRAO, agruparLinhasMapa,
  resumirFornecedores, cenarioMenorPreco, cenarioFornecedorUnico, cenarioSelecao,
  diasAteValidade, opcoesDaBase, ordenarLinhas,
} from './mapaCotacao';
import type { PropostaMapa } from './mapaCotacao';
import type { CotacaoProcessoItem, CotacaoPropostaDraft, CotacaoPropostaItemDraft } from '../types';

// ---------------------------------------------------------------------
// Fábricas
// ---------------------------------------------------------------------

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
    extraido_raw: {} as any,
    ...p,
  };
}

function proposta(nome: string, itens: CotacaoPropostaItemDraft[], p: Partial<CotacaoPropostaDraft> = {}): PropostaMapa {
  return {
    key: nome,
    proposta: {
      _key: nome, _salvo: true, _extraido_em: null,
      arquivo_origem: null, numero_proposta: null, data_emissao: null,
      validade_data: null, validade_texto: null,
      fornecedor_razao_social: nome, fornecedor_cnpj: null, fornecedor_inscricao_estadual: null,
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
    },
  };
}

function escopoItem(id: string, texto: string, qtd = 1): CotacaoProcessoItem {
  return {
    id, processo_id: 'proc', ri: `RI-${id}`, rm: null, item_reqc: null,
    material_code: null, texto_breve: texto, qtd_solicitada: qtd, unidade_medida: 'UN',
    centro: null, deposito: null, created_at: '2026-09-01T00:00:00Z',
  };
}

// ---------------------------------------------------------------------
// Tokenização e similaridade
// ---------------------------------------------------------------------

describe('tokensDescricao', () => {
  it('cola o número na unidade e descarta ligações', () => {
    expect(tokensDescricao('FITA DUPLA FACE DE ADESIVO 19 MM X 20M'))
      .toEqual(['FITA', 'DUPLA', 'FACE', 'ADESIVO', '19MM', '20M']);
  });

  it('normaliza plural para o singular', () => {
    expect(tokensDescricao('PILHAS PALITO AAA')).toEqual(tokensDescricao('PILHA PALITO AAA'));
  });

  it('não mutila palavra curta terminada em S', () => {
    expect(tokensDescricao('GAS INERTE')).toEqual(['GAS', 'INERTE']);
  });

  it('trata vírgula decimal como parte da medida', () => {
    expect(tokensDescricao('CABO FLEXIVEL 2,5MM')).toEqual(['CABO', 'FLEXIVEL', '2.5MM']);
  });
});

describe('similaridadeDescricao', () => {
  it('junta o mesmo material descrito com palavras a mais', () => {
    const s = similaridadeDescricao(
      'FITA DUPLA FACE DE ADESIVO TRANSPARENTE 19MM X 20M',
      'FITA DUPLA FACE 19MM X 20M ATLAS',
    );
    expect(s).toBeGreaterThanOrEqual(LIMIAR_SIMILARIDADE_PADRAO);
  });

  it('separa materiais diferentes que só compartilham a medida', () => {
    const s = similaridadeDescricao('FITA ISOLANTE 19MM X 10M', 'FITA DUPLA FACE 19MM X 20M');
    expect(s).toBeLessThan(LIMIAR_SIMILARIDADE_PADRAO);
  });

  it('separa o mesmo material em medidas diferentes', () => {
    const s = similaridadeDescricao('FITA ISOLANTE 19MM', 'FITA ISOLANTE 12MM');
    expect(s).toBeLessThan(LIMIAR_SIMILARIDADE_PADRAO);
  });

  it('vale 0 quando um dos lados é vazio', () => {
    expect(similaridadeDescricao('', 'FITA ISOLANTE')).toBe(0);
    expect(similaridadeDescricao(null, null)).toBe(0);
  });

  it('é simétrica', () => {
    const a = 'PILHA ALCALINA 12V 23A';
    const b = 'PILHAS ALCALINAS 12V 23A ELGIN';
    expect(similaridadeDescricao(a, b)).toBeCloseTo(similaridadeDescricao(b, a), 10);
  });
});

describe('similaridadeItens', () => {
  it('código de produto igual é prova, mesmo com descrições diferentes', () => {
    const a = item({ descricao_produto: 'PARAFUSO SEXTAVADO', codigo_produto: 'ABC-1' });
    const b = item({ descricao_produto: 'PARAFUSO CABECA SEXTAVADA GALVANIZADO', codigo_produto: 'abc-1' });
    expect(similaridadeItens(a, b)).toBe(1);
  });

  it('código vazio dos dois lados não vira match', () => {
    const a = item({ descricao_produto: 'CADEADO 25MM', codigo_produto: '' });
    const b = item({ descricao_produto: 'TRINCO PEQUENO', codigo_produto: '' });
    expect(similaridadeItens(a, b)).toBeLessThan(LIMIAR_SIMILARIDADE_PADRAO);
  });
});

// ---------------------------------------------------------------------
// Custo
// ---------------------------------------------------------------------

describe('brutoDoItem', () => {
  it('prefere o total informado pelo fornecedor', () => {
    expect(brutoDoItem(item({ descricao_produto: 'X', quantidade: 3, preco_unitario: 10, preco_total_item: 29.9 }))).toBe(29.9);
  });

  it('cai para preço × quantidade', () => {
    expect(brutoDoItem(item({ descricao_produto: 'X', quantidade: 3, preco_unitario: 10, preco_total_item: null }))).toBe(30);
  });

  it('é nulo sem preço', () => {
    expect(brutoDoItem(item({ descricao_produto: 'X', preco_unitario: null, preco_total_item: null }))).toBeNull();
  });
});

describe('calcularCustoItem', () => {
  const base = item({
    descricao_produto: 'X', quantidade: 10, preco_unitario: 100, preco_total_item: 1000,
    aliquota_ipi_pct: 5, aliquota_icms_pct: 18, aliquota_pis_pct: 1.65, aliquota_cofins_pct: 7.6,
  });

  it('soma o IPI e não credita nada no regime padrão de uso e consumo', () => {
    const c = calcularCustoItem(base, OPCOES_CUSTO_PADRAO);
    expect(c.ipi).toBe(50);
    expect(c.creditos).toBe(0);
    expect(c.liquido).toBe(1050);
  });

  it('desconta o ICMS quando a empresa credita', () => {
    const c = calcularCustoItem(base, { ...OPCOES_CUSTO_PADRAO, creditaIcms: true });
    expect(c.creditoIcms).toBe(180);
    expect(c.liquido).toBe(1050 - 180);
  });

  it('desconta PIS e COFINS juntos', () => {
    const c = calcularCustoItem(base, { ...OPCOES_CUSTO_PADRAO, creditaPisCofins: true });
    expect(c.creditoPisCofins).toBeCloseTo(92.5, 6);
  });

  it('ignora o IPI quando o preço cotado já o inclui', () => {
    const c = calcularCustoItem(base, { ...OPCOES_CUSTO_PADRAO, ipiSomado: false });
    expect(c.ipi).toBe(0);
    expect(c.liquido).toBe(1000);
  });

  it('só soma o frete rateado quando a opção está ligada', () => {
    const ligado = calcularCustoItem(base, OPCOES_CUSTO_PADRAO, 40);
    expect(ligado.comparavel).toBe(1090);
    expect(ligado.unitarioComparavel).toBe(109);

    const desligado = calcularCustoItem(base, { ...OPCOES_CUSTO_PADRAO, ratearFrete: false }, 40);
    expect(desligado.comparavel).toBe(1050);
  });

  it('marca como incompleto o item sem preço, sem quebrar as somas', () => {
    const c = calcularCustoItem(item({ descricao_produto: 'X', preco_unitario: null, preco_total_item: null }), OPCOES_CUSTO_PADRAO);
    expect(c.incompleto).toBe(true);
    expect(c.liquido).toBeNull();
    expect(c.comparavel).toBeNull();
  });
});

describe('opcoesDaBase', () => {
  const nenhum = { icms: false, pisCofins: false, ipi: false };

  it('preço cotado não soma nem desconta nada', () => {
    expect(opcoesDaBase('cotado', { icms: true, pisCofins: true, ipi: true }))
      .toEqual({ ipiSomado: false, creditaIcms: false, creditaPisCofins: false, creditaIpi: false, ratearFrete: false });
  });

  it('desembolso soma IPI e frete, mas ignora crédito mesmo se marcado', () => {
    const o = opcoesDaBase('desembolso', { icms: true, pisCofins: true, ipi: true });
    expect(o.ipiSomado).toBe(true);
    expect(o.ratearFrete).toBe(true);
    expect(o.creditaIcms).toBe(false);
  });

  it('custo líquido honra só os créditos habilitados', () => {
    expect(opcoesDaBase('liquido', { ...nenhum, icms: true }).creditaIcms).toBe(true);
    expect(opcoesDaBase('liquido', { ...nenhum, icms: true }).creditaPisCofins).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Matriz
// ---------------------------------------------------------------------

describe('agruparLinhasMapa', () => {
  const opcoes = OPCOES_CUSTO_PADRAO;

  it('põe o mesmo material de três fornecedores na mesma linha', () => {
    const linhas = agruparLinhasMapa({
      escopo: [],
      opcoes,
      propostas: [
        proposta('A', [item({ descricao_produto: 'FITA ISOLANTE 19MM X 10M', preco_unitario: 25.9 })]),
        proposta('B', [item({ descricao_produto: 'FITA ISOLANTE 19MM X 10M 3M', preco_unitario: 26 })]),
        proposta('C', [item({ descricao_produto: 'FITA ISOLANTE PRETA 19MM X 10M', preco_unitario: 24 })]),
      ],
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].celulas).toHaveLength(3);
    expect(linhas[0].origem).toBe('similaridade');
  });

  it('mantém em linhas separadas materiais diferentes com a mesma medida', () => {
    const linhas = agruparLinhasMapa({
      escopo: [],
      opcoes,
      propostas: [
        proposta('A', [item({ descricao_produto: 'FITA ISOLANTE 19MM X 10M' })]),
        proposta('B', [item({ descricao_produto: 'FITA DUPLA FACE 19MM X 20M' })]),
      ],
    });
    expect(linhas).toHaveLength(2);
  });

  it('nunca coloca dois itens do mesmo fornecedor na mesma linha', () => {
    const linhas = agruparLinhasMapa({
      escopo: [],
      opcoes,
      propostas: [
        proposta('A', [
          item({ descricao_produto: 'FITA ISOLANTE 19MM X 10M' }),
          item({ descricao_produto: 'FITA ISOLANTE 19MM X 10M PRETA' }),
        ]),
      ],
    });
    expect(linhas).toHaveLength(2);
  });

  it('o vínculo com a RM ganha da similaridade', () => {
    // As descrições são parecidíssimas, mas o comprador vinculou cada uma a
    // um item de RM diferente — a matriz tem que respeitar isso.
    const escopo = [escopoItem('e1', 'FITA ISOLANTE 19MM'), escopoItem('e2', 'FITA ISOLANTE 19MM ROLO')];
    const linhas = agruparLinhasMapa({
      escopo,
      opcoes,
      propostas: [
        proposta('A', [
          item({ descricao_produto: 'FITA ISOLANTE 19MM', processo_item_id: 'e1' }),
          item({ descricao_produto: 'FITA ISOLANTE 19MM', processo_item_id: 'e2' }),
        ]),
      ],
    });
    expect(linhas.map(l => l.key)).toEqual(['esc:e1', 'esc:e2']);
    expect(linhas.every(l => l.celulas.length === 1)).toBe(true);
  });

  it('mostra o item de RM que ninguém cotou', () => {
    const linhas = agruparLinhasMapa({
      escopo: [escopoItem('e1', 'CADEADO 25MM'), escopoItem('e2', 'LUVA DE VAQUETA')],
      opcoes,
      propostas: [proposta('A', [item({ descricao_produto: 'CADEADO 25MM', processo_item_id: 'e1' })])],
    });
    const semOferta = linhas.find(l => l.key === 'esc:e2');
    expect(semOferta?.celulas).toHaveLength(0);
  });

  it('marca a melhor oferta e o quanto as outras estão acima', () => {
    const linhas = agruparLinhasMapa({
      escopo: [],
      opcoes,
      propostas: [
        proposta('A', [item({ descricao_produto: 'CADEADO SEGREDO 25MM', quantidade: 5, preco_unitario: 30 })]),
        proposta('B', [item({ descricao_produto: 'CADEADO SEGREDO 25MM', quantidade: 5, preco_unitario: 33 })]),
      ],
    });
    const [linha] = linhas;
    expect(linha.melhorCusto).toBe(150);
    expect(linha.piorCusto).toBe(165);
    expect(linha.dispersao).toBe(15);
    expect(linha.celulas.find(c => c.propostaKey === 'A')?.melhor).toBe(true);
    expect(linha.celulas.find(c => c.propostaKey === 'B')?.deltaPct).toBeCloseTo(10, 6);
  });

  it('acusa quantidade divergente entre fornecedores', () => {
    const linhas = agruparLinhasMapa({
      escopo: [],
      opcoes,
      propostas: [
        proposta('A', [item({ descricao_produto: 'CADEADO SEGREDO 25MM', quantidade: 5 })]),
        proposta('B', [item({ descricao_produto: 'CADEADO SEGREDO 25MM', quantidade: 10 })]),
      ],
    });
    expect(linhas[0].quantidadeDivergente).toBe(true);
  });

  it('respeita a correção manual do comprador', () => {
    const a = item({ _key: 'ia', descricao_produto: 'CADEADO SEGREDO 25MM' });
    const b = item({ _key: 'ib', descricao_produto: 'CADEADO COM SENHA STAM' });
    const solto = agruparLinhasMapa({
      escopo: [], opcoes,
      propostas: [proposta('A', [a]), proposta('B', [b])],
    });
    expect(solto).toHaveLength(2);

    const juntado = agruparLinhasMapa({
      escopo: [], opcoes,
      propostas: [proposta('A', [a]), proposta('B', [b])],
      overrides: { ib: 'sim:ia' },
    });
    expect(juntado).toHaveLength(1);
    expect(juntado[0].celulas).toHaveLength(2);
  });

  it('rateia o frete proporcional ao valor do item', () => {
    const linhas = agruparLinhasMapa({
      escopo: [], opcoes,
      propostas: [proposta('A', [
        item({ _key: 'caro', descricao_produto: 'BOMBA CENTRIFUGA', preco_unitario: 750, quantidade: 1 }),
        item({ _key: 'barato', descricao_produto: 'ANEL VEDACAO', preco_unitario: 250, quantidade: 1 }),
      ])],
      fretePorProposta: { A: 100 },
    });
    const caro = linhas.flatMap(l => l.celulas).find(c => c.item._key === 'caro');
    const barato = linhas.flatMap(l => l.celulas).find(c => c.item._key === 'barato');
    expect(caro?.custo.freteRateado).toBeCloseTo(75, 6);
    expect(barato?.custo.freteRateado).toBeCloseTo(25, 6);
  });

  it('ordena as linhas de RM antes das agrupadas por similaridade', () => {
    const linhas = agruparLinhasMapa({
      escopo: [escopoItem('e1', 'CADEADO 25MM')],
      opcoes,
      propostas: [proposta('A', [
        item({ descricao_produto: 'CADEADO 25MM', processo_item_id: 'e1' }),
        item({ descricao_produto: 'ITEM FORA DO ESCOPO' }),
      ])],
    });
    expect(linhas[0].origem).toBe('escopo');
    expect(linhas[1].origem).toBe('similaridade');
  });
});

// ---------------------------------------------------------------------
// Resumo e cenários
// ---------------------------------------------------------------------

describe('diasAteValidade', () => {
  it('conta os dias até a proposta vencer', () => {
    expect(diasAteValidade('2026-09-10', '2026-09-05')).toBe(5);
  });
  it('é negativo para proposta vencida', () => {
    expect(diasAteValidade('2026-09-01', '2026-09-05')).toBe(-4);
  });
  it('é nulo sem data', () => {
    expect(diasAteValidade(null, '2026-09-05')).toBeNull();
  });
});

describe('resumirFornecedores e cenários', () => {
  // Dois itens, dois fornecedores: A ganha o item 1, B ganha o item 2, mas
  // B tem frete alto — é a situação em que "menor preço item a item" e
  // "fornecedor único" divergem, que é exatamente o que o mapa precisa expor.
  const propostas = [
    proposta('A', [
      item({ _key: 'a1', descricao_produto: 'CADEADO SEGREDO 25MM', quantidade: 5, preco_unitario: 30 }),
      item({ _key: 'a2', descricao_produto: 'TRINCO PEQUENO PARA CADEADO', quantidade: 5, preco_unitario: 10 }),
    ], { prazo_entrega_dias: 7, validade_data: '2026-09-10' }),
    proposta('B', [
      item({ _key: 'b1', descricao_produto: 'CADEADO SEGREDO 25MM', quantidade: 5, preco_unitario: 31 }),
      item({ _key: 'b2', descricao_produto: 'TRINCO PEQUENO PARA CADEADO', quantidade: 5, preco_unitario: 9 }),
    ], { faturamento_minimo: 500 }),
  ];
  const fretePorProposta = { A: 40, B: 150 };
  const linhas = agruparLinhasMapa({
    escopo: [], propostas, opcoes: { ...OPCOES_CUSTO_PADRAO, ratearFrete: false }, fretePorProposta,
  });
  const resumos = resumirFornecedores({ linhas, propostas, fretePorProposta, hojeISO: '2026-09-05' });

  it('separou os dois materiais', () => {
    expect(linhas).toHaveLength(2);
  });

  it('resume cobertura, total e validade por fornecedor', () => {
    const a = resumos.find(r => r.propostaKey === 'A')!;
    expect(a.itensCotados).toBe(2);
    expect(a.cobertura).toBe(1);
    expect(a.totalLiquido).toBe(200);
    expect(a.totalComFrete).toBe(240);
    expect(a.melhorEm).toBe(1);
    expect(a.validadeDias).toBe(5);
    expect(a.atingeFaturamentoMinimo).toBeNull();
  });

  it('acusa faturamento mínimo não atingido', () => {
    const b = resumos.find(r => r.propostaKey === 'B')!;
    expect(b.totalBruto).toBe(200);
    expect(b.atingeFaturamentoMinimo).toBe(false);
  });

  it('o cenário de menor preço item a item cobra os dois fretes inteiros', () => {
    const c = cenarioMenorPreco(linhas, resumos);
    expect(c.parcelas).toHaveLength(2);
    // 150 (cadeado A) + 40 frete A + 45 (trinco B) + 150 frete B
    expect(c.total).toBe(385);
    expect(c.itensAtendidos).toBe(2);
    expect(c.alertas.some(a => a.includes('dividida'))).toBe(true);
  });

  it('o cenário de fornecedor único sai mais barato apesar de nenhum item ser o mais barato', () => {
    const c = cenarioFornecedorUnico(linhas, resumos)!;
    expect(c.parcelas).toHaveLength(1);
    expect(c.parcelas[0].propostaKey).toBe('A');
    expect(c.total).toBe(240);
    expect(c.total).toBeLessThan(cenarioMenorPreco(linhas, resumos).total);
  });

  it('o cenário da seleção do comprador soma só o que ele marcou', () => {
    const c = cenarioSelecao(linhas, resumos, new Set(['a1']));
    expect(c.parcelas).toHaveLength(1);
    expect(c.total).toBe(190); // 150 + frete 40
    expect(c.itensAtendidos).toBe(1);
    expect(c.alertas.some(a => a.includes('sem fornecedor'))).toBe(true);
  });

  it('não inventa cenário de fornecedor único quando não há proposta', () => {
    expect(cenarioFornecedorUnico([], [])).toBeNull();
  });
});

describe('ordenarLinhas', () => {
  const linhas = agruparLinhasMapa({
    escopo: [escopoItem('e1', 'ZEBRA 10MM')],
    opcoes: OPCOES_CUSTO_PADRAO,
    propostas: [
      proposta('A', [
        item({ _key: 'z', descricao_produto: 'ZEBRA 10MM', processo_item_id: 'e1', quantidade: 1, preco_unitario: 100 }),
        item({ _key: 'a', descricao_produto: 'ABACAXI AVULSO', quantidade: 1, preco_unitario: 10 }),
      ]),
      proposta('B', [
        item({ _key: 'a2', descricao_produto: 'ABACAXI AVULSO', quantidade: 1, preco_unitario: 12 }),
      ]),
    ],
  });

  it('ordena por título por padrão (alfabética)', () => {
    const ord = ordenarLinhas(linhas, 'alfabetica');
    expect(ord.map(l => l.titulo)).toEqual(['ABACAXI AVULSO', 'ZEBRA 10MM']);
  });

  it('ordena pela quantidade de ofertas quando pedido "disputa"', () => {
    const ord = ordenarLinhas(linhas, 'disputa');
    expect(ord[0].titulo).toBe('ABACAXI AVULSO'); // 2 ofertas contra 1 do item de RM
  });

  it('ordena por RI, deixando itens sem RM por último', () => {
    const ord = ordenarLinhas(linhas, 'ri');
    expect(ord[0].ri).toBe('RI-e1');
    expect(ord[1].ri).toBeNull();
  });

  it('não muda o agrupamento, só a ordem de exibição', () => {
    const ord = ordenarLinhas(linhas, 'alfabetica');
    expect(ord).toHaveLength(linhas.length);
    expect(new Set(ord.map(l => l.key))).toEqual(new Set(linhas.map(l => l.key)));
  });
});
