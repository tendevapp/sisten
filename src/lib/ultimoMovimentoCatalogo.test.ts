import { describe, expect, it } from 'vitest';
import {
  classificarGiroMovimento,
  compararPorUltimoMovimento,
  detalheUltimoMovimento,
  diasDesdeUltimoMovimento,
  textoTagUltimoMovimento,
  ultimosMovimentosPorMaterial,
} from './ultimoMovimentoCatalogo';

describe('ultimoMovimentoCatalogo', () => {
  it('indexa por codigo normalizado mantendo a data mais recente', () => {
    const mapa = ultimosMovimentosPorMaterial([
      { material: '000012345', ultima_data: '2026-10-01', tipo_movimento: '221' },
      { material: '12345', ultima_data: '2026-11-20', tipo_movimento: '311' },
      { material: '12345', ultima_data: '2026-11-05', tipo_movimento: '201' },
      { material: '   ', ultima_data: '2026-11-20', tipo_movimento: '221' },
      { material: '99999', ultima_data: 'invalida', tipo_movimento: '221' },
    ]);

    expect(mapa.size).toBe(1);
    expect(mapa.get('12345')).toEqual({
      material: '12345',
      ultimaData: '2026-11-20',
      tipoMovimento: '311',
    });
  });

  it('calcula dias corridos sem negativo e sem erro de fuso', () => {
    expect(diasDesdeUltimoMovimento({ material: '10', ultimaData: '2026-11-25', tipoMovimento: '221' }, '2026-11-25')).toBe(0);
    expect(diasDesdeUltimoMovimento({ material: '10', ultimaData: '2026-11-10', tipoMovimento: '221' }, '2026-11-25')).toBe(15);
    expect(diasDesdeUltimoMovimento({ material: '10', ultimaData: '2026-11-28', tipoMovimento: '221' }, '2026-11-25')).toBe(0);
    expect(diasDesdeUltimoMovimento(null, '2026-11-25')).toBeNull();
  });

  it('classifica o semaforo de giro em 30 e 90 dias', () => {
    expect(classificarGiroMovimento(0)).toBe('alto');
    expect(classificarGiroMovimento(30)).toBe('alto');
    expect(classificarGiroMovimento(31)).toBe('medio');
    expect(classificarGiroMovimento(90)).toBe('medio');
    expect(classificarGiroMovimento(91)).toBe('baixo');
    expect(classificarGiroMovimento(null)).toBe('sem_movimento');
  });

  it('formata texto curto da tag e detalhe completo', () => {
    expect(textoTagUltimoMovimento(0)).toBe('0d');
    expect(textoTagUltimoMovimento(42)).toBe('42d');
    expect(textoTagUltimoMovimento(null)).toBe('Sem mov.');

    expect(
      detalheUltimoMovimento({ material: '10', ultimaData: '2026-11-20', tipoMovimento: '311' }, '2026-11-25'),
    ).toBe('Última saída: 20/11/2026 (há 5 dias) · TMV 311 · Transf. produção · Alto giro (≤ 30d)');

    expect(detalheUltimoMovimento(null, '2026-11-25')).toContain('Nenhuma saída/consumo registrada na MB51');
  });

  it('ordena corretamente por recente (alto giro) e por antigo (mais parado)', () => {
    const dias = [null, 120, 5, 45, 0];

    expect([...dias].sort((a, b) => compararPorUltimoMovimento(a, b, 'recente'))).toEqual([0, 5, 45, 120, null]);
    expect([...dias].sort((a, b) => compararPorUltimoMovimento(a, b, 'antigo'))).toEqual([null, 120, 45, 5, 0]);
  });
});
