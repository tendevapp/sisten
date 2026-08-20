import { describe, expect, it } from 'vitest';
import { excelSerialToISO, mapZl0170Row, parseZl0170Number, ZL0170_COLUMNS } from './zl0170Miro';

describe('excelSerialToISO', () => {
  it('converte serial do Excel para ISO', () => {
    expect(excelSerialToISO(45658)).toBe('2025-01-01');
  });

  it('aceita data pt-BR com barra', () => {
    expect(excelSerialToISO('17/08/2026')).toBe('2026-08-17');
  });

  it('retorna null para vazio', () => {
    expect(excelSerialToISO('')).toBeNull();
    expect(excelSerialToISO(undefined)).toBeNull();
    expect(excelSerialToISO(null)).toBeNull();
  });

  it('retorna null para string não reconhecida como data', () => {
    expect(excelSerialToISO('not a date')).toBeNull();
  });
});

describe('parseZl0170Number', () => {
  it('converte string com milhar e decimal brasileiro', () => {
    expect(parseZl0170Number('63.510,13')).toBe(63510.13);
  });

  it('converte quantidade com casas decimais', () => {
    expect(parseZl0170Number('23,000')).toBe(23);
  });

  it('retorna null para vazio', () => {
    expect(parseZl0170Number('')).toBeNull();
    expect(parseZl0170Number(undefined)).toBeNull();
  });

  it('converte valor negativo com sinal ao final (formato SAP)', () => {
    expect(parseZl0170Number('1.234,56-')).toBe(-1234.56);
  });
});

describe('mapZl0170Row', () => {
  it('mapeia colunas conhecidas, inclusive cabeçalhos repetidos (Moeda, UMP, Ano), por posição', () => {
    const headers = ['Nº Pedido', 'Itm', 'UMP', 'Preço líq.', 'Moeda', 'Valor líquido', 'Moeda', 'Ano', 'Ano', 'UMP'];
    const mappedFields = [
      'numero_pedido', 'item', 'unidade_pedido', 'preco_liquido', 'moeda_preco',
      'valor_liquido', 'moeda_valor_liquido', 'ano_migo', 'ano_miro', 'unidade_miro',
    ];
    const row = ['4100439328', '10', 'UN', '2.761,31', 'BRL', '63.510,13', 'BRL', '2026', '2026', 'UN'];

    const { record, camposExtras } = mapZl0170Row(headers, mappedFields, row);

    expect(record.numero_pedido).toBe('4100439328');
    expect(record.item).toBe('10');
    expect(record.preco_liquido).toBe(2761.31);
    expect(record.moeda_preco).toBe('BRL');
    expect(record.valor_liquido).toBe(63510.13);
    expect(record.moeda_valor_liquido).toBe('BRL');
    expect(record.ano_migo).toBe('2026');
    expect(record.ano_miro).toBe('2026');
    expect(record.unidade_miro).toBe('UN');
    expect(camposExtras).toEqual({});
  });

  it('joga coluna desconhecida em camposExtras e trata célula vazia como null', () => {
    const headers = ['Nº Pedido', 'Coluna Desconhecida', 'Nome 2'];
    const mappedFields = ['numero_pedido', null, 'nome_2'];
    const row = ['4100439328', 'valor qualquer', ''];

    const { record, camposExtras } = mapZl0170Row(headers, mappedFields, row);

    expect(record.nome_2).toBeNull();
    expect(camposExtras).toEqual({ 'Coluna Desconhecida': 'valor qualquer' });
  });

  it('ZL0170_COLUMNS mapeia número do pedido e item, com 45 colunas no total', () => {
    expect(ZL0170_COLUMNS.find(c => c.field === 'numero_pedido')?.header).toBe('Nº Pedido');
    expect(ZL0170_COLUMNS.find(c => c.field === 'item')?.header).toBe('Itm');
    expect(ZL0170_COLUMNS.find(c => c.field === 'doc_miro')?.header).toBe('Doc. MIRO');
    expect(ZL0170_COLUMNS).toHaveLength(45);
  });
});
