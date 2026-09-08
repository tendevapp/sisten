import { describe, it, expect } from 'vitest';
import type { DemTarefa } from '../types';
import {
  STATUS_LABEL, PRIORIDADE_LABEL, PRIORIDADE_PESO,
  progressoChecklist, reordenarComOrdem, proximaOrdem, ordenarTarefas,
  mapaCalendario, tarefasNaoAgendadas, gerarCodigoTarefa,
} from './demandasQuadro';

const tarefaBase = (over: Partial<DemTarefa>): DemTarefa => ({
  id: over.id || 't1',
  quadro_id: 'q1',
  bucket_id: null,
  titulo: 'x',
  descricao: null,
  responsaveis: [],
  data_inicio: null,
  data_vencimento: null,
  status: 'nao_iniciado',
  prioridade: 'media',
  checklist: [],
  anexos: [],
  ordem: 0,
  concluida_em: null,
  codigo: null,
  criado_por: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  excluido_em: null,
  excluido_por: null,
  ...over,
});

describe('demandasQuadro — rótulos', () => {
  it('cobre os 3 status e as 4 prioridades', () => {
    expect(Object.keys(STATUS_LABEL)).toHaveLength(3);
    expect(Object.keys(PRIORIDADE_LABEL)).toHaveLength(4);
    expect(PRIORIDADE_PESO.urgente).toBeGreaterThan(PRIORIDADE_PESO.baixa);
  });
});

describe('progressoChecklist', () => {
  it('conta itens feitos e total', () => {
    expect(progressoChecklist([{ id: '1', texto: 'a', feito: true }, { id: '2', texto: 'b', feito: false }]))
      .toEqual({ feitos: 1, total: 2 });
    expect(progressoChecklist(null)).toEqual({ feitos: 0, total: 0 });
  });
});

describe('reordenarComOrdem / proximaOrdem', () => {
  it('move item e reindexa a ordem', () => {
    const itens = [{ id: 'a', ordem: 0 }, { id: 'b', ordem: 1 }, { id: 'c', ordem: 2 }];
    const r = reordenarComOrdem(itens, 0, 2);
    expect(r.map(i => i.id)).toEqual(['b', 'c', 'a']);
    expect(r.map(i => i.ordem)).toEqual([0, 1, 2]);
  });

  it('proximaOrdem devolve o fim da fila', () => {
    expect(proximaOrdem([{ ordem: 0 }, { ordem: 4 }])).toBe(5);
    expect(proximaOrdem([])).toBe(0);
  });
});

describe('ordenarTarefas', () => {
  it('ordena por ordem, empate pelo mais recente', () => {
    const a = tarefaBase({ id: 'a', ordem: 1, created_at: '2026-09-01T00:00:00Z' });
    const b = tarefaBase({ id: 'b', ordem: 0 });
    const c = tarefaBase({ id: 'c', ordem: 1, created_at: '2026-09-05T00:00:00Z' });
    expect(ordenarTarefas([a, b, c]).map(t => t.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('mapaCalendario / tarefasNaoAgendadas', () => {
  it('agrupa por vencimento e separa as sem data', () => {
    const comVenc = tarefaBase({ id: 'v', data_vencimento: '2026-09-10' });
    const soInicio = tarefaBase({ id: 'i', data_inicio: '2026-09-11' });
    const semData = tarefaBase({ id: 's' });
    const mapa = mapaCalendario([comVenc, soInicio, semData]);
    expect(mapa.get('2026-09-10')?.map(t => t.id)).toEqual(['v']);
    expect(mapa.get('2026-09-11')?.map(t => t.id)).toEqual(['i']);
    expect(tarefasNaoAgendadas([comVenc, soInicio, semData]).map(t => t.id)).toEqual(['s']);
  });
});

describe('gerarCodigoTarefa', () => {
  it('gera DEM-DDMMYY-NN e incrementa a partir do que já existe no mês', () => {
    expect(gerarCodigoTarefa('2026-09-08', [])).toBe('DEM-080926-01');
    expect(gerarCodigoTarefa('2026-09-08', ['DEM-010926-01', 'DEM-030926-02'])).toBe('DEM-080926-03');
  });
});
