import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/supabaseClient', () => ({ supabase: null }));
vi.mock('./almoxCatalogoApi', () => ({
  BUCKET_CATALOGO: 'request-attachments',
  TABELA_CATALOGO: 'alm_catalogo_itens',
  TABELA_FOTOS_ADICIONAIS: 'alm_catalogo_item_fotos',
  obterUrlsFotosCatalogoLote: vi.fn(async (itens: Array<{ path: string }>) =>
    new Map(itens.map(i => [i.path, `https://assinada/${i.path}`]))),
}));

import {
  assinarFotoItem, chaveMaterialFoto, indexarFotosSolicitacaoPorItem, montarFotosDoItem, type FotoItemCompra,
} from './fotosItemCompra';
import { obterUrlsFotosCatalogoLote } from './almoxCatalogoApi';
import type { RequestAttachment } from '../types';

const anexo = (extra: Partial<RequestAttachment>): RequestAttachment => ({
  id: 'a', request_id: 'r1', request_item_id: 'i1', name: 'foto.jpg', url: 'r1/foto.jpg',
  storage_path: 'r1/foto.jpg', mime_type: 'image/jpeg', size: 1, created_at: '2026-11-01T00:00:00Z',
  ...extra,
} as RequestAttachment);

const cadastro: FotoItemCompra[] = [
  { path: 'almox-catalogo/123.jpg', origem: 'cadastro', legenda: 'PARAFUSO' },
  { path: 'almox-catalogo/123-b.jpg', origem: 'cadastro', legenda: 'PARAFUSO (2)' },
];

describe('montarFotosDoItem', () => {
  it('põe as fotos da solicitação antes das do cadastro', () => {
    const fotos = montarFotosDoItem({ anexosSolicitacao: [anexo({})], fotosCadastro: cadastro });
    expect(fotos.map(f => f.origem)).toEqual(['solicitacao', 'cadastro', 'cadastro']);
  });

  it('usa só o cadastro quando a solicitação não tem foto', () => {
    expect(montarFotosDoItem({ anexosSolicitacao: null, fotosCadastro: cadastro })).toHaveLength(2);
  });

  it('item genérico ignora o cadastro', () => {
    const fotos = montarFotosDoItem({ anexosSolicitacao: [anexo({})], fotosCadastro: cadastro, ehGenerico: true });
    expect(fotos).toHaveLength(1);
    expect(fotos[0].origem).toBe('solicitacao');
  });

  it('descarta PDF e o mesmo arquivo repetido nas duas fontes', () => {
    const fotos = montarFotosDoItem({
      anexosSolicitacao: [
        anexo({ id: 'pdf', mime_type: 'application/pdf', storage_path: 'r1/nf.pdf' }),
        anexo({ id: 'reuso', storage_path: '/almox-catalogo/123.jpg' }),
      ],
      fotosCadastro: cadastro,
    });
    expect(fotos.map(f => f.path)).toEqual(['almox-catalogo/123.jpg', 'almox-catalogo/123-b.jpg']);
    expect(fotos[0].origem).toBe('solicitacao');
  });
});

describe('indexarFotosSolicitacaoPorItem', () => {
  it('agrupa só imagens com item', () => {
    const mapa = indexarFotosSolicitacaoPorItem([
      anexo({ id: '1' }),
      anexo({ id: '2', request_item_id: undefined }),
      anexo({ id: '3', mime_type: 'application/pdf' }),
      anexo({ id: '4', request_item_id: 'i2' }),
    ]);
    expect(mapa.get('i1')?.map(a => a.id)).toEqual(['1']);
    expect(mapa.get('i2')?.map(a => a.id)).toEqual(['4']);
  });
});

describe('chaveMaterialFoto', () => {
  it('ignora zeros à esquerda', () => {
    expect(chaveMaterialFoto('0001194538')).toBe('1194538');
    expect(chaveMaterialFoto(' 1194538 ')).toBe('1194538');
    expect(chaveMaterialFoto(null)).toBe('');
  });
});

describe('assinarFotoItem', () => {
  it('agrupa pedidos simultâneos numa só assinatura', async () => {
    vi.mocked(obterUrlsFotosCatalogoLote).mockClear();
    const [a, b, c] = await Promise.all([assinarFotoItem('x.jpg'), assinarFotoItem('/y.jpg'), assinarFotoItem('x.jpg')]);
    expect(a).toBe('https://assinada/x.jpg');
    expect(b).toBe('https://assinada/y.jpg');
    expect(c).toBe(a);
    expect(obterUrlsFotosCatalogoLote).toHaveBeenCalledTimes(1);
  });
});
