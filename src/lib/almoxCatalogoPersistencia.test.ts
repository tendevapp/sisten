/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Catálogo do almoxarifado gravando em `alm_catalogo_itens` — o que antes
 * ficava só no localStorage de quem cadastrou. Supabase simulado em memória.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Profile } from '../types';
import {
  salvarItemCatalogo, listarItensCatalogo, buscarFotoCatalogoPorCodigoSap, buscarFotosCatalogoPorCodigosSap,
  excluirItemCatalogo, migrarCatalogoLocalLegado, salvarItensCatalogoLocal, obterItensCatalogoLocal,
} from './almoxCatalogoApi';

type Linha = Record<string, any>;

const banco = vi.hoisted(() => ({
  linhas: [] as Record<string, any>[],
  arquivos: new Set<string>(),
  seq: 0,
  falharGravacao: false,
}));

vi.mock('./imageCompression', () => ({
  comprimirImagemUpload: async () => new Blob(['jpg'], { type: 'image/jpeg' }),
}));

vi.mock('../db/localDb', () => ({
  localDb: { getEstoque: () => [], fetchEstoque: async () => [], getGruposMercadoria: () => [] },
}));

vi.mock('../db/supabaseClient', () => {
  function consulta(tabela: string) {
    const filtros: ((l: Linha) => boolean)[] = [];
    let operacao: { tipo: 'select' | 'insert' | 'update'; dados?: Linha } = { tipo: 'select' };

    const executar = () => {
      if (tabela !== 'alm_catalogo_itens') return { data: [], error: null };
      if (operacao.tipo === 'insert') {
        if (banco.falharGravacao) return { data: null, error: { code: 'XX', message: 'falhou' } };
        const nova = { ...operacao.dados } as Linha;
        if (banco.linhas.some(l => l.ativo && nova.ativo !== false && l.codigo_sap === nova.codigo_sap)) {
          return { data: null, error: { code: '23505', message: 'duplicado' } };
        }
        banco.seq += 1;
        nova.id = `id-${banco.seq}`;
        nova.codigo_registro = `CAT-290926-${String(banco.seq).padStart(2, '0')}`;
        banco.linhas.push(nova);
        return { data: [{ ...nova }], error: null };
      }
      const alvo = banco.linhas.filter(l => filtros.every(f => f(l)));
      if (operacao.tipo === 'update') {
        if (banco.falharGravacao) return { data: null, error: { code: 'XX', message: 'falhou' } };
        alvo.forEach(l => Object.assign(l, operacao.dados));
      }
      return { data: alvo.map(l => ({ ...l })), error: null };
    };

    const q: any = {
      select: () => q,
      insert: (dados: Linha) => { operacao = { tipo: 'insert', dados }; return q; },
      update: (dados: Linha) => { operacao = { tipo: 'update', dados }; return q; },
      eq: (c: string, v: any) => { filtros.push(l => l[c] === v); return q; },
      in: (c: string, vs: any[]) => { filtros.push(l => vs.includes(l[c])); return q; },
      not: (c: string) => { filtros.push(l => l[c] != null); return q; },
      order: () => q,
      maybeSingle: async () => { const r = executar(); return { data: r.data?.[0] ?? null, error: r.error }; },
      single: async () => { const r = executar(); return { data: r.data?.[0] ?? null, error: r.error }; },
      then: (ok: any, erro: any) => Promise.resolve(executar()).then(ok, erro),
    };
    return q;
  }

  const storage = {
    from: () => ({
      upload: async (path: string) => { banco.arquivos.add(path); return { error: null }; },
      remove: async (paths: string[]) => { paths.forEach(p => banco.arquivos.delete(p)); return { error: null }; },
      createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://assinada/${path}` }, error: null }),
      createSignedUrls: async (paths: string[]) => ({ data: paths.map(p => ({ path: p, signedUrl: `https://assinada/${p}` })), error: null }),
    }),
  };

  return { supabase: { from: consulta, storage } };
});

if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, String(v)); },
      removeItem: (k: string) => { mem.delete(k); },
      clear: () => mem.clear(),
    },
    writable: true,
  });
}

const usuario = { id: 'u-1', name: 'Almoxarife' } as Profile;
const foto = () => new File(['x'], 'IMG_0001.PNG', { type: 'image/png' });

beforeEach(() => {
  banco.linhas = [];
  banco.arquivos.clear();
  banco.seq = 0;
  banco.falharGravacao = false;
  localStorage.clear();
});

describe('salvarItemCatalogo', () => {
  it('grava na tabela e sobe a foto comprimida como .jpg', async () => {
    const salvo = await salvarItemCatalogo({
      codigo_sap: '1423710', descricao: 'ALAVANCA MAKITA 4187280', observacao: 'Peça da 9557N', fotoArquivo: foto(),
    }, usuario);

    expect(banco.linhas).toHaveLength(1);
    expect(salvo.codigo_registro).toBe('CAT-290926-01');
    expect(salvo.imagem_path).toMatch(/^almox-catalogo\/material-1423710-\d+\.jpg$/);
    expect(banco.arquivos.has(salvo.imagem_path!)).toBe(true);
    expect(salvo.url_imagem).toContain('https://assinada/');
  });

  it('trocar a foto atualiza o mesmo registro e apaga a foto anterior', async () => {
    const primeiro = await salvarItemCatalogo({ codigo_sap: '1423710', descricao: 'ALAVANCA', fotoArquivo: foto() }, usuario);
    await new Promise(r => setTimeout(r, 2));
    const segundo = await salvarItemCatalogo({ codigo_sap: '1423710', descricao: 'ALAVANCA', fotoArquivo: foto() }, usuario);

    expect(banco.linhas).toHaveLength(1);
    expect(segundo.id).toBe(primeiro.id);
    expect(banco.arquivos.has(primeiro.imagem_path!)).toBe(false);
    expect(banco.arquivos.has(segundo.imagem_path!)).toBe(true);
  });

  it('remover a foto não apaga texto técnico nem observação', async () => {
    const salvo = await salvarItemCatalogo({
      codigo_sap: '1423710', descricao: 'ALAVANCA', texto_tecnico: 'MODELO 9557N', observacao: 'Caixa com 1', fotoArquivo: foto(),
    }, usuario);
    await salvarItemCatalogo({ codigo_sap: '1423710', descricao: 'ALAVANCA', removerFoto: true }, usuario);

    const linha = banco.linhas[0];
    expect(linha.imagem_path).toBeNull();
    expect(linha.texto_tecnico).toBe('MODELO 9557N');
    expect(linha.observacao).toBe('Caixa com 1');
    expect(banco.arquivos.has(salvo.imagem_path!)).toBe(false);
  });

  it('se a gravação falha, a foto recém-enviada não fica órfã no Storage', async () => {
    banco.falharGravacao = true;
    await expect(salvarItemCatalogo({ codigo_sap: '1423710', descricao: 'ALAVANCA', fotoArquivo: foto() }, usuario))
      .rejects.toThrow('Falha ao salvar no catálogo');
    expect(banco.arquivos.size).toBe(0);
  });
});

describe('leitura compartilhada', () => {
  it('o que um usuário salvou aparece na listagem e na busca de fotos de outro', async () => {
    await salvarItemCatalogo({ codigo_sap: '1423710', descricao: 'ALAVANCA', fotoArquivo: foto() }, usuario);
    localStorage.clear(); // outro aparelho: nada local

    expect((await listarItensCatalogo()).map(i => i.codigo_sap)).toEqual(['1423710']);
    expect((await buscarFotoCatalogoPorCodigoSap('1423710'))?.url_imagem).toContain('https://assinada/');
    expect((await buscarFotosCatalogoPorCodigosSap(['1423710', '999'])).has('1423710')).toBe(true);
  });

  it('excluir desativa o registro e apaga a foto', async () => {
    const salvo = await salvarItemCatalogo({ codigo_sap: '1423710', descricao: 'ALAVANCA', fotoArquivo: foto() }, usuario);
    await excluirItemCatalogo(salvo.id, usuario);

    expect(banco.linhas[0].ativo).toBe(false);
    expect(banco.arquivos.size).toBe(0);
    expect(await listarItensCatalogo()).toEqual([]);
  });
});

describe('migrarCatalogoLocalLegado', () => {
  it('sobe o que ficou no aparelho, sem a foto inexistente, e limpa o local', async () => {
    salvarItensCatalogoLocal([
      { codigo_sap: '200099', descricao: 'ABAFADOR', observacao: 'Concha', ativo: true, imagem_path: 'almox-catalogo/x.jpg' } as any,
      { codigo_sap: '200100', descricao: 'LUVA', ativo: false } as any,
    ]);

    expect(await migrarCatalogoLocalLegado()).toBe(1);
    expect(banco.linhas).toHaveLength(1);
    expect(banco.linhas[0]).toMatchObject({ codigo_sap: '200099', observacao: 'Concha' });
    expect(banco.linhas[0].imagem_path).toBeUndefined();
    expect(obterItensCatalogoLocal()).toEqual([]);
  });

  it('não duplica material que já está no banco', async () => {
    await salvarItemCatalogo({ codigo_sap: '200099', descricao: 'ABAFADOR' }, usuario);
    salvarItensCatalogoLocal([{ codigo_sap: '200099', descricao: 'ABAFADOR', ativo: true } as any]);

    expect(await migrarCatalogoLocalLegado()).toBe(0);
    expect(banco.linhas).toHaveLength(1);
  });
});
