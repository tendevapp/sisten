import { describe, expect, it } from 'vitest';
import { chavePosicao, grupoDoRoteiro, indexarPosicoes, ordenarPorRoteiro } from './inventarioRoteiro';

describe('roteiro do inventário pela posição', () => {
  it('indexa por material × depósito, junta posições repetidas e ordena', () => {
    const m = indexarPosicoes([
      { material: '001393151', deposito: '4', posicao_estoque: '104.020300' },
      { material: '1393151', deposito: '0004', posicao_estoque: '104.010200, 104.020300' },
      { material: '1305343', deposito: '0200', posicao_estoque: '' },
    ]);
    expect(m.get(chavePosicao('1393151', '0004'))).toEqual(['104.010200', '104.020300']);
    expect(m.has(chavePosicao('1305343', '0200'))).toBe(false);
  });

  it('ordena por depósito, bloco, andar e apto; sem posição vai para o fim na ordem original', () => {
    const itens = [
      { id: 'a', p: [] as string[] },
      { id: 'b', p: ['104.230309'] },
      { id: 'c', p: ['102.ANEXO'] },
      { id: 'd', p: ['104.020300'] },
      { id: 'e', p: [] as string[] },
      { id: 'f', p: ['104.0203'] },
    ];
    expect(ordenarPorRoteiro(itens, (i) => i.p).map((i) => i.id)).toEqual(['c', 'f', 'd', 'b', 'a', 'e']);
  });

  it('agrupa pela estante/área, sem bloco e andar', () => {
    const g = grupoDoRoteiro('104.230309');
    expect(g).not.toMatch(/Bloco|Andar|Apto/);
    expect(g.length).toBeGreaterThan(0);
    expect(grupoDoRoteiro('104.230309')).toBe(grupoDoRoteiro('104.230102'));
    expect(grupoDoRoteiro(null)).toBe('Sem posição na ZL0024');
    expect(grupoDoRoteiro('200.020100')).toBe('Depósito externo');
  });
});
