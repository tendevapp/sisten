import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/supabaseClient', () => ({ supabase: {} }));

import { diasRestantes, janelaDiasUteis, montarLinhas, semanaMeta, type DadosRelatorioEtapas } from './producaoRelatorioEtapas';

const FERIADOS = new Set(['2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20']);
const HOJE = '2026-10-09';

describe('relatório prazo por etapa', () => {
  it('conta os dias como a planilha: seg–sáb, sem feriados, de hoje até a data final', () => {
    const esperado: Array<[string, number]> = [
      ['2026-10-31', 19], ['2026-11-07', 24], ['2026-11-11', 27], ['2026-11-14', 30], ['2026-11-20', 34],
      ['2026-11-21', 35], ['2026-11-25', 38], ['2026-12-01', 43], ['2026-12-05', 47],
    ];
    for (const [data, dias] of esperado) expect(diasRestantes(HOJE, data, FERIADOS)).toBe(dias);
    // Data já passada: dias úteis de atraso, negativos.
    expect(diasRestantes(HOJE, '2026-10-07', FERIADOS)).toBe(-2);
  });

  it('a janela do ritmo termina ontem e pula domingo e feriado', () => {
    // 13/10 (ter), 10/10 (sáb), 09/10 (sex) — pula o domingo 11 e o feriado de 12/10.
    expect(janelaDiasUteis('2026-10-14', 3, FERIADOS)).toEqual({ de: '2026-10-09', ate: '2026-10-13' });
  });

  it('monta as linhas com falta, progresso, ritmo e status', () => {
    const datasRecentes = Array.from({ length: 12 }, () => '2026-10-05');
    const dados: DadosRelatorioEtapas = {
      hoje: HOJE,
      feriados: [...FERIADOS],
      etapas: [
        { codigo: 'nav01', nome: 'NAV01', ordem: 20, escopo: 'todos', dataFinal: '2026-11-07', regraValida: true, total: 115,
          datas: [...Array.from({ length: 69 }, () => '2026-06-01'), ...datasRecentes] },
        { codigo: 'marco_porta', nome: 'Marco Porta', ordem: 30, escopo: 'T1', dataFinal: '2026-11-11', regraValida: true, total: 23,
          datas: Array.from({ length: 23 }, () => '2026-09-01') },
        { codigo: 'corte', nome: 'Corte', ordem: 10, escopo: 'todos', dataFinal: '2026-10-07', regraValida: true, total: 115,
          datas: ['2026-09-01'] },
      ],
    };
    const [corte, nav01, porta] = montarLinhas(dados);
    expect(corte.status).toBe('atrasada');
    // 1 tramo/dia no ritmo real, mas precisa de 34/24 ≈ 1,42: termina depois de 07/11.
    expect(nav01).toMatchObject({ prontos: 81, falta: 34, diasRestantes: 24, ritmoReal: 1, status: 'risco' });
    expect(nav01.percentual).toBeCloseTo(81 / 115);
    expect(nav01.ritmoNecessario).toBeCloseTo(34 / 24);
    expect(porta).toMatchObject({ falta: 0, status: 'concluida', previsao: null });
    expect(semanaMeta([{ dataFinal: '2026-11-07' }, { dataFinal: '2026-12-05' }])).toBe('W49');
  });
});
