import { describe, expect, it } from 'vitest';
import { cargaAguardandoAlmox, entregasPortariaPendentes, rotuloStatusCarga } from './recebimentoAlmox';

const c = (status: string, data: string, hora: string | null = null, created_at = '2026-11-10T10:00:00Z') => ({ status, data, hora, created_at });

describe('ficha cega aberta pela portaria', () => {
  it('rótulos de status, inclusive os novos', () => {
    expect(rotuloStatusCarga('aguardando_almox')).toBe('Aguardando almoxarifado');
    expect(rotuloStatusCarga('nao_chegou')).toBe('Não chegou');
    expect(rotuloStatusCarga('recebida')).toBe('Recebida');
    expect(rotuloStatusCarga('outro')).toBe('outro');
  });

  it('pendentes: só aguardando, mais antiga primeiro', () => {
    const l = [
      c('aguardando_almox', '2026-11-10', '14:00'),
      c('recebida', '2026-11-09', '08:00'),
      c('aguardando_almox', '2026-11-10', '09:30'),
      c('nao_chegou', '2026-11-08'),
      c('aguardando_almox', '2026-11-09', '16:00'),
    ];
    expect(entregasPortariaPendentes(l).map((x) => `${x.data} ${x.hora}`)).toEqual([
      '2026-11-09 16:00', '2026-11-10 09:30', '2026-11-10 14:00',
    ]);
    expect(cargaAguardandoAlmox({ status: 'nao_chegou' })).toBe(false);
  });
});
