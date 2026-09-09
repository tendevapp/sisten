import { describe, it, expect } from 'vitest';
import { formatarIdadeCartao } from './kanban';

const agora = new Date('2026-09-08T12:00:00Z');

describe('formatarIdadeCartao', () => {
  it('mostra "agora" no primeiro minuto', () => {
    expect(formatarIdadeCartao('2026-09-08T11:59:30Z', agora)).toEqual({ texto: 'agora', nivel: 'novo' });
  });

  it('conta minutos, horas e dias', () => {
    expect(formatarIdadeCartao('2026-09-08T11:15:00Z', agora).texto).toBe('há 45 min');
    expect(formatarIdadeCartao('2026-09-08T04:00:00Z', agora).texto).toBe('há 8 h');
    expect(formatarIdadeCartao('2026-09-06T12:00:00Z', agora).texto).toBe('há 2 d');
  });

  it('passa a semanas e meses quando fica antigo', () => {
    expect(formatarIdadeCartao('2026-08-25T12:00:00Z', agora).texto).toBe('há 2 sem');
    expect(formatarIdadeCartao('2026-07-01T12:00:00Z', agora).texto).toBe('há 2 meses');
    expect(formatarIdadeCartao('2026-08-05T12:00:00Z', agora).texto).toBe('há 1 mês');
  });

  it('escala o alerta: novo < 3d, atenção 3–6d, crítico >= 7d', () => {
    expect(formatarIdadeCartao('2026-09-06T12:00:00Z', agora).nivel).toBe('novo');
    expect(formatarIdadeCartao('2026-09-04T12:00:00Z', agora).nivel).toBe('atencao');
    expect(formatarIdadeCartao('2026-09-01T12:00:00Z', agora).nivel).toBe('critico');
  });

  it('não quebra com data inválida nem com data futura', () => {
    expect(formatarIdadeCartao('sem-data', agora)).toEqual({ texto: '—', nivel: 'novo' });
    expect(formatarIdadeCartao('2026-09-09T12:00:00Z', agora).texto).toBe('agora');
  });
});
