import { describe, expect, it } from 'vitest';
import {
  criarLinhasAlertasExcel,
  criarLinhasConformidadeAreaExcel,
  criarLinhasCronogramaExcel,
  criarLinhasCustosExcel,
  criarLinhasPlanoExcel,
  formatarHorarioTabela,
} from './rhPlanoTreinamentosExport';

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

  it('gera linhas formatadas para custos, áreas de conformidade e alertas', () => {
    const linhasCustos = criarLinhasCustosExcel([
      { id: '1', titulo: 'NR 35', tipo: 'interno', cotacaoUnitario: 100, turmasProgramadas: 2, turmasRealizadas: 1, participantesTotal: 15, custoPrevisto: 200, custoRealizado: 120, desvio: -80 },
    ]);
    expect(linhasCustos[0]).toContain('Treinamento');
    expect(linhasCustos[1][0]).toBe('NR 35');
    expect(linhasCustos[1][8]).toBe(-80);

    const linhasAreas = criarLinhasConformidadeAreaExcel([
      { area: 'Manutenção', totalPessoas: 20, aptos: 18, vencidos: 2, pendentes: 0, taxaConformidade: 90 },
    ]);
    expect(linhasAreas[1][0]).toBe('Manutenção');
    expect(linhasAreas[1][5]).toBe('90%');

    const linhasAlertas = criarLinhasAlertasExcel([
      { colaborador: 'Carlos', registro: '123', treinamento: 'NR 10', status_calculado: 'vencido', validade_em: '2026-05-10', dias_para_vencimento: -10 },
    ]);
    expect(linhasAlertas[1][0]).toBe('Carlos');
    expect(linhasAlertas[1][3]).toBe('VENCIDO');
  });
});
