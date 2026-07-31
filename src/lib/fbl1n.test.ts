import { describe, expect, it } from 'vitest';
import { excelSerialToISO, mapFbl1nRow, parseFbl1nNumber } from './fbl1n';

describe('excelSerialToISO', () => {
  it('converte serial do Excel para ISO', () => {
    expect(excelSerialToISO(45658)).toBe('2025-01-01');
  });

  it('aceita string de data já formatada, cortando hora', () => {
    expect(excelSerialToISO('2025-03-10T00:00:00')).toBe('2025-03-10');
  });

  it('retorna null para vazio', () => {
    expect(excelSerialToISO('')).toBeNull();
    expect(excelSerialToISO(undefined)).toBeNull();
    expect(excelSerialToISO(null)).toBeNull();
  });
});

describe('parseFbl1nNumber', () => {
  it('aceita número já numérico', () => {
    expect(parseFbl1nNumber(1234.5)).toBe(1234.5);
  });

  it('converte string com milhar e decimal brasileiro', () => {
    expect(parseFbl1nNumber('1.234,56')).toBe(1234.56);
  });

  it('converte string só com decimal', () => {
    expect(parseFbl1nNumber('1234,5')).toBe(1234.5);
  });

  it('retorna null para vazio', () => {
    expect(parseFbl1nNumber('')).toBeNull();
    expect(parseFbl1nNumber(undefined)).toBeNull();
  });
});

describe('mapFbl1nRow', () => {
  it('mapeia colunas conhecidas e joga o resto em camposExtras', () => {
    const headers = ['Nº documento', 'Empresa', 'Mont.moeda doc.', 'Data de lançamento', 'Coluna Desconhecida'];
    const mappedFields = ['numero_documento', 'empresa', 'montante_moeda_doc', 'data_lancamento', null];
    const row = ['1400001234', '0001', '1.500,00', 45658, 'valor qualquer'];

    const { record, camposExtras } = mapFbl1nRow(headers, mappedFields, row);

    expect(record.numero_documento).toBe('1400001234');
    expect(record.empresa).toBe('0001');
    expect(record.montante_moeda_doc).toBe(1500);
    expect(record.data_lancamento).toBe('2025-01-01');
    expect(camposExtras).toEqual({ 'Coluna Desconhecida': 'valor qualquer' });
  });

  it('trata célula vazia como null para campo texto', () => {
    const headers = ['Texto'];
    const mappedFields = ['texto'];
    const row = [''];

    const { record } = mapFbl1nRow(headers, mappedFields, row);

    expect(record.texto).toBeNull();
  });

  it('FBL1N_COLUMNS mapeia número de documento e empresa', async () => {
    const { FBL1N_COLUMNS } = await import('./fbl1n');
    expect(FBL1N_COLUMNS.find(c => c.field === 'numero_documento')?.header).toBe('Nº documento');
    expect(FBL1N_COLUMNS.find(c => c.field === 'empresa')?.header).toBe('Empresa');
    expect(FBL1N_COLUMNS).toHaveLength(45);
  });
});
