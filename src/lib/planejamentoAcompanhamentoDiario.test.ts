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
  it('aplica a meta configurada e o realizado manual sem alterar os demais dados importados', () => {
    const model = buildAcompanhamentoDiarioModel([
      { termino_nav01: '2026-09-08', raw_data: {} },
    ], new Date('2026-09-08T12:00:00Z'), 8, {
      metas: [{ area: 'NAVE_1', ano: 2026, mes: 9, meta: 40, dias_uteis: 20 }],
      realizados: [{ area: 'NAVE_1', data: '2026-09-08', realizado: 4 }],
      feriados: ['2026-09-07'],
    });

    const nave = model.areas.find(area => area.id === 'NAVE_1');
    const setembro = nave?.monthly.find(month => month.month === 'Setembro');
    const terca = nave?.weeklyDaily.find(point => point.date === '2026-09-08');
    const segunda = nave?.weeklyDaily.find(point => point.date === '2026-09-07');

    expect(setembro?.programado).toBe(40);
    expect(setembro?.diasUteis).toBe(20);
    expect(setembro?.real).toBe(4);
    expect(terca).toMatchObject({ real: 4, media: 2 });
    expect(segunda?.media).toBeNull();
  });

  it('aplica o ajuste semanal ao ritmo diario e ao programado mensal', () => {
    const model = buildAcompanhamentoDiarioModel([], new Date('2026-09-09T12:00:00Z'), 8, {
      metas: [{ area: 'NAVE_1', ano: 2026, mes: 9, meta: 42, dias_uteis: 21 }],
      metasSemanais: [{ area: 'NAVE_1', semana_inicio: '2026-09-06', meta: 16, dias_uteis: 4 }],
      realizados: [],
      feriados: ['2026-09-07'],
    } as any);

    const nave = model.areas.find(area => area.id === 'NAVE_1');
    const setembro = nave?.monthly.find(month => month.month === 'Setembro');
    const terca = nave?.weeklyDaily.find(point => point.date === '2026-09-08');

    expect(terca?.media).toBe(4);
    expect(setembro?.programado).toBe(50);
  });
});
