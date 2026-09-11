/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseLinhasImportacaoFaturamento } from './finFaturamentoImportacao';

const CABECALHO = [
  'Torre', 'Tramo', 'Seq.', 'Descrição do Cliente', 'Part Number',
  '5125 (Faturamento)', 'Data Faturamento', 'Semana (Week)', 'Data Expedição',
];

/** Simula o bloco de título mesclado (linhas em branco/irrelevantes) antes do cabeçalho de verdade. */
function planilha(...linhasDeDado: unknown[][]): unknown[][] {
  return [
    ['GW JACOBINA — CONTROLE DE FATURAMENTO', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    CABECALHO,
    ...linhasDeDado,
  ];
}

describe('parseLinhasImportacaoFaturamento', () => {
  it('ignora as linhas de título mescladas antes do cabeçalho', () => {
    const r = parseLinhasImportacaoFaturamento(planilha(
      [1, 'T1', 3143, 'S1 SEC GW5S120M', 'PN-001', '21016-1', '31/08/2026', 36, '04/09/2026'],
    ));
    expect(r.erroFatal).toBeUndefined();
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({ torre_numero: 1, tramo: 'T1', serie: 3143 });
  });

  it('reporta erro fatal quando não acha Torre/Tramo nas 20 primeiras linhas', () => {
    const r = parseLinhasImportacaoFaturamento([
      ['Coluna X', 'Coluna Y'],
      [1, 2],
    ]);
    expect(r.erroFatal).toMatch(/Torre.*Tramo/);
    expect(r.linhas).toHaveLength(0);
  });

  it('erro fatal em planilha vazia', () => {
    expect(parseLinhasImportacaoFaturamento([]).erroFatal).toBe('Planilha vazia.');
  });

  it('preenche a torre mesclada por arrasto para os 5 tramos', () => {
    const r = parseLinhasImportacaoFaturamento(planilha(
      [1, 'T1', 3143, '', '', '', '', '', ''],
      ['', 'T2', 3144, '', '', '', '', '', ''],
      ['', 'T3', 3145, '', '', '', '', '', ''],
      ['', 'T4', 3146, '', '', '', '', '', ''],
      ['', 'T5', 3147, '', '', '', '', '', ''],
      [2, 'T1', 3148, '', '', '', '', '', ''],
      ['', 'T2', 3149, '', '', '', '', '', ''],
    ));
    expect(r.linhas.map((l) => l.torre_numero)).toEqual([1, 1, 1, 1, 1, 2, 2]);
    expect(r.linhas.map((l) => l.tramo)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T1', 'T2']);
  });

  it('normaliza o tramo em formatos variados', () => {
    const r = parseLinhasImportacaoFaturamento(planilha(
      [1, 1, '', '', '', '', '', '', ''],
      [1, '2', '', '', '', '', '', '', ''],
      [1, 'T3', '', '', '', '', '', '', ''],
      [1, 'tramo 4', '', '', '', '', '', '', ''],
    ));
    expect(r.linhas.map((l) => l.tramo)).toEqual(['T1', 'T2', 'T3', 'T4']);
  });

  it('marca pendência e ignora linha com tramo não reconhecido', () => {
    const r = parseLinhasImportacaoFaturamento(planilha(
      [1, 'T9', 3143, '', '', '', '', '', ''],
    ));
    expect(r.linhas).toHaveLength(0);
    expect(r.pendencias).toHaveLength(1);
    expect(r.pendencias[0].motivo).toMatch(/não reconhecido/);
  });

  it('marca pendência e ignora linha sem torre (sem arrasto anterior)', () => {
    const r = parseLinhasImportacaoFaturamento(planilha(
      ['', 'T1', 3143, '', '', '', '', '', ''],
    ));
    expect(r.linhas).toHaveLength(0);
    expect(r.pendencias[0].motivo).toMatch(/Torre em branco/);
  });

  it('ignora silenciosamente linha totalmente em branco (sem virar pendência)', () => {
    const r = parseLinhasImportacaoFaturamento(planilha(
      [1, 'T1', 3143, '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', ''],
      [1, 'T2', 3144, '', '', '', '', '', ''],
    ));
    expect(r.linhas).toHaveLength(2);
    expect(r.pendencias).toHaveLength(0);
  });

  it('mapeia todas as colunas pedidas para os campos internos', () => {
    const r = parseLinhasImportacaoFaturamento(planilha(
      [3, 'T4', 3156, 'S4 SEC GW5S120M', 'PN-556-A', '21050-1', '08/09/2026', 37, '09/09/2026'],
    ));
    expect(r.linhas[0]).toEqual({
      linha: 1,
      torre_numero: 3,
      tramo: 'T4',
      serie: 3156,
      codigo_cliente: 'S4 SEC GW5S120M',
      part_number: 'PN-556-A',
      nota_fiscal: '21050-1',
      data_faturado: '2026-09-08',
      semana_faturamento: 37,
      data_expedido: '2026-09-09',
    });
  });

  it('aceita data como serial do Excel', () => {
    // 46273 = 08/09/2026 no calendario do Excel (epoch 1899-12-30, com o bug do ano bissexto de 1900).
    const r = parseLinhasImportacaoFaturamento(planilha(
      [1, 'T1', 3143, '', '', '', 46273, '', ''],
    ));
    expect(r.linhas[0].data_faturado).toBe('2026-09-08');
  });

  it('trata campos opcionais em branco como null, sem virar pendência', () => {
    const r = parseLinhasImportacaoFaturamento(planilha(
      [5, 'T1', '', '', '', '', '', '', ''],
    ));
    expect(r.pendencias).toHaveLength(0);
    expect(r.linhas[0]).toMatchObject({
      serie: null, codigo_cliente: null, part_number: null, nota_fiscal: null,
      data_faturado: null, semana_faturamento: null, data_expedido: null,
    });
  });

  it('linha repetida (mesma torre/tramo) substitui a anterior e vira pendência', () => {
    const r = parseLinhasImportacaoFaturamento(planilha(
      [1, 'T1', 3143, '', '', 'NF-VELHA', '', '', ''],
      [1, 'T1', 3143, '', '', 'NF-NOVA', '', '', ''],
    ));
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].nota_fiscal).toBe('NF-NOVA');
    expect(r.pendencias.some((p) => p.motivo.includes('repetida'))).toBe(true);
  });

  it('o cabeçalho pode estar em qualquer coluna, fora de ordem', () => {
    const cabecalhoForaDeOrdem = ['Data Expedição', 'Torre', 'Semana (Week)', 'Tramo'];
    const r = parseLinhasImportacaoFaturamento([
      cabecalhoForaDeOrdem,
      ['09/09/2026', 4, 37, 'T3'],
    ]);
    expect(r.linhas[0]).toMatchObject({ torre_numero: 4, tramo: 'T3', semana_faturamento: 37, data_expedido: '2026-09-09' });
  });
});
