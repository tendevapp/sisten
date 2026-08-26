import { describe, it, expect } from 'vitest';
import {
  temValor, normalizarCnpj, formatarCnpj, parseMoeda, parsePercentual,
  parseDataBR, parseValidade, parsePrazoDias, parseCidadeUF, parseFreteModalidade,
  normalizarDescricao, normalizarProposta, validarProposta, conferirTotais,
  podeSalvar, deveAutoSelecionar, aplicarSugestoes, coberturaEscopo,
  repararJsonTruncado,
} from './cotacoes';
import type {
  CotacaoPropostaDraft, CotacaoPropostaItemDraft, CotacaoProcessoItem,
  PropostaExtraida, SugestaoVinculo,
} from '../types';

describe('temValor', () => {
  it('trata placeholders como vazio', () => {
    expect(temValor(null)).toBe(false);
    expect(temValor(undefined)).toBe(false);
    expect(temValor('')).toBe(false);
    expect(temValor('  ')).toBe(false);
    expect(temValor('N/A')).toBe(false);
    expect(temValor('n/a')).toBe(false);
    expect(temValor('-')).toBe(false);
    expect(temValor('não informado')).toBe(false);
  });

  it('aceita valores reais, incluindo "0"', () => {
    expect(temValor('0')).toBe(true);
    expect(temValor('Fornecedor X')).toBe(true);
  });
});

describe('normalizarCnpj', () => {
  it('extrai os 14 dígitos de um CNPJ formatado', () => {
    expect(normalizarCnpj('12.345.678/0001-90')).toBe('12345678000190');
  });

  it('aceita já só-dígitos', () => {
    expect(normalizarCnpj('12345678000190')).toBe('12345678000190');
  });

  it('rejeita 13 dígitos (lixo parcial, não string truncada)', () => {
    expect(normalizarCnpj('1234567800019')).toBeNull();
  });

  it('rejeita CPF (11 dígitos)', () => {
    expect(normalizarCnpj('123.456.789-01')).toBeNull();
  });

  it('null/placeholder -> null', () => {
    expect(normalizarCnpj(null)).toBeNull();
    expect(normalizarCnpj('N/A')).toBeNull();
  });
});

describe('formatarCnpj', () => {
  it('formata 14 dígitos', () => {
    expect(formatarCnpj('12345678000190')).toBe('12.345.678/0001-90');
  });

  it('devolve vazio para entrada inválida', () => {
    expect(formatarCnpj(null)).toBe('');
    expect(formatarCnpj('123')).toBe('123');
  });
});

describe('parseMoeda', () => {
  it('formato BR com decimal', () => {
    expect(parseMoeda('R$ 1.234,56')).toBeCloseTo(1234.56);
  });

  it('formato já com ponto decimal (o que o prompt pede)', () => {
    expect(parseMoeda('1234.56')).toBeCloseTo(1234.56);
  });

  it('milhar sem decimal -> heurística de mb51.ts', () => {
    expect(parseMoeda('1.234')).toBe(1234);
  });

  it('"0" é preço legítimo, não null', () => {
    expect(parseMoeda('0')).toBe(0);
  });

  it('placeholders e vazio -> null', () => {
    expect(parseMoeda('')).toBeNull();
    expect(parseMoeda(null)).toBeNull();
    expect(parseMoeda('N/A')).toBeNull();
  });

  it('vírgula como decimal simples', () => {
    expect(parseMoeda('1,5')).toBeCloseTo(1.5);
  });

  it('sinal negativo antes ou depois', () => {
    expect(parseMoeda('-10,50')).toBeCloseTo(-10.5);
    expect(parseMoeda('10,50-')).toBeCloseTo(-10.5);
  });
});

describe('parsePercentual', () => {
  it('número puro em pontos percentuais', () => {
    expect(parsePercentual('18')).toBe(18);
  });

  it('com sinal de %', () => {
    expect(parsePercentual('18%')).toBe(18);
  });

  it('formato BR com decimal', () => {
    expect(parsePercentual('18,00')).toBe(18);
  });

  it('fração ambígua "0,18" vira 0.18 (a ambiguidade é tratada na validação, não aqui)', () => {
    expect(parsePercentual('0,18')).toBeCloseTo(0.18);
  });

  it('vazio -> null', () => {
    expect(parsePercentual(null)).toBeNull();
  });
});

describe('parseDataBR', () => {
  it('ISO passa direto', () => {
    expect(parseDataBR('2026-08-16')).toBe('2026-08-16');
  });

  it('BR com barra', () => {
    expect(parseDataBR('16/08/2026')).toBe('2026-08-16');
  });

  it('BR com ponto', () => {
    expect(parseDataBR('16.08.2026')).toBe('2026-08-16');
  });

  it('data por extenso não é reconhecida', () => {
    expect(parseDataBR('16 de agosto de 2026')).toBeNull();
  });

  it('prazo em texto não é data', () => {
    expect(parseDataBR('30 dias')).toBeNull();
  });
});

describe('parseValidade', () => {
  it('ramo de data', () => {
    expect(parseValidade('30/09/2026')).toEqual({ data: '2026-09-30', texto: null });
  });

  it('ramo de texto', () => {
    expect(parseValidade('30 dias')).toEqual({ data: null, texto: '30 dias' });
  });

  it('vazio', () => {
    expect(parseValidade(null)).toEqual({ data: null, texto: null });
  });
});

describe('parsePrazoDias', () => {
  it('extrai o número de um texto', () => {
    expect(parsePrazoDias('15 dias úteis')).toBe(15);
  });

  it('sem número -> null', () => {
    expect(parsePrazoDias('imediato')).toBeNull();
  });
});

describe('parseCidadeUF', () => {
  it('separado por barra', () => {
    expect(parseCidadeUF('São Paulo/SP')).toEqual({ cidade: 'São Paulo', uf: 'SP' });
  });

  it('separado por traço', () => {
    expect(parseCidadeUF('SAO PAULO - SP')).toEqual({ cidade: 'SAO PAULO', uf: 'SP' });
  });

  it('sem UF reconhecível', () => {
    expect(parseCidadeUF('Sao Paulo')).toEqual({ cidade: 'Sao Paulo', uf: null });
  });
});

describe('parseFreteModalidade', () => {
  it('CIF e FOB', () => {
    expect(parseFreteModalidade('CIF')).toBe('CIF');
    expect(parseFreteModalidade('fob')).toBe('FOB');
  });

  it('outro valor cai em OUTRO', () => {
    expect(parseFreteModalidade('a combinar')).toBe('OUTRO');
  });

  it('vazio -> null', () => {
    expect(parseFreteModalidade(null)).toBeNull();
  });
});

describe('normalizarDescricao', () => {
  it('remove acentos, maiuscula e colapsa espaços', () => {
    expect(normalizarDescricao('Parafuso  Sextavado M8')).toBe('PARAFUSO SEXTAVADO M8');
    expect(normalizarDescricao('Válvula de Retenção')).toBe('VALVULA DE RETENCAO');
  });
});

function propostaExtraidaBase(): PropostaExtraida {
  return {
    Arquivo_Origem: 'proposta.pdf', Numero_Proposta: '123', Data_Emissao: '16/08/2026',
    Validade_Proposta: '30 dias', Fornecedor_Razao_Social: 'Fornecedor X LTDA',
    Fornecedor_CNPJ: '12.345.678/0001-90', Fornecedor_Inscricao_Estadual: null,
    Fornecedor_Cidade_UF: 'São Paulo/SP', Fornecedor_Telefone: null,
    Vendedor_Nome: null, Vendedor_Email: null, Vendedor_Telefone: null,
    Cliente_Razao_Social: null, Cliente_CNPJ: null, Cliente_Inscricao_Estadual: null,
    Cliente_Cidade_UF: null, Condicao_Pagamento: '30/60/90', Forma_Pagamento: 'Boleto',
    Prazo_Entrega: '15 dias úteis', Frete_Modalidade: 'CIF', Transportadora_Indicada: null,
    Faturamento_Minimo: null, Dados_Bancarios_PIX: null, Valor_Total_Orcamento: '1000.00',
    Observacoes_Gerais: null,
    itens: [{
      Item_Numero: '1', Codigo_Produto: 'ABC', Descricao_Produto: 'Parafuso M8',
      Marca_Fabricante: null, Unidade_Medida: 'UN', NCM: null, CST: null, CFOP: null,
      Quantidade: '10', Preco_Unitario: '100.00', Preco_Total_Item: '1000.00',
      Aliquota_ICMS_Pct: '18', Aliquota_PIS_Pct: null, Aliquota_COFINS_Pct: null, Aliquota_IPI_pct: null,
    }],
  };
}

describe('normalizarProposta', () => {
  it('converte o contrato da IA no rascunho editável', () => {
    const draft = normalizarProposta(propostaExtraidaBase());
    expect(draft.fornecedor_cnpj).toBe('12345678000190');
    expect(draft.data_emissao).toBe('2026-08-16');
    expect(draft.validade_texto).toBe('30 dias');
    expect(draft.fornecedor_cidade).toBe('São Paulo');
    expect(draft.fornecedor_uf).toBe('SP');
    expect(draft.frete_modalidade).toBe('CIF');
    expect(draft.prazo_entrega_dias).toBe(15);
    expect(draft.valor_total_orcamento).toBe(1000);
    expect(draft.itens).toHaveLength(1);
    expect(draft.itens[0].quantidade).toBe(10);
    expect(draft.itens[0].preco_unitario).toBe(100);
    expect(draft.itens[0].aliquota_icms_pct).toBe(18);
  });
});

function itemDraft(overrides: Partial<CotacaoPropostaItemDraft> = {}): CotacaoPropostaItemDraft {
  return {
    _key: 'k1', processo_item_id: 'pi-1', fora_escopo: false, vinculo_origem: 'manual', vinculo_score: null,
    ri: 'ri-1', material_code: 'mat-1',
    item_numero: 1, codigo_produto: 'ABC', descricao_produto: 'Parafuso M8', marca_fabricante: null,
    unidade_medida: 'UN', ncm: null, cst: null, cfop: null,
    quantidade: 10, preco_unitario: 100, preco_total_item: 1000,
    aliquota_icms_pct: 18, aliquota_pis_pct: null, aliquota_cofins_pct: null, aliquota_ipi_pct: null,
    extraido_raw: {} as any,
    ...overrides,
  };
}

function propostaDraft(overrides: Partial<CotacaoPropostaDraft> = {}): CotacaoPropostaDraft {
  return {
    _key: 'p1', _salvo: false, _extraido_em: '2026-08-16T12:00:00.000Z',
    arquivo_origem: null, numero_proposta: '123', data_emissao: '2026-08-16',
    validade_data: null, validade_texto: '30 dias',
    fornecedor_razao_social: 'Fornecedor X', fornecedor_cnpj: '12345678000190',
    fornecedor_inscricao_estadual: null, fornecedor_cidade: null, fornecedor_uf: null, fornecedor_telefone: null,
    cod_vendor: null, contato_id: null, fornecedor_match: 'nao_encontrado',
    vendedor_nome: null, vendedor_email: 'vendedor@x.com', vendedor_telefone: null,
    cliente_razao_social: null, cliente_cnpj: null, cliente_inscricao_estadual: null, cliente_cidade: null, cliente_uf: null,
    condicao_pagamento: '30/60/90', forma_pagamento: null, prazo_entrega_texto: '15 dias', prazo_entrega_dias: 15,
    frete_modalidade: 'CIF', transportadora_indicada: null, faturamento_minimo: null, dados_bancarios_pix: null,
    valor_total_orcamento: 1000, observacoes_gerais: null,
    campos_faltantes: [], revisado: false, extracao_id: null, extraido_raw: {} as any,
    itens: [itemDraft()],
    ...overrides,
  };
}

describe('validarProposta', () => {
  it('passa com razão social mas sem CNPJ', () => {
    const v = validarProposta(propostaDraft({ fornecedor_cnpj: null }));
    expect(v.bloqueios.some(b => b.campo === 'fornecedor_identificacao')).toBe(false);
  });

  it('bloqueia sem razão social e sem CNPJ', () => {
    const v = validarProposta(propostaDraft({ fornecedor_razao_social: null, fornecedor_cnpj: null }));
    expect(v.bloqueios.some(b => b.campo === 'fornecedor_identificacao')).toBe(true);
    expect(podeSalvar(v)).toBe(false);
  });

  it('bloqueia item sem preço unitário', () => {
    const v = validarProposta(propostaDraft({ itens: [itemDraft({ preco_unitario: null })] }));
    expect(v.bloqueios.some(b => b.campo === 'preco_unitario')).toBe(true);
  });

  it('item fora do escopo sem vínculo não bloqueia', () => {
    const v = validarProposta(propostaDraft({ itens: [itemDraft({ processo_item_id: null, fora_escopo: true })] }));
    expect(v.bloqueios.some(b => b.campo === 'vinculo')).toBe(false);
    expect(podeSalvar(v)).toBe(true);
  });

  it('item sem vínculo e não marcado fora do escopo bloqueia', () => {
    const v = validarProposta(propostaDraft({ itens: [itemDraft({ processo_item_id: null, fora_escopo: false })] }));
    expect(v.bloqueios.some(b => b.campo === 'vinculo')).toBe(true);
  });

  it('alíquota suspeita (<1) gera aviso, não bloqueio', () => {
    const v = validarProposta(propostaDraft({ itens: [itemDraft({ aliquota_icms_pct: 0.18 })] }));
    expect(v.avisos.some(a => a.campo === 'aliquota_suspeita')).toBe(true);
    expect(podeSalvar(v)).toBe(true);
  });

  it('proposta completa não gera avisos de cabeçalho', () => {
    const v = validarProposta(propostaDraft());
    expect(v.avisos.filter(a => ['numero_proposta', 'data_emissao', 'validade', 'condicao_pagamento', 'prazo_entrega', 'frete_modalidade', 'vendedor_email'].includes(a.campo))).toHaveLength(0);
  });
});

describe('conferirTotais', () => {
  it('soma exata -> 0%', () => {
    const r = conferirTotais(propostaDraft());
    expect(r?.divergenciaPct).toBeCloseTo(0);
  });

  it('item faltando -> divergência grande', () => {
    const r = conferirTotais(propostaDraft({
      valor_total_orcamento: 2000,
      itens: [itemDraft({ preco_total_item: 1000 })],
    }));
    expect(r?.divergenciaPct).toBeCloseTo(50);
  });

  it('sem valor_total_orcamento -> informado null, sem chamar erro', () => {
    const r = conferirTotais(propostaDraft({ valor_total_orcamento: null }));
    expect(r?.informado).toBeNull();
    expect(r?.divergenciaPct).toBeNull();
  });
});

describe('deveAutoSelecionar', () => {
  const sug = (score: number, origem: 'aprendido' | 'trigrama' = 'trigrama'): SugestaoVinculo => ({
    idx: 0, processo_item_id: 'pi', ri: 'ri', texto_breve: null, material_code: null, score, origem,
  });

  it('candidato único e forte -> true', () => {
    expect(deveAutoSelecionar(sug(0.92), sug(0.30))).toBe(true);
  });

  it('candidatos próximos (ambíguo) -> false', () => {
    expect(deveAutoSelecionar(sug(0.50), sug(0.44))).toBe(false);
  });

  it('candidato fraco sem segundo -> false', () => {
    expect(deveAutoSelecionar(sug(0.40), undefined)).toBe(false);
  });

  it('vínculo aprendido com score alto -> true mesmo com segundo próximo', () => {
    expect(deveAutoSelecionar(sug(0.95, 'aprendido'), sug(0.93))).toBe(true);
  });

  it('sem candidato -> false', () => {
    expect(deveAutoSelecionar(undefined, undefined)).toBe(false);
  });
});

describe('aplicarSugestoes', () => {
  it('aplica quando a auto-seleção é válida', () => {
    const itens = [itemDraft({ processo_item_id: null, ri: null, material_code: null })];
    const sugestoes = new Map([[0, [
      { idx: 0, processo_item_id: 'pi-9', ri: 'ri-9', texto_breve: 'x', material_code: 'mat-9', score: 0.9, origem: 'trigrama' as const },
      { idx: 0, processo_item_id: 'pi-1', ri: 'ri-1', texto_breve: 'y', material_code: 'mat-1', score: 0.2, origem: 'trigrama' as const },
    ]]]);
    const resultado = aplicarSugestoes(itens, sugestoes);
    expect(resultado[0].processo_item_id).toBe('pi-9');
    expect(resultado[0].vinculo_origem).toBe('sugerido');
  });

  it('não aplica quando ambíguo', () => {
    const itens = [itemDraft({ processo_item_id: null })];
    const sugestoes = new Map([[0, [
      { idx: 0, processo_item_id: 'pi-9', ri: 'ri-9', texto_breve: null, material_code: null, score: 0.5, origem: 'trigrama' as const },
      { idx: 0, processo_item_id: 'pi-8', ri: 'ri-8', texto_breve: null, material_code: null, score: 0.46, origem: 'trigrama' as const },
    ]]]);
    const resultado = aplicarSugestoes(itens, sugestoes);
    expect(resultado[0].processo_item_id).toBeNull();
  });
});

describe('coberturaEscopo', () => {
  function processoItem(overrides: Partial<CotacaoProcessoItem> = {}): CotacaoProcessoItem {
    return {
      id: 'pi-1', processo_id: 'proc-1', ri: 'ri-1', rm: null, item_reqc: null,
      material_code: null, texto_breve: null, qtd_solicitada: null, unidade_medida: null,
      centro: null, deposito: null, created_at: '2026-01-01',
      ...overrides,
    };
  }

  it('separa cobertos de sem oferta', () => {
    const escopo = [processoItem({ id: 'pi-1', ri: 'ri-1' }), processoItem({ id: 'pi-2', ri: 'ri-2' })];
    const itens = [itemDraft({ processo_item_id: 'pi-1' })];
    const r = coberturaEscopo(escopo, itens);
    expect(r.cobertos).toEqual(['ri-1']);
    expect(r.semOferta.map(e => e.ri)).toEqual(['ri-2']);
  });
});

describe('repararJsonTruncado', () => {
  it('recupera proposta e itens completos cortados dentro do 2º nível', () => {
    const bruto = '{"propostas":[{"Numero_Proposta":"1","itens":[{"Descricao_Produto":"A"}]},{"Numero_Proposta":"2","itens":[{"Descricao_Produto":"B"},{"Descricao_Produto":"C"';
    const resultado = repararJsonTruncado(bruto) as { propostas: any[] };
    expect(resultado.propostas).toHaveLength(2);
    expect(resultado.propostas[1].itens).toHaveLength(1);
    expect(resultado.propostas[1].itens[0].Descricao_Produto).toBe('B');
  });

  it('uma chave dentro de uma descrição não confunde a contagem', () => {
    const bruto = '{"propostas":[{"itens":[{"Descricao_Produto":"Suporte tipo {L} para viga"}]';
    const resultado = repararJsonTruncado(bruto) as { propostas: any[] };
    expect(resultado.propostas[0].itens[0].Descricao_Produto).toBe('Suporte tipo {L} para viga');
  });

  it('corte antes de qualquer chave fechada -> lança', () => {
    expect(() => repararJsonTruncado('{"propostas":[{"Numero')).toThrow();
  });
});
