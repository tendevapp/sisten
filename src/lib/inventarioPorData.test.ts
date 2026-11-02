import { describe, expect, it } from 'vitest';
import { agruparPorData, dataNoIntervalo, rotuloDia } from './inventarioPorData';

describe('inventários por data', () => {
  it('agrupa do dia mais recente para o mais antigo, mantendo a ordem dentro do dia', () => {
    const grupos = agruparPorData(
      [{ data: '2026-10-31', id: 'a' }, { data: '2026-11-02', id: 'b' }, { data: '2026-10-31', id: 'c' }],
      '2026-11-02', '2026-11-01',
    );
    expect(grupos.map(g => g.data)).toEqual(['2026-11-02', '2026-10-31']);
    expect(grupos[1].itens.map(i => i.id)).toEqual(['a', 'c']);
  });

  it('dá nome a hoje, ontem e ao dia da semana sem cair no dia anterior por fuso', () => {
    expect(rotuloDia('2026-11-02', '2026-11-02', '2026-11-01')).toBe('Hoje · 02/11/2026');
    expect(rotuloDia('2026-11-01', '2026-11-02', '2026-11-01')).toBe('Ontem · 01/11/2026');
    expect(rotuloDia('2026-09-01', '2026-11-02', '2026-11-01')).toBe('Terça · 01/09/2026');
  });

  it('filtra pela data como texto, com pontas abertas', () => {
    expect(dataNoIntervalo('2026-10-31', { de: '2026-10-31', ate: '2026-10-31' })).toBe(true);
    expect(dataNoIntervalo('2026-10-30', { de: '2026-10-31', ate: '' })).toBe(false);
    expect(dataNoIntervalo('2026-10-30', null)).toBe(true);
  });
});
