import { describe, expect, it } from 'vitest';
import { lerPrecoRitec, parseCatalogoRitec } from './catalogoRitec';

describe('catálogo RITEC', () => {
  it('converte o preço CIF e ignora linhas vazias', () => {
    const itens = parseCatalogoRitec([
      ['CÓDIGO AG ', 'Nível 2 SAP', 'DESCRIÇÃO SAP', 'NOVO  MIX CIF OBRA'],
      ['1043847', 'MANUAIS', 'TALHA MANUAL', 'R$ 1,149.50'],
      [null, null, null, null],
    ]);
    expect(itens).toEqual([expect.objectContaining({ codigo_sap: '1043847', preco_cif_obra: 1149.5 })]);
    expect(lerPrecoRitec('R$ 118.08')).toBe(118.08);
    expect(lerPrecoRitec('R$ 1.149,50')).toBe(1149.5);
    expect(lerPrecoRitec('-')).toBeNull();
  });

  it('mantém uma única cópia de repetição idêntica e recusa divergência', () => {
    expect(parseCatalogoRitec([
      ['CÓDIGO AG', 'DESCRIÇÃO SAP'], ['1', 'A'], ['1', 'A'],
    ])).toHaveLength(1);
    expect(() => parseCatalogoRitec([
      ['CÓDIGO AG', 'DESCRIÇÃO SAP'], ['1', 'A'], ['1', 'B'],
    ])).toThrow('duplicado');
  });
});
