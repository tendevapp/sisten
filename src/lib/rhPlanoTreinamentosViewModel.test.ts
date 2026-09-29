import { describe, expect, it } from 'vitest';
import { criarCompetenciasCronograma, filtrarPlanos, resumirIndicadoresTreinamentos } from './rhPlanoTreinamentosViewModel';

describe('visões de plano e cronograma de treinamentos', () => {
  const planos = [
    { id: '1', codigo: 'PL-01', titulo: 'NR 10', responsavel: 'RH', data_inicio: '2026-01-10', status: 'realizado', tipo_informacao: 'interno', custo_total: 100, participantes_planejados: 10, participantes: [{ count: 8 }] },
    { id: '2', codigo: 'PL-02', titulo: 'Primeiros socorros', responsavel: 'SSMA', data_inicio: '2027-02-10', status: 'programado', tipo_informacao: 'externo', custo_total: 200, participantes_planejados: 5, participantes: [{ count: 0 }] },
  ] as any[];

  it('filtra por ano, situação, origem e busca textual', () => {
    expect(filtrarPlanos(planos as any, { busca: 'nr', ano: '2026', status: 'realizado', tipo: 'interno', responsavel: 'todos' })).toHaveLength(1);
    expect(filtrarPlanos(planos as any, { busca: '', ano: '2026', status: 'programado', tipo: 'todos', responsavel: 'todos' })).toHaveLength(0);
  });

  it('mantém todas as competências disponíveis em ordem, inclusive de anos distintos', () => {
    expect(criarCompetenciasCronograma([{ meses: [{ competencia: '2027-02-01', quantidade: 1 }, { competencia: '2026-12-01', quantidade: 2 }] }] as any)).toEqual(['2026-12-01', '2027-02-01']);
  });

  it('calcula indicadores sem duplicar participações nem custo do plano', () => {
    const resumo = resumirIndicadoresTreinamentos(planos as any, [{ cotacao: 50, meses: [{ competencia: '2026-01-01', quantidade: 3 }] }] as any, { ano: '2026', tipo: 'todos' });
    expect(resumo).toMatchObject({ programados: 1, realizados: 1, participacoes: 8, capacidade: 10, custoRealizado: 100, custoPrevisto: 150 });
    expect(resumo.porMes[0]).toMatchObject({ competencia: '2026-01-01', programados: 1, realizados: 1, participacoes: 8 });
  });
});
