import { describe, it, expect } from 'vitest';
import {
  classificarCobertura, resumirCobertura, faixaIdadeDe, resumirIdade,
  resumirPermanencia, resumirEstoqueMorto, formatCobertura, mediana,
  conciliarComZl0024,
  COBERTURA_EXCESSO_DIAS, COBERTURA_RUPTURA_DIAS,
} from './giroEstoque';
import { isProjetoItem } from './almoxarifado';
import { EstoqueGiro, EstoqueCamadaFifo } from '../types';

const giro = (over: Partial<EstoqueGiro>): EstoqueGiro => ({
  material: '1000001',
  saldo_atual: 100,
  valor_estoque: 1000,
  sem_consumo_na_janela: false,
  legado_intocado: false,
  ...over,
});

const camada = (over: Partial<EstoqueCamadaFifo>): EstoqueCamadaFifo => ({
  material: '1000001',
  legado: false,
  qtd_remanescente: 10,
  valor_remanescente: 100,
  classe_permanencia: 'em_estoque',
  ...over,
});

describe('classificarCobertura', () => {
  it('trata sem consumo antes de qualquer faixa de dias', () => {
    // Sem consumo, cobertura é nula: cair em "excesso" misturaria
    // "gira devagar" com "não gira", que são problemas diferentes.
    expect(classificarCobertura(giro({ sem_consumo_na_janela: true, cobertura_dias: null })))
      .toBe('sem_consumo');
  });

  it('trata cobertura nula como sem consumo mesmo sem a flag', () => {
    expect(classificarCobertura(giro({ cobertura_dias: null }))).toBe('sem_consumo');
    expect(classificarCobertura(giro({ cobertura_dias: undefined }))).toBe('sem_consumo');
  });

  it('classifica ruptura, saudável e excesso pelos limiares', () => {
    expect(classificarCobertura(giro({ cobertura_dias: 5 }))).toBe('ruptura');
    expect(classificarCobertura(giro({ cobertura_dias: 100 }))).toBe('saudavel');
    expect(classificarCobertura(giro({ cobertura_dias: 500 }))).toBe('excesso');
  });

  it('usa fronteiras fechadas: o limiar exato é saudável dos dois lados', () => {
    expect(classificarCobertura(giro({ cobertura_dias: COBERTURA_RUPTURA_DIAS }))).toBe('saudavel');
    expect(classificarCobertura(giro({ cobertura_dias: COBERTURA_RUPTURA_DIAS - 0.1 }))).toBe('ruptura');
    expect(classificarCobertura(giro({ cobertura_dias: COBERTURA_EXCESSO_DIAS }))).toBe('saudavel');
    expect(classificarCobertura(giro({ cobertura_dias: COBERTURA_EXCESSO_DIAS + 0.1 }))).toBe('excesso');
  });
});

describe('resumirCobertura', () => {
  it('devolve as quatro situações mesmo quando vazias, para o gráfico não saltar', () => {
    const r = resumirCobertura([]);
    expect(r).toHaveLength(4);
    expect(r.every(x => x.materiais === 0 && x.valor === 0)).toBe(true);
  });

  it('soma materiais e valor por situação', () => {
    const r = resumirCobertura([
      giro({ cobertura_dias: 5, valor_estoque: 100 }),
      giro({ cobertura_dias: 8, valor_estoque: 200 }),
      giro({ cobertura_dias: 500, valor_estoque: 900 }),
      giro({ sem_consumo_na_janela: true, cobertura_dias: null, valor_estoque: 50 }),
    ]);
    const por = (s: string) => r.find(x => x.situacao === s)!;
    expect(por('ruptura')).toMatchObject({ materiais: 2, valor: 300 });
    expect(por('excesso')).toMatchObject({ materiais: 1, valor: 900 });
    expect(por('sem_consumo')).toMatchObject({ materiais: 1, valor: 50 });
  });
});

describe('faixaIdadeDe', () => {
  it('manda camada legada para a faixa própria, nunca para uma faixa de dias', () => {
    // O estoque anterior à reabertura tem idade real de ~3 anos; jogá-lo em
    // "180+" seria verdade mas subestimaria muito o problema.
    expect(faixaIdadeDe(camada({ legado: true, dias_em_estoque: null }))).toBe('legado');
  });

  it('não deixa camada legada escapar mesmo com dias preenchidos', () => {
    expect(faixaIdadeDe(camada({ legado: true, dias_em_estoque: 10 }))).toBe('legado');
  });

  it('classifica pelas faixas de dias', () => {
    expect(faixaIdadeDe(camada({ dias_em_estoque: 0 }))).toBe('0-30');
    expect(faixaIdadeDe(camada({ dias_em_estoque: 30 }))).toBe('0-30');
    expect(faixaIdadeDe(camada({ dias_em_estoque: 31 }))).toBe('31-60');
    expect(faixaIdadeDe(camada({ dias_em_estoque: 90 }))).toBe('61-90');
    expect(faixaIdadeDe(camada({ dias_em_estoque: 180 }))).toBe('91-180');
    expect(faixaIdadeDe(camada({ dias_em_estoque: 181 }))).toBe('180+');
  });

  it('sem dias e sem flag cai no legado, não numa faixa inventada', () => {
    expect(faixaIdadeDe(camada({ legado: false, dias_em_estoque: null }))).toBe('legado');
  });
});

describe('resumirIdade', () => {
  it('ignora camadas já consumidas', () => {
    const r = resumirIdade([
      camada({ qtd_remanescente: 0, valor_remanescente: 0, dias_em_estoque: 10 }),
      camada({ qtd_remanescente: 5, valor_remanescente: 50, dias_em_estoque: 10 }),
    ]);
    expect(r.find(x => x.faixa === '0-30')!.camadas).toBe(1);
    expect(r.find(x => x.faixa === '0-30')!.quantidade).toBe(5);
  });

  it('conta materiais distintos, não camadas', () => {
    const r = resumirIdade([
      camada({ material: 'A', dias_em_estoque: 10 }),
      camada({ material: 'A', dias_em_estoque: 20 }),
      camada({ material: 'B', dias_em_estoque: 15 }),
    ]);
    const f = r.find(x => x.faixa === '0-30')!;
    expect(f.camadas).toBe(3);
    expect(f.materiais).toBe(2);
  });

  it('devolve as faixas em ordem, com o legado por último', () => {
    const r = resumirIdade([]);
    expect(r.map(x => x.faixa)).toEqual(['0-30', '31-60', '61-90', '91-180', '180+', 'legado']);
    expect(r[r.length - 1].legado).toBe(true);
  });
});

describe('resumirPermanencia', () => {
  it('ordena por acionabilidade, com antecipada na frente', () => {
    const r = resumirPermanencia([
      camada({ classe_permanencia: 'cross_dock', dias_permanencia: 2 }),
      camada({ classe_permanencia: 'antecipada', dias_permanencia: 120 }),
    ]);
    expect(r[0].classe).toBe('antecipada');
  });

  it('calcula a mediana de dias por classe', () => {
    const r = resumirPermanencia([
      camada({ classe_permanencia: 'cross_dock', dias_permanencia: 1 }),
      camada({ classe_permanencia: 'cross_dock', dias_permanencia: 3 }),
      camada({ classe_permanencia: 'cross_dock', dias_permanencia: 7 }),
    ]);
    expect(r[0].medianaDias).toBe(3);
  });

  it('deixa a mediana nula quando a classe não tem dias medidos', () => {
    const r = resumirPermanencia([
      camada({ classe_permanencia: 'legado_pre_reabertura', dias_permanencia: null }),
    ]);
    expect(r[0].medianaDias).toBeNull();
  });

  it('omite classes sem nenhuma camada', () => {
    const r = resumirPermanencia([camada({ classe_permanencia: 'cross_dock', dias_permanencia: 2 })]);
    expect(r).toHaveLength(1);
  });
});

describe('resumirEstoqueMorto', () => {
  it('separa sem-consumo de intocado, que é o subconjunto pior', () => {
    const r = resumirEstoqueMorto([
      giro({ sem_consumo_na_janela: true, legado_intocado: true, valor_estoque: 500 }),
      giro({ sem_consumo_na_janela: true, legado_intocado: false, valor_estoque: 300 }),
      giro({ valor_estoque: 200 }),
    ]);
    expect(r.materiaisSemConsumo).toBe(2);
    expect(r.valorSemConsumo).toBe(800);
    expect(r.materiaisIntocados).toBe(1);
    expect(r.valorIntocado).toBe(500);
    expect(r.valorTotal).toBe(1000);
  });
});

describe('mediana', () => {
  it('devolve nulo para lista vazia em vez de zero', () => {
    // Zero seria lido como "consumido no mesmo dia", que é o oposto de
    // "não há medida".
    expect(mediana([])).toBeNull();
  });

  it('calcula em listas ímpares e pares', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('conciliarComZl0024', () => {
  it('fecha quando toda camada com saldo tem material no ZL0024', () => {
    const r = conciliarComZl0024(
      [camada({ material: 'A', qtd_remanescente: 10 })],
      [giro({ material: 'A', saldo_atual: 10 })]
    );
    expect(r.fecha).toBe(true);
    expect(r.materiaisConciliados).toBe(1);
    expect(r.qtdConciliada).toBe(10);
    expect(r.materiaisSemSaldo).toBe(0);
  });

  it('acusa camada com saldo cujo material não está no ZL0024', () => {
    // Foi exatamente este caso — compra direta para projeto — que inflou o
    // FIFO em R$ 851 mil antes da auditoria.
    const r = conciliarComZl0024(
      [camada({ material: 'FANTASMA', qtd_remanescente: 40, valor_remanescente: 900 })],
      [giro({ material: 'A', saldo_atual: 10 })]
    );
    expect(r.fecha).toBe(false);
    expect(r.materiaisSemSaldo).toBe(1);
    expect(r.qtdSemSaldo).toBe(40);
    expect(r.valorSemSaldo).toBe(900);
  });

  it('ignora camadas já consumidas ao conciliar', () => {
    // Camada zerada não representa saldo, então não pode ser cobrada do ZL0024.
    const r = conciliarComZl0024(
      [camada({ material: 'FANTASMA', qtd_remanescente: 0, valor_remanescente: 0 })],
      [giro({ material: 'A' })]
    );
    expect(r.fecha).toBe(true);
  });

  it('conta materiais distintos, não camadas', () => {
    const r = conciliarComZl0024(
      [
        camada({ material: 'A', qtd_remanescente: 5 }),
        camada({ material: 'A', qtd_remanescente: 5 }),
      ],
      [giro({ material: 'A', saldo_atual: 10 })]
    );
    expect(r.materiaisConciliados).toBe(1);
    expect(r.qtdConciliada).toBe(10);
  });
});

describe('isProjetoItem (filtro projeto/consumo)', () => {
  it('reconhece o código longo de projeto usado na MB51', () => {
    expect(isProjetoItem('100000000000044436')).toBe(true);
  });

  it('trata item de consumo de 7 dígitos como não-projeto', () => {
    expect(isProjetoItem('1020179')).toBe(false);
    expect(isProjetoItem('1371231')).toBe(false);
  });

  it('ignora zeros à esquerda antes de decidir', () => {
    expect(isProjetoItem('000100000123')).toBe(true);
  });

  it('não quebra com vazio, nulo ou travessão', () => {
    expect(isProjetoItem('')).toBe(false);
    expect(isProjetoItem(null)).toBe(false);
    expect(isProjetoItem(undefined)).toBe(false);
    expect(isProjetoItem('—')).toBe(false);
  });
});

describe('formatCobertura', () => {
  it('mostra travessão quando não há cobertura calculável', () => {
    expect(formatCobertura(null)).toBe('—');
    expect(formatCobertura(undefined)).toBe('—');
  });

  it('passa a anos acima de um ano e satura em 10+', () => {
    expect(formatCobertura(30)).toBe('30 dias');
    expect(formatCobertura(730)).toBe('2.0 anos');
    expect(formatCobertura(99999)).toBe('10+ anos');
  });
});
