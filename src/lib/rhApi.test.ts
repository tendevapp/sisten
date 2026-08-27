import { describe, it, expect } from 'vitest';
import { calcularHorasASE, diaDaSemana } from './rhApi';

describe('calcularHorasASE', () => {
  it('calcula um período diurno simples sem intervalo', () => {
    // 17:00 às 19:00, exemplo da FRM.RHU-0007 (Analista de RH, 60%HE)
    const r = calcularHorasASE('17:00', '19:00', 0);
    expect(r.minutosDiurnos).toBe(120);
    expect(r.minutosNoturnos).toBe(0);
    expect(r.totalHoras).toBe(2);
  });

  it('desconta o intervalo do período diurno', () => {
    const r = calcularHorasASE('17:00', '20:00', 60);
    expect(r.minutosDiurnos).toBe(120);
    expect(r.totalHoras).toBe(2);
  });

  it('aplica a redução da hora noturna (22h-5h) integralmente quando o turno está todo nela', () => {
    // 22:00 às 23:00 = 60min de relógio, mas hora noturna reduzida (52min30s = 1h)
    // conta a mais: 60 / 52.5 = 1.142857h
    const r = calcularHorasASE('22:00', '23:00', 0);
    expect(r.minutosDiurnos).toBe(0);
    expect(r.minutosNoturnos).toBe(60);
    expect(r.totalHoras).toBeCloseTo(60 / 52.5, 2);
  });

  it('divide corretamente um turno que cruza a janela noturna', () => {
    // 21:00 às 23:00: 1h diurna (21h-22h) + 1h noturna reduzida (22h-23h)
    const r = calcularHorasASE('21:00', '23:00', 0);
    expect(r.minutosDiurnos).toBe(60);
    expect(r.minutosNoturnos).toBe(60);
    expect(r.totalHoras).toBeCloseTo(1 + 60 / 52.5 / 1, 2);
  });

  it('trata a virada de dia (saída menor que entrada)', () => {
    // 23:00 às 02:00: 3h de relógio, todas dentro da janela noturna
    const r = calcularHorasASE('23:00', '02:00', 0);
    expect(r.minutosNoturnos).toBe(180);
    expect(r.minutosDiurnos).toBe(0);
    expect(r.totalHoras).toBeCloseTo(180 / 52.5, 2);
  });

  it('retorna zero quando entrada ou saída estão vazias', () => {
    expect(calcularHorasASE('', '19:00', 0).totalHoras).toBe(0);
    expect(calcularHorasASE('17:00', '', 0).totalHoras).toBe(0);
  });
});

describe('diaDaSemana', () => {
  it('identifica a sexta-feira do exemplo do FRM.RHU-0007 (06/01/2023)', () => {
    expect(diaDaSemana('2023-01-06')).toBe('Sexta');
  });

  it('retorna vazio para uma data mal formada', () => {
    expect(diaDaSemana('06/01/2023')).toBe('');
    expect(diaDaSemana('')).toBe('');
  });
});
