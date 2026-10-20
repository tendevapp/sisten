import { describe, expect, it } from 'vitest';
import { dividirRomaneio, itensRemoviveis, localizacaoDoItem, resumoSeparacao } from './premontagemSeparacao';

const item = (id: string, separado: boolean, qtd_total: number, qtd_separada = separado ? qtd_total : 0) =>
  ({ id, separado, qtd_total, qtd_separada });

describe('localizacaoDoItem', () => {
  it('usa a do romaneio e, sem ela, a do cadastro', () => {
    expect(localizacaoDoItem({ localizador: 'R2-A3' }, { localizador: 'R9' })).toBe('R2-A3');
    expect(localizacaoDoItem({ localizador: '  ' }, { localizador: 'R9' })).toBe('R9');
    expect(localizacaoDoItem({ localizador: null }, null)).toBeNull();
  });
});

describe('dividirRomaneio', () => {
  it('o que já vinha separado vai para o resumo; o marcado agora fica em cima', () => {
    const itens = [item('a', true, 2), item('b', false, 1), item('c', true, 4)];
    const { pendentes, anteriores } = dividirRomaneio(itens, new Set(['a']));
    expect(pendentes.map((i) => i.id)).toEqual(['b', 'c']);
    expect(anteriores.map((i) => i.id)).toEqual(['a']);
  });
});

describe('itensRemoviveis', () => {
  it('só sai do romaneio o que não tem nada separado', () => {
    const itens = [item('a', true, 2), item('b', false, 1), item('c', false, 3, 1)];
    expect(itensRemoviveis(itens).map((i) => i.id)).toEqual(['b']);
  });
});

describe('resumoSeparacao', () => {
  it('conta itens e peças separados e que faltam', () => {
    expect(resumoSeparacao([item('a', true, 2, 3), item('b', false, 5), item('c', false, 1)]))
      .toEqual({ separados: 1, faltam: 2, pecasSeparadas: 3, pecasFaltam: 6 });
  });
});
