import { describe, it, expect, beforeEach, vi } from 'vitest';
import { seenKey, readSeen } from './useTour';

describe('useTour storage helpers', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const localStorageMock = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => { store[key] = val; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
    };
    vi.stubGlobal('localStorage', localStorageMock);
  });

  it('deve gerar a chave de localStorage correta', () => {
    expect(seenKey('nova-solicitacao')).toBe('sisten:tour-seen:nova-solicitacao');
  });

  it('deve retornar false quando o tour ainda não foi visto', () => {
    expect(readSeen('nova-solicitacao')).toBe(false);
  });

  it('deve retornar true quando o tour foi marcado como visto (1)', () => {
    localStorage.setItem(seenKey('nova-solicitacao'), '1');
    expect(readSeen('nova-solicitacao')).toBe(true);
  });
});
