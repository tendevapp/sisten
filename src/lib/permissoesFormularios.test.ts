import { describe, it, expect } from 'vitest';
import {
  podeEditarFormulario,
  donoDoRegistro,
  podeEditarRegistroPortaria,
  podeRegistrarSaidaPortaria,
  ehSetorPortaria,
  ehMesmoDiaPortaria,
  SETOR_PORTARIA_ID,
} from './permissoesFormularios';

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

describe('podeEditarRegistroPortaria', () => {
  const hoje = new Date(2026, 10, 19, 14, 30, 0); // 2026-11-19 local
  const diaSeguinte = new Date(2026, 10, 20, 7, 10, 0); // 2026-11-20 local

  const portaria1 = { id: 'p1', roles: ['solicitante'], sector_id: SETOR_PORTARIA_ID };
  const portaria2 = { id: 'p2', roles: ['solicitante'], sector_id: SETOR_PORTARIA_ID };
  const outroSetor = { id: 'x1', roles: ['solicitante'], sector_id: '5' };
  const adminPortaria = { id: 'a1', roles: ['admin'], sector_id: '1' };

  it('permite ao setor Portaria editar registros feitos no mesmo dia (inclusive por outro usuario/aparelho)', () => {
    const regHoje = { criado_por: 'p1', data: '2026-11-19' };
    expect(ehSetorPortaria(portaria1)).toBe(true);
    expect(ehMesmoDiaPortaria(regHoje, hoje)).toBe(true);
    expect(podeEditarRegistroPortaria(portaria1, regHoje, hoje)).toBe(true);
    expect(podeEditarRegistroPortaria(portaria2, regHoje, hoje)).toBe(true);
    expect(podeEditarRegistroPortaria(portaria2, { criado_por: 'p1', data_entrada: '2026-11-19' }, hoje)).toBe(true);
  });

  it('bloqueia alteracao apos finalizar o dia, inclusive para usuarios do setor Portaria', () => {
    const regOntem = { criado_por: 'p1', data: '2026-11-19' };
    expect(podeEditarRegistroPortaria(portaria1, regOntem, diaSeguinte)).toBe(false);
    expect(podeEditarRegistroPortaria(portaria2, regOntem, diaSeguinte)).toBe(false);
    expect(podeEditarRegistroPortaria(outroSetor, { criado_por: 'x1', data: '2026-11-19' }, diaSeguinte)).toBe(false);
  });

  it('mantem admin liberado em qualquer data', () => {
    const regOntem = { criado_por: 'p1', data: '2026-11-19' };
    expect(podeEditarRegistroPortaria(adminPortaria, regOntem, diaSeguinte)).toBe(true);
  });

  it('usuario de outro setor so edita o proprio registro no mesmo dia', () => {
    expect(podeEditarRegistroPortaria(outroSetor, { criado_por: 'x1', data: '2026-11-19' }, hoje)).toBe(true);
    expect(podeEditarRegistroPortaria(outroSetor, { criado_por: 'p1', data: '2026-11-19' }, hoje)).toBe(false);
  });

  it('permite ao setor Portaria registrar saida de veiculo que entrou no dia anterior', () => {
    const regOntem = { criado_por: 'p1', data_entrada: '2026-11-19' };
    expect(podeRegistrarSaidaPortaria(portaria2, regOntem)).toBe(true);
    expect(podeRegistrarSaidaPortaria(outroSetor, regOntem)).toBe(false);
  });
});
