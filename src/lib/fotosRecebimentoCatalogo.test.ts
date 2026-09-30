import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/supabaseClient', () => ({ supabase: {} }));
vi.mock('../db/localDb', () => ({ localDb: {} }));
vi.mock('./recebimentoAlmoxApi', () => ({ assinarEvidencias: vi.fn(async () => ({})) }));
vi.mock('./almoxCatalogoApi', () => ({
  buscarItemAtivoCatalogo: vi.fn(),
  salvarItemCatalogo: vi.fn(),
}));

import { buscarItemAtivoCatalogo, salvarItemCatalogo } from './almoxCatalogoApi';
import { cadastrarItensComFotoNoCatalogo, extrairFotosDosItens } from './fotosRecebimentoCatalogo';
import type { Profile } from '../types';

const foto = (path: string, tipo = 'image/jpeg') => ({ path, nome: `${path}.jpg`, tipo });

describe('extrairFotosDosItens', () => {
  it('traz primeiro as fotos da conferência mais recente', () => {
    const r = extrairFotosDosItens([
      { material_code: '1', evidencias: [foto('antiga')], conferencia: { codigo: 'RCM-010126-01', data: '2026-01-01' } },
      { material_code: '1', evidencias: [foto('nova1'), foto('nova2')], conferencia: { codigo: 'RCM-300926-01', data: '2026-09-30' } },
    ]);
    expect(r.map((f) => f.path)).toEqual(['nova1', 'nova2', 'antiga']);
    expect(r[0]).toMatchObject({ conferencia: 'RCM-300926-01', data: '2026-09-30' });
  });

  it('ignora conferência excluída, PDF e item sem foto', () => {
    const r = extrairFotosDosItens([
      { material_code: '1', evidencias: [foto('x')], conferencia: { codigo: 'A', data: '2026-09-30', excluido_em: '2026-10-01T00:00:00Z' } },
      { material_code: '1', evidencias: [foto('nota', 'application/pdf')], conferencia: { codigo: 'B', data: '2026-09-29' } },
      { material_code: '1', evidencias: [], conferencia: { codigo: 'C', data: '2026-09-28' } },
      { material_code: '1', evidencias: null, conferencia: { codigo: 'D', data: '2026-09-27' } },
      { material_code: '1', evidencias: [foto('ok')], conferencia: { codigo: 'E', data: '2026-09-26' } },
    ]);
    expect(r.map((f) => f.path)).toEqual(['ok']);
  });

  it('respeita o limite', () => {
    const evs = Array.from({ length: 5 }, (_, i) => foto(`f${i}`));
    expect(extrairFotosDosItens([{ material_code: '1', evidencias: evs, conferencia: { codigo: 'A', data: '2026-09-30' } }], 3)).toHaveLength(3);
  });
});

describe('cadastrarItensComFotoNoCatalogo', () => {
  const user = { id: 'u1', name: 'MARIA' } as Profile;
  const original = new File(['x'], 'camera.jpg', { type: 'image/jpeg' });
  const nova = { blob: new Blob(['carimbada']), name: 'camera.jpg', mimeType: 'image/jpeg', sizeOriginal: 1, sizeCompressed: 1, previewUrl: 'blob:x', original };

  beforeEach(() => {
    vi.mocked(buscarItemAtivoCatalogo).mockReset().mockResolvedValue(null);
    vi.mocked(salvarItemCatalogo).mockReset().mockResolvedValue({} as any);
  });

  it('cadastra o item com a foto limpa (sem carimbo), sem exigir saldo', async () => {
    const r = await cadastrarItensComFotoNoCatalogo(
      [{ materialCode: '1471091', descricao: 'CARREGADOR CELULAR TIPO-C C/CABO', unidade: 'UN', fotosNovas: [nova] }],
      user,
    );
    expect(r.cadastrados).toEqual(['1471091']);
    expect(salvarItemCatalogo).toHaveBeenCalledWith(
      expect.objectContaining({ codigo_sap: '1471091', descricao: 'CARREGADOR CELULAR TIPO-C C/CABO', umb: 'UN', fotoArquivo: original }),
      user,
    );
  });

  it('não troca a foto que o catálogo já tem', async () => {
    vi.mocked(buscarItemAtivoCatalogo).mockResolvedValue({ imagem_path: 'almox-catalogo/a.jpg' } as any);
    const r = await cadastrarItensComFotoNoCatalogo([{ materialCode: '1420740', descricao: 'LANTERNA', fotosNovas: [nova] }], user);
    expect(r.jaTinham).toEqual(['1420740']);
    expect(salvarItemCatalogo).not.toHaveBeenCalled();
  });

  it('projeto, sem código ou sem foto ficam de fora; uma falha não derruba os outros', async () => {
    vi.mocked(salvarItemCatalogo).mockRejectedValueOnce(new Error('sem rede'));
    const r = await cadastrarItensComFotoNoCatalogo([
      { materialCode: '100000000000044436', descricao: 'TOWER', fotosNovas: [nova] },
      { materialCode: '', descricao: 'SEM CODIGO', fotosNovas: [nova] },
      { materialCode: '9', descricao: 'SEM FOTO' },
      { materialCode: '1194258', descricao: 'FITA', fotosNovas: [nova] },
      { materialCode: '1423913', descricao: 'LANTERNA 2', fotosNovas: [nova] },
    ], user);
    expect(r.ignorados).toEqual(['100000000000044436']);
    expect(r.falhas).toEqual([{ material: '1194258', motivo: 'sem rede' }]);
    expect(r.cadastrados).toEqual(['1423913']);
  });
});
