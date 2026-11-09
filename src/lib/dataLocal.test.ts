import { describe, expect, it } from 'vitest';
import { dataHojeLocal, dataLocalMaisDias, paraISOLocal } from './dataLocal';

describe('dataLocal', () => {
  it('usa o calendário local, não UTC (22h de 06/11 continua 06/11)', () => {
    const noite = new Date(2026, 10, 6, 22, 30);
    expect(dataHojeLocal(noite)).toBe('2026-11-06');
    expect(paraISOLocal(noite)).toBe('2026-11-06');
  });

  it('começo do dia não volta para ontem', () => {
    expect(dataHojeLocal(new Date(2026, 8, 1, 0, 5))).toBe('2026-09-01');
  });

  it('soma dias atravessando mês e ano', () => {
    const base = new Date(2026, 11, 30, 23, 0);
    expect(dataLocalMaisDias(2, base)).toBe('2027-01-01');
    expect(dataLocalMaisDias(-30, base)).toBe('2026-11-30');
    expect(dataLocalMaisDias(0, base)).toBe('2026-12-30');
  });
});
