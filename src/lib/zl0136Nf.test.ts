import { describe, expect, it } from 'vitest';
import {
  ZL0136_COLUMNS,
  mapZl0136Row,
  parseZl0136Number,
} from './zl0136Nf';

describe('ZL0136_COLUMNS', () => {
  it('representa as 79 colunas e preserva os dois campos Moeda do documento', () => {
    expect(ZL0136_COLUMNS).toHaveLength(79);
    expect(ZL0136_COLUMNS.filter(column => column.header === 'Moeda do documento')).toHaveLength(2);
    expect(ZL0136_COLUMNS.find(column => column.header === 'Número de documento de nove posições')?.field)
      .toBe('numero_documento_nove_posicoes');
    expect(ZL0136_COLUMNS.find(column => column.header === 'Pedido')?.field).toBe('pedido');
  });
});

describe('parseZl0136Number', () => {
  it('converte números SAP em formato brasileiro e valores negativos', () => {
    expect(parseZl0136Number(' 1,00000')).toBe(1);
    expect(parseZl0136Number('1.234,56')).toBe(1234.56);
    expect(parseZl0136Number('1234-')).toBe(-1234);
  });
});

describe('mapZl0136Row', () => {
  it('mapeia datas, números, texto e headers duplicados pela posição', () => {
    const headers = ZL0136_COLUMNS.map(column => column.header);
    const mappedFields = ZL0136_COLUMNS.map(column => column.field);
    const row: any[] = Array.from({ length: ZL0136_COLUMNS.length }, () => '');

    row[5] = '007000528';
    row[8] = 46052;
    row[9] = 46049;
    row[17] = 'BRL';
    row[18] = ' 1,00000';
    row[29] = 5695;
    row[34] = '5105720973';
    row[36] = 'BRL';
    row[37] = '1.234,56';
    row[75] = '4700330967';
    row[76] = '00010';

    const { record, camposExtras } = mapZl0136Row(headers, mappedFields, row);

    expect(record.numero_documento_nove_posicoes).toBe('007000528');
    expect(record.data_lancamento).toBe('2026-01-30');
    expect(record.data_documento).toBe('2026-01-27');
    expect(record.moeda_documento_faturamento).toBe('BRL');
    expect(record.moeda_documento).toBe('BRL');
    expect(record.cambio_contabilidade).toBe(1);
    expect(record.quantidade).toBe(5695);
    expect(record.base_icms).toBe(1234.56);
    expect(record.documento_compras).toBe('5105720973');
    expect(record.pedido).toBe('4700330967');
    expect(record.item_pedido).toBe('00010');
    expect(camposExtras).toEqual({});
  });
});
