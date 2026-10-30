import { describe, expect, it } from 'vitest';
import type { EstoqueItem } from '../types';
import { montarIndiceGemba } from './gembaIndice';
import { COR_BIN_VAZIO, montarCargas, pecasDaEstante, pecasDoApoio, tipoDeCarga } from './gembaCarga';
import { ESTANTES, caixaDoAndar, acharBloco } from './gembaLayout';

const linha = (material: string, deposito: string, quantidade: number, posicao_estoque: string, txt: string, umb = 'UN'): EstoqueItem => ({
  id: Math.random(), material, deposito, quantidade, posicao_estoque, txt_breve_material: txt, umb,
});

describe('gembaCarga - tipoDeCarga', () => {
  it.each([
    ['CABO FLEXIVEL 2,5MM PRETO', 'bobina'],
    ['MANGUEIRA HIDRAULICA 1/2', 'bobina'],
    ['ESTANHO SOLDA 60/40 FIO 500G', 'miudeza'],
    ['PARAFUSO SEXTAVADO M10X40', 'miudeza'],
    ['TINTA EPÓXI CINZA', 'balde'],
    ['ÓLEO HIDRÁULICO ISO 68', 'balde'],
    ['CIMENTO CP II 50KG', 'saco'],
    ['LUVA VAQUETA CANO CURTO', 'epi'],
    ['CAPACETE ABA FRONTAL BRANCO', 'epi'],
    ['FARDAMENTO CAMISA BRIM', 'fardo'],
    ['ESTOPA BRANCA', 'fardo'],
    ['CHAPA AÇO GALVANIZADO 2MM', 'perfil'],
    ['ELETRODUTO RÍGIDO 3/4', 'perfil'],
    ['FILTRO HIDRÁULICO', 'caixa'],
  ])('%s → %s', (descricao, tipo) => {
    expect(tipoDeCarga(descricao)).toBe(tipo);
  });

  it('usa a unidade quando a descrição não diz', () => {
    expect(tipoDeCarga('PRODUTO X', 'SC')).toBe('saco');
    expect(tipoDeCarga('PRODUTO X', 'GL')).toBe('balde');
    expect(tipoDeCarga('PRODUTO X', 'UN')).toBe('caixa');
  });
});

describe('gembaCarga - montarCargas', () => {
  const estoque = [
    linha('1', '0004', 5, '104.020100', 'CABO FLEXIVEL'),
    linha('2', '0004', 0, '104.030100', 'PARAFUSO ZERADO'),
    linha('3', '0004', 2, '104.130218', 'ESTANHO SOLDA'),
    linha('4', '0002', 9, '102.ANEXO', 'LUVA VAQUETA'),
    linha('5', '0003', 3, '', 'CHAPA CLIENTE'),
  ];
  const { cargas, porZona } = montarCargas(montarIndiceGemba(estoque, new Map(), []));

  it('só põe carga onde há saldo', () => {
    expect(cargas.find(c => c.codigo === '2')).toBeUndefined();
    expect(cargas.find(c => c.codigo === '1')).toMatchObject({ estanteId: 'rua_04', andar: 1, tipo: 'bobina' });
  });

  it('apartamento do anexo e zonas com nome', () => {
    expect(cargas.find(c => c.codigo === '3')).toMatchObject({ estanteId: 'anexo_1', andar: 2, apartamento: 18 });
    expect(porZona.apoio_manutencao).toBe(1);
  });

  it('material sem endereço não ganha carga (todo vão é um bloco numerado)', () => {
    expect(cargas.find(c => c.codigo === '5')).toBeUndefined();
  });

  it('peça da BOM com posição na Rua 03 ganha carga no bloco', () => {
    const indice = montarIndiceGemba([], new Map(), [], [
      { partNumber: '60.10.92715', codSap: null, descricao: 'Placa de conexão', umb: 'each', posicao: '103.010200', saldo: 46, imagemPath: null },
    ]);
    expect(montarCargas(indice).cargas.find(c => c.codigo === '60.10.92715')).toMatchObject({ estanteId: 'rua_03', indiceVao: 0, andar: 2 });
  });
});

describe('gembaCarga - pecasDaEstante', () => {
  const rua04 = ESTANTES.find(e => e.id === 'rua_04')!;
  const anexo1 = ESTANTES.find(e => e.id === 'anexo_1')!;

  it('cada tipo gera peças dentro do andar, com palete no porta-pallet', () => {
    const { indice } = acharBloco('0004', 2)!;
    const slot = caixaDoAndar(rua04, indice, 1)!;
    for (const tipo of ['caixa', 'epi', 'saco', 'fardo', 'bobina', 'balde', 'perfil', 'miudeza'] as const) {
      const pecas = pecasDaEstante(rua04, [{ estanteId: 'rua_04', indiceVao: indice, andar: 1, apartamento: null, tipo, codigo: 'X' }]);
      expect(pecas.length, tipo).toBeGreaterThan(0);
      for (const p of pecas) {
        expect(p.centro[1], tipo).toBeGreaterThanOrEqual(slot.centro[1] - slot.tamanho[1] / 2 - 1e-6);
        expect(p.centro[1], tipo).toBeLessThanOrEqual(slot.centro[1] + slot.tamanho[1] / 2);
        expect(Math.abs(p.centro[0] - slot.centro[0]), tipo).toBeLessThanOrEqual(slot.tamanho[0] / 2);
      }
      expect(pecas.some(p => p.forma === 'palete'), tipo).toBe(tipo !== 'miudeza');
    }
  });

  it('é determinístico', () => {
    const c = [{ estanteId: 'rua_04', indiceVao: 3, andar: 2, apartamento: null, tipo: 'caixa' as const, codigo: 'ABC' }];
    expect(pecasDaEstante(rua04, c)).toEqual(pecasDaEstante(rua04, c));
  });

  it('anexo desenha todos os bins e pinta só os ocupados', () => {
    const pecas = pecasDaEstante(anexo1, [{ estanteId: 'anexo_1', indiceVao: 0, andar: 2, apartamento: 18, tipo: 'miudeza', codigo: '3' }]);
    const bins = pecas.filter(p => p.forma === 'bin');
    expect(bins).toHaveLength(8 * 2 * 30);
    expect(bins.filter(b => b.cor !== COR_BIN_VAZIO)).toHaveLength(1);
  });
});

describe('gembaCarga - pecasDoApoio', () => {
  it('uma caixa por item, com estrutura de estante', () => {
    const { estrutura, pecas } = pecasDoApoio('apoio_manutencao', 40);
    expect(pecas).toHaveLength(40);
    expect(estrutura.length).toBeGreaterThan(0);
  });
});
