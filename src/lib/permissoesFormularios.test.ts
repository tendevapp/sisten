import { describe, it, expect } from 'vitest';
import { podeEditarFormulario, donoDoRegistro } from './permissoesFormularios';

const autor = { id: 'u1', roles: ['requisitante'] };
const outro = { id: 'u2', roles: ['requisitante'] };
const admin = { id: 'u9', roles: ['admin'] };

describe('donoDoRegistro', () => {
  it('lê criado_por (portaria/expedição)', () => {
    expect(donoDoRegistro({ criado_por: 'u1' })).toBe('u1');
  });
  it('lê solicitante_id (ASE)', () => {
    expect(donoDoRegistro({ solicitante_id: 'u1' })).toBe('u1');
  });
  it('retorna null quando não há dono', () => {
    expect(donoDoRegistro({ criado_por: null })).toBeNull();
    expect(donoDoRegistro(null)).toBeNull();
  });
});

describe('podeEditarFormulario', () => {
  it('deixa o autor editar a própria resposta', () => {
    expect(podeEditarFormulario(autor, { criado_por: 'u1' })).toBe(true);
    expect(podeEditarFormulario(autor, { solicitante_id: 'u1' })).toBe(true);
  });

  it('bloqueia quem não é o autor', () => {
    expect(podeEditarFormulario(outro, { criado_por: 'u1' })).toBe(false);
    expect(podeEditarFormulario(outro, { solicitante_id: 'u1' })).toBe(false);
  });

  it('deixa o admin editar qualquer resposta', () => {
    expect(podeEditarFormulario(admin, { criado_por: 'u1' })).toBe(true);
    expect(podeEditarFormulario(admin, { criado_por: null })).toBe(true);
  });

  it('registro antigo sem dono: só admin', () => {
    expect(podeEditarFormulario(autor, { criado_por: null })).toBe(false);
    expect(podeEditarFormulario(admin, { criado_por: null })).toBe(true);
  });

  it('sem usuário: nunca', () => {
    expect(podeEditarFormulario(null, { criado_por: 'u1' })).toBe(false);
  });
});
