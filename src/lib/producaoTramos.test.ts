import { describe, expect, it } from 'vitest';
import { estadoTramo, validarEventoTramo } from './producaoTramos';

describe('eventos de tramo', () => {
  it('impede Jato antes da liberação para NAV02', () => {
    expect(validarEventoTramo(
      { marco: 'liberado_jato', dataOperacional: '2026-08-01' },
      { liberadoNav02Em: '2026-08-02' },
    )).toEqual(['Jato não pode anteceder a liberação para NAV02.']);
  });

  it('reduz o histórico ao estado atual do tramo', () => {
    expect(estadoTramo([
      { tipo: 'marco', marco: 'inicio', dataOperacional: '2026-04-22' },
      { tipo: 'marco', marco: 'liberado_nav02', dataOperacional: '2026-05-01' },
      { tipo: 'situacao', dataOperacional: '2026-10-06', setor: 'Jato', atividade: 'Jato em Andamento', reparosSolda: 2 },
    ])).toMatchObject({
      inicioEm: '2026-04-22',
      liberadoNav02Em: '2026-05-01',
      setorAtual: 'Jato',
      atividadeAtual: 'Jato em Andamento',
      reparosSolda: 2,
    });
  });
});
