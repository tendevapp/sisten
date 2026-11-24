import { describe, it, expect } from 'vitest';
import { liberadoEm, SILENCIO_MS, JANELA_MS, ESPERA_MAXIMA_MS } from './espalhamentoDownload';

const t0 = Date.parse('2026-11-24T14:07:00Z');

describe('liberadoEm', () => {
  it('espera o silêncio mais a fração do aparelho na janela', () => {
    expect(liberadoEm('2026-11-24T14:07:00Z', { fracao: 0, vistoEm: t0 })).toBe(t0 + SILENCIO_MS);
    expect(liberadoEm('2026-11-24T14:07:00Z', { fracao: 0.5, vistoEm: t0 })).toBe(t0 + SILENCIO_MS + JANELA_MS / 2);
  });

  it('importação seguinte empurra a vez (um download só por rodada)', () => {
    const ad = { fracao: 0.1, vistoEm: t0 };
    const depois = liberadoEm('2026-11-24T14:13:00Z', ad)!;
    expect(depois).toBe(Date.parse('2026-11-24T14:13:00Z') + SILENCIO_MS + 0.1 * JANELA_MS);
  });

  it('não espera além do limite nem sem data no carimbo', () => {
    expect(liberadoEm('2026-11-24T15:00:00Z', { fracao: 0.9, vistoEm: t0 })).toBe(t0 + ESPERA_MAXIMA_MS);
    expect(liberadoEm(null, { fracao: 0.5, vistoEm: t0 })).toBeNull();
  });

  it('importação antiga (app aberto depois) libera na hora', () => {
    expect(liberadoEm('2026-11-23T10:00:00Z', { fracao: 0.9, vistoEm: t0 })!).toBeLessThan(t0);
  });
});
