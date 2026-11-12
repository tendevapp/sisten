import { describe, expect, it } from 'vitest';
import { interpretarErroTrocaSenha } from './trocaSenha';

describe('interpretarErroTrocaSenha', () => {
  it('sem erro: troca feita', () => {
    expect(interpretarErroTrocaSenha(null)).toEqual({ ok: true, mantida: false });
  });

  it('senha igual à atual (provisória ou a antiga) conta como feita', () => {
    expect(interpretarErroTrocaSenha({ code: 'same_password', status: 422, message: 'New password should be different from the old password.' }))
      .toEqual({ ok: true, mantida: true });
    expect(interpretarErroTrocaSenha({ status: 422, message: 'New password should be different from the old password.' }))
      .toEqual({ ok: true, mantida: true });
  });

  it('mostra o motivo real nas outras falhas', () => {
    const fraca = interpretarErroTrocaSenha({ code: 'weak_password', status: 422, message: 'Password should be at least 6 characters.' });
    expect(fraca.ok).toBe(false);
    expect(fraca.erro).toMatch(/fraca/);

    const sessao = interpretarErroTrocaSenha({ name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' });
    expect(sessao.erro).toMatch(/sessão expirou/);

    const rede = interpretarErroTrocaSenha({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' });
    expect(rede.erro).toMatch(/Sem conexão/);

    const outro = interpretarErroTrocaSenha({ code: 'unexpected_failure', status: 500, message: 'boom' });
    expect(outro.erro).toContain('(boom)');
  });
});
