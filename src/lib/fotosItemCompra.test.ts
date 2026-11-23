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
  assinarFotoItem, chaveMaterialFoto, indexarFotosSolicitacaoPorItem, indexarFotosSolicitacaoPorMaterial,
  montarFotosDoItem, type FotoItemCompra,
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

describe('indexarFotosSolicitacaoPorMaterial', () => {
  const itens = [
    { id: 'i-antigo', request_id: 'r-antigo', sap_code: '1449040' },
    { id: 'i-gen', request_id: 'r-gen', sap_code: '1449040', is_generic: true },
  ];

  it('acha a foto do mesmo material em outra solicitação, mais recente primeiro', () => {
    const mapa = indexarFotosSolicitacaoPorMaterial([
      anexo({ id: 'a1', request_id: 'r-antigo', request_item_id: 'i-antigo', storage_path: 'r-antigo/1.jpg', created_at: '2026-09-30T00:00:00Z' }),
      anexo({ id: 'a2', request_id: 'r-antigo', request_item_id: 'i-antigo', storage_path: 'r-antigo/2.jpg', created_at: '2026-10-05T00:00:00Z' }),
      anexo({ id: 'pdf', request_id: 'r-antigo', request_item_id: 'i-antigo', mime_type: 'application/pdf', storage_path: 'r-antigo/nf.pdf' }),
      anexo({ id: 'g', request_id: 'r-gen', request_item_id: 'i-gen', storage_path: 'r-gen/g.jpg' }),
    ], itens, new Map([['r-antigo', '4000022']]));
    const fotos = mapa.get('1449040') ?? [];
    expect(fotos.map(f => f.path)).toEqual(['r-antigo/2.jpg', 'r-antigo/1.jpg']);
    expect(fotos[0]).toMatchObject({ origem: 'outra_solicitacao', legenda: 'Solicitação #4000022' });
  });

  it('usa o material do anexo quando o item não está em cache, sem zeros à esquerda', () => {
    const mapa = indexarFotosSolicitacaoPorMaterial(
      [anexo({ request_item_id: 'sumiu', material_code: '0001449040' } as Partial<RequestAttachment>)], [],
    );
    expect(mapa.get('1449040')).toHaveLength(1);
  });

  it('entra depois do cadastro, só em item não genérico e sem repetir a própria foto', () => {
    const outras: FotoItemCompra[] = [
      { path: 'r1/foto.jpg', origem: 'outra_solicitacao', legenda: 'Solicitação #1' },
      { path: 'r2/x.jpg', origem: 'outra_solicitacao', legenda: 'Solicitação #2' },
    ];
    const fotos = montarFotosDoItem({ anexosSolicitacao: [anexo({})], fotosCadastro: cadastro, fotosOutrasSolicitacoes: outras });
    expect(fotos.map(f => f.origem)).toEqual(['solicitacao', 'cadastro', 'cadastro', 'outra_solicitacao']);
    expect(montarFotosDoItem({ fotosOutrasSolicitacoes: outras, ehGenerico: true })).toHaveLength(0);
    expect(montarFotosDoItem({ fotosOutrasSolicitacoes: outras })).toHaveLength(2);
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
