import { describe, expect, it } from 'vitest';
import { chaveApontamento, diferencaApontamento, posicoesParaContar, situacaoApontamento, ultimoApontamentoPorChave, type ApontamentoSimulacao } from './apontamentoSimulacao';
import type { PosicaoSimulada } from './simulacaoBaixas';

const pos = (o: Partial<PosicaoSimulada>): PosicaoSimulada => ({
  material: '1047385', descricao: 'ARAME', deposito: '0001', unidade: 'KG', saidas: 450, entradas: 0, saldo: 3810, esperado: 3360, casos: [], ...o,
});

describe('apontamento da simulação de baixas', () => {
  it('tira o que não tem saldo na ZL0024 e o EPI do Book', () => {
    const r = posicoesParaContar([
      pos({}),
      pos({ material: '1194263', saldo: null, esperado: null }),
      pos({ material: '1133360', saldo: 0, esperado: -160 }),
      pos({ material: '1355906', saldo: 20, esperado: 18 }),
      pos({ material: '2000001', deposito: '0105' }),
      pos({ material: '2000002', deposito: '6' }),
    ], new Set(['1355906']));
    expect(r.contar.map(p => p.material)).toEqual(['1047385']);
    expect(r).toMatchObject({ semSaldo: 2, epi: 1, deposito: 2 });
  });

  it('situação e diferença', () => {
    expect(situacaoApontamento(3360, undefined)).toBe('contar');
    expect(situacaoApontamento(3360, 3360)).toBe('coincide');
    expect(situacaoApontamento(3360, 3359.5)).toBe('diferenca');
    expect(diferencaApontamento(3360, 3359.5)).toBe(-0.5);
    expect(diferencaApontamento(null, 2)).toBeNull();
    expect(chaveApontamento(pos({}))).toBe('1047385|0001|KG');
  });

  it('reimportar a ZL0024 não perde a contagem: vale a mais recente de qualquer corte', () => {
    const a = (zl: string, contado: number, em: string): ApontamentoSimulacao => ({ zl_em: zl, material: '1047385', deposito: '0001', unidade: 'KG',
      descricao: null, posicao: null, esperado: 10, contado, observacao: null, contado_por_nome: null, contado_em: em });
    const m = ultimoApontamentoPorChave([a('2026-11-19T12:51', 8, '2026-11-19T13:00'), a('2026-11-19T14:43', 9, '2026-11-19T15:00'), a('2026-11-18T10:00', 7, '2026-11-18T11:00')]);
    expect(m.size).toBe(1);
    expect(m.get('1047385|0001|KG')?.contado).toBe(9);
  });
});
