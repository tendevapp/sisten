import { describe, expect, it } from 'vitest';
import {
  agruparPorData, diasNoIntervalo, intervaloDoPeriodo, navegarPeriodo, rotuloDia, rotuloPeriodo, testeCombinaBusca,
} from './alcoolemiaPeriodo';

describe('intervaloDoPeriodo', () => {
  it('dia é a própria data', () => {
    expect(intervaloDoPeriodo('dia', '2026-10-30')).toEqual({ inicio: '2026-10-30', fim: '2026-10-30' });
  });

  it('semana vai de segunda a domingo', () => {
    // 30/10/2026 é sexta
    expect(intervaloDoPeriodo('semana', '2026-10-30')).toEqual({ inicio: '2026-10-26', fim: '2026-11-01' });
    // domingo fica na semana que começou na segunda anterior
    expect(intervaloDoPeriodo('semana', '2026-11-01')).toEqual({ inicio: '2026-10-26', fim: '2026-11-01' });
    expect(intervaloDoPeriodo('semana', '2026-10-26')).toEqual({ inicio: '2026-10-26', fim: '2026-11-01' });
  });

  it('mês cobre do dia 1 ao último dia, inclusive fevereiro', () => {
    expect(intervaloDoPeriodo('mes', '2026-10-30')).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' });
    expect(intervaloDoPeriodo('mes', '2028-02-10')).toEqual({ inicio: '2028-02-01', fim: '2028-02-29' });
  });

  it('período reordena datas trocadas', () => {
    expect(intervaloDoPeriodo('periodo', '2026-10-30', '2026-10-20', '2026-10-05')).toEqual({ inicio: '2026-10-05', fim: '2026-10-20' });
    expect(intervaloDoPeriodo('periodo', '2026-10-30', '2026-10-20')).toEqual({ inicio: '2026-10-20', fim: '2026-10-20' });
  });
});

describe('navegarPeriodo', () => {
  it('anda por dia, semana e mês', () => {
    expect(navegarPeriodo('dia', '2026-10-31', 1)).toBe('2026-11-01');
    expect(navegarPeriodo('semana', '2026-10-30', -1)).toBe('2026-10-23');
    expect(navegarPeriodo('mes', '2026-01-31', 1)).toBe('2026-02-01');
    expect(navegarPeriodo('mes', '2026-01-15', -1)).toBe('2025-12-01');
  });
});

describe('rotuloPeriodo', () => {
  it('descreve o intervalo', () => {
    expect(rotuloPeriodo('dia', { inicio: '2026-10-30', fim: '2026-10-30' }, '2026-10-30')).toBe('Hoje, 30/10');
    expect(rotuloPeriodo('dia', { inicio: '2026-10-29', fim: '2026-10-29' }, '2026-10-30')).toBe('29/10/2026');
    expect(rotuloPeriodo('semana', { inicio: '2026-10-26', fim: '2026-11-01' }, '2026-10-30')).toBe('26/10 a 01/11');
    expect(rotuloPeriodo('mes', { inicio: '2026-10-01', fim: '2026-10-31' }, '2026-10-30')).toBe('outubro de 2026');
    expect(rotuloPeriodo('periodo', { inicio: '2025-12-20', fim: '2026-01-05' }, '2026-10-30')).toBe('20/12/2025 a 05/01/2026');
  });

  it('nomeia o dia do grupo', () => {
    expect(rotuloDia('2026-10-30', '2026-10-30')).toBe('Hoje');
    expect(rotuloDia('2026-10-29', '2026-10-30')).toBe('Ontem');
    expect(rotuloDia('2026-10-26', '2026-10-30')).toBe('segunda, 26/10');
  });

  it('conta os dias com as duas pontas', () => {
    expect(diasNoIntervalo({ inicio: '2026-10-01', fim: '2026-10-31' })).toBe(31);
    expect(diasNoIntervalo({ inicio: '2026-10-30', fim: '2026-10-30' })).toBe(1);
  });
});

describe('testeCombinaBusca', () => {
  const t = { nome: 'ANDRÉ MURITIBA ARAÚJO', matricula: '173019586', empresa: 'TEN', cargo_funcao: 'COORDENADOR DE COMPRAS', codigo_formulario: 'ALC-301026-01' };

  it('acha sem acento e fora de ordem', () => {
    expect(testeCombinaBusca(t, 'araujo andre')).toBe(true);
    expect(testeCombinaBusca(t, 'muritiba')).toBe(true);
  });

  it('acha por matrícula e código', () => {
    expect(testeCombinaBusca(t, '1730')).toBe(true);
    expect(testeCombinaBusca(t, 'alc-301026')).toBe(true);
  });

  it('exige todos os termos', () => {
    expect(testeCombinaBusca(t, 'andre silva')).toBe(false);
  });

  it('busca vazia passa tudo', () => {
    expect(testeCombinaBusca(t, '   ')).toBe(true);
  });
});

describe('agruparPorData', () => {
  it('agrupa na ordem recebida', () => {
    const grupos = agruparPorData([{ data: '2026-10-30' }, { data: '2026-10-30' }, { data: '2026-10-29' }]);
    expect(grupos.map((g) => [g.data, g.itens.length])).toEqual([['2026-10-30', 2], ['2026-10-29', 1]]);
  });
});
