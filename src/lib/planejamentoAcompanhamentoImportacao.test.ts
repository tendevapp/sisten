import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  ACOMPANHAMENTO_IMPORT_PROGRESS,
  excelSerialToIsoDate,
  parseAcompanhamentoWorkbook,
} from './planejamentoAcompanhamentoImportacao';

function workbookBytes(sheets: Record<string, (string | number | null)[][]>) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('planejamentoAcompanhamentoImportacao', () => {
  it('expõe etapas progressivas para a importação da base', () => {
    expect(ACOMPANHAMENTO_IMPORT_PROGRESS.map(step => step.value)).toEqual([10, 30, 55, 80]);
    expect(ACOMPANHAMENTO_IMPORT_PROGRESS.map(step => step.label)).toEqual([
      'Lendo planilha...',
      'Validando dados...',
      'Enviando base ao Supabase...',
      'Recalculando dashboards...',
    ]);
  });

  it('converte serial Excel em data ISO sem deslocamento de fuso', () => {
    expect(excelSerialToIsoDate(1)).toBe('1900-01-01');
    expect(excelSerialToIsoDate(46134)).toMatch(/^2026-/);
    expect(excelSerialToIsoDate('')).toBeNull();
  });

  it('encontra a aba BD, ignora linhas vazias e mapeia a base e o cronograma', () => {
    const bdHeader = [
      'BD', 'SEQUÊNCIAL', 'TORRE', 'PROJETO', 'DESCRIÇÃO', 'POSTO', 'INICIO', 'TURNO INICIO',
      'CALANDRA', 'TERMINO', 'TURN. TERMINO', 'TOTAL', 'DATA INICIO', 'TURN. INICIO', 'DATA TERMINO',
      'TURN. TERMINO', 'TOTAL DE TURNO', 'DATA TERMINO', 'TURNO LIB. JATO', 'QTD. REPAROS',
      'METRAGEM REPAROS', 'TOTAL DE TURNO', 'TERMINO FINAL', 'TURN. TERMINO', 'TOTAL DE TURNO',
      'X', 'DATA ', 'CORT X EXPEDIÇÃO', 'X', 'Nº TORRE', 'LEAD TIME CORTE', 'LEAD TIME CALANDRA', 'TEMPO ARMAZENAGEM',
    ];
    const result = parseAcompanhamentoWorkbook(workbookBytes({
      AUX: [['não usar']],
      BD_ACOMPANHAMENTO_GERAL: [
        ['BANCO DE DADOS'],
        bdHeader,
        ['T1-3143', 3143, 'T1', 'GW-001', 'GW5S120M-001', null, 46134, 1, 46157, 46191, 1, 7, 46199, 1, 46212, 1, 4, 46241, 1, 2, null, 0, 46271, 1, 60, 'X', 46273, 'X', null, 1, '37', '37', '37'],
        [null, null, null],
      ],
      CRONOGRAMA: [
        ['x', 'x', 'x', 'SEQUENCIAL', 'x', 'x', 'x', 'x', 'x', 'x', 'POSTO'],
        ['x', 'x', 'x', 3143, 'x', 'x', 'x', 'x', 'x', 'x', 'INTERNOS'],
      ],
    }));

    expect(result.bdRows).toHaveLength(1);
    expect(result.bdRows[0]).toMatchObject({
      linha_origem: 3,
      bd: 'T1-3143',
      sequencial: 3143,
      tramo: 'T1',
      inicio: '2026-04-22',
      numero_torre: 1,
    });
    expect(result.bdRows[0].raw_data['BD']).toBe('T1-3143');
    expect(result.cronogramaRows).toEqual([{ linha_origem: 2, sequencial: 3143, posto: 'INTERNOS', raw_data: expect.any(Object) }]);
  });
});
