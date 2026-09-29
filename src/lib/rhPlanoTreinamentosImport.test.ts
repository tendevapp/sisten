import { describe, expect, it } from 'vitest';
import { mapearCronogramaTreinamentos, mapearPlanoTreinamentos } from './rhPlanoTreinamentosImport';

describe('importação do plano e cronograma de treinamentos', () => {
  it('importa somente as linhas preenchidas do plano e normaliza datas, custos e status', () => {
    const itens = mapearPlanoTreinamentos([
      [], [], [],
      ['Código', 'Título do Treinamento', 'Responsável', 'Data de Início', 'Data de Término', 'Horário', 'Carga Horária', 'Nº de Participantes', 'Local', 'Tipo', 'Modalidade', 'Objetivo', 'Custo Total', 'Data Realizada', 'Status', 'Comentários', 'Duração (dias)', 'Custo por Aluno', 'Plano Mês e Ano', '', '', '', '', '', '', '', '', '', '', 'Categoria'],
      ['TR-01', 'INTEGRAÇÃO', 'RH', 46062, 46062, 0.333333, 8, 3, 'Auditório', 'Interno', 'Presencial', 'Integração', 1200, 46062, 'Realizado', '', 1, 400, '2-2026', '', '', '', '', '', '', '', '', '', '', 'Integração'],
      ['TR-02', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ]);

    expect(itens).toEqual([expect.objectContaining({ codigo: 'TR-01', titulo: 'INTEGRAÇÃO', data_inicio: '2026-02-09', carga_horaria: 8, custo_total: 1200, status: 'realizado', tipo_informacao: 'interno', categoria: 'Integração' })]);
  });

  it('mantém linhas de cronograma com mesma descrição quando a cotação for distinta e cria meses planejados', () => {
    const itens = mapearCronogramaTreinamentos([
      ['Descrição', 'Cotação', 'Total', 'Unidade Mês', 'Total', 'Jan-26', 'Feb-26'],
      ['NR 11 - Empilhadeira', 4800, 4800, 1, 1, 1, ''],
      ['NR 11 - Empilhadeira', 3900, 3900, 1, 1, '', 1],
    ]);

    expect(itens).toEqual([
      expect.objectContaining({ descricao: 'NR 11 - Empilhadeira', cotacao: 4800, quantidade_total: 1, meses: [{ competencia: '2026-01-01', quantidade: 1 }] }),
      expect.objectContaining({ descricao: 'NR 11 - Empilhadeira', cotacao: 3900, quantidade_total: 1, meses: [{ competencia: '2026-02-01', quantidade: 1 }] }),
    ]);
  });
});
