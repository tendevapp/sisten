import { describe, expect, it, vi } from 'vitest';
import type { SsmaRidDesvio } from '../types';

const { createSignedUrls } = vi.hoisted(() => ({
  createSignedUrls: vi.fn(),
}));

vi.mock('../db/supabaseClient', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({ createSignedUrls })),
    },
  },
}));

import { assinarFotosDesvios } from './ssmaApi';

describe('URLs das fotos do RID', () => {
  it('renova a URL mesmo quando existe uma URL assinada antiga salva', async () => {
    createSignedUrls.mockResolvedValue({
      data: [{ path: 'rid-1/antes_foto.jpg', signedUrl: 'https://storage/fresh-url' }],
    });

    const desvio = {
      id: 'rid-1',
      fotos: [{
        id: 'foto-1',
        path: 'rid-1/antes_foto.jpg',
        name: 'foto.jpg',
        size: 100,
        mime_type: 'image/jpeg',
        preview_url: 'https://storage/expired-url',
        tipo: 'antes',
        created_at: '2026-09-10T11:47:18.897Z',
      }],
    } as SsmaRidDesvio;

    const [resultado] = await assinarFotosDesvios([desvio]);

    expect(createSignedUrls).toHaveBeenCalledWith(['rid-1/antes_foto.jpg'], 60 * 60 * 24);
    expect(resultado.fotos[0].preview_url).toBe('https://storage/fresh-url');
  });
});
