import { describe, expect, it } from 'vitest';
import { buildDashboardModel } from './planejamentoAcompanhamento';

describe('planejamento dashboard model', () => {
  it('recalcula os indicadores e as matrizes diretamente do engine importado', () => {
    const rows = [
      { torre: 'TORRE 01', tramo: 'T1', ok_nav01: 1, ok_saw3: 1, ok_internos: 0, ok_white: 0, avanco_tramo: 0.5, status: 'EM PRODUCAO', prox_etapa: 'INTERNOS', posto_atual: 'ERRO', dias_sem_movto: 40, lt_nav01: 10, lt_saw3: 8, saldo_prazo: -5 },
      { torre: 'TORRE 01', tramo: 'T2', ok_nav01: 1, ok_saw3: 1, ok_internos: 1, ok_white: 1, avanco_tramo: 1, status: 'CONCLUIDO', prox_etapa: 'CONCLUIDO', posto_atual: 'EXPEDIDO', dias_sem_movto: 0, lt_nav01: 12, lt_saw3: 6, lt_internos: 20, lt_white: 30, saldo_prazo: 12 },
      { torre: 'TORRE 02', tramo: 'T1', ok_nav01: 0, ok_saw3: 0, ok_internos: 0, ok_white: 0, avanco_tramo: 0, status: 'NAO INICIADO', prox_etapa: 'NAV01', posto_atual: 'ERRO', dias_sem_movto: 0, saldo_prazo: 20 },
    ];
    const model = buildDashboardModel(rows, [
      { semana_inicio: '2026-09-14', nav01_sem: 1, saw3_sem: 1, internos_sem: 0, white_sem: 0 },
      { semana_inicio: '2026-09-21', nav01_sem: 0, saw3_sem: 0, internos_sem: 1, white_sem: 1 },
    ], new Date('2026-09-28T12:00:00Z'));

    expect(model.kpis).toMatchObject({
      totalTramos: 3,
      totalEtapas: 12,
      etapasConcluidas: 6,
      whiteConcluidos: 1,
      totalTorres: 2,
      torresConcluidas: 0,
      wip: 1,
      naoIniciados: 1,
      avancoFisico: 0.5,
      agingMedioWip: 40,
    });
    expect(model.stages.map(stage => stage.concluidos)).toEqual([2, 2, 1, 1]);
    expect(model.postos[0]).toMatchObject({ posto: 'INTERNOS', tramos: 1 });
    expect(model.prazoPorTorre.find(row => row.torre === 'TORRE 01')?.saldo_total).toBe(7);
  });
});
