import { describe, it, expect, beforeEach } from 'vitest';
import { diaLocal, marcarDiaSessao, limparDiaSessao, sessaoExpirouNoDia, usuarioSessaoPermanente } from './sessaoDiaria';

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

describe('usuarioSessaoPermanente', () => {
  it('reconhece o usuário tv.fin por string de login ou email', () => {
    expect(usuarioSessaoPermanente('tv.fin')).toBe(true);
    expect(usuarioSessaoPermanente('tv.fin@sisten.local')).toBe(true);
    expect(usuarioSessaoPermanente('TV.FIN')).toBe(true);
    expect(usuarioSessaoPermanente('TV.FIN@SISTEN.LOCAL')).toBe(true);
  });

  it('reconhece outros usuários prefixados com tv.', () => {
    expect(usuarioSessaoPermanente('tv.almox')).toBe(true);
    expect(usuarioSessaoPermanente('tv.almox@sisten.local')).toBe(true);
    expect(usuarioSessaoPermanente('tv_painel')).toBe(true);
  });

  it('reconhece objeto de perfil com cargo TV ou nome TV', () => {
    expect(usuarioSessaoPermanente({ email: 'outro@sisten.local', cargo: 'TV' })).toBe(true);
    expect(usuarioSessaoPermanente({ email: 'outro@sisten.local', cargo: 'tv' })).toBe(true);
    expect(usuarioSessaoPermanente({ email: 'tv.fin@sisten.local', cargo: 'Visualizador' })).toBe(true);
    expect(usuarioSessaoPermanente({ email: 'outro@sisten.local', name: 'TV Sala Financeiro' })).toBe(true);
  });

  it('retorna false para usuários comuns', () => {
    expect(usuarioSessaoPermanente('andre.araujo@ten.com.br')).toBe(false);
    expect(usuarioSessaoPermanente('joao.silva@sisten.local')).toBe(false);
    expect(usuarioSessaoPermanente({ email: 'maria@ten.com.br', cargo: 'Comprador' })).toBe(false);
    expect(usuarioSessaoPermanente(null)).toBe(false);
    expect(usuarioSessaoPermanente(undefined)).toBe(false);
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

  it('expira quando o dia local vira para usuário comum', () => {
    marcarDiaSessao(new Date(2026, 8, 2, 23, 59));
    expect(sessaoExpirouNoDia(new Date(2026, 8, 3, 0, 1))).toBe(true);
  });

  it('NUNCA expira para tv.fin mesmo após virada de dia', () => {
    marcarDiaSessao(new Date(2026, 8, 2, 23, 59));
    // Passando identificador
    expect(sessaoExpirouNoDia(new Date(2026, 8, 3, 0, 1), 'tv.fin')).toBe(false);
    expect(sessaoExpirouNoDia(new Date(2026, 8, 10, 12, 0), 'tv.fin@sisten.local')).toBe(false);
    // Passando objeto de perfil
    expect(sessaoExpirouNoDia(new Date(2026, 8, 3, 0, 1), { email: 'tv.fin@sisten.local', cargo: 'TV' })).toBe(false);
  });

  it('NUNCA expira para tv.fin quando o usuário está em cache local e a função é chamada sem argumentos', () => {
    marcarDiaSessao(new Date(2026, 8, 2, 23, 59));
    localStorage.setItem('sisten_current_user', JSON.stringify({ email: 'tv.fin@sisten.local', name: 'TV FIN' }));
    expect(sessaoExpirouNoDia(new Date(2026, 8, 3, 0, 1))).toBe(false);
  });

  it('limparDiaSessao remove a marcação', () => {
    marcarDiaSessao(new Date(2026, 8, 2));
    limparDiaSessao();
    expect(sessaoExpirouNoDia(new Date(2026, 8, 3))).toBe(false);
  });
});

