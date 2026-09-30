/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * O identificador `nome.sobrenome` é a credencial de quem não tem e-mail: se
 * a geração mudar de comportamento, o usuário simplesmente não entra mais.
 */

import { describe, expect, it } from 'vitest';
import {
  gerarUsuarioLogin,
  usuarioLoginValido,
  emailDeLogin,
  ehEmailInterno,
  rotuloIdentificador,
  ehNovoUsuario,
  DIAS_LIMITE_NOVO_USUARIO,
} from './loginSemEmail';

describe('gerarUsuarioLogin', () => {
  it('usa o primeiro nome e o último sobrenome', () => {
    expect(gerarUsuarioLogin('André Muritiba Araújo')).toBe('andre.araujo');
    expect(gerarUsuarioLogin('Maria Silva')).toBe('maria.silva');
  });

  it('ignora partículas do meio do nome', () => {
    expect(gerarUsuarioLogin('José da Silva Pereira')).toBe('jose.pereira');
    expect(gerarUsuarioLogin('Ana dos Santos')).toBe('ana.santos');
  });

  it('aceita nome de uma palavra só', () => {
    expect(gerarUsuarioLogin('Madonna')).toBe('madonna');
  });

  it('devolve vazio quando não há nome utilizável', () => {
    expect(gerarUsuarioLogin('')).toBe('');
    expect(gerarUsuarioLogin('   ')).toBe('');
  });

  it('não deixa passar caractere que quebraria o e-mail interno', () => {
    expect(gerarUsuarioLogin("D'Ávila O'Brien")).toBe('davila.obrien');
    expect(usuarioLoginValido(gerarUsuarioLogin('Ção Ñunes'))).toBe(true);
  });
});

describe('usuarioLoginValido', () => {
  it('aceita minúsculas, números e pontos internos', () => {
    expect(usuarioLoginValido('jose.pereira')).toBe(true);
    expect(usuarioLoginValido('joao2')).toBe(true);
  });

  it('recusa ponto nas pontas, ponto duplo, espaço e maiúscula', () => {
    expect(usuarioLoginValido('.jose')).toBe(false);
    expect(usuarioLoginValido('jose.')).toBe(false);
    expect(usuarioLoginValido('jose..pereira')).toBe(false);
    expect(usuarioLoginValido('jose pereira')).toBe(false);
    expect(usuarioLoginValido('Jose.Pereira')).toBe(false);
    expect(usuarioLoginValido('ab')).toBe(false);
  });
});

describe('emailDeLogin', () => {
  it('cola o domínio interno quando não veio e-mail', () => {
    expect(emailDeLogin('jose.pereira')).toBe('jose.pereira@sisten.local');
  });

  it('deixa passar e-mail de verdade, só normalizando', () => {
    expect(emailDeLogin('  Fulano@TEN.ind.br ')).toBe('fulano@ten.ind.br');
  });

  it('devolve vazio para entrada vazia, sem inventar domínio', () => {
    expect(emailDeLogin('')).toBe('');
    expect(emailDeLogin('   ')).toBe('');
  });
});

describe('exibição do identificador', () => {
  it('reconhece o endereço interno', () => {
    expect(ehEmailInterno('jose.pereira@sisten.local')).toBe(true);
    expect(ehEmailInterno('jose@ten.ind.br')).toBe(false);
    expect(ehEmailInterno(null)).toBe(false);
  });

  it('esconde o domínio técnico e preserva o e-mail real', () => {
    expect(rotuloIdentificador('jose.pereira@sisten.local')).toBe('jose.pereira');
    expect(rotuloIdentificador('jose@ten.ind.br')).toBe('jose@ten.ind.br');
  });
});

describe('ehNovoUsuario (regra da tag de novo usuário - máximo 8 dias)', () => {
  const agora = new Date('2026-09-30T12:00:00Z');

  it('valida que a constante DIAS_LIMITE_NOVO_USUARIO é 8 dias', () => {
    expect(DIAS_LIMITE_NOVO_USUARIO).toBe(8);
  });

  it('retorna true para usuário cadastrado hoje (0 dias)', () => {
    const hoje = new Date('2026-09-30T08:00:00Z').toISOString();
    expect(ehNovoUsuario(hoje, agora)).toBe(true);
  });

  it('retorna true para usuário cadastrado há 4 dias', () => {
    const quatroDiasAtras = new Date('2026-09-26T12:00:00Z').toISOString();
    expect(ehNovoUsuario(quatroDiasAtras, agora)).toBe(true);
  });

  it('retorna true para usuário cadastrado exatamente há 8 dias (limite)', () => {
    const oitoDiasAtras = new Date('2026-09-22T12:00:00Z').toISOString();
    expect(ehNovoUsuario(oitoDiasAtras, agora)).toBe(true);
  });

  it('retorna false para usuário cadastrado há mais de 8 dias (tag deve ser removida)', () => {
    const oitoDiasMeioAtras = new Date('2026-09-21T23:00:00Z').toISOString();
    const noveDiasAtras = new Date('2026-09-21T12:00:00Z').toISOString();
    const trintaDiasAtras = new Date('2026-08-31T12:00:00Z').toISOString();

    expect(ehNovoUsuario(oitoDiasMeioAtras, agora)).toBe(false);
    expect(ehNovoUsuario(noveDiasAtras, agora)).toBe(false);
    expect(ehNovoUsuario(trintaDiasAtras, agora)).toBe(false);
  });

  it('retorna false para datas inválidas, nulas ou vazias', () => {
    expect(ehNovoUsuario(null, agora)).toBe(false);
    expect(ehNovoUsuario(undefined, agora)).toBe(false);
    expect(ehNovoUsuario('', agora)).toBe(false);
    expect(ehNovoUsuario('data-invalida', agora)).toBe(false);
  });

  it('retorna false para datas futuras', () => {
    const amanha = new Date('2026-10-01T12:00:00Z').toISOString();
    expect(ehNovoUsuario(amanha, agora)).toBe(false);
  });
});

