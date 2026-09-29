import { describe, expect, it } from 'vitest';
import {
  extrairValidadeMeses,
  mapearBancoTreinamentos,
  mapearControleTreinamentos,
  mapearObrigatoriedadesPorFuncao,
} from './rhMatrizTreinamentosImport';

describe('Importação da matriz de treinamentos do RH', () => {
  it('extrai o catálogo e os conteúdos da aba Banco de Dados', () => {
    const itens = mapearBancoTreinamentos([
      ['Banco de Dados Treinamento'],
      [],
      ['Treinamento', 'Conteúdos', 'Necessário Análise de Eficácia?', 'CH'],
      ['Integração', 'Regras de acesso e segurança', 'S', 0.333333333],
      ['NR-35 Trabalho em Altura (Val. 02 Anos)', '', 'N', 8],
    ]);

    expect(itens).toEqual([
      expect.objectContaining({ nome: 'Integração', conteudo: 'Regras de acesso e segurança', analise_eficacia: true, carga_horaria: 8 }),
      expect.objectContaining({ nome: 'NR-35 Trabalho em Altura (Val. 02 Anos)', validade_meses: 24, carga_horaria: 8 }),
    ]);
  });

  it('lê colaborador, área, líder e os status intercalados da aba Controle', () => {
    const controle: unknown[][] = Array.from({ length: 6 }, () => []);
    controle[2][11] = 'COLABORADOR';
    controle[2][12] = 'REGISTRO';
    controle[2][13] = 'FUNÇÃO';
    controle[2][15] = 'ÁREA';
    controle[2][16] = 'LIDER';
    controle[2][17] = 'NR-35 TRABALHO EM ALTURA (Val. 02 Anos)';
    controle[0][17] = 'INTERNO';
    controle[3][17] = 'SITUAÇÃO';
    controle[3][18] = 'VENCIMENTO';
    controle[4][11] = 'MARIA DA SILVA';
    controle[4][12] = '1730001';
    controle[4][13] = 'SOLDADORA';
    controle[4][15] = 'PRODUÇÃO';
    controle[4][16] = 'CARLOS SOUZA';
    controle[4][17] = 'APTO';
    controle[4][18] = 46300;

    const resultado = mapearControleTreinamentos(controle);

    expect(resultado.pessoas).toEqual([{ registro: '1730001', nome: 'MARIA DA SILVA', area: 'PRODUÇÃO', lideranca: 'CARLOS SOUZA' }]);
    expect(resultado.registros).toEqual([
      expect.objectContaining({ registro: '1730001', treinamento: 'NR-35 TRABALHO EM ALTURA (Val. 02 Anos)', status: 'apto', validade_em: '2026-10-05' }),
    ]);
    expect(resultado.tiposPorTreinamento).toEqual({
      'NR-35 TRABALHO EM ALTURA (Val. 02 Anos)': 'interno',
    });
  });

  it('converte a matriz de obrigatoriedade por função e descarta marcadores vazios', () => {
    const itens = mapearObrigatoriedadesPorFuncao([
      [],
      ['', '', 'FUNÇÃO', 'TREINAMENTOS', 'TREINAMENTOS'],
      [],
      [1, '#N/A', 'SOLDADOR', 'INTEGRAÇÃO', '-'],
      [2, '#N/A', 'SOLDADOR', 'NR-35 TRABALHO EM ALTURA', 'TRABALHO A QUENTE'],
    ]);

    expect(itens).toEqual([
      { cargo: 'SOLDADOR', treinamento: 'INTEGRAÇÃO' },
      { cargo: 'SOLDADOR', treinamento: 'NR-35 TRABALHO EM ALTURA' },
      { cargo: 'SOLDADOR', treinamento: 'TRABALHO A QUENTE' },
    ]);
  });

  it('deduz a validade textual da planilha', () => {
    expect(extrairValidadeMeses('Brigada (Val. 01 Ano)')).toBe(12);
    expect(extrairValidadeMeses('NR-10 (val. 02 Ano)')).toBe(24);
    expect(extrairValidadeMeses('MOOP (Val. 05 Anos)')).toBe(60);
    expect(extrairValidadeMeses('Integração')).toBeNull();
  });
});
