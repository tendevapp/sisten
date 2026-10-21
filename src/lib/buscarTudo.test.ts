import { describe, expect, it } from 'vitest';
import { buscarTudo } from './buscarTudo';

/** Simula o PostgREST: devolve a fatia pedida, nunca mais que `teto` linhas. */
function servidor(total: number, teto = 1000) {
  const linhas = Array.from({ length: total }, (_, i) => i);
  const pedidos: [number, number][] = [];
  const consulta = async (de: number, ate: number) => {
    pedidos.push([de, ate]);
    return { data: linhas.slice(de, Math.min(ate + 1, de + teto)), error: null };
  };
  return { consulta, pedidos };
}

describe('buscarTudo', () => {
  it('passa do teto de 1.000 linhas juntando as páginas', async () => {
    const { consulta, pedidos } = servidor(1154);
    const todas = await buscarTudo<number>(consulta);
    expect(todas).toHaveLength(1154);
    expect(todas.at(-1)).toBe(1153);
    expect(pedidos).toEqual([[0, 999], [1000, 1999]]);
  });

  it('com o total exato de uma página, confirma o fim com uma página vazia', async () => {
    const { consulta, pedidos } = servidor(1000);
    expect(await buscarTudo<number>(consulta)).toHaveLength(1000);
    expect(pedidos).toHaveLength(2);
  });

  it('propaga o erro do servidor', async () => {
    await expect(buscarTudo(async () => ({ data: null, error: { message: 'caiu' } }))).rejects.toThrow('caiu');
  });
});
