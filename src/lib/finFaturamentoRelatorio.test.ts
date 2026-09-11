/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { FinFatGwjaco } from '../types';
import {
  semanaISO,
  estadoTramo,
  semanaDaLinha,
  resumoFaturamento,
  matrizTorreTramo,
  faturadosPorSemana,
  faturadosPorTramo,
  ultimasNotas,
} from './finFaturamentoRelatorio';

function linha(over: Partial<FinFatGwjaco> = {}): FinFatGwjaco {
  return {
    id: Math.random().toString(36).slice(2),
    projeto: 'GW_JACOBINA',
    torre_numero: 1,
    tramo: 'T1',
    serie: 3143,
    tramo_id: null,
    codigo_cliente: 'S1 SEC GW5S120M',
    projeto_codigo: 'GW5S120M-001',
    nota_fiscal: null,
    data_faturado: null,
    semana_faturamento: null,
    data_expedido: null,
    data_tramos_previstos: null,
    observacao: null,
    criado_por_id: null,
    criado_por_nome: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...over,
  };
}

describe('semanaISO', () => {
  // A numeração tem que bater com a que o time já usa na planilha do cliente;
  // se divergir, o gráfico semanal contaria uma história diferente da cobrança.
  it('reproduz a numeração de semana da planilha', () => {
    expect(semanaISO('2026-08-31')).toBe(36);
    expect(semanaISO('2026-08-25')).toBe(35);
    expect(semanaISO('2026-08-21')).toBe(34);
    expect(semanaISO('2026-08-13')).toBe(33);
    expect(semanaISO('2026-09-08')).toBe(37);
  });

  it('não escorrega um dia por causa de fuso', () => {
    // new Date('2026-09-07') vira 06/09 em UTC-3 — domingo, semana anterior.
    expect(semanaISO('2026-09-07')).toBe(37);
    expect(semanaISO('2026-09-06')).toBe(36);
  });

  it('devolve null para data inválida', () => {
    expect(semanaISO('')).toBeNull();
    expect(semanaISO('sem-data')).toBeNull();
  });
});

describe('estadoTramo', () => {
  it('usa o passo mais avançado do funil', () => {
    expect(estadoTramo(linha())).toBe('pendente');
    expect(estadoTramo(linha({ data_faturado: '2026-08-31' }))).toBe('faturado');
    expect(estadoTramo(linha({ data_faturado: '2026-08-31', data_expedido: '2026-09-04' }))).toBe('expedido');
  });
});

describe('semanaDaLinha', () => {
  it('prefere a semana digitada à derivada', () => {
    expect(semanaDaLinha(linha({ data_faturado: '2026-08-31', semana_faturamento: 99 }))).toBe(99);
  });

  it('deriva da data quando a semana está vazia', () => {
    expect(semanaDaLinha(linha({ data_faturado: '2026-08-31' }))).toBe(36);
  });

  it('devolve null sem faturamento', () => {
    expect(semanaDaLinha(linha())).toBeNull();
  });
});

describe('resumoFaturamento', () => {
  const linhas = [
    linha({ torre_numero: 1, tramo: 'T1', data_faturado: '2026-08-31', semana_faturamento: 36, data_expedido: '2026-09-04' }),
    linha({ torre_numero: 1, tramo: 'T2', data_faturado: '2026-08-31', semana_faturamento: 36 }),
    linha({ torre_numero: 2, tramo: 'T1', data_faturado: '2026-08-13', semana_faturamento: 33 }),
    linha({ torre_numero: 2, tramo: 'T2' }),
  ];

  it('conta o funil', () => {
    const r = resumoFaturamento(linhas, 36);
    expect(r.total).toBe(4);
    expect(r.faturados).toBe(3);
    expect(r.expedidos).toBe(1);
    expect(r.pendentes).toBe(1);
    expect(r.percentual).toBe(75);
  });

  it('separa torre iniciada de torre concluída', () => {
    const r = resumoFaturamento(linhas, 36);
    expect(r.totalTorres).toBe(2);
    expect(r.torresIniciadas).toBe(2);
    expect(r.torresConcluidas).toBe(1); // só a torre 1 tem todos os tramos faturados
  });

  it('conta o que saiu na semana de referência', () => {
    expect(resumoFaturamento(linhas, 36).naSemana).toBe(2);
    expect(resumoFaturamento(linhas, 33).naSemana).toBe(1);
    expect(resumoFaturamento(linhas, null).naSemana).toBe(0);
  });

  it('pega a nota mais recente', () => {
    const comNota = [
      linha({ data_faturado: '2026-08-13', nota_fiscal: '20949-1' }),
      linha({ data_faturado: '2026-09-08', nota_fiscal: '21050-1' }),
    ];
    expect(resumoFaturamento(comNota, null).ultimaNota?.nota_fiscal).toBe('21050-1');
  });

  it('não divide por zero na base vazia', () => {
    const r = resumoFaturamento([], 36);
    expect(r.percentual).toBe(0);
    expect(r.ultimaNota).toBeNull();
  });
});

describe('matrizTorreTramo', () => {
  it('monta cinco linhas de tramo por torre, em ordem', () => {
    const m = matrizTorreTramo([
      linha({ torre_numero: 2, tramo: 'T1', data_faturado: '2026-08-31' }),
      linha({ torre_numero: 1, tramo: 'T1', data_faturado: '2026-08-31', data_expedido: '2026-09-04' }),
      linha({ torre_numero: 1, tramo: 'T5' }),
    ]);

    expect(m.torres).toEqual([1, 2]);
    expect(m.linhas.map((l) => l.tramo)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5']);
    expect(m.linhas[0].celulas[0]?.estado).toBe('expedido');
    expect(m.linhas[0].celulas[1]?.estado).toBe('faturado');
    expect(m.linhas[4].celulas[0]?.estado).toBe('pendente');
  });

  it('deixa null onde a torre não tem o tramo cadastrado', () => {
    const m = matrizTorreTramo([linha({ torre_numero: 1, tramo: 'T1' })]);
    expect(m.linhas[1].celulas[0]).toBeNull();
  });
});

describe('faturadosPorSemana', () => {
  it('agrupa e ordena por semana crescente', () => {
    const pontos = faturadosPorSemana([
      linha({ data_faturado: '2026-08-31', semana_faturamento: 36 }),
      linha({ data_faturado: '2026-08-31', semana_faturamento: 36 }),
      linha({ data_faturado: '2026-08-13', semana_faturamento: 33 }),
      linha(),
    ], 36);

    expect(pontos.map((p) => p.semana)).toEqual([33, 36]);
    expect(pontos.map((p) => p.faturados)).toEqual([1, 2]);
    expect(pontos[1].ehAtual).toBe(true);
    expect(pontos[0].ehAtual).toBe(false);
  });

  it('mantém só as semanas mais recentes dentro do limite', () => {
    const linhas = [33, 34, 35, 36].map((s) =>
      linha({ data_faturado: '2026-08-31', semana_faturamento: s }),
    );
    expect(faturadosPorSemana(linhas, 36, 2).map((p) => p.semana)).toEqual([35, 36]);
  });
});

describe('faturadosPorTramo', () => {
  it('devolve sempre os cinco tramos, mesmo zerados', () => {
    const pontos = faturadosPorTramo([
      linha({ tramo: 'T1', data_faturado: '2026-08-31', data_expedido: '2026-09-04' }),
      linha({ tramo: 'T1', data_faturado: '2026-08-31' }),
      linha({ tramo: 'T3' }),
    ]);

    expect(pontos.map((p) => p.tramo)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5']);
    expect(pontos[0]).toMatchObject({ faturados: 2, expedidos: 1, total: 2 });
    expect(pontos[1]).toMatchObject({ faturados: 0, total: 0 });
    expect(pontos[2]).toMatchObject({ faturados: 0, total: 1 });
  });
});

describe('ultimasNotas', () => {
  it('ordena da mais recente para a mais antiga e ignora sem NF', () => {
    const notas = ultimasNotas([
      linha({ data_faturado: '2026-08-13', nota_fiscal: '20949-1' }),
      linha({ data_faturado: '2026-09-08', nota_fiscal: '21050-1' }),
      linha({ data_faturado: '2026-08-31', nota_fiscal: null }),
      linha({ nota_fiscal: '99999-1' }),
    ]);

    expect(notas.map((n) => n.nota_fiscal)).toEqual(['21050-1', '20949-1']);
  });

  it('desempata o mesmo dia pela NF maior', () => {
    const notas = ultimasNotas([
      linha({ data_faturado: '2026-08-31', nota_fiscal: '21016-1' }),
      linha({ data_faturado: '2026-08-31', nota_fiscal: '21020-1' }),
    ]);
    expect(notas[0].nota_fiscal).toBe('21020-1');
  });

  it('respeita o limite', () => {
    const linhas = Array.from({ length: 10 }, (_, i) =>
      linha({ data_faturado: '2026-08-31', nota_fiscal: `210${i}-1` }),
    );
    expect(ultimasNotas(linhas, 3)).toHaveLength(3);
  });
});
