import { describe, expect, it } from 'vitest';
import {
  calcularConsumoMovimentos,
  calcularFaixaPlanilha,
  contarDiasUteis,
  deduplicarControleEstoque,
} from './controleEstoque';

describe('controleEstoque', () => {
  it('reproduz a faixa operacional da planilha', () => {
    expect(calcularFaixaPlanilha({
      consumoTotal: 151,
      diasUteis: 151,
      leadTimeDias: 15,
      intervaloCompraDias: 30,
      saldoAtual: 60,
      precoUnitario: 10,
      quantidadePorTorre: 4,
    })).toEqual({
      consumoDia: 1,
      estoqueMinimo: 45,
      estoqueMaximo: 90,
      quantidadeComprar: 30,
      valorComprar: 300,
      status: 'ALERTA',
      coberturaDias: 60,
      autonomiaTorres: 15,
      origemMinimo: 'CALCULADO',
      origemMaximo: 'CALCULADO',
    });
  });

  it('conta dias uteis de forma inclusiva como o NETWORKDAYS', () => {
    expect(contarDiasUteis('2026-03-03', '2026-09-29')).toBe(151);
    expect(contarDiasUteis('2026-09-26', '2026-09-27')).toBe(0);
    expect(contarDiasUteis('2026-09-30', '2026-09-29')).toBeNull();
  });

  it('calcula entrada e consumo liquidos pelos TMVs usados na planilha', () => {
    expect(calcularConsumoMovimentos([
      { tipoMovimento: '101', quantidade: 20 },
      { tipoMovimento: '102', quantidade: -5 },
      { tipoMovimento: '221', quantidade: -10 },
      { tipoMovimento: '222', quantidade: 2 },
      { tipoMovimento: '311', quantidade: -5 },
      { tipoMovimento: '312', quantidade: 1 },
      { tipoMovimento: '601', quantidade: -99 },
    ])).toEqual({
      entrada: 15,
      baixaDireta: 8,
      producao: 4,
      consumo: 12,
    });
  });

  it.each([
    [44, 'CRITICO'],
    [45, 'ALERTA'],
    [89.99, 'ALERTA'],
    [90, 'OK'],
  ] as const)('classifica saldo %s como %s nos limites da faixa', (saldoAtual, status) => {
    expect(calcularFaixaPlanilha({
      consumoTotal: 151,
      diasUteis: 151,
      leadTimeDias: 15,
      intervaloCompraDias: 30,
      saldoAtual,
      precoUnitario: 10,
      quantidadePorTorre: 4,
    }).status).toBe(status);
  });

  it('nunca sugere compra negativa', () => {
    expect(calcularFaixaPlanilha({
      consumoTotal: 151,
      diasUteis: 151,
      leadTimeDias: 15,
      intervaloCompraDias: 30,
      saldoAtual: 120,
      precoUnitario: 10,
      quantidadePorTorre: 4,
    }).quantidadeComprar).toBe(0);
  });

  it('preserva null quando cobertura, autonomia ou a propria faixa estao indisponiveis', () => {
    const semConsumo = calcularFaixaPlanilha({
      consumoTotal: 0,
      diasUteis: 151,
      leadTimeDias: 15,
      intervaloCompraDias: 30,
      saldoAtual: 10,
      precoUnitario: null,
      quantidadePorTorre: null,
    });

    expect(semConsumo.coberturaDias).toBeNull();
    expect(semConsumo.autonomiaTorres).toBeNull();
    expect(semConsumo.valorComprar).toBeNull();

    expect(calcularFaixaPlanilha({
      consumoTotal: 10,
      diasUteis: 0,
      leadTimeDias: 15,
      intervaloCompraDias: 30,
      saldoAtual: 10,
      precoUnitario: 2,
      quantidadePorTorre: 1,
    })).toMatchObject({
      consumoDia: null,
      estoqueMinimo: null,
      estoqueMaximo: null,
      quantidadeComprar: null,
      status: 'SEM_DADOS',
    });
  });

  it('aplica minimo e maximo manuais sem ocultar sua origem', () => {
    expect(calcularFaixaPlanilha({
      consumoTotal: 151,
      diasUteis: 151,
      leadTimeDias: 15,
      intervaloCompraDias: 30,
      saldoAtual: 60,
      precoUnitario: 10,
      quantidadePorTorre: 4,
      estoqueMinimoManual: 70,
      estoqueMaximoManual: 100,
    })).toMatchObject({
      estoqueMinimo: 70,
      estoqueMaximo: 100,
      quantidadeComprar: 40,
      valorComprar: 400,
      status: 'CRITICO',
      origemMinimo: 'OVERRIDE',
      origemMaximo: 'OVERRIDE',
    });
  });

  it('consolida materiais duplicados sem perder o detalhe dos depositos', () => {
    const resultado = deduplicarControleEstoque([
      {
        material: '000000001234',
        descricao: 'PARAFUSO',
        deposito: '0001',
        saldoAtual: 10,
        valorEstoque: 100,
      },
      {
        material: '000000001234',
        descricao: 'PARAFUSO',
        deposito: '0002',
        saldoAtual: 5,
        valorEstoque: 50,
      },
      {
        material: '000000009999',
        descricao: 'PORCA',
        deposito: '0001',
        saldoAtual: 2,
        valorEstoque: 8,
      },
    ]);

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toMatchObject({
      material: '000000001234',
      saldoAtual: 15,
      valorEstoque: 150,
      quantidadeDepositos: 2,
    });
    expect(resultado[0].depositos).toEqual([
      { deposito: '0001', saldoAtual: 10, valorEstoque: 100 },
      { deposito: '0002', saldoAtual: 5, valorEstoque: 50 },
    ]);
  });
});
