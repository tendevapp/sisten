import { describe, it, expect } from 'vitest';
import {
  TAXA_DOLAR_REAL,
  converterUsdParaBrl,
  formatCustoBrl,
  formatUsdParaBrl,
  formatUsd,
  EMPTY,
} from './format';

describe('TAXA_DOLAR_REAL', () => {
  it('deve ter taxa fixa de 6 para conversao de dolar para real', () => {
    expect(TAXA_DOLAR_REAL).toBe(6);
  });
});

describe('converterUsdParaBrl', () => {
  it('converte valor multiplicando por 6', () => {
    expect(converterUsdParaBrl(1)).toBe(6);
    expect(converterUsdParaBrl(0.5)).toBe(3);
    expect(converterUsdParaBrl(0.001)).toBeCloseTo(0.006, 5);
    expect(converterUsdParaBrl(10)).toBe(60);
  });

  it('preserva zero', () => {
    expect(converterUsdParaBrl(0)).toBe(0);
  });

  it('retorna null para valores invalidos ou ausentes', () => {
    expect(converterUsdParaBrl(null)).toBeNull();
    expect(converterUsdParaBrl(undefined)).toBeNull();
    expect(converterUsdParaBrl(NaN)).toBeNull();
  });
});

describe('formatCustoBrl', () => {
  it('formata valor em Real com simbolo R$ e separador decimal pt-BR', () => {
    const formatted = formatCustoBrl(6);
    expect(formatted).toContain('R$');
    expect(formatted).toContain('6,00');
  });

  it('preserva ate 4 casas decimais para micro-custos de IA', () => {
    const formatted = formatCustoBrl(0.0018);
    expect(formatted).toContain('R$');
    expect(formatted).toContain('0,0018');
  });

  it('retorna traco (EMPTY) para valores invalidos', () => {
    expect(formatCustoBrl(null)).toBe(EMPTY);
    expect(formatCustoBrl(undefined)).toBe(EMPTY);
  });
});

describe('formatUsdParaBrl', () => {
  it('converte USD por 6 e formata em Real diretamente', () => {
    const formatted = formatUsdParaBrl(0.001); // 0.001 * 6 = 0.006
    expect(formatted).toContain('R$');
    expect(formatted).toContain('0,006');
  });

  it('retorna traco (EMPTY) para entradas invalidas', () => {
    expect(formatUsdParaBrl(null)).toBe(EMPTY);
  });
});

describe('formatUsd', () => {
  it('mantem compatibilidade para exibicao direta de USD', () => {
    const formatted = formatUsd(1.5);
    expect(formatted).toContain('$');
    expect(formatted).toContain('1.50');
  });
});
