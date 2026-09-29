import { describe, it, expect, beforeEach } from 'vitest';
import { CENAS, cenaDaSessao, cenaForcada, ehCenaId, limparCenaSessao, sortearCena } from './cenaInicio';

// Ambiente de teste é 'node' (sem DOM): shim mínimo dos dois storages.
function criarStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  (globalThis as any).localStorage = criarStorage();
  (globalThis as any).sessionStorage = criarStorage();
});

describe('sortearCena', () => {
  it('nunca repete a cena anterior, qualquer que seja o número sorteado', () => {
    for (const anterior of CENAS) {
      for (const n of [0, 0.2, 0.5, 0.8, 0.999999, 1]) {
        expect(sortearCena(anterior, () => n)).not.toBe(anterior);
      }
    }
  });

  it('alcança todas as cenas quando não há anterior', () => {
    const vistas = new Set(CENAS.map((_, i) => sortearCena(null, () => i / CENAS.length)));
    expect(vistas.size).toBe(CENAS.length);
  });

  it('ignora anterior desconhecida', () => {
    expect(CENAS).toContain(sortearCena('inexistente', () => 0));
  });
});

describe('cenaForcada / ehCenaId', () => {
  it('aceita só cenas conhecidas', () => {
    expect(cenaForcada('?cena=calandra')).toBe('calandra');
    expect(cenaForcada('?x=1&cena=laser')).toBe('laser');
    expect(cenaForcada('?cena=nada')).toBeNull();
    expect(cenaForcada('')).toBeNull();
    expect(ehCenaId(42)).toBe(false);
  });
});

describe('cenaDaSessao', () => {
  it('mantém a mesma cena durante a sessão', () => {
    const primeira = cenaDaSessao(() => 0.1);
    expect(cenaDaSessao(() => 0.9)).toBe(primeira);
  });

  it('sorteia outra cena no login seguinte (após limparCenaSessao)', () => {
    const primeira = cenaDaSessao(() => 0.3);
    limparCenaSessao();
    expect(cenaDaSessao(() => 0.3)).not.toBe(primeira);
  });

  it('funciona sem storage disponível', () => {
    const quebrado = {
      getItem: () => { throw new Error('bloqueado'); },
      setItem: () => { throw new Error('bloqueado'); },
      removeItem: () => { throw new Error('bloqueado'); },
    };
    (globalThis as any).localStorage = quebrado;
    (globalThis as any).sessionStorage = quebrado;
    expect(CENAS).toContain(cenaDaSessao(() => 0.5));
    expect(() => limparCenaSessao()).not.toThrow();
  });
});
