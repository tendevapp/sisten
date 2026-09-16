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
    vi.stubEnv('VITE_SUPABASE_SERVICE_ROLE_KEY', '');
  });

  it('não cria cliente administrativo a partir da chave anônima', async () => {
    const { supabase, supabaseAdmin } = await import('./supabaseClient');

    expect(supabase).toEqual({ client: true });
    expect(supabaseAdmin).toBeNull();
    expect(createClient).toHaveBeenCalledTimes(1);
  });
});
