import { describe, expect, it } from 'vitest';
import { buscarPorChave, buscarPorGrupo } from './paginacaoChave';

type Linha = { id: number; material: string; seq: number };

/** Banco de mentira: ordena como o Postgres faria (texto, depois seq). */
function banco(linhas: Linha[]) {
  const ordenadas = [...linhas].sort((a, b) => (a.material < b.material ? -1 : a.material > b.material ? 1 : a.seq - b.seq));
  let chamadas = 0;
  return {
    get chamadas() { return chamadas; },
    porId: async (depois: string | number | null, limite: number) => {
      chamadas += 1;
      const porId = [...linhas].sort((a, b) => a.id - b.id);
      return { data: porId.filter((l) => depois === null || l.id > Number(depois)).slice(0, limite), error: null };
    },
    desde: async (desde: string | null, inclusivo: boolean, limite: number) => {
      chamadas += 1;
      const filtradas = ordenadas.filter((l) => desde === null || (inclusivo ? l.material >= desde : l.material > desde));
      // Dentro do mesmo material a ordem não é garantida: embaralha de propósito.
      return { data: filtradas.slice(0, limite).reverse().sort((a, b) => (a.material < b.material ? -1 : a.material > b.material ? 1 : 0)), error: null };
    },
    grupo: async (valor: string) => ordenadas.filter((l) => l.material === valor),
  };
}

function gerar(grupos: Array<[string, number]>): Linha[] {
  let id = 0;
  return grupos.flatMap(([material, n]) => Array.from({ length: n }, (_, seq) => ({ id: ++id, material, seq })));
}

const chaves = (ls: Linha[]) => ls.map((l) => l.id).sort((a, b) => a - b);

describe('buscarPorChave', () => {
  it('traz tudo uma vez só, inclusive quando o total é múltiplo da página', async () => {
    for (const total of [0, 1, 9, 10, 11, 30]) {
      const linhas = gerar([['A', total]]);
      const db = banco(linhas);
      const r = await buscarPorChave(db.porId, (l) => l.id, 10);
      expect(chaves(r)).toEqual(chaves(linhas));
    }
  });

  it('erro da página vira exceção', async () => {
    await expect(buscarPorChave(async () => ({ data: null, error: { message: 'falhou' } }), () => 1)).rejects.toThrow('falhou');
  });
});

describe('buscarPorGrupo', () => {
  it('não perde nem repete linha quando o grupo cruza a página', async () => {
    const linhas = gerar([['A', 3], ['B', 4], ['C', 6], ['D', 1], ['E', 5]]);
    const r = await buscarPorGrupo({ paginaDesde: banco(linhas).desde, grupoInteiro: banco(linhas).grupo, chave: (l) => l.material, tamanho: 5 });
    expect(chaves(r)).toEqual(chaves(linhas));
  });

  it('grupo maior que a página vem inteiro de grupoInteiro', async () => {
    const linhas = gerar([['A', 2], ['B', 23], ['C', 4], ['D', 12]]);
    const db = banco(linhas);
    const r = await buscarPorGrupo({ paginaDesde: db.desde, grupoInteiro: db.grupo, chave: (l) => l.material, tamanho: 5 });
    expect(chaves(r)).toEqual(chaves(linhas));
  });

  it('página cheia que termina exatamente no fim da tabela', async () => {
    for (const grupos of [[['A', 5]], [['A', 2], ['B', 3]], [['A', 5], ['B', 5]], [['A', 10]]] as Array<Array<[string, number]>>) {
      const linhas = gerar(grupos);
      const db = banco(linhas);
      const r = await buscarPorGrupo({ paginaDesde: db.desde, grupoInteiro: db.grupo, chave: (l) => l.material, tamanho: 5 });
      expect(chaves(r)).toEqual(chaves(linhas));
    }
  });

  it('tabela vazia', async () => {
    const db = banco([]);
    expect(await buscarPorGrupo({ paginaDesde: db.desde, grupoInteiro: db.grupo, chave: (l: Linha) => l.material })).toEqual([]);
  });
});
