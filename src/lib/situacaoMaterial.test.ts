import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/supabaseClient', () => ({ supabase: {} }));

import { abaixoDoMinimo, documentoComItem, situacaoPedido } from './situacaoMaterial';

describe('situacaoPedido', () => {
  const hoje = '2026-10-26';

  it('sem pendência é recebido, mesmo com remessa vencida', () => {
    expect(situacaoPedido({ quantidade_pendente: 0, remessa_prevista: '2026-01-01' }, hoje)).toBe('recebido');
  });

  it('pendente com remessa passada é atrasado; hoje ou futura, aberto', () => {
    expect(situacaoPedido({ quantidade_pendente: 5, remessa_prevista: '2026-10-25' }, hoje)).toBe('atrasado');
    expect(situacaoPedido({ quantidade_pendente: 5, remessa_prevista: '2026-10-26' }, hoje)).toBe('aberto');
    expect(situacaoPedido({ quantidade_pendente: 5, remessa_prevista: null }, hoje)).toBe('aberto');
  });
});

describe('abaixoDoMinimo', () => {
  it('só avisa quando há mínimo cadastrado', () => {
    expect(abaixoDoMinimo({ saldo_total: 2, estoque_minimo: 5 })).toBe(true);
    expect(abaixoDoMinimo({ saldo_total: 5, estoque_minimo: 5 })).toBe(false);
    expect(abaixoDoMinimo({ saldo_total: 0, estoque_minimo: null })).toBe(false);
    expect(abaixoDoMinimo({ saldo_total: 0, estoque_minimo: 0 })).toBe(false);
  });
});

describe('documentoComItem', () => {
  it('junta documento e item sem zeros à esquerda', () => {
    expect(documentoComItem('1100339951', '00020')).toBe('1100339951/20');
    expect(documentoComItem('4100446757', '0')).toBe('4100446757');
    expect(documentoComItem('4100446757', null)).toBe('4100446757');
  });
});
