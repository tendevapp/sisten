import { describe, expect, it } from 'vitest';
import { casaAtualizacao, intervaloAtualizacao, type FiltroAtualizacao } from './filtroDataAtualizacao';

// Datas no fuso do aparelho: o teste vale em qualquer TZ.
const agora = new Date(2026, 10, 16, 15, 0); // 16/11/2026 15:00 local
const em = (dia: number, hora = 10, mes = 10) => new Date(2026, mes, dia, hora, 0).toISOString();
const f = (preset: FiltroAtualizacao['preset'], de = '', ate = ''): FiltroAtualizacao => ({ preset, de, ate });

describe('filtro por data de atualização', () => {
  it('atalhos olham para trás a partir de hoje', () => {
    expect(intervaloAtualizacao(f('hoje'), agora)).toEqual({ de: '2026-11-16', ate: '2026-11-16' });
    expect(intervaloAtualizacao(f('7dias'), agora)).toEqual({ de: '2026-11-10', ate: '2026-11-16' });
    expect(intervaloAtualizacao(f('30dias'), agora)).toEqual({ de: '2026-10-18', ate: '2026-11-16' });
    expect(intervaloAtualizacao(f('este_mes'), agora)).toEqual({ de: '2026-11-01', ate: '2026-11-16' });
    expect(intervaloAtualizacao(f('todos'), agora)).toBeNull();
  });

  it('compara pelo dia local, inclusive nas pontas', () => {
    expect(casaAtualizacao(em(16, 23), f('hoje'), agora)).toBe(true);
    expect(casaAtualizacao(em(15, 23), f('hoje'), agora)).toBe(false);
    expect(casaAtualizacao(em(10, 0), f('7dias'), agora)).toBe(true);
    expect(casaAtualizacao(em(9, 23), f('7dias'), agora)).toBe(false);
  });

  it('período: De/Até abertos, trocados e vazio', () => {
    expect(casaAtualizacao(em(12), f('periodo', '2026-11-12', '2026-11-13'), agora)).toBe(true);
    expect(casaAtualizacao(em(14), f('periodo', '2026-11-12', '2026-11-13'), agora)).toBe(false);
    expect(casaAtualizacao(em(14), f('periodo', '2026-11-13', '2026-11-12'), agora)).toBe(false);
    expect(casaAtualizacao(em(12), f('periodo', '2026-11-13', '2026-11-12'), agora)).toBe(true);
    expect(casaAtualizacao(em(1), f('periodo', '', '2026-11-05'), agora)).toBe(true);
    expect(casaAtualizacao(em(16, 10, 9), f('periodo', '2026-11-01'), agora)).toBe(false);
    expect(casaAtualizacao(null, f('periodo'), agora)).toBe(true);
  });

  it('sem cadastro: só entra em "Nunca" e em "Qualquer"', () => {
    expect(casaAtualizacao(null, f('nunca'), agora)).toBe(true);
    expect(casaAtualizacao(em(16), f('nunca'), agora)).toBe(false);
    expect(casaAtualizacao(undefined, f('todos'), agora)).toBe(true);
    expect(casaAtualizacao(null, f('30dias'), agora)).toBe(false);
  });
});
