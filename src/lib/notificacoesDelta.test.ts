import { describe, expect, it } from 'vitest';
import { LEITURA_COMPLETA_MS, maisRecente, mesclarNotificacoes, precisaLeituraCompleta } from './notificacoesDelta';

const n = (id: string, created_at: string, is_read = false) => ({ id, created_at, is_read });

describe('notificações: só as novas, com leitura completa de tempos em tempos', () => {
  it('novas entram no topo, sem repetir, mais recentes primeiro, até o limite', () => {
    const atuais = [n('b', '2026-11-26T10:00:00Z'), n('a', '2026-11-26T09:00:00Z')];
    const novas = [n('c', '2026-11-26T11:00:00Z'), n('b', '2026-11-26T10:00:00Z', true)];
    expect(mesclarNotificacoes(atuais, novas, 2).map(x => x.id)).toEqual(['c', 'b']);
    // A versão do servidor vale sobre a do cache.
    expect(mesclarNotificacoes(atuais, novas, 10).find(x => x.id === 'b')?.is_read).toBe(true);
  });
  it('marca de onde buscar as novas', () => {
    expect(maisRecente([n('a', '2026-11-26T09:00:00Z'), n('b', '2026-11-26T10:00:00Z')])).toBe('2026-11-26T10:00:00Z');
    expect(maisRecente([])).toBeNull();
  });
  it('leitura completa: sem cache, na primeira vez ou depois do intervalo (lidas/excluídas em outro aparelho)', () => {
    expect(precisaLeituraCompleta({ temCache: false, ultimaCompletaEm: 1, agora: 2 })).toBe(true);
    expect(precisaLeituraCompleta({ temCache: true, ultimaCompletaEm: null, agora: 2 })).toBe(true);
    expect(precisaLeituraCompleta({ temCache: true, ultimaCompletaEm: 0, agora: LEITURA_COMPLETA_MS - 1 })).toBe(false);
    expect(precisaLeituraCompleta({ temCache: true, ultimaCompletaEm: 0, agora: LEITURA_COMPLETA_MS })).toBe(true);
  });
});
