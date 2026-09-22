import { describe, expect, it } from 'vitest';
import {
  ZF0076_COLUMNS,
  excelSerialToISO,
  mapZf0076Row,
  parseZf0076Number,
  parseZf0076Time,
} from './zf0076NfPo';

describe('ZF0076_COLUMNS', () => {
  it('preserva as 76 colunas do export SAP, inclusive cabeçalhos repetidos', () => {
    expect(ZF0076_COLUMNS).toHaveLength(76);
    expect(ZF0076_COLUMNS.filter(c => c.header === 'Item')).toHaveLength(2);
    expect(ZF0076_COLUMNS.filter(c => c.header === 'Moeda')).toHaveLength(5);
    expect(ZF0076_COLUMNS.filter(c => c.header === 'Referência')).toHaveLength(2);
  });
});

describe('parseZf0076Number', () => {
  it('converte valores SAP com decimal brasileiro, sinal final e célula numérica', () => {
    expect(parseZf0076Number('1.234,56-')).toBe(-1234.56);
    expect(parseZf0076Number('1,00000')).toBe(1);
    expect(parseZf0076Number(21539387.87)).toBe(21539387.87);
  });
});

describe('parseZf0076Time', () => {
  it('converte a fração de hora do Excel para HH:mm:ss', () => {
    expect(parseZf0076Time(0.46951388888889)).toBe('11:16:06');
  });
});

describe('mapZf0076Row', () => {
  it('mapeia ocorrências repetidas para campos distintos e normaliza data, hora e números', () => {
    const headers = ZF0076_COLUMNS.map(c => c.header);
    const mappedFields = ZF0076_COLUMNS.map(c => c.field);
    const row: any[] = Array.from({ length: 76 }, () => '');

    row[0] = '4100446757';
    row[1] = '40';
    row[2] = 46129;
    row[16] = 46122;
    row[17] = 0.46951388888889;
    row[22] = '5105784740';
    row[25] = 'BRL';
    row[26] = 46233;
    row[29] = '17546-1';
    row[30] = '17546-1';
    row[34] = -122;
    row[35] = 'UN';
    row[36] = -122;
    row[37] = 'UN';
    row[39] = '-20.814,57';
    row[40] = 'BRL';
    row[46] = 'BRL';
    row[47] = -642342.19;
    row[48] = 'BRL';
    row[49] = 0;
    row[50] = 'BRL';
    row[57] = '1000061364';
    row[58] = 'HEMPEL TINTAS DO BRASIL LTDA';
    row[59] = '1000057347';
    row[60] = 'OUTRO FORNECEDOR';
    row[73] = '100000000000044977';

    const { record, camposExtras } = mapZf0076Row(headers, mappedFields, row);

    expect(record.documento_compra).toBe('4100446757');
    expect(record.item_pedido).toBe('40');
    expect(record.data_aprovacao).toBe(excelSerialToISO(46129));
    expect(record.hora).toBe('11:16:06');
    expect(record.referencia_documento).toBe('17546-1');
    expect(record.referencia_nf).toBe('17546-1');
    expect(record.montante).toBe(-20814.57);
    expect(record.moeda_montante).toBe('BRL');
    expect(record.moeda_imposto).toBe('BRL');
    expect(record.fornecedor_alternativo).toBe('1000057347');
    expect(record.nome_fornecedor_alternativo).toBe('OUTRO FORNECEDOR');
    expect(record.material_nf).toBe('100000000000044977');
    expect(camposExtras).toEqual({});
  });
});
