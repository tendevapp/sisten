import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.fn(() => ({ client: true }));

vi.mock('@supabase/supabase-js', () => ({ createClient }));

describe('supabaseClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  });

  it('cria um único cliente, com a chave anônima', async () => {
    const modulo = await import('./supabaseClient');

    expect(modulo.supabase).toEqual({ client: true });
    expect(createClient).toHaveBeenCalledTimes(1);
    expect((createClient.mock.calls[0] as unknown[])[1]).toBe('anon-key');
  });

  it('não usa a chave de serviço mesmo que ela esteja no ambiente do build', async () => {
    vi.stubEnv('VITE_SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');

    const modulo = await import('./supabaseClient');

    expect(modulo).not.toHaveProperty('supabaseAdmin');
    expect(createClient).toHaveBeenCalledTimes(1);
    for (const chamada of createClient.mock.calls as unknown[][]) {
      expect(chamada[1]).not.toBe('service-role-key');
    }
  });
});
