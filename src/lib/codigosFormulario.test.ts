/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatarDataDDMMYY, gerarCodigoFormulario, proximoIndiceCodigo } from './codigosFormulario';

describe('Código de formulário — MODULO-DDMMYY-INDICE', () => {
  it('formata a data ISO como DDMMYY', () => {
    expect(formatarDataDDMMYY('2026-09-03')).toBe('030926');
    expect(formatarDataDDMMYY('2026-12-31')).toBe('311226');
  });

  it('não desloca o dia por fuso ao formatar data ISO', () => {
    // `new Date('2026-09-01')` é meia-noite UTC, que em UTC-3 ainda é 31/08.
    expect(formatarDataDDMMYY('2026-09-01')).toBe('010926');
  });

  it('monta o código no padrão do app', () => {
    expect(gerarCodigoFormulario('RID', '2026-09-03', 1)).toBe('RID-030926-01');
    expect(gerarCodigoFormulario('ase', '2026-08-27', 12)).toBe('ASE-270826-12');
  });

  it('mantém dois dígitos no índice e aceita índice em texto', () => {
    expect(gerarCodigoFormulario('RID', '2026-09-03', '7')).toBe('RID-030926-07');
    expect(gerarCodigoFormulario('RID', '2026-09-03', 105)).toBe('RID-030926-105');
  });

  it('trata índice inválido como o primeiro do recorte', () => {
    expect(gerarCodigoFormulario('RID', '2026-09-03', 0)).toBe('RID-030926-01');
    expect(gerarCodigoFormulario('RID', '2026-09-03', 'abc')).toBe('RID-030926-01');
  });

  it('calcula o próximo índice a partir dos códigos existentes', () => {
    const existentes = ['RID-010926-01', 'RID-030926-02', 'RID-150926-03'];
    expect(proximoIndiceCodigo('RID', existentes)).toBe(4);
  });

  it('ignora códigos fora do padrão ao calcular o próximo índice', () => {
    const existentes = ['RID-010926-01', 'ASE-270826-09', 'legado-sem-padrao', null, undefined];
    expect(proximoIndiceCodigo('RID', existentes)).toBe(2);
  });

  it('começa em 1 quando não há registro no recorte', () => {
    expect(proximoIndiceCodigo('RID', [])).toBe(1);
  });
});
