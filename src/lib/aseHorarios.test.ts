import { describe, expect, it } from 'vitest';
import { normalizarHoraAse, validarPeriodoAse } from './aseHorarios';
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
  it.each([['19:00', '17:00'], ['23:00', '01:00'], ['1730', '700']])('bloqueia entrada %s maior que saída %s', (entrada, saida) => {
    expect(validarPeriodoAse(entrada, saida)).toBe('A entrada não pode ser posterior à saída.');
  });

  it.each([['07:00', '16:00'], ['17:00', '19:00'], ['00:00', '23:59'], ['17:00', '17:00'], ['', '19:00'], ['17:00', ''], ['', '']])('aceita período %s - %s ou rascunho incompleto', (entrada, saida) => {
    expect(validarPeriodoAse(entrada, saida)).toBeNull();
  });

  it('bloqueia horários fora do formato válido', () => {
    expect(validarPeriodoAse('25:00', '19:00')).toBeTruthy();
  });
});
