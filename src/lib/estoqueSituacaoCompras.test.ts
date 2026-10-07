import { describe, expect, it } from 'vitest';
import {
  calcularSituacaoEstoque,
  indexarSituacoesEstoque,
  situacaoEstoqueDoMaterial,
} from './estoqueSituacaoCompras';

// consumo 150 em 150 dias úteis = 1/dia; lead 15 + intervalo 30 → mínimo 45, máximo 90.
const item = (extra: Record<string, unknown> = {}) => ({
  material: '1355905', umb: 'UN', saldo_reposicao: 100, consumo_total: 150, dias_uteis: 150,
  lead_time_dias: 15, intervalo_compra_dias: 30, preco_medio_sap: 10, quantidade_por_torre: null,
  estoque_minimo_override: null, estoque_maximo_override: null,
  ultimo_movimento: '2026-09-20', ultimo_movimento_geral: '2026-09-20',
  ...extra,
}) as Parameters<typeof calcularSituacaoEstoque>[0] & { material: string };

describe('estoqueSituacaoCompras', () => {
  it('classifica pela faixa do Controle de Estoque', () => {
    expect(calcularSituacaoEstoque(item()).tag).toBeNull();
    expect(calcularSituacaoEstoque(item({ saldo_reposicao: 60 })).tag).toBe('ALERTA');
    expect(calcularSituacaoEstoque(item({ saldo_reposicao: 10 }))).toMatchObject({ tag: 'CRITICO', minimo: 45, maximo: 90 });
  });

  it('estoque zero vence o crítico', () => {
    expect(calcularSituacaoEstoque(item({ saldo_reposicao: 0 })).tag).toBe('ZERO');
  });

  it('zerado sem consumo na janela, mas que já movimentou, também é estoque zero', () => {
    expect(calcularSituacaoEstoque(item({ saldo_reposicao: 0, consumo_total: 0, ultimo_movimento: null })).tag).toBe('ZERO');
  });

  it('compra direta que nunca passou pelo estoque não ganha tag', () => {
    expect(calcularSituacaoEstoque(item({
      saldo_reposicao: 0, consumo_total: 0, ultimo_movimento: null, ultimo_movimento_geral: null,
    })).tag).toBeNull();
  });

  it('respeita o mínimo cadastrado à mão', () => {
    expect(calcularSituacaoEstoque(item({ saldo_reposicao: 100, estoque_minimo_override: 120, estoque_maximo_override: 200 })).tag).toBe('CRITICO');
  });

  it('casa o código com ou sem zeros à esquerda e fica com o centro mais grave', () => {
    const mapa = indexarSituacoesEstoque([item({ material: '000000000001355905' }), item({ saldo_reposicao: 0 })]);
    expect(situacaoEstoqueDoMaterial(mapa, '1355905')?.tag).toBe('ZERO');
    expect(situacaoEstoqueDoMaterial(mapa, '0001355905')?.tag).toBe('ZERO');
    expect(situacaoEstoqueDoMaterial(mapa, '999')).toBeNull();
  });
});
