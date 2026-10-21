/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * O PostgREST do projeto devolve no máximo 1.000 linhas por requisição
 * (`max_rows`), e corta em silêncio: sem erro, a tela só recebe menos. Pedir
 * `.range(0, 19999)` não adianta — o servidor limita do mesmo jeito. Toda
 * leitura de tabela que pode passar de mil linhas pagina por aqui.
 *
 * A consulta precisa de `.order()` numa chave estável, senão uma página pode
 * repetir ou pular linhas.
 */
export async function buscarTudo<T>(
  montarQuery: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  pagina = 1000,
): Promise<T[]> {
  const saida: T[] = [];
  for (let i = 0; ; i += 1) {
    const de = i * pagina;
    const { data, error } = await montarQuery(de, de + pagina - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as T[];
    saida.push(...lote);
    if (lote.length < pagina) break;
  }
  return saida;
}
