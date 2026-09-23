import { describe, expect, it } from 'vitest';
import {
  agruparHistoricoPreco,
  acumularValoresPorPeriodo,
  calcularPrecoUnitarioFiscal,
  chaveFornecedorItem,
  periodoDoAgrupamento,
  resumirFornecedorItem,
  rotuloSemanaISO,
  statusPagamentoRastreado,
} from './finFornecedorItem';

describe('calcularPrecoUnitarioFiscal', () => {
  it('prioriza o preco liquido e usa total por quantidade somente como fallback', () => {
    expect(calcularPrecoUnitarioFiscal({ precoLiquido: 12.5, total: 100, quantidade: 4 })).toBe(12.5);
    expect(calcularPrecoUnitarioFiscal({ precoLiquido: null, total: 100, quantidade: 4 })).toBe(25);
    expect(calcularPrecoUnitarioFiscal({ precoLiquido: 0, total: 100, quantidade: 0 })).toBeNull();
  });
});

describe('chaveFornecedorItem', () => {
  it('gera uma chave estável para selecionar e expandir o resumo', () => {
    expect(chaveFornecedorItem('100', 'MAT-1')).toBe('100::MAT-1');
  });
});

describe('agruparHistoricoPreco', () => {
  const linhas = [
    { dataDocumento: '2026-03-02', precoUnitario: 10, quantidade: 2, numeroNf: '1' },
    { dataDocumento: '2026-03-02', precoUnitario: 20, quantidade: 8, numeroNf: '2' },
    { dataDocumento: '2026-03-09', precoUnitario: 30, quantidade: 1, numeroNf: '3' },
  ];

  it('agrega por dia com preço ponderado pela quantidade', () => {
    expect(agruparHistoricoPreco(linhas, 'dia')).toEqual([
      { periodo: '2026-03-02', precoUnitario: 18, quantidade: 10, qtdNfs: 2 },
      { periodo: '2026-03-09', precoUnitario: 30, quantidade: 1, qtdNfs: 1 },
    ]);
  });

  it('consolida por semana e por mês', () => {
    expect(agruparHistoricoPreco(linhas, 'semana')).toHaveLength(2);
    expect(agruparHistoricoPreco(linhas, 'mes')).toEqual([
      { periodo: '2026-03', precoUnitario: 210 / 11, quantidade: 11, qtdNfs: 3 },
    ]);
  });
});

describe('rotuloSemanaISO', () => {
  it('usa a numeração ISO abreviada no padrão W34', () => {
    expect(rotuloSemanaISO('2026-08-17')).toBe('W34');
    expect(rotuloSemanaISO('2026-12-28')).toBe('W53');
  });
});

describe('periodoDoAgrupamento', () => {
  it('normaliza a data na chave usada pelos graficos e pelo detalhamento', () => {
    expect(periodoDoAgrupamento('2026-08-19', 'dia')).toBe('2026-08-19');
    expect(periodoDoAgrupamento('2026-08-19', 'semana')).toBe('2026-08-17');
    expect(periodoDoAgrupamento('2026-08-19', 'mes')).toBe('2026-08');
  });
});

describe('acumularValoresPorPeriodo', () => {
  it('soma faturado e pago por período antes de calcular o acumulado', () => {
    expect(acumularValoresPorPeriodo([
      { dataDocumento: '2026-03-02', valorFaturado: 100, valorPagoRastreado: 20 },
      { dataDocumento: '2026-03-02', valorFaturado: 50, valorPagoRastreado: 10 },
      { dataDocumento: '2026-03-09', valorFaturado: 200, valorPagoRastreado: 100 },
    ], 'semana')).toEqual([
      { periodo: '2026-03-02', valorFaturado: 150, valorPagoRastreado: 30, faturadoAcumulado: 150, pagoAcumulado: 30 },
      { periodo: '2026-03-09', valorFaturado: 200, valorPagoRastreado: 100, faturadoAcumulado: 350, pagoAcumulado: 130 },
    ]);
  });
});

describe('statusPagamentoRastreado', () => {
  it('distingue pagamento parcial, total e excedente sem ocultar a diferenca', () => {
    expect(statusPagamentoRastreado(100, null)).toBe('SEM_VINCULO_FBL1N');
    expect(statusPagamentoRastreado(100, 40)).toBe('PAGO_PARCIAL');
    expect(statusPagamentoRastreado(100, 100)).toBe('PAGO_TOTAL');
    expect(statusPagamentoRastreado(100, 100.02)).toBe('PAGAMENTO_SUPERIOR_A_NF');
  });
});

describe('resumirFornecedorItem', () => {
  it('agrupa fornecedor e item, soma o valor pago rateado e calcula a variacao pelo ultimo preco', () => {
    const resumo = resumirFornecedorItem([
      {
        id: 1,
        fornecedorCodigo: '100',
        fornecedorNome: 'Fornecedor A',
        itemChave: 'MAT-1',
        descricaoItem: 'Material 1',
        tipoItem: 'MATERIAL',
        dataDocumento: '2026-01-10',
        quantidade: 10,
        valorItemNf: 100,
        valorPagoRateado: 100,
        precoUnitario: 10,
        numeroNf: '1',
        statusPagamento: 'PAGO_TOTAL',
      },
      {
        id: 2,
        fornecedorCodigo: '100',
        fornecedorNome: 'Fornecedor A',
        itemChave: 'MAT-1',
        descricaoItem: 'Material 1',
        tipoItem: 'MATERIAL',
        dataDocumento: '2026-02-10',
        quantidade: 10,
        valorItemNf: 120,
        valorPagoRateado: 60,
        precoUnitario: 12,
        numeroNf: '2',
        statusPagamento: 'PAGO_PARCIAL',
      },
    ]);

    expect(resumo).toHaveLength(1);
    expect(resumo[0]).toMatchObject({
      fornecedorCodigo: '100',
      itemChave: 'MAT-1',
      quantidade: 20,
      valorFaturado: 220,
      valorPagoRastreado: 160,
      precoUnitarioAtual: 12,
      precoUnitarioAnterior: 10,
      qtdNfs: 2,
    });
    expect(resumo[0].variacaoPrecoPct).toBeCloseTo(20);
  });
});
