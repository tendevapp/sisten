/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Testes unitários para o fluxo de Apontamentos de Produção de Torres Eólicas:
 * Naves, Fábricas, Processos, Validação de Tramo TX-XXXX e Cálculo de Progresso.
 */

import { describe, expect, it } from 'vitest';
import {
  ETAPAS_NAVE_1_FABRICA_1,
  ETAPAS_NAVE_1_FABRICA_2,
  ETAPAS_NAVE_1_FABRICA_3,
  PROCESSOS_NAVE_2,
  PROCESSOS_NAVE_WHITE,
  validarFormatoTramo,
  calcularProgressoTramo,
  determinarProximoEstagio,
  normalizarCodigoTramo,
  type ProcessoApontamento,
} from './producaoTorres';

describe('Estrutura de Naves e Fábricas do PRD', () => {
  it('Nave 1 deve conter 3 Fábricas com os processos exatos do PRD', () => {
    // 1ª Fábrica: Preparo da Chapa
    const nomesF1 = ETAPAS_NAVE_1_FABRICA_1.map(p => p.nome);
    expect(nomesF1).toEqual(['Corte', 'Pré-Jato', 'Chanfro']);

    // 2ª Fábrica: Fabricação da Virola
    const nomesF2 = ETAPAS_NAVE_1_FABRICA_2.map(p => p.nome);
    expect(nomesF2).toEqual([
      'Calandra',
      'SAW 1 (Solda Longitudinal)',
      'Recalandra / Respaldo',
      'UT Longitudinal (Ultrassom)',
      'Liberação de Virola',
    ]);

    // 3ª Fábrica: Montagem Estrutural Inicial
    const nomesF3 = ETAPAS_NAVE_1_FABRICA_3.map(p => p.nome);
    expect(nomesF3).toEqual([
      'Montagem de Flange',
      'Montagem de Bi-partida',
      'Passagem de Virola',
      'Marco-Porta',
    ]);
  });

  it('Nave 2 deve conter os processos exatos do PRD com confirmação de tramo', () => {
    const ids = PROCESSOS_NAVE_2.map(p => p.id);
    expect(ids).toEqual([
      'saw_2_3',
      'liberacao_internos_soldaveis',
      'ut_circunferencial',
      'liberacao_white_jato',
    ]);

    const liberacaoInternos = PROCESSOS_NAVE_2.find(p => p.id === 'liberacao_internos_soldaveis');
    expect(liberacaoInternos?.exigeConfirmacaoTramo).toBe(true);

    const liberacaoWhite = PROCESSOS_NAVE_2.find(p => p.id === 'liberacao_white_jato');
    expect(liberacaoWhite?.exigeConfirmacaoTramo).toBe(true);
  });

  it('Nave White deve conter os 5 processos exatos de acabamento e montagem final', () => {
    const ids = PROCESSOS_NAVE_WHITE.map(p => p.id);
    expect(ids).toEqual([
      'jato',
      'metalizacao',
      'pintura_reparo',
      'acabamento_pintura',
      'montagem_final',
    ]);
  });
});

describe('Validação e Normalização do Tramo TX-XXXX', () => {
  it('deve validar formatos válidos de tramo TX-XXXX', () => {
    expect(validarFormatoTramo('T1-3143')).toBe(true);
    expect(validarFormatoTramo('T2-0012')).toBe(true);
    expect(validarFormatoTramo('T5-4500')).toBe(true);
    expect(validarFormatoTramo('T3-A120')).toBe(true);
  });

  it('deve rejeitar formatos inválidos de tramo', () => {
    expect(validarFormatoTramo('')).toBe(false);
    expect(validarFormatoTramo('T1')).toBe(false);
    expect(validarFormatoTramo('1234')).toBe(false);
    expect(validarFormatoTramo('T9-1234')).toBe(false); // Tramo só vai de T1 a T5
  });

  it('deve normalizar texto para caixa alta e aparar espaços', () => {
    expect(normalizarCodigoTramo('  t1-3143  ')).toBe('T1-3143');
    expect(normalizarCodigoTramo('t4-abc1')).toBe('T4-ABC1');
  });
});

describe('Cálculo de Progresso da Torre / Tramo (Nave 2 + Nave White)', () => {
  it('deve iniciar com 0% se nenhum processo de Nave 2 ou White foi concluído', () => {
    const progresso = calcularProgressoTramo([]);
    expect(progresso.percentual).toBe(0);
    expect(progresso.concluidos).toBe(0);
    expect(progresso.total).toBe(9); // 4 da Nave 2 + 5 da Nave White
  });

  it('deve calcular corretamente o percentual acumulado conforme os processos avançam', () => {
    // 2 processos concluídos na Nave 2
    const prog1 = calcularProgressoTramo(['saw_2_3', 'liberacao_internos_soldaveis']);
    expect(prog1.concluidos).toBe(2);
    expect(prog1.percentual).toBe(22); // 2 / 9 = ~22.2% arredondado

    // Concluindo toda a Nave 2 (4 processos)
    const prog2 = calcularProgressoTramo([
      'saw_2_3',
      'liberacao_internos_soldaveis',
      'ut_circunferencial',
      'liberacao_white_jato',
    ]);
    expect(prog2.concluidos).toBe(4);
    expect(prog2.percentual).toBe(44); // 4 / 9 = ~44.4%

    // Concluindo Nave 2 + Nave White (9 processos) -> 100%
    const prog3 = calcularProgressoTramo([
      'saw_2_3',
      'liberacao_internos_soldaveis',
      'ut_circunferencial',
      'liberacao_white_jato',
      'jato',
      'metalizacao',
      'pintura_reparo',
      'acabamento_pintura',
      'montagem_final',
    ]);
    expect(prog3.concluidos).toBe(9);
    expect(prog3.percentual).toBe(100);
  });

  it('determina corretamente a transição de estágio', () => {
    // Marco-porta concluído -> vai para nave2
    expect(determinarProximoEstagio('marco_porta')).toBe('nave2');
    // Liberação white concluída -> vai para white
    expect(determinarProximoEstagio('liberacao_white_jato')).toBe('white');
    // Montagem final concluída -> vai para expedicao_almoxarifado
    expect(determinarProximoEstagio('montagem_final')).toBe('expedicao_almoxarifado');
    // Outros processos mantêm o estágio atual
    expect(determinarProximoEstagio('corte')).toBeNull();
  });
});
