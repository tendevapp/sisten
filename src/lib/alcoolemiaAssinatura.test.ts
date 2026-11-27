import { describe, expect, it } from 'vitest';
import { faltaImagemAssinatura, mesclarAssinaturas, semApagarAssinatura, testeAssinado } from './alcoolemiaAssinatura';

// 27/11/2026: a lista deixou de trazer a imagem da assinatura (~56 KB por teste,
// 33 MB na tabela) — Monitor de Desempenho: 190 MB num dia de um só aparelho.
describe('assinatura do sorteado fora da lista', () => {
  it('assinado se tem a imagem ou o horário da assinatura (a lista só traz o horário)', () => {
    expect(testeAssinado({ assinatura_sorteado: null, assinatura_sorteado_em: '2026-11-27T10:00:00Z' })).toBe(true);
    expect(testeAssinado({ assinatura_sorteado: 'data:img', assinatura_sorteado_em: null })).toBe(true);
    expect(testeAssinado({ assinatura_sorteado: null, assinatura_sorteado_em: null })).toBe(false);
  });
  it('sabe quais testes precisam buscar a imagem', () => {
    expect(faltaImagemAssinatura({ assinatura_sorteado: undefined, assinatura_sorteado_em: '2026-11-27T10:00:00Z' })).toBe(true);
    expect(faltaImagemAssinatura({ assinatura_sorteado: 'data:img', assinatura_sorteado_em: '2026-11-27T10:00:00Z' })).toBe(false);
    expect(faltaImagemAssinatura({ assinatura_sorteado: null, assinatura_sorteado_em: null })).toBe(false);
  });
  it('põe a imagem buscada em cada teste', () => {
    const r = mesclarAssinaturas([{ id: 'a', x: 1 }, { id: 'b', x: 2 }] as any[], new Map([['a', 'data:a']]));
    expect(r).toEqual([{ id: 'a', x: 1, assinatura_sorteado: 'data:a' }, { id: 'b', x: 2 }]);
  });
  it('editar sem a imagem não apaga a assinatura gravada (ela é a evidência)', () => {
    expect(semApagarAssinatura({ resultado: 'NEGATIVO', assinatura_sorteado: null, assinatura_sorteado_em: null } as any))
      .toEqual({ resultado: 'NEGATIVO' });
    expect(semApagarAssinatura({ resultado: 'NEGATIVO', assinatura_sorteado: 'data:nova', assinatura_sorteado_em: 'x' } as any))
      .toEqual({ resultado: 'NEGATIVO', assinatura_sorteado: 'data:nova', assinatura_sorteado_em: 'x' });
    expect(semApagarAssinatura({ resultado: 'NEGATIVO' } as any)).toEqual({ resultado: 'NEGATIVO' });
  });
});
