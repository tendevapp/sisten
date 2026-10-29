import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/supabaseClient', () => ({ supabase: {} }));

import { dataImportacaoEstoque, planejarBaixa, prontidaoRegularizacao } from './retiradaSemSaldoBaixa';
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

describe('prontidaoRegularizacao', () => {
  const reg = (id: string, data: string, itens: ReturnType<typeof item>[], status: 'PENDENTE' | 'REGULARIZADA' = 'PENDENTE') =>
    ({ id, status, data, created_at: `${data}T08:00:00Z`, itens });
  const estoque = indexarEstoquePorDeposito([
    est('0004', '1437274', 10),
    est('0001', '1291134', 3),
  ]);

  it('pronta quando todo item tem saldo, parcial com parte, aguardando sem nenhum', () => {
    const m = prontidaoRegularizacao([
      reg('a', '2026-10-01', [item('1437274', 4)]),
      reg('b', '2026-10-02', [item('1291134', 2), item('9999999', 1)]),
      reg('c', '2026-10-03', [item('9999999', 1)]),
    ], estoque, () => false);
    expect(m.get('a')).toEqual({ prontidao: 'pronta', itensComSaldo: 1, totalItens: 1 });
    expect(m.get('b')).toEqual({ prontidao: 'parcial', itensComSaldo: 1, totalItens: 2 });
    expect(m.get('c')?.prontidao).toBe('aguardando');
  });

  it('o saldo vai para a saída mais antiga — a mais nova não conta com a mesma quantidade', () => {
    const m = prontidaoRegularizacao([
      reg('nova', '2026-10-05', [item('1437274', 6)]),
      reg('antiga', '2026-10-01', [item('1437274', 6)]),
    ], estoque, () => false);
    expect(m.get('antiga')?.prontidao).toBe('pronta');
    expect(m.get('nova')?.prontidao).toBe('aguardando');
  });

  it('item que não cabe não consome saldo; regularizada fica de fora', () => {
    const m = prontidaoRegularizacao([
      reg('feita', '2026-09-30', [item('1437274', 10)], 'REGULARIZADA'),
      reg('grande', '2026-10-01', [item('1437274', 50)]),
      reg('pequena', '2026-10-02', [item('0001437274', 10)]),
    ], estoque, () => false);
    expect(m.has('feita')).toBe(false);
    expect(m.get('grande')?.prontidao).toBe('aguardando');
    expect(m.get('pequena')?.prontidao).toBe('pronta');
  });

  it('cada item precisa caber num depósito só', () => {
    const dividido = indexarEstoquePorDeposito([est('0004', '1437274', 5), est('0001', '1437274', 5)]);
    const m = prontidaoRegularizacao([reg('a', '2026-10-01', [item('1437274', 8)])], dividido, () => false);
    expect(m.get('a')?.prontidao).toBe('aguardando');
  });
});

describe('dataImportacaoEstoque', () => {
  it('pega a importação mais recente', () => {
    expect(dataImportacaoEstoque([{ imported_at: '2026-10-28T10:00:00Z' }, { imported_at: '2026-10-29T07:30:00Z' }, {}]))
      .toBe('2026-10-29T07:30:00Z');
    expect(dataImportacaoEstoque([])).toBeNull();
  });
});
