import { describe, expect, it } from 'vitest';
import { CRITERIO_QR, inventarioAvulsoDaPessoa } from './inventarioAtalho';

const inv = (id: string, criado_por_id: string, extra: Record<string, unknown> = {}) =>
  ({ id, criado_por_id, status: 'aberto', criterio: CRITERIO_QR, data: '2026-11-27', ...extra }) as any;

describe('inventário avulso do dia (botão Contar / QR)', () => {
  it('admin sem inventário próprio não entra no da colega — abre o dele', () => {
    // 27/11: o admin apertou Contar e caiu no INV-271126-48 da Kemilly, com aviso de "já em contagem".
    const admin = { id: 'admin', roles: ['admin'] } as any;
    expect(inventarioAvulsoDaPessoa([inv('kemilly-48', 'kemilly')], admin, '2026-11-27')).toBeUndefined();
  });
  it('usa o avulso aberto de hoje da própria pessoa', () => {
    const user = { id: 'kemilly', roles: [] } as any;
    const lista = [inv('outro', 'vinicius'), inv('meu', 'kemilly')];
    expect(inventarioAvulsoDaPessoa(lista, user, '2026-11-27')?.id).toBe('meu');
  });
  it('ignora o próprio já concluído, de outro dia ou planejado', () => {
    const user = { id: 'kemilly', roles: [] } as any;
    const lista = [
      inv('a', 'kemilly', { status: 'concluido' }),
      inv('b', 'kemilly', { data: '2026-11-26' }),
      inv('c', 'kemilly', { criterio: 'Curva ABC' }),
    ];
    expect(inventarioAvulsoDaPessoa(lista, user, '2026-11-27')).toBeUndefined();
  });
});
