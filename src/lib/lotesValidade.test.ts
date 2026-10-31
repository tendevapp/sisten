import { describe, expect, it } from 'vitest';
import { formatarLotesValidade, normalizarLotesValidade } from './lotesValidade';

describe('lotes e validades opcionais', () => {
  it('descarta linhas vazias sem deslocar a validade de cada lote', () => {
    const entrada = [
      { lote: ' A ', validade: '2027-03-31' },
      { lote: ' ', validade: null },
      { lote: 'B', validade: '2028-08-15' },
      { lote: null, validade: '2029-01-01' },
      { lote: 'C', validade: null },
    ];
    expect(normalizarLotesValidade(entrada)).toEqual([
      { lote: 'A', validade: '2027-03-31' }, { lote: 'B', validade: '2028-08-15' },
      { lote: null, validade: '2029-01-01' }, { lote: 'C', validade: null },
    ]);
    expect(entrada[0].lote).toBe(' A ');
  });

  it('aceita registros antigos sem lista e pares com somente lote ou validade', () => {
    expect(normalizarLotesValidade()).toEqual([]);
    expect(formatarLotesValidade()).toBe('');
    expect(formatarLotesValidade([{ lote: 'C', validade: null }, { lote: null, validade: '2028-01-01' }]))
      .toBe('Lote: C · Validade: não informada\nLote: não informado · Validade: 01/01/2028');
  });
});
