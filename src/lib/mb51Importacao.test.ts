import { describe, expect, it } from 'vitest';
import { periodoMb51, separarNovasMb51 } from './mb51';

describe('importação da MB51 só com o que é novo', () => {
  it('período vai da menor à maior data, ignorando linhas sem data', () => {
    expect(periodoMb51([{ data_lancamento: '2026-11-10' }, { data_lancamento: null }, { data_lancamento: '2026-08-03' }, { data_lancamento: '2026-11-17' }]))
      .toEqual({ de: '2026-08-03', ate: '2026-11-17' });
    expect(periodoMb51([{ data_lancamento: null }, {}])).toBeNull();
  });

  it('separa as linhas novas das já gravadas pela chave', () => {
    const linhas = [{ chave_unica: 'a|1' }, { chave_unica: 'b|1' }, { chave_unica: 'c|1' }];
    expect(separarNovasMb51(linhas, new Set(['a|1', 'c|1', 'z|1']))).toEqual({ novas: [{ chave_unica: 'b|1' }], jaGravadas: 2 });
    expect(separarNovasMb51(linhas, new Set()).novas).toHaveLength(3);
  });
});
