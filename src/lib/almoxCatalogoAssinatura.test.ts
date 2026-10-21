import { describe, expect, it, vi } from 'vitest';

const chamadas: number[] = [];

vi.mock('../db/supabaseClient', () => ({
  supabase: {
    storage: {
      from: () => ({
        // Como o Storage real: acima de 1.000 caminhos recusa o pedido inteiro.
        createSignedUrls: async (paths: string[]) => {
          chamadas.push(paths.length);
          if (paths.length > 1000) return { data: null, error: { message: 'body/paths must NOT have more than 1000 items' } };
          return { data: paths.map(p => ({ path: p, signedUrl: `https://assinada/${p}`, error: null })), error: null };
        },
      }),
    },
  },
}));

import { BUCKET_CATALOGO, obterUrlsFotosCatalogoLote } from './almoxCatalogoApi';

describe('obterUrlsFotosCatalogoLote', () => {
  it('assina mais de 1.000 fotos em fatias, sem perder nenhuma', async () => {
    const itens = Array.from({ length: 1154 }, (_, i) => ({ path: `almox-catalogo/material-${i}.jpg`, bucket: BUCKET_CATALOGO }));
    const urls = await obterUrlsFotosCatalogoLote(itens);
    expect(urls.size).toBe(1154);
    expect(urls.get('almox-catalogo/material-1153.jpg')).toBe('https://assinada/almox-catalogo/material-1153.jpg');
    expect(Math.max(...chamadas)).toBeLessThanOrEqual(1000);
  });
});
