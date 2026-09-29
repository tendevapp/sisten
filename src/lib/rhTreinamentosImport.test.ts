import { describe, expect, it } from 'vitest';
import {
  corrigirTextoTreinamento,
  diaSemanaPtBr,
  mapearPlanilhaTreinamentos,
  normalizarHorarioTreinamento,
  normalizarDataTreinamento,
  normalizarCabecalhoTreinamento,
} from './rhTreinamentosImport';

const CABECALHO = [
  'Data do Treinamento',
  'Dia da Semana',
  'Semana',
  'Tipo de Planejamento:\r\nProgramado(P)/Não Programado(NP)/Reprogramado(RP)',
  'Treinamento',
  'Turma - Horário',
  'Tipo de Treinamento\r\nBásico(B)/Trein. de Evolução(T.E)/Trein. Legais(T.L)',
  'Data da Eficácia',
  'Treinamento Realizado?',
];

describe('Importação do plano de treinamentos do RH', () => {
  it('normaliza cabeçalhos e datas da planilha oficial', () => {
    expect(normalizarCabecalhoTreinamento('Data do Treinamento')).toBe('datadotreinamento');
    expect(normalizarCabecalhoTreinamento('Tipo de Treinamento\r\nBásico(B)')).toBe('tipodetreinamentobasicob');
    expect(normalizarDataTreinamento(46392)).toBe('2027-01-05');
    expect(normalizarDataTreinamento('5/1/27')).toBe('2027-01-05');
  });

  it('mapeia as linhas da aba Tarefas e converte o realizado para booleano', () => {
    const resultado = mapearPlanilhaTreinamentos([
      ['Observação', null],
      CABECALHO,
      [46392, 'Tuesday', 'W2', 'P', 'Integração', '8:00', 'B', null, 'S'],
      ['6/1/27', 'Wednesday', 'W2', 'Programado', 'Trabalho a Quente', '8:00', 'T.L', '10/1/27', 'N'],
    ]);

    expect(resultado).toMatchObject({ linhasLidas: 2, linhasIgnoradas: 0, duplicadas: 0 });
    expect(resultado.itens).toEqual([
      {
        data_treinamento: '2027-01-05',
        dia_semana: 'Terça-feira',
        semana: 'W2',
        tipo_planejamento: 'P',
        treinamento: 'Integração',
        turma_horario: '08:00',
        tipo_treinamento: 'B',
        data_eficacia: null,
        realizado: true,
      },
      {
        data_treinamento: '2027-01-06',
        dia_semana: 'Quarta-feira',
        semana: 'W2',
        tipo_planejamento: 'P',
        treinamento: 'Trabalho a Quente',
        turma_horario: '08:00',
        tipo_treinamento: 'T.L',
        data_eficacia: '2027-01-10',
        realizado: false,
      },
    ]);
  });

  it('corrige acentos quebrados, horário do Excel e dia da semana', () => {
    expect(corrigirTextoTreinamento('IntegraÃ§Ã£o')).toBe('Integração');
    expect(corrigirTextoTreinamento('Seg.no Uso de MÃ¡quinas')).toBe('Seg.no Uso de Máquinas');
    expect(corrigirTextoTreinamento('SEGURANÃ‡A')).toBe('SEGURANÇA');
    expect(corrigirTextoTreinamento('Integração')).toBe('Integração');
    expect(normalizarHorarioTreinamento('0.3333333333333333')).toBe('08:00');
    expect(normalizarHorarioTreinamento(0.3333333333333333)).toBe('08:00');
    expect(normalizarHorarioTreinamento('0,3333333333333333')).toBe('08:00');
    expect(normalizarHorarioTreinamento(0.5)).toBe('12:00');
    for (const formato of ['8:00', '08:00', '08:00:00', '8h', '08h', '08h00', '8H00', '8hs']) {
      expect(normalizarHorarioTreinamento(formato)).toBe('08:00');
    }
    expect(normalizarHorarioTreinamento('14h30')).toBe('14:30');
    expect(normalizarHorarioTreinamento('Turma A')).toBe('Turma A');
    expect(normalizarHorarioTreinamento('25:00')).toBe('25:00');
    expect(diaSemanaPtBr('2027-12-22')).toBe('Quarta-feira');
    expect(diaSemanaPtBr('2027-01-05')).toBe('Terça-feira');
  });

  it('a versão quebrada e a correta da mesma linha viram uma só', () => {
    const resultado = mapearPlanilhaTreinamentos([
      CABECALHO,
      ['5/1/27', 'Tuesday', 'W2', 'P', 'IntegraÃ§Ã£o', 0.3333333333333333, 'B', null, 'N'],
      ['5/1/27', 46392, 'W2', 'P', 'Integração', '8:00', 'B', null, 'N'],
    ]);
    expect(resultado.duplicadas).toBe(1);
    expect(resultado.itens).toHaveLength(1);
    expect(resultado.itens[0]).toMatchObject({ treinamento: 'Integração', turma_horario: '08:00', dia_semana: 'Terça-feira' });
  });

  it('mantém somente a última ocorrência de uma chave repetida', () => {
    const resultado = mapearPlanilhaTreinamentos([
      CABECALHO,
      ['5/1/27', 'Tuesday', 'W2', 'P', 'Integração', '8:00', 'B', null, 'N'],
      ['5/1/27', 'Tuesday', 'W2', 'P', 'Integração', '8:00', 'B', null, 'S'],
    ]);

    expect(resultado.duplicadas).toBe(1);
    expect(resultado.itens).toHaveLength(1);
    expect(resultado.itens[0].realizado).toBe(true);
  });

  it('ignora linhas incompletas e recusa uma planilha sem dados válidos', () => {
    expect(mapearPlanilhaTreinamentos([
      CABECALHO,
      ['', 'Tuesday', 'W2', 'P', 'Sem data', '8:00', 'B', null, 'N'],
      ['5/1/27', 'Tuesday', 'W2', 'P', '', '8:00', 'B', null, 'N'],
    ])).toMatchObject({ linhasLidas: 2, linhasIgnoradas: 2, itens: [] });

    expect(() => mapearPlanilhaTreinamentos([['Data', 'Treinamento'], ['5/1/27', 'x']]))
      .toThrow(/cabeçalhos obrigatórios/i);
  });
});
