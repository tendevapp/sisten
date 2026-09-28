import { describe, expect, it } from 'vitest';
import {
  mapearPlanilhaTreinamentos,
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
        dia_semana: 'Tuesday',
        semana: 'W2',
        tipo_planejamento: 'P',
        treinamento: 'Integração',
        turma_horario: '8:00',
        tipo_treinamento: 'B',
        data_eficacia: null,
        realizado: true,
      },
      {
        data_treinamento: '2027-01-06',
        dia_semana: 'Wednesday',
        semana: 'W2',
        tipo_planejamento: 'P',
        treinamento: 'Trabalho a Quente',
        turma_horario: '8:00',
        tipo_treinamento: 'T.L',
        data_eficacia: '2027-01-10',
        realizado: false,
      },
    ]);
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
