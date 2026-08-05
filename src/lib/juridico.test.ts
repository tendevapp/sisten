import { describe, it, expect } from 'vitest';
import { isJuridicoSector, findJuridicoSector, NOME_SETOR_JURIDICO } from './juridico';

describe('juridico sector helpers', () => {
  it('deve identificar o setor Jurídico pelo nome exato', () => {
    expect(isJuridicoSector({ name: 'Jurídico' })).toBe(true);
    expect(isJuridicoSector({ name: NOME_SETOR_JURIDICO })).toBe(true);
  });

  it('deve identificar variações sem acento ou em maiúsculas/minúsculas', () => {
    expect(isJuridicoSector({ name: 'Juridico' })).toBe(true);
    expect(isJuridicoSector({ name: 'JURÍDICO' })).toBe(true);
    expect(isJuridicoSector({ name: 'Setor Jurídico' })).toBe(true);
    expect(isJuridicoSector({ name: 'Departamento Juridico' })).toBe(true);
    expect(isJuridicoSector({ name: 'Contratos' })).toBe(true);
  });

  it('não deve identificar outros setores', () => {
    expect(isJuridicoSector({ name: 'Manutenção' })).toBe(false);
    expect(isJuridicoSector({ name: 'TI' })).toBe(false);
    expect(isJuridicoSector({ name: 'Facilities' })).toBe(false);
    expect(isJuridicoSector(null)).toBe(false);
  });

  it('deve encontrar o setor correto na lista', () => {
    const setores = [
      { id: '1', name: 'Manutenção' },
      { id: '2', name: 'Departamento Juridico' },
    ];
    expect(findJuridicoSector(setores)).toEqual({ id: '2', name: 'Departamento Juridico' });
  });
});
