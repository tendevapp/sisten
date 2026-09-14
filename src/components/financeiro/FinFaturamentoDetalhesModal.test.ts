/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { FinFatGwjaco } from '../../types';
import { estadoTramo } from '../../lib/finFaturamentoRelatorio';

function criarLinha(over: Partial<FinFatGwjaco> = {}): FinFatGwjaco {
  return {
    id: Math.random().toString(36).slice(2),
    projeto: 'GW_JACOBINA',
    torre_numero: 1,
    tramo: 'T1',
    serie: 3143,
    tramo_id: null,
    codigo_cliente: 'S1 SEC GW5S120M',
    part_number: 'PN-001',
    projeto_codigo: 'GW5S120M-001',
    nota_fiscal: null,
    data_faturado: null,
    semana_faturamento: null,
    data_expedido: null,
    data_tramos_previstos: null,
    restricao: false,
    observacao: null,
    criado_por_id: null,
    criado_por_nome: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...over,
  };
}

describe('FinFaturamentoDetalhesModal — regras de agregação e filtros de dados', () => {
  const linhas: FinFatGwjaco[] = [
    criarLinha({ torre_numero: 1, tramo: 'T1', data_faturado: '2026-08-31', semana_faturamento: 36, data_expedido: '2026-09-04', nota_fiscal: 'NF-101' }),
    criarLinha({ torre_numero: 1, tramo: 'T2', data_faturado: '2026-08-31', semana_faturamento: 36, nota_fiscal: 'NF-102', restricao: true }),
    criarLinha({ torre_numero: 1, tramo: 'T3', data_faturado: null, semana_faturamento: null, data_expedido: null }),
    criarLinha({ torre_numero: 2, tramo: 'T1', data_faturado: '2026-09-08', semana_faturamento: 37, nota_fiscal: 'NF-103' }),
    criarLinha({ torre_numero: 2, tramo: 'T2', data_faturado: null }),
  ];

  it('classifica corretamente os estados no funil (expedido, faturado, pendente)', () => {
    expect(estadoTramo(linhas[0])).toBe('expedido');
    expect(estadoTramo(linhas[1])).toBe('faturado');
    expect(estadoTramo(linhas[2])).toBe('pendente');
    expect(estadoTramo(linhas[3])).toBe('faturado');
    expect(estadoTramo(linhas[4])).toBe('pendente');
  });

  it('identifica tramos com restrição corretamente', () => {
    const comRestricao = linhas.filter((l) => l.restricao);
    expect(comRestricao.length).toBe(1);
    expect(comRestricao[0].tramo).toBe('T2');
    expect(comRestricao[0].torre_numero).toBe(1);
  });

  it('calcula corretamente o recorte por mês civil', () => {
    const agosto = linhas.filter((l) => (l.data_faturado ?? '').slice(0, 7) === '2026-08');
    const setembro = linhas.filter((l) => (l.data_faturado ?? '').slice(0, 7) === '2026-09');

    expect(agosto.length).toBe(2);
    expect(setembro.length).toBe(1);
  });

  it('calcula corretamente o recorte por semana de faturamento', () => {
    const s36 = linhas.filter((l) => l.semana_faturamento === 36);
    const s37 = linhas.filter((l) => l.semana_faturamento === 37);

    expect(s36.length).toBe(2);
    expect(s37.length).toBe(1);
  });

  it('calcula o detalhamento de tramos de uma torre específica', () => {
    const torre1 = linhas.filter((l) => l.torre_numero === 1);
    expect(torre1.length).toBe(3);

    const faturados = torre1.filter((l) => Boolean(l.data_faturado));
    expect(faturados.length).toBe(2);
  });

  it('calcula o detalhamento de um tipo de tramo (T1, T2, etc.) entre torres', () => {
    const tramosT1 = linhas.filter((l) => l.tramo === 'T1');
    expect(tramosT1.length).toBe(2);
    expect(tramosT1.every((l) => Boolean(l.data_faturado))).toBe(true);

    const tramosT2 = linhas.filter((l) => l.tramo === 'T2');
    expect(tramosT2.length).toBe(2);
    expect(tramosT2.filter((l) => Boolean(l.data_faturado)).length).toBe(1);
  });
});
