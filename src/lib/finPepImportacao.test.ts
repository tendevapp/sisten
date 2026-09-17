/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseLinhasImportacaoPep, parseTextoColadoPep } from './finPepImportacao';

describe('finPepImportacao — Parsing e Validação de PEP', () => {
  it('converte texto colado (TSV) do usuário em matriz de linhas', () => {
    const texto = `Centro de lucro\tDefinição do projeto\tWBS element\tName\tLevel\tUsuário unidade de medida 1\tMoeda\tEmpresa\tCódigo elemento classificação contábil\tCódigo elemento de faturamento\tStatus\tIFRS15 - OD
TEN00\tTEN00\tTEN00\tACAPU - TOR EÓLICAS NORDE\t1\tUA\tBRL\t1130\tX\t\tLIB\tTEN0098
TEN00\tTEN002\tTEN0011\tDespesa Direta\t1\tUA\tBRL\t1130\tColuna3\tColuna4\tLIB\tTEN0098`;

    const rawRows = parseTextoColadoPep(texto);
    expect(rawRows.length).toBe(3);
    expect(rawRows[0][0]).toBe('Centro de lucro');
    expect(rawRows[1][2]).toBe('TEN00');
    expect(rawRows[2][2]).toBe('TEN0011');
  });

  it('faz parse correto dos dados fornecidos com cabeçalhos', () => {
    const rawRows = [
      ['Centro de lucro', 'Definição do projeto', 'WBS element', 'Name', 'Level', 'Usuário unidade de medida 1', 'Moeda', 'Empresa', 'Código elemento classificação contábil', 'Código elemento de faturamento', 'Status', 'IFRS15 - OD'],
      ['TEN00', 'TEN00', 'TEN00', 'ACAPU - TOR EÓLICAS NORDE', '1', 'UA', 'BRL', '1130', 'X', '', 'LIB', 'TEN0098'],
      ['TEN00', 'TEN002', 'TEN0011', 'Despesa Direta', '1', 'UA', 'BRL', '1130', 'Coluna3', 'Coluna4', 'LIB', 'TEN0098'],
      ['TEN00', 'TEN00', 'TEN001101', 'Servico Preliminar', '2', 'UA', 'BRL', '1130', '', '', 'LIB', 'TEN0098'],
      ['TEN00', 'TEN00', 'TEN001101116000', 'PESSOAL AFASTADO DIR.', '3', 'UA', 'BRL', '1130', 'X', '', 'LIB', 'TEN0098'],
      ['TEN00', 'TEN00', 'TEN001101127002', 'CUSTO REPARO DE 7 TORRE ECO GE', '3', 'UA', 'BRL', '1130', 'X', '', 'LIB', 'TEN0098'],
      ['TEN00', 'TEN00', 'TEN001101127003', 'CUSTO REPARO DE TORRES EM PARQUE EOLICO', '3', 'UA', 'BRL', '1130', 'X', '', 'LIB', 'TEN0098'],
      ['TEN00', 'TEN00', 'TEN001101127004', 'CUSTO LAVAGEM DE TRAMO', '3', 'UA', 'BRL', '1130', 'X', '', 'LIB', 'TEN0098'],
    ];

    const resultado = parseLinhasImportacaoPep(rawRows);
    expect(resultado.pendencias.length).toBe(0);
    expect(resultado.validas.length).toBe(7);

    // Primeiro item
    const item1 = resultado.validas[0];
    expect(item1.centro_lucro).toBe('TEN00');
    expect(item1.definicao_projeto).toBe('TEN00');
    expect(item1.wbs_element).toBe('TEN00');
    expect(item1.nome).toBe('ACAPU - TOR EÓLICAS NORDE');
    expect(item1.nivel).toBe(1);
    expect(item1.unidade_medida).toBe('UA');
    expect(item1.moeda).toBe('BRL');
    expect(item1.empresa).toBe('1130');
    expect(item1.classificacao_contabil).toBe('X');
    expect(item1.elemento_faturamento).toBeNull();
    expect(item1.status).toBe('LIB');
    expect(item1.ifrs15_od).toBe('TEN0098');

    // Segundo item com Coluna3 e Coluna4
    const item2 = resultado.validas[1];
    expect(item2.definicao_projeto).toBe('TEN002');
    expect(item2.wbs_element).toBe('TEN0011');
    expect(item2.classificacao_contabil).toBe('Coluna3');
    expect(item2.elemento_faturamento).toBe('Coluna4');

    // Nível 3
    const item4 = resultado.validas[3];
    expect(item4.wbs_element).toBe('TEN001101116000');
    expect(item4.nivel).toBe(3);
  });

  it('registra pendência quando WBS element está ausente', () => {
    const rawRows = [
      ['Centro de lucro', 'Definição do projeto', 'WBS element', 'Name'],
      ['TEN00', 'TEN00', '', 'Sem PEP'],
    ];

    const resultado = parseLinhasImportacaoPep(rawRows);
    expect(resultado.validas.length).toBe(0);
    expect(resultado.pendencias.length).toBe(1);
    expect(resultado.pendencias[0].motivo).toContain('WBS/PEP ausente');
  });
});
