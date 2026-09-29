import { describe, expect, it } from 'vitest';
import { criarLinhasCronogramaExcel, criarLinhasPlanoExcel, formatarHorarioTabela } from './rhPlanoTreinamentosExport';

describe('exportação de plano e cronograma de treinamentos', () => {
  it('normaliza horários para HH:mm, inclusive quando a planilha trouxe fração do dia', () => {
    expect(formatarHorarioTabela('8:0')).toBe('08:00');
    expect(formatarHorarioTabela('08:30:00')).toBe('08:30');
    expect(formatarHorarioTabela('0.5')).toBe('12:00');
  });

  it('mantém as colunas do plano na exportação', () => {
    const linhas = criarLinhasPlanoExcel([{ codigo: 'PL-01', titulo: 'NR 10', horario: '8:00', data_inicio: '2026-01-10', custo_total: 125 }] as any);
    expect(linhas[0]).toContain('Horário');
    expect(linhas[1][0]).toBe('PL-01');
    expect(linhas[1][5]).toBe('08:00');
  });

  it('gera uma coluna para cada competência do cronograma', () => {
    const linhas = criarLinhasCronogramaExcel([{ descricao: 'NR 10', cotacao: 50, unidade_mes: 1, quantidade_total: 2, meses: [{ competencia: '2026-01-01', quantidade: 2 }] }] as any, ['2026-01-01', '2026-02-01']);
    expect(linhas[0]).toEqual(expect.arrayContaining(['Jan/26', 'Fev/26']));
    expect(linhas[1].slice(-2)).toEqual([2, '']);
  });
});
