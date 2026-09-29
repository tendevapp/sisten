import { describe, expect, it } from 'vitest';
import {
  criarCompetenciasCronograma,
  filtrarPlanos,
  resumirIndicadoresTreinamentos,
  resumirIndicadoresMatriz,
} from './rhPlanoTreinamentosViewModel';

describe('visões de plano e cronograma de treinamentos', () => {
  const planos = [
    {
      id: '1',
      codigo: 'PL-01',
      titulo: 'NR 10',
      responsavel: 'RH',
      data_inicio: '2026-01-10',
      status: 'realizado',
      tipo_informacao: 'interno',
      custo_total: 100,
      participantes_planejados: 10,
      carga_horaria: 8,
      local: 'Sala 1',
      categoria: 'Segurança',
      participantes: [{ count: 8 }],
    },
    {
      id: '2',
      codigo: 'PL-02',
      titulo: 'Primeiros socorros',
      responsavel: 'SSMA',
      data_inicio: '2027-02-10',
      status: 'programado',
      tipo_informacao: 'externo',
      custo_total: 200,
      participantes_planejados: 5,
      carga_horaria: 4,
      local: 'Auditório',
      categoria: 'Saúde',
      participantes: [{ count: 0 }],
    },
  ] as any[];

  it('filtra por ano, situação, origem e busca textual', () => {
    expect(filtrarPlanos(planos as any, { busca: 'nr', ano: '2026', status: 'realizado', tipo: 'interno', responsavel: 'todos' })).toHaveLength(1);
    expect(filtrarPlanos(planos as any, { busca: '', ano: '2026', status: 'programado', tipo: 'todos', responsavel: 'todos' })).toHaveLength(0);
    expect(filtrarPlanos(planos as any, { busca: '', ano: 'todos', status: 'todos', tipo: 'todos', responsavel: 'todos', mes: '02' })).toHaveLength(1);
  });

  it('mantém todas as competências disponíveis em ordem, inclusive de anos distintos', () => {
    expect(criarCompetenciasCronograma([{ meses: [{ competencia: '2027-02-01', quantidade: 1 }, { competencia: '2026-12-01', quantidade: 2 }] }] as any)).toEqual(['2026-12-01', '2027-02-01']);
  });

  it('calcula indicadores sem duplicar participações nem custo do plano e calcula HHT', () => {
    const resumo = resumirIndicadoresTreinamentos(
      planos as any,
      [{ descricao: 'NR 10', cotacao: 50, meses: [{ competencia: '2026-01-01', quantidade: 3 }] }] as any,
      { ano: '2026', tipo: 'todos' }
    );
    expect(resumo).toMatchObject({
      programados: 1,
      realizados: 1,
      participacoes: 8,
      capacidade: 10,
      custoRealizado: 100,
      custoPrevisto: 150,
      horasTotais: 8,
      hht: 64, // 8 participacoes * 8 horas
      desvioOrcamentario: -50,
    });
    expect(resumo.porMes[0]).toMatchObject({ competencia: '2026-01-01', programados: 1, realizados: 1, participacoes: 8 });
    expect(resumo.custosPorTreinamento.length).toBeGreaterThan(0);
  });

  it('calcula indicadores da matriz de conformidade e alertas por área', () => {
    const pessoas = [
      { id: 'p1', nome: 'João Silva', registro: '001', cargo: 'Eletricista', area: 'Manutenção', ativo: true },
      { id: 'p2', nome: 'Maria Santos', registro: '002', cargo: 'Operador', area: 'Produção', ativo: true },
    ] as any[];

    const catalogo = [
      { id: 't1', nome: 'NR 10', chave: 'NR 10', ativo: true },
      { id: 't2', nome: 'Ponte Rolante', chave: 'PONTE ROLANTE', ativo: true },
    ] as any[];

    const requisitos = [
      { cargo: 'Eletricista', cargo_chave: 'ELETRICISTA', treinamento_id: 't1', obrigatorio: true },
      { cargo: 'Operador', cargo_chave: 'OPERADOR', treinamento_id: 't2', obrigatorio: true },
    ] as any[];

    const registros = [
      { pessoa_id: 'p1', treinamento_id: 't1', status: 'apto' },
      { pessoa_id: 'p2', treinamento_id: 't2', status: 'vencido' },
    ] as any[];

    const alertas = [
      { pessoa_id: 'p2', treinamento_id: 't2', colaborador: 'Maria Santos', registro: '002', treinamento: 'Ponte Rolante', status_calculado: 'vencido' },
    ] as any[];

    const matrizResumo = resumirIndicadoresMatriz({
      pessoas,
      catalogo,
      requisitos,
      registros,
      alertas,
    });

    expect(matrizResumo.totalColaboradores).toBe(2);
    expect(matrizResumo.totalAptos).toBe(1);
    expect(matrizResumo.totalVencidos).toBe(1);
    expect(matrizResumo.taxaConformidadeGeral).toBe(50);
    expect(matrizResumo.porArea).toHaveLength(2);
    expect(matrizResumo.alertas).toHaveLength(1);
  });
});
