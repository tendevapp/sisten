import { describe, expect, it } from 'vitest';
import { alteradoNoIntervalo, formatarAlteracao, intervaloDoFiltro } from './filtroDataAlteracao';

// 21/10/2026 15:00 no fuso do aparelho.
const agora = new Date(2026, 9, 21, 15, 0);
const semPeriodo = { de: '', ate: '' };

/** Instante ISO de um horário local. */
const local = (dia: number, hora: number, mes = 9) => new Date(2026, mes, dia, hora, 0).toISOString();

describe('intervaloDoFiltro', () => {
  it('monta os atalhos a partir do dia local', () => {
    expect(intervaloDoFiltro('todas', semPeriodo, agora)).toBeNull();
    expect(intervaloDoFiltro('hoje', semPeriodo, agora)).toEqual({ de: '2026-10-21', ate: '2026-10-21' });
    expect(intervaloDoFiltro('ontem', semPeriodo, agora)).toEqual({ de: '2026-10-20', ate: '2026-10-20' });
    expect(intervaloDoFiltro('7dias', semPeriodo, agora)).toEqual({ de: '2026-10-15', ate: '2026-10-21' });
    expect(intervaloDoFiltro('30dias', semPeriodo, agora)).toEqual({ de: '2026-09-22', ate: '2026-10-21' });
  });

  it('no período, aceita ponta aberta e desinverte datas trocadas', () => {
    expect(intervaloDoFiltro('periodo', { de: '2026-10-01', ate: '' }, agora)).toEqual({ de: '2026-10-01', ate: '' });
    expect(intervaloDoFiltro('periodo', { de: '2026-10-20', ate: '2026-10-10' }, agora)).toEqual({ de: '2026-10-10', ate: '2026-10-20' });
  });
});

describe('alteradoNoIntervalo', () => {
  const hoje = intervaloDoFiltro('hoje', semPeriodo, agora);

  it('compara pelo dia local, inclusive no fim da noite', () => {
    expect(alteradoNoIntervalo(local(21, 0), hoje)).toBe(true);
    expect(alteradoNoIntervalo(local(21, 23), hoje)).toBe(true);
    expect(alteradoNoIntervalo(local(20, 23), hoje)).toBe(false);
  });

  it('sem filtro passa tudo; com filtro, item sem data fica de fora', () => {
    expect(alteradoNoIntervalo(null, null)).toBe(true);
    expect(alteradoNoIntervalo(null, hoje)).toBe(false);
    expect(alteradoNoIntervalo('lixo', hoje)).toBe(false);
  });

  it('período com só a data inicial vai até hoje e além', () => {
    const desde = intervaloDoFiltro('periodo', { de: '2026-10-15', ate: '' }, agora);
    expect(alteradoNoIntervalo(local(14, 12), desde)).toBe(false);
    expect(alteradoNoIntervalo(local(15, 8), desde)).toBe(true);
    expect(alteradoNoIntervalo(local(21, 8), desde)).toBe(true);
  });
});

describe('formatarAlteracao', () => {
  it('mostra dia/mês e hora locais, com ano só fora do ano atual', () => {
    expect(formatarAlteracao(new Date(2026, 9, 21, 15, 3).toISOString(), agora)).toBe('21/10 15:03');
    expect(formatarAlteracao(new Date(2025, 0, 5, 8, 0).toISOString(), agora)).toBe('05/01/2025 08:00');
    expect(formatarAlteracao('lixo', agora)).toBe('');
  });
});
