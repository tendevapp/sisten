import { describe, expect, it } from 'vitest';
import { COMPLETO_A_CADA_MS, maiorIdMb51, mesclarMb51, planoMb51 } from './mb51Incremental';

const agora = Date.parse('2026-11-27T18:00:00Z');
const meta = { versao: 43, maiorId: 900, completoEm: '2026-11-27T10:00:00Z' };

describe('MB51 no aparelho: rebaixar só o que mudou (27/11: ~62 MB por "Atualizar"/importação)', () => {
  it('sem cópia ou sem carimbo: baixa tudo', () => {
    expect(planoMb51({ temCache: false, meta, versaoRemota: 43, agora })).toBe('completo');
    expect(planoMb51({ temCache: true, meta: null, versaoRemota: 43, agora })).toBe('completo');
  });
  it('versão do servidor igual à da cópia (ex.: importou a ZL0024, não a MB51): não baixa nada', () => {
    expect(planoMb51({ temCache: true, meta, versaoRemota: 43, agora })).toBe('usar_cache');
  });
  it('importação nova da MB51: baixa só as linhas depois do maior id', () => {
    expect(planoMb51({ temCache: true, meta, versaoRemota: 44, agora })).toBe('delta');
  });
  it('sem o carimbo do servidor: faz o delta (barato) em vez de confiar na cópia', () => {
    expect(planoMb51({ temCache: true, meta, versaoRemota: null, agora })).toBe('delta');
  });
  it('cópia completa com mais de um dia: baixa tudo (pega reclassificação de TMV/PEP)', () => {
    const velha = { ...meta, completoEm: new Date(agora - COMPLETO_A_CADA_MS).toISOString() };
    expect(planoMb51({ temCache: true, meta: velha, versaoRemota: 43, agora })).toBe('completo');
  });
  it('junta as novas sem duplicar e acha o maior id', () => {
    const locais = [{ id: 1, q: 'a' }, { id: 2, q: 'b' }];
    const juntas = mesclarMb51(locais, [{ id: 2, q: 'B' }, { id: 3, q: 'c' }]);
    expect(juntas).toEqual([{ id: 1, q: 'a' }, { id: 2, q: 'B' }, { id: 3, q: 'c' }]);
    expect(maiorIdMb51(juntas)).toBe(3);
    expect(maiorIdMb51([])).toBe(0);
  });
});
