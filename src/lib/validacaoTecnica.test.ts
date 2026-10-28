import { describe, expect, it } from 'vitest';
import { interpretarLinks, podeDecidirValidacao, ultimaValidacaoPorRi, type ValidacaoTecnica } from './validacaoTecnica';

describe('interpretarLinks', () => {
  it('um por linha, com ou sem protocolo, sem repetir', () => {
    expect(interpretarLinks('https://a.com/x\nwww.fabricante.com.br/ficha.pdf\nhttps://a.com/x')).toEqual([
      'https://a.com/x',
      'https://www.fabricante.com.br/ficha.pdf',
    ]);
  });
  it('descarta o que não é endereço', () => {
    expect(interpretarLinks('ver anexo')).toEqual([]);
  });
});

describe('podeDecidirValidacao', () => {
  const v = { setor_id: 'manut', marcados_ids: ['u-eng'] };
  it('admin, aprovador do setor ou marcado', () => {
    expect(podeDecidirValidacao(v, { id: 'x', roles: ['admin'] })).toBe(true);
    expect(podeDecidirValidacao(v, { id: 'x', roles: ['gestor'], aprovador_setores: ['manut'] })).toBe(true);
    expect(podeDecidirValidacao(v, { id: 'u-eng', roles: [] })).toBe(true);
  });
  it('aprovador de outro setor não decide', () => {
    expect(podeDecidirValidacao(v, { id: 'x', roles: ['gestor'], aprovador_setores: ['almox'] })).toBe(false);
  });
});

describe('ultimaValidacaoPorRi', () => {
  it('fica com o chamado mais recente do item', () => {
    const base = { ri: '1', status: 'REPROVADA' } as ValidacaoTecnica;
    const m = ultimaValidacaoPorRi([
      { ...base, id: 'a', created_at: '2026-10-20T10:00:00Z' },
      { ...base, id: 'b', status: 'APROVADA', created_at: '2026-10-27T10:00:00Z' },
    ]);
    expect(m.get('1')?.id).toBe('b');
  });
});
