import { describe, it, expect } from 'vitest';
import { classificar, combinarResultados, ehSoDigitos, rastreioDeRequisicoes, type ResultadoBusca } from './buscaGlobalRank';
import type { SAPRequisicao } from '../types';

interface Item {
  nome: string;
  extra?: string;
}

const itens: Item[] = [
  { nome: 'Estoque', extra: 'Almoxarifado saldo ZL0024' },
  { nome: 'Controle de Estoque', extra: 'Faixa mínima' },
  { nome: 'Inventário Cíclico' },
  { nome: 'Recebimento Físico', extra: 'ficha cega e estoque' },
];
const campos = (i: Item) => ({ principal: i.nome, extra: [i.extra] });

describe('classificar', () => {
  it('termo vazio não devolve nada', () => {
    expect(classificar(itens, '', campos)).toEqual([]);
    expect(classificar(itens, '   ', campos)).toEqual([]);
  });

  it('ignora acentos e maiúsculas', () => {
    expect(classificar(itens, 'INVENTARIO ciclico', campos).map(i => i.nome)).toEqual(['Inventário Cíclico']);
  });

  it('título que começa com o termo vem antes de quem só contém', () => {
    expect(classificar(itens, 'estoque', campos).map(i => i.nome)).toEqual([
      'Estoque',
      'Controle de Estoque',
      'Recebimento Físico',
    ]);
  });

  it('casa por palavras em qualquer ordem (AND)', () => {
    expect(classificar(itens, 'estoque controle', campos).map(i => i.nome)).toEqual(['Controle de Estoque']);
  });

  it('o texto auxiliar também casa, mas depois do título', () => {
    const r = classificar(itens, 'ficha cega', campos).map(i => i.nome);
    expect(r).toEqual(['Recebimento Físico']);
  });

  it('respeita o limite e mantém a ordem original dentro do mesmo peso', () => {
    expect(classificar(itens, 'estoque', campos, 2).map(i => i.nome)).toEqual(['Estoque', 'Controle de Estoque']);
  });

  it('frase entre aspas casa inteira', () => {
    expect(classificar(itens, '"de estoque"', campos).map(i => i.nome)).toEqual(['Controle de Estoque']);
  });
});

describe('ehSoDigitos', () => {
  it('só números, com espaços nas pontas tolerados', () => {
    expect(ehSoDigitos('1234567')).toBe(true);
    expect(ehSoDigitos(' 1234567 ')).toBe(true);
    expect(ehSoDigitos('12a')).toBe(false);
    expect(ehSoDigitos('')).toBe(false);
  });
});

const req = (rm: string, item: string): SAPRequisicao => ({ ri: `${rm}${item}`, requisicao_de_compra: rm, item_reqc: item }) as unknown as SAPRequisicao;

describe('rastreioDeRequisicoes', () => {
  const base = [req('1000000001', '00010'), req('1000000001', '00020'), req('1000000002', '00010'), req('2000000009', '00010')];

  it('exige ao menos 5 dígitos', () => {
    expect(rastreioDeRequisicoes('1000', base)).toEqual([]);
    expect(rastreioDeRequisicoes('rm1000000001', base)).toEqual([]);
  });

  it('agrupa por RM e conta os itens', () => {
    const r = rastreioDeRequisicoes('100000', base);
    expect(r.map(x => x.titulo)).toEqual(['RM 1000000001', 'RM 1000000002']);
    expect(r[0].subtitulo).toBe('2 itens no rastreio de compras');
    expect(r[1].subtitulo).toBe('1 item no rastreio de compras');
    expect(r[0].path).toBe('/rastreio?ri=100000000100010');
  });

  it('respeita o limite', () => {
    expect(rastreioDeRequisicoes('100000', base, 1)).toHaveLength(1);
  });
});

describe('combinarResultados', () => {
  const r = (grupo: ResultadoBusca['grupo'], id: string): ResultadoBusca => ({ grupo, id, titulo: id, path: '/' });

  it('ordena pelos grupos e remove repetidos', () => {
    const lista = combinarResultados([r('Materiais', 'm1'), r('Páginas', 'p1')], [r('Páginas', 'p1'), r('Solicitações', 's1')]);
    expect(lista.map(x => `${x.grupo}:${x.id}`)).toEqual(['Páginas:p1', 'Solicitações:s1', 'Materiais:m1']);
  });

  it('o mesmo id em grupos diferentes não é repetição', () => {
    expect(combinarResultados([r('Páginas', 'x'), r('Formulários', 'x')])).toHaveLength(2);
  });
});
