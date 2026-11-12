/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Download de tabela inteira paginado pela chave (`coluna > último valor`),
 * não por OFFSET.
 *
 * Com OFFSET, a página N obriga o banco a montar e descartar as N−1 anteriores:
 * baixar 70 mil linhas em páginas de mil custa ~35× a tabela. Medido em
 * 12/11/2026 na última página: MB51 453 ms com OFFSET × 1,2 ms pela chave;
 * fornecedores/cidades 438 ms × 1,1 ms. Na instância Micro cada leitura dessas
 * também expulsa do cache o que os outros usuários estavam usando.
 *
 * Só serve para chave que o banco ordena e indexa. Tabela pequena (2026 da
 * ZL0132, ~3 mil linhas) continua no OFFSET: lá ele é mais barato.
 */

export interface RespostaPagina<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Chave única e não nula (ex.: `id`). `pagina(depois, limite)` devolve as linhas
 * com chave maior que `depois` (todas, quando `null`), ordenadas pela chave.
 */
export async function buscarPorChave<T>(
  pagina: (depois: string | number | null, limite: number) => PromiseLike<RespostaPagina<T>>,
  chave: (linha: T) => string | number,
  tamanho = 1000,
): Promise<T[]> {
  const saida: T[] = [];
  let depois: string | number | null = null;
  for (;;) {
    const { data, error } = await pagina(depois, tamanho);
    if (error) throw new Error(error.message);
    const lote = data ?? [];
    saida.push(...lote);
    if (lote.length < tamanho) break;
    depois = chave(lote[lote.length - 1]);
  }
  return saida;
}

/**
 * Chave que se repete (ex.: `material` do histórico de pedidos, várias linhas
 * por material). Cada página termina no fim de um grupo: as linhas do último
 * valor da página ficam para a próxima, que começa nele (`>=`). Grupo maior que
 * uma página inteira vem de `grupoInteiro`.
 *
 * `paginaDesde(desde, inclusivo, limite)`: linhas com chave `>= desde`
 * (inclusivo) ou `> desde`, todas quando `null`, ordenadas pela chave, sem
 * chave nula — as de chave nula o chamador busca à parte.
 */
export async function buscarPorGrupo<T>(opcoes: {
  paginaDesde: (desde: string | null, inclusivo: boolean, limite: number) => PromiseLike<RespostaPagina<T>>;
  grupoInteiro: (valor: string) => Promise<T[]>;
  chave: (linha: T) => string;
  tamanho?: number;
}): Promise<T[]> {
  const { paginaDesde, grupoInteiro, chave, tamanho = 1000 } = opcoes;
  const saida: T[] = [];
  let desde: string | null = null;
  let inclusivo = false;
  for (;;) {
    const { data, error } = await paginaDesde(desde, inclusivo, tamanho);
    if (error) throw new Error(error.message);
    const lote = data ?? [];
    if (lote.length < tamanho) {
      saida.push(...lote);
      break;
    }
    const ultimo = chave(lote[lote.length - 1]);
    if (chave(lote[0]) === ultimo) {
      // A página inteira é um grupo só (e pode haver mais dele adiante).
      saida.push(...(await grupoInteiro(ultimo)));
      desde = ultimo;
      inclusivo = false;
      continue;
    }
    for (const linha of lote) {
      if (chave(linha) !== ultimo) saida.push(linha);
    }
    desde = ultimo;
    inclusivo = true;
  }
  return saida;
}
