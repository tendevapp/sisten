import { describe, expect, it } from 'vitest';
import { buildAcompanhamentoDiarioModel, DAILY_AREAS } from './planejamentoAcompanhamentoDiario';

describe('planejamentoAcompanhamentoDiario', () => {
  it('recalcula as seis áreas usando as datas da base e as metas do modelo', () => {
    const model = buildAcompanhamentoDiarioModel([
      {
        inicio: '2026-04-22',
        termino_nav01: '2026-09-01',
        data_termino_saw3: '2026-09-02',
        data_termino_internos: '2026-09-02',
        termino_final: '2026-09-03',
        data_expedicao: '2026-09-04',
        raw_data: {},
      },
      {
        inicio: '2026-04-22',
        termino_nav01: '2026-09-01',
        data_termino_saw3: null,
        data_termino_internos: null,
        termino_final: null,
        data_expedicao: null,
        raw_data: {},
      },
    ], new Date('2026-09-04T12:00:00Z'));

    expect(DAILY_AREAS).toHaveLength(6);
    expect(model.referenceMonth).toBe('Setembro');
    expect(model.areas.find(area => area.id === 'NAVE_1')?.monthly.find(month => month.month === 'Setembro')?.real).toBe(2);
    expect(model.areas.find(area => area.id === 'SAW_03')?.monthly.find(month => month.month === 'Setembro')?.real).toBe(1);
    expect(model.areas.find(area => area.id === 'FATURAMENTO')?.monthly.find(month => month.month === 'Setembro')?.real).toBe(1);
    expect(model.areas.find(area => area.id === 'EXPEDICAO')?.monthly.find(month => month.month === 'Setembro')?.real).toBe(1);
    expect(model.areas.find(area => area.id === 'EXPEDICAO')?.monthly.find(month => month.month === 'Setembro')?.programado).toBe(33);
    expect(model.areas.every(area => area.weeklyDaily.some(point => point.label === 'W36'))).toBe(true);
  });

  it('recalcula a referência semanal quando o usuário troca o mês', () => {
    const model = buildAcompanhamentoDiarioModel([
      { termino_nav01: '2026-08-18', data_expedicao: '2026-08-20', raw_data: {} },
    ], new Date('2026-09-04T12:00:00Z'), 7);

    expect(model.referenceMonth).toBe('Agosto');
    expect(model.referenceMonthIndex).toBe(7);
    expect(model.areas.find(area => area.id === 'NAVE_1')?.monthly.find(month => month.month === 'Agosto')?.real).toBe(1);
    expect(model.areas.find(area => area.id === 'NAVE_1')?.weeklyDaily.some(point => point.date === '2026-08-30')).toBe(true);
  });
});
