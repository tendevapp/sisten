import { describe, expect, it } from 'vitest';
import { dividirRomaneio, interpretarNumeracaoTramos, itensRemoviveis, localizacaoDoItem, resumoSeparacao } from './premontagemSeparacao';

const item = (id: string, separado: boolean, qtd_total: number, qtd_separada = separado ? qtd_total : 0) =>
  ({ id, separado, qtd_total, qtd_separada });

describe('localizacaoDoItem', () => {
  it('usa a do Cadastro de Itens BOM primeiro', () => {
    expect(localizacaoDoItem({ localizador: 'R2-A3' }, { localizador: 'R9' }, { posicao_estoque: '101.020301' })).toBe('101.020301');
    expect(localizacaoDoItem({ localizador: 'R2-A3' }, null, { posicao_estoque: null })).toBe('R2-A3');
  });

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

describe('interpretarNumeracaoTramos', () => {
  const disponiveis = new Set(['T1-3143', 'T1-3158', 'T1-3173']);

  it('aceita só o número ou o id completo, ignorando repetidos', () => {
    expect(interpretarNumeracaoTramos('3143, t1-3158 3143', 'T1', disponiveis)).toEqual({ ids: ['T1-3143', 'T1-3158'], invalidos: [] });
  });

  it('vazio é kit pulmão: nenhum tramo numerado', () => {
    expect(interpretarNumeracaoTramos('  ', 'T1', disponiveis)).toEqual({ ids: [], invalidos: [] });
  });

  it('número fora das unidades disponíveis volta como inválido', () => {
    expect(interpretarNumeracaoTramos('3143;9999', 'T1', disponiveis)).toEqual({ ids: ['T1-3143'], invalidos: ['9999'] });
  });
});
