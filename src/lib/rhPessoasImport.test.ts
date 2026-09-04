/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { mapearPlanilhaPessoas, normalizarCabecalho, situacaoParaAtivo } from './rhPessoasImport';

const CABECALHO_OFICIAL = [
  'MATRÍCULA', 'COLABORADOR', 'CHAVE DO NOME', 'MACROÁREA', 'ÁREA ',
  'SUBSETOR', 'CARGO ', 'LIDERANÇA', 'TURNO', 'SITUAÇÃO',
];

const LINHA = [
  '12345', 'JOÃO DA SILVA', 'JOAO SILVA', 'OPERAÇÃO', 'PRODUÇÃO',
  'SOLDA', 'SOLDADOR', 'CARLOS SOUZA', '2º TURNO', 'ATIVO',
];

describe('Importação de colaboradores (rh_pessoas)', () => {
  it('normaliza cabeçalho com acento, espaço e maiúscula', () => {
    expect(normalizarCabecalho('MATRÍCULA')).toBe('matricula');
    expect(normalizarCabecalho('CHAVE DO NOME')).toBe('chavedonome');
    expect(normalizarCabecalho('ÁREA ')).toBe('area');
    expect(normalizarCabecalho('MACROÁREA')).toBe('macroarea');
    expect(normalizarCabecalho('LIDERANÇA')).toBe('lideranca');
    expect(normalizarCabecalho('SITUAÇÃO')).toBe('situacao');
  });

  it('mapeia todas as colunas da planilha oficial', () => {
    const [pessoa] = mapearPlanilhaPessoas([CABECALHO_OFICIAL, LINHA]);
    expect(pessoa).toEqual({
      registro: '12345',
      nome: 'JOÃO DA SILVA',
      chave_nome: 'JOAO SILVA',
      macroarea: 'OPERAÇÃO',
      area: 'PRODUÇÃO',
      subsetor: 'SOLDA',
      cargo: 'SOLDADOR',
      lideranca: 'CARLOS SOUZA',
      turno: '2º TURNO',
      situacao: 'ATIVO',
    });
  });

  it('aceita a planilha antiga, só com registro, nome e cargo', () => {
    const itens = mapearPlanilhaPessoas([
      ['REGISTRO', 'NOME DO EMPREGADO', 'DESCRIÇÃO DO CARGO'],
      ['999', 'MARIA LIMA', 'ANALISTA'],
    ]);
    expect(itens).toEqual([{ registro: '999', nome: 'MARIA LIMA', cargo: 'ANALISTA' }]);
  });

  it('ignora célula vazia em vez de gravar string vazia', () => {
    const [pessoa] = mapearPlanilhaPessoas([
      CABECALHO_OFICIAL,
      ['12345', 'JOÃO DA SILVA', '', '', '', '', 'SOLDADOR', '', '', ''],
    ]);
    expect(pessoa.cargo).toBe('SOLDADOR');
    expect(pessoa).not.toHaveProperty('area');
    expect(pessoa).not.toHaveProperty('turno');
  });

  it('descarta linha sem matrícula ou sem nome', () => {
    const itens = mapearPlanilhaPessoas([
      CABECALHO_OFICIAL,
      LINHA,
      ['', 'SEM MATRICULA', '', '', '', '', '', '', '', ''],
      ['777', '', '', '', '', '', '', '', '', ''],
    ]);
    expect(itens).toHaveLength(1);
    expect(itens[0].registro).toBe('12345');
  });

  it('recusa planilha sem as colunas obrigatórias', () => {
    expect(() => mapearPlanilhaPessoas([['ÁREA', 'TURNO'], ['PRODUÇÃO', 'ADM']]))
      .toThrow(/Colunas obrigatórias/);
  });

  it('recusa planilha vazia', () => {
    expect(() => mapearPlanilhaPessoas([CABECALHO_OFICIAL])).toThrow(/vazia/);
  });

  it('traduz a situação para o booleano ativo', () => {
    expect(situacaoParaAtivo('ATIVO')).toBe(true);
    expect(situacaoParaAtivo('Trabalhando')).toBe(true);
    expect(situacaoParaAtivo('DEMITIDO')).toBe(false);
    expect(situacaoParaAtivo('Desligado')).toBe(false);
    expect(situacaoParaAtivo('RESCISÃO')).toBe(false);
  });

  it('mantém ativo quem está afastado, de férias ou em licença', () => {
    // Continua sendo colaborador: precisa aparecer na busca dos formulários.
    expect(situacaoParaAtivo('AFASTADO')).toBe(true);
    expect(situacaoParaAtivo('FÉRIAS')).toBe(true);
    expect(situacaoParaAtivo('LICENÇA MATERNIDADE')).toBe(true);
  });

  it('sem coluna de situação, mantém o colaborador ativo', () => {
    expect(situacaoParaAtivo('')).toBe(true);
    expect(situacaoParaAtivo(null)).toBe(true);
    expect(situacaoParaAtivo(undefined)).toBe(true);
  });
});
