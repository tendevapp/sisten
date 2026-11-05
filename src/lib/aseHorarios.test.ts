import { describe, expect, it } from 'vitest';
import { diaSeguinteAse, formatarPeriodoAse, normalizarHoraAse, validarPeriodoAse, viraDiaAse } from './aseHorarios';
import { calcularHorasASE } from './rhApi';

describe('digitação de horários na ASE', () => {
  it.each([
    ['700', '07:00'], ['0700', '07:00'], ['1730', '17:30'],
    ['7:00', '07:00'], ['17:30', '17:30'], ['0000', '00:00'],
    ['2359', '23:59'], [' 19:00 ', '19:00'],
  ])('normaliza %s para %s', (texto, esperado) => {
    expect(normalizarHoraAse(texto)).toBe(esperado);
  });

  it.each(['', '7', '17', '17:', '17:3', '2400', '2360', '24:00', '12:60', '-1:00', 'abc', '12345', '17:00:00'])('rejeita entrada parcial ou inválida: %s', texto => {
    expect(normalizarHoraAse(texto)).toBeNull();
  });

  it('preserva cálculo de minutos e virada de dia com horários digitados', () => {
    expect(calcularHorasASE(normalizarHoraAse('1730')!, normalizarHoraAse('1930')!, 30).totalHoras).toBe(1.5);
    expect(calcularHorasASE(normalizarHoraAse('2300')!, normalizarHoraAse('100')!, 0)).toEqual(calcularHorasASE('23:00', '01:00', 0));
  });
});

describe('ordem dos horários da ASE', () => {
  it.each([['19:00', '17:00'], ['1730', '700'], ['07:00', '06:00']])('bloqueia virada de dia longa demais (provável troca): %s - %s', (entrada, saida) => {
    expect(validarPeriodoAse(entrada, saida)).toMatch(/mais de 12h/);
  });

  it.each([['17:00', '00:45'], ['23:00', '01:00'], ['16:00', '0400'], ['22:00', '00:00']])('aceita 2º turno com saída no dia seguinte: %s - %s', (entrada, saida) => {
    expect(validarPeriodoAse(entrada, saida)).toBeNull();
    expect(viraDiaAse(entrada, saida)).toBe(true);
  });

  it('17:00 às 00:45 com 1h de intervalo dá 6h45 + adicional noturno', () => {
    const r = calcularHorasASE('17:00', '00:45', 60);
    expect(r.minutosDiurnos).toBe(240);
    expect(r.minutosNoturnos).toBe(165);
  });

  it('marca o período e o dia seguinte para o PDF e a tela', () => {
    expect(formatarPeriodoAse('17:00', '00:45')).toBe('17:00 - 00:45 (+1 dia)');
    expect(formatarPeriodoAse('07:00', '16:00')).toBe('07:00 - 16:00');
    expect(formatarPeriodoAse('', '16:00')).toBe('');
    expect(viraDiaAse('07:00', '16:00')).toBe(false);
    expect(diaSeguinteAse('2026-11-07')).toBe('08/11');
    expect(diaSeguinteAse('2026-12-31')).toBe('01/01');
  });

  it.each([['07:00', '16:00'], ['17:00', '19:00'], ['00:00', '23:59'], ['17:00', '17:00'], ['', '19:00'], ['17:00', ''], ['', '']])('aceita período %s - %s ou rascunho incompleto', (entrada, saida) => {
    expect(validarPeriodoAse(entrada, saida)).toBeNull();
  });

  it('bloqueia horários fora do formato válido', () => {
    expect(validarPeriodoAse('25:00', '19:00')).toBeTruthy();
  });
});
