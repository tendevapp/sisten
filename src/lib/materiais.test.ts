import { describe, expect, it } from 'vitest';
import { normalizarTermo } from './materiais';

describe('normalizarTermo', () => {
  it('quebra em tokens, em qualquer ordem, para casar descrição do SAP', () => {
    // O catálogo grava "PARAFUSO M12 SEXTAVADO"; a pessoa digita na ordem dela.
    expect(normalizarTermo('parafuso sextavado m12')).toEqual({
      tipo: 'texto',
      normalizado: 'PARAFUSO SEXTAVADO M12',
      tokens: ['PARAFUSO', 'SEXTAVADO', 'M12'],
    });
  });

  it('remove acento — o catálogo grava VALVULA, a pessoa digita válvula', () => {
    expect(normalizarTermo('válvula esfera').normalizado).toBe('VALVULA ESFERA');
  });

  it('colapsa espaço repetido e ignora borda', () => {
    expect(normalizarTermo('  luva   npt  ').tokens).toEqual(['LUVA', 'NPT']);
  });

  it('reconhece termo só de dígitos como código de material', () => {
    expect(normalizarTermo('10318').tipo).toBe('codigo');
  });

  it('preserva a fração, que é atributo real de tubulação', () => {
    expect(normalizarTermo('luva 1/2 npt').tokens).toEqual(['LUVA', '1/2', 'NPT']);
  });

  it('marca como curto o que não vale consultar', () => {
    // Um caractere casaria com meio catálogo; a UI não deve nem consultar.
    expect(normalizarTermo('l').tipo).toBe('curto');
    expect(normalizarTermo('   ').tipo).toBe('curto');
    expect(normalizarTermo('l').tokens).toEqual([]);
  });

  it('exige 4 dígitos para tratar como código', () => {
    // Abaixo disso o prefixo devolveria milhares de linhas sem utilidade.
    expect(normalizarTermo('103').tipo).toBe('curto');
    expect(normalizarTermo('1031').tipo).toBe('codigo');
  });
});
