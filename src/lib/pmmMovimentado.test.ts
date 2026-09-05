import { describe, expect, it } from 'vitest';
import type { MB51Classificado } from '../types';
import { calcularPmmMovimentado, contaParaPmm, variacaoPmm } from './pmmMovimentado';

function mov(over: Partial<MB51Classificado> = {}): MB51Classificado {
  return {
    id: Math.floor(Math.random() * 1e9),
    doc_material: '5000001',
    material: '400001',
    qtd_um_registro: 10,
    montante_mi: 1000,
    data_lancamento: '2026-03-10',
    tipo_movimento: '101',
    descricao_tipo_movimento: 'Entrada por compra',
    categoria: 'compra' as MB51Classificado['categoria'],
    movimenta_estoque: true,
    sinal: 'entrada',
    ...over,
  };
}

describe('contaParaPmm', () => {
  it('aceita entrada real com valor', () => {
    expect(contaParaPmm(mov())).toBe(true);
  });

  it('recusa transferência interna (não movimenta estoque)', () => {
    expect(contaParaPmm(mov({ tipo_movimento: '311', movimenta_estoque: false }))).toBe(false);
  });

  it('recusa saída e entrada sem valor', () => {
    expect(contaParaPmm(mov({ qtd_um_registro: -5, montante_mi: -500, sinal: 'saida' }))).toBe(false);
    expect(contaParaPmm(mov({ montante_mi: 0 }))).toBe(false);
  });

  it('recusa linha sem material', () => {
    expect(contaParaPmm(mov({ material: null }))).toBe(false);
  });
});

describe('calcularPmmMovimentado', () => {
  it('faz média ponderada pela quantidade, não média simples', () => {
    const mapa = calcularPmmMovimentado([
      mov({ qtd_um_registro: 10, montante_mi: 1000 }),  // 100/un
      mov({ qtd_um_registro: 90, montante_mi: 18000 }), // 200/un
    ]);
    // Média simples daria 150; ponderada dá 190.
    expect(mapa.get('400001')?.pmm).toBeCloseTo(190);
    expect(mapa.get('400001')?.quantidade).toBe(100);
    expect(mapa.get('400001')?.entradas).toBe(2);
  });

  it('ignora transferências e saídas no cálculo', () => {
    const mapa = calcularPmmMovimentado([
      mov({ qtd_um_registro: 10, montante_mi: 1000 }),
      mov({ qtd_um_registro: 100, montante_mi: 100, tipo_movimento: '311', movimenta_estoque: false }),
      mov({ qtd_um_registro: -4, montante_mi: -400, sinal: 'saida' }),
    ]);
    expect(mapa.get('400001')?.pmm).toBeCloseTo(100);
    expect(mapa.get('400001')?.entradas).toBe(1);
  });

  it('normaliza o código: zeros à esquerda não criam material novo', () => {
    const mapa = calcularPmmMovimentado([
      mov({ material: '000000400001', qtd_um_registro: 10, montante_mi: 1000 }),
      mov({ material: '400001', qtd_um_registro: 10, montante_mi: 3000 }),
    ]);
    expect(mapa.size).toBe(1);
    expect(mapa.get('400001')?.pmm).toBeCloseTo(200);
  });

  it('guarda a primeira e a última entrada por data ISO', () => {
    const mapa = calcularPmmMovimentado([
      mov({ data_lancamento: '2026-07-31' }),
      mov({ data_lancamento: '2026-08-01' }),
      mov({ data_lancamento: '2026-02-05' }),
    ]);
    expect(mapa.get('400001')?.primeiraEntrada).toBe('2026-02-05');
    expect(mapa.get('400001')?.ultimaEntrada).toBe('2026-08-01');
  });

  it('material sem entrada válida não aparece no mapa', () => {
    const mapa = calcularPmmMovimentado([mov({ material: '500002', montante_mi: 0 })]);
    expect(mapa.has('500002')).toBe(false);
  });
});

describe('variacaoPmm', () => {
  it('devolve a fração assinada sobre o PMM do SAP', () => {
    expect(variacaoPmm(100, 135)).toBeCloseTo(0.35);
    expect(variacaoPmm(100, 80)).toBeCloseTo(-0.2);
  });

  it('sem um dos lados não há variação', () => {
    expect(variacaoPmm(0, 100)).toBeNull();
    expect(variacaoPmm(100, null)).toBeNull();
    expect(variacaoPmm(null, null)).toBeNull();
  });
});
