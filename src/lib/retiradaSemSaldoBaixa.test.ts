import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/supabaseClient', () => ({ supabase: {} }));

import { planejarBaixa } from './retiradaSemSaldoBaixa';
import { indexarEstoquePorDeposito } from './requisicaoBalcao';
import type { EstoqueItem } from '../types';

const est = (deposito: string, material: string, quantidade: number) =>
  ({ deposito, material, quantidade, txt_breve_material: `MAT ${material}`, umb: 'UN' }) as unknown as EstoqueItem;

const item = (material: string, quantidade: number) => ({ material, descricao: 'X', unidade: 'UN', quantidade });

describe('planejarBaixa', () => {
  const estoque = indexarEstoquePorDeposito([
    est('0004', '1437274', 5),
    est('0001', '1437274', 20),
    est('0004', '1291134', 2),
  ]);

  it('escolhe o depósito que cobre a quantidade, o de maior saldo', () => {
    const [l] = planejarBaixa([item('1437274', 8)], estoque, () => false);
    expect(l).toMatchObject({ deposito: '0001', saldoDeposito: 20, saldoTotal: 25, cobre: true });
  });

  it('casa o código com ou sem zeros à esquerda', () => {
    const [l] = planejarBaixa([item('0001437274', 3)], estoque, () => false);
    expect(l).toMatchObject({ material: '1437274', cobre: true });
  });

  it('sem saldo suficiente fica no de maior saldo e sinaliza', () => {
    const [l] = planejarBaixa([item('1291134', 4)], estoque, () => false);
    expect(l).toMatchObject({ deposito: '0004', saldoDeposito: 2, cobre: false });
  });

  it('item fora da ZL0024 vai para o depósito central sem saldo', () => {
    const [l] = planejarBaixa([item('9999999', 1)], estoque, () => false);
    expect(l).toMatchObject({ deposito: '0004', saldoDeposito: 0, saldoTotal: 0, cobre: false });
  });

  it('ignora depósito inativo', () => {
    const [l] = planejarBaixa([item('1437274', 8)], estoque, dep => dep === '0001');
    expect(l).toMatchObject({ deposito: '0004', cobre: false });
  });
});
