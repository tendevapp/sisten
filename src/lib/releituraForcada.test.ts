import { describe, expect, it } from 'vitest';
import { RELEITURA_FORCADA_MINIMO_MS, precisaBaixar } from './releituraForcada';

const agora = Date.parse('2026-11-27T18:00:00Z');
const recente = new Date(agora - 60_000).toISOString();
const antigo = new Date(agora - RELEITURA_FORCADA_MINIMO_MS).toISOString();

// 27/11/2026: abrir o formulário do Balcão forçava a ZL0024 inteira (~8 MB) toda
// vez — 375 leituras num dia de um só aparelho, sem importação nova.
describe('releitura forçada de base importada (ZL0024)', () => {
  it('versão nova no servidor: baixa', () => {
    expect(precisaBaixar({ versaoMudou: true, forcar: false, baixadoEm: recente, agora })).toBe(true);
  });
  it('sem forçar e versão igual: usa a cópia', () => {
    expect(precisaBaixar({ versaoMudou: false, forcar: false, baixadoEm: antigo, agora })).toBe(false);
  });
  it('forçar com versão igual e cópia recente: usa a cópia (a base só muda por importação)', () => {
    expect(precisaBaixar({ versaoMudou: false, forcar: true, baixadoEm: recente, agora })).toBe(false);
  });
  it('forçar com cópia antiga ou sem data: baixa (margem caso o carimbo falhe)', () => {
    expect(precisaBaixar({ versaoMudou: false, forcar: true, baixadoEm: antigo, agora })).toBe(true);
    expect(precisaBaixar({ versaoMudou: false, forcar: true, baixadoEm: null, agora })).toBe(true);
  });
});
