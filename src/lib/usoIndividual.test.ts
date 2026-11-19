import { describe, expect, it } from 'vitest';
import { consolidarUsoIndividual } from './usoIndividual';
import { isUserAndre, ANDRE_EMAIL, ANDRE_USER_ID } from './pages';

describe('isUserAndre', () => {
  it('libera apenas o usuario de Andre por id ou email', () => {
    expect(isUserAndre({ id: ANDRE_USER_ID, email: 'qualquer@ten.ind.br' })).toBe(true);
    expect(isUserAndre({ id: 'outro-id', email: 'ANDRE.ARAUJO@ten.ind.br' })).toBe(true);
    expect(isUserAndre({ id: 'outro-id', email: ANDRE_EMAIL })).toBe(true);
  });

  it('bloqueia outros admins e outros usuarios com nome parecido', () => {
    expect(isUserAndre({ id: 'admin-2', email: 'outro.admin@ten.ind.br' })).toBe(false);
    expect(isUserAndre({ id: 'fbcac1ac-37af-4973-b3f4-e46adf3017a1', email: 'ricardo.souza@sisten.local' })).toBe(false);
    expect(isUserAndre(null)).toBe(false);
  });
});

describe('consolidarUsoIndividual', () => {
  it('calcula sessoes, tempo em tela, ranking de paginas e respeita teto de 30min', () => {
    const res = consolidarUsoIndividual([
      { id: '1', event_type: 'login', path: null, page_label: null, session_id: 's1', created_at: '2026-11-19T11:00:00.000Z' },
      { id: '2', event_type: 'page_view', path: '/', page_label: 'Início', session_id: 's1', created_at: '2026-11-19T11:00:10.000Z' },
      { id: '3', event_type: 'page_view', path: '/suprimentos/compras', page_label: 'Central Compras', session_id: 's1', created_at: '2026-11-19T11:02:10.000Z' },
      // 1h depois na mesma sessao -> excede teto de 30min, nao soma dwell
      { id: '4', event_type: 'page_view', path: '/suprimentos/compras', page_label: 'Central Compras', session_id: 's1', created_at: '2026-11-19T12:02:10.000Z' },
      { id: '5', event_type: 'page_view', path: '/solicitacoes', page_label: 'Solicitações', session_id: 's1', created_at: '2026-11-19T12:03:10.000Z' },
    ]);

    expect(res.totalLogins).toBe(1);
    expect(res.totalVisualizacoes).toBe(4);
    expect(res.sessoesDistintas).toBe(1);
    expect(res.paginasDistintas).toBe(3);
    // 120s em '/' + 60s em '/suprimentos/compras' (segunda visita) = 180s
    expect(res.tempoTotalSeg).toBe(180);
    expect(res.rankingPaginas[0].path).toBe('/suprimentos/compras');
    expect(res.rankingPaginas[0].visitas).toBe(2);
    expect(res.rankingPaginas[0].tempoTotalSeg).toBe(60);
    expect(res.primeiroEvento).toBe('2026-11-19T11:00:00.000Z');
    expect(res.ultimoEvento).toBe('2026-11-19T12:03:10.000Z');
  });

  it('nao calcula dwell entre sessoes diferentes', () => {
    const res = consolidarUsoIndividual([
      { id: '1', event_type: 'page_view', path: '/', page_label: 'Início', session_id: 's1', created_at: '2026-11-19T11:00:00.000Z' },
      { id: '2', event_type: 'page_view', path: '/relatorios', page_label: 'Relatórios', session_id: 's2', created_at: '2026-11-19T11:05:00.000Z' },
    ]);
    expect(res.sessoesDistintas).toBe(2);
    expect(res.tempoTotalSeg).toBe(0);
    expect(res.eventos[0].dwell_seconds).toBeNull();
  });
});

