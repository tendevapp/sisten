import { describe, expect, it } from 'vitest';
import {
  PRAZO_AUTH_LOGIN_MS, PRAZO_AUTH_MS, criarPausaAuth, ehRenovacaoDeSessao, prazoDaRequisicao, usuarioDaSessaoGuardada,
} from './redePatio';

const base = 'https://x.supabase.co';

describe('prazo das requisições que não podem ficar esperando para sempre', () => {
  it('renovação de sessão (silenciosa, segura o app inteiro) tem prazo curto', () => {
    expect(prazoDaRequisicao(`${base}/auth/v1/token?grant_type=refresh_token`)).toBe(PRAZO_AUTH_MS);
    expect(ehRenovacaoDeSessao(`${base}/auth/v1/token?grant_type=refresh_token`)).toBe(true);
  });
  it('login e demais chamadas de autenticação têm prazo maior e não entram na pausa', () => {
    expect(prazoDaRequisicao(`${base}/auth/v1/token?grant_type=password`)).toBe(PRAZO_AUTH_LOGIN_MS);
    expect(prazoDaRequisicao(`${base}/auth/v1/user`)).toBe(PRAZO_AUTH_LOGIN_MS);
    expect(ehRenovacaoDeSessao(`${base}/auth/v1/token?grant_type=password`)).toBe(false);
  });
  it('link assinado de foto tem prazo', () => {
    expect(prazoDaRequisicao(`${base}/storage/v1/object/sign/request-attachments/almox-catalogo/a.jpg`)).toBeGreaterThan(0);
    expect(prazoDaRequisicao(`${base}/storage/v1/object/sign/request-attachments`)).toBeGreaterThan(0);
  });
  it('o resto segue sem prazo aqui (relatórios pesados, importações)', () => {
    expect(prazoDaRequisicao(`${base}/rest/v1/sap_zl0024?select=*`)).toBeNull();
    expect(prazoDaRequisicao(`${base}/functions/v1/importar`)).toBeNull();
  });
});

describe('pausa da autenticação depois de uma rede muda', () => {
  it('depois de esgotar o prazo, as próximas tentativas falham na hora por um tempo', () => {
    const pausa = criarPausaAuth(30_000);
    expect(pausa.ativa(0)).toBe(false);
    pausa.registrarFalha(1_000);
    expect(pausa.ativa(2_000)).toBe(true);
    expect(pausa.ativa(31_001)).toBe(false);
  });
  it('resposta do servidor encerra a pausa', () => {
    const pausa = criarPausaAuth(30_000);
    pausa.registrarFalha(0);
    pausa.registrarSucesso();
    expect(pausa.ativa(1)).toBe(false);
  });
});

describe('quem estava logado quando a sessão venceu sem rede', () => {
  const sessao = (id: string) => JSON.stringify({ access_token: 'x', refresh_token: 'y', user: { id, email: 'a@b' } });
  it('acha o usuário na sessão guardada do Supabase', () => {
    expect(usuarioDaSessaoGuardada([['sb-abc-auth-token', sessao('u-1')], ['outra', '{}']])).toBe('u-1');
  });
  it('sem sessão guardada (deslogado) não inventa usuário', () => {
    expect(usuarioDaSessaoGuardada([['outra', '{}']])).toBeNull();
    expect(usuarioDaSessaoGuardada([['sb-abc-auth-token', 'não é json']])).toBeNull();
  });
});
