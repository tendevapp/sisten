import { describe, it, expect, beforeEach } from 'vitest';
import { diaLocal, marcarDiaSessao, limparDiaSessao, sessaoExpirouNoDia } from './sessaoDiaria';

// Ambiente de teste é 'node' (sem DOM): shim mínimo de localStorage.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
});

describe('diaLocal', () => {
  it('formata AAAA-MM-DD com zero à esquerda', () => {
    expect(diaLocal(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(diaLocal(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('sessaoExpirouNoDia', () => {
  it('não expira sem marcação', () => {
    expect(sessaoExpirouNoDia()).toBe(false);
  });

  it('não expira no mesmo dia', () => {
    const hoje = new Date(2026, 8, 2, 8, 0);
    marcarDiaSessao(hoje);
    expect(sessaoExpirouNoDia(new Date(2026, 8, 2, 23, 59))).toBe(false);
  });

  it('expira quando o dia local vira', () => {
    marcarDiaSessao(new Date(2026, 8, 2, 23, 59));
    expect(sessaoExpirouNoDia(new Date(2026, 8, 3, 0, 1))).toBe(true);
  });

  it('limparDiaSessao remove a marcação', () => {
    marcarDiaSessao(new Date(2026, 8, 2));
    limparDiaSessao();
    expect(sessaoExpirouNoDia(new Date(2026, 8, 3))).toBe(false);
  });
});
