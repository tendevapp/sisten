import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/supabaseClient', () => ({ supabase: null }));

import {
  intervaloDoPreset, montarRelatorioRid, semanaIso, MAX_SETORES, type RidRelatorioLinha,
} from './ssmaRidRelatorio';

let seq = 0;
const rid = (extra: Partial<RidRelatorioLinha>): RidRelatorioLinha => ({
  id: `r${++seq}`, setor: 'ALMOXARIFADO', data_registro: '2026-10-15', empresa: 'TEN',
  area_desvio: 'ALMOXARIFADO', area_desvio_outro: null, sanado_imediato: false, status: 'REGISTRADO',
  comportamentos_inseguros: [], condicoes_inseguras: [],
  ...extra,
});

const OUTUBRO = { inicio: '2026-10-01', fim: '2026-10-31', hoje: '2026-11-03' };

describe('intervaloDoPreset', () => {
  it('mês anterior vira o ano em janeiro', () => {
    expect(intervaloDoPreset('mes_anterior', '2026-01-10')).toEqual({ inicio: '2025-12-01', fim: '2025-12-31' });
  });
  it('mês atual vai do dia 1 até hoje', () => {
    expect(intervaloDoPreset('mes_atual', '2026-11-03')).toEqual({ inicio: '2026-11-01', fim: '2026-11-03' });
  });
  it('últimos 30 dias inclui hoje', () => {
    expect(intervaloDoPreset('ultimos_30', '2026-11-03')).toEqual({ inicio: '2026-10-05', fim: '2026-11-03' });
  });
});

describe('semanaIso', () => {
  it('segunda-feira e número da semana', () => {
    expect(semanaIso('2026-11-03')).toEqual({ segunda: '2026-11-02', numero: 45, ano: 2026 });
    expect(semanaIso('2027-01-01').numero).toBe(53);
  });
});

describe('montarRelatorioRid', () => {
  it('conta abertos, fechados e sanados; tira cancelados e fora do período', () => {
    const r = montarRelatorioRid([
      rid({ status: 'CONCLUIDO', sanado_imediato: true }),
      rid({ status: 'REGISTRADO', data_registro: '2026-10-01' }),
      rid({ status: 'EM_TRATAMENTO', data_registro: '2026-10-31' }),
      rid({ status: 'CANCELADO' }),
      rid({ data_registro: '2026-09-30' }),
    ], OUTUBRO);
    expect(r.total).toBe(3);
    expect(r.fechados).toBe(1);
    expect(r.abertos).toBe(2);
    expect(r.pctFechados).toBe(33);
    expect(r.sanadosNaHora).toBe(1);
    // abertos: 01/10 → 33 dias, 31/10 → 3 dias
    expect(r.abertosMais30Dias).toBe(1);
    expect(r.idadeMediaAbertos).toBe(18);
  });

  it('filtra por empresa', () => {
    const r = montarRelatorioRid([rid({ empresa: 'TEN' }), rid({ empresa: 'CONTRATADA' })], { ...OUTUBRO, empresa: 'CONTRATADA' });
    expect(r.total).toBe(1);
    expect(r.contratada).toBe(1);
  });

  it('agrupa setores além do limite em Outros', () => {
    const linhas = Array.from({ length: MAX_SETORES + 2 }, (_, i) => rid({ setor: `SETOR ${String(i).padStart(2, '0')}` }));
    const r = montarRelatorioRid(linhas, OUTUBRO);
    expect(r.porSetor).toHaveLength(MAX_SETORES);
    expect(r.porSetor.at(-1)).toMatchObject({ setor: 'Outros (3)', total: 3 });
  });

  it('semanas do período aparecem mesmo vazias', () => {
    const r = montarRelatorioRid([rid({ data_registro: '2026-10-15', status: 'CONCLUIDO' })], OUTUBRO);
    expect(r.granularidade).toBe('semana');
    expect(r.porPeriodo.map(p => p.rotulo)).toEqual(['S40', 'S41', 'S42', 'S43', 'S44']);
    expect(r.porPeriodo.find(p => p.rotulo === 'S42')).toMatchObject({ fechados: 1, abertos: 0 });
  });

  it('período longo agrupa por mês', () => {
    const r = montarRelatorioRid([rid({ data_registro: '2026-03-10' })], { inicio: '2026-01-01', fim: '2026-11-03', hoje: '2026-11-03' });
    expect(r.granularidade).toBe('mes');
    expect(r.porPeriodo).toHaveLength(11);
    expect(r.porPeriodo[2]).toMatchObject({ rotulo: 'mar/26', abertos: 1 });
  });

  it('ranking de classificações separa comportamento e condição; Outros locais somam juntos', () => {
    const r = montarRelatorioRid([
      rid({ comportamentos_inseguros: ['Falta de organização'], condicoes_inseguras: ['Piso escorregadio'], area_desvio: 'OUTROS', area_desvio_outro: 'Ônibus' }),
      rid({ comportamentos_inseguros: ['Falta de organização'], area_desvio: 'OUTROS', area_desvio_outro: 'Rota 03' }),
    ], OUTUBRO);
    expect(r.topClassificacoes[0]).toEqual({ nome: 'Falta de organização', quantidade: 2, tipo: 'comportamento' });
    expect(r.topClassificacoes[1].tipo).toBe('condicao');
    expect(r.topAreas).toEqual([{ nome: 'Outros locais', quantidade: 2, tipo: undefined }]);
  });
});
