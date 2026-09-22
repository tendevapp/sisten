/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  RELATORIO_DIARIO_MOCK,
  calcularResumoDia,
  formatarDataDDMMAA,
  type RelatorioDiarioProducao,
} from './producaoDashboard';

const vazio: RelatorioDiarioProducao = {
  data: '2026-09-19',
  jato: { id: 'jato', titulo: 'Jato', colunas: ['Peça', 'Atividade'], blocos: [] },
  metalizacao: { id: 'metalizacao', titulo: 'Metalização', colunas: ['Peça', 'Atividade'], blocos: [] },
  pintura: { id: 'pintura', titulo: 'Pintura', colunas: ['Cabine / Peça', 'Processo'], blocos: [] },
  reparo: { id: 'reparo', titulo: 'Reparo', colunas: ['Bordas'], linhas: [] },
  observacoes: [],
};

describe('calcularResumoDia', () => {
  it('conta as atividades dos quatro setores', () => {
    const resumo = calcularResumoDia(RELATORIO_DIARIO_MOCK);
    expect(resumo.concluidas).toBe(27);
    expect(resumo.andamento).toBe(6);
    expect(resumo.naoIniciadas).toBe(35);
    expect(resumo.total).toBe(68);
  });

  it('ignora postos vazios no denominador', () => {
    const comVazias = calcularResumoDia({
      ...vazio,
      reparo: {
        ...vazio.reparo,
        colunas: ['Bordas', 'Suportes'],
        linhas: [
          { local: 'MF-A', peca: 'T1-0001', status: ['concluido', 'andamento'] },
          { local: 'MF-B', vazia: true },
        ],
      },
    });
    expect(comVazias.total).toBe(2);
    expect(comVazias.naoIniciadas).toBe(0);
  });

  it('fecha os percentuais em 100 mesmo com arredondamento', () => {
    const resumo = calcularResumoDia(RELATORIO_DIARIO_MOCK);
    expect(resumo.pctConcluidas + resumo.pctAndamento + resumo.pctNaoIniciadas).toBe(100);
  });

  it('devolve zeros quando não há atividade alguma', () => {
    const resumo = calcularResumoDia(vazio);
    expect(resumo).toMatchObject({ total: 0, pctConcluidas: 0, pctAndamento: 0, pctNaoIniciadas: 0 });
  });
});

describe('formatarDataDDMMAA', () => {
  it('fatia a string ISO sem passar pelo fuso', () => {
    expect(formatarDataDDMMAA('2026-09-19')).toBe('19/09/26');
    expect(formatarDataDDMMAA('2026-01-01')).toBe('01/01/26');
  });
});
