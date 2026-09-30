import { describe, it, expect, beforeEach } from 'vitest';
import {
  CENAS,
  CENAS_ADMIN,
  CENAS_PUBLICAS,
  NOMES_CENAS,
  cenaDaSessao,
  cenaForcada,
  definirCenaSessao,
  ehCenaId,
  limparCenaSessao,
  proximaCena,
  sortearCena,
  type CenaId,
} from './cenaInicio';

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

const NUMEROS = [0, 0.2, 0.5, 0.8, 0.999999, 1];

describe('catálogo de cenas', () => {
  it('não repete id e todo id tem nome', () => {
    expect(new Set(CENAS).size).toBe(CENAS.length);
    for (const c of CENAS) expect(NOMES_CENAS[c]).toBeTruthy();
  });

  it('cenas públicas e de admin não se misturam', () => {
    for (const c of CENAS_ADMIN) expect((CENAS_PUBLICAS as readonly string[]).includes(c)).toBe(false);
  });
});

describe('sortearCena', () => {
  it('nunca repete a cena anterior, qualquer que seja o número sorteado', () => {
    for (const admin of [false, true]) {
      for (const anterior of CENAS) {
        for (const n of NUMEROS) {
          expect(sortearCena(anterior, () => n, admin)).not.toBe(anterior);
        }
      }
    }
  });

  it('quem não é admin alcança todas as públicas e nenhuma de admin', () => {
    const vistas = new Set(NUMEROS.concat(CENAS_PUBLICAS.map((_, i) => (i + 0.5) / CENAS_PUBLICAS.length)).map(n => sortearCena(null, () => n)));
    expect(vistas.size).toBe(CENAS_PUBLICAS.length);
    for (const c of vistas) expect((CENAS_ADMIN as readonly string[]).includes(c)).toBe(false);
  });

  it('admin alcança todas as cenas, inclusive as de admin', () => {
    const vistas = new Set(CENAS.map((_, i) => sortearCena(null, () => (i + 0.5) / CENAS.length, true)));
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

  it('cena de admin só vale para admin', () => {
    expect(cenaForcada('?cena=torque')).toBeNull();
    expect(cenaForcada('?cena=torque', false)).toBeNull();
    expect(cenaForcada('?cena=torque', true)).toBe('torque');
    expect(cenaForcada('?cena=calandra', true)).toBe('calandra');
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

  it('cena de admin gravada no navegador é ignorada por quem não é admin', () => {
    definirCenaSessao('drone');
    const cena = cenaDaSessao(() => 0.4, false);
    expect(CENAS_PUBLICAS).toContain(cena);
  });

  it('admin reaproveita a cena de admin escolhida', () => {
    definirCenaSessao('drone');
    expect(cenaDaSessao(() => 0.4, true)).toBe('drone');
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
    expect(() => definirCenaSessao('torque')).not.toThrow();
  });
});

describe('proximaCena', () => {
  it('anda para frente e para trás e dá a volta', () => {
    expect(proximaCena(CENAS[0], 1)).toBe(CENAS[1]);
    expect(proximaCena(CENAS[1], -1)).toBe(CENAS[0]);
    expect(proximaCena(CENAS[CENAS.length - 1], 1)).toBe(CENAS[0]);
    expect(proximaCena(CENAS[0], -1)).toBe(CENAS[CENAS.length - 1]);
  });

  it('percorre todas as cenas antes de voltar ao ponto de partida', () => {
    const vistas = new Set<string>();
    let c: CenaId = CENAS[0];
    for (let i = 0; i < CENAS.length; i++) {
      vistas.add(c);
      c = proximaCena(c, 1);
    }
    expect(vistas.size).toBe(CENAS.length);
    expect(c).toBe(CENAS[0]);
  });
});
