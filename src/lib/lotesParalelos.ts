/**
 * Envia uma lista em lotes, alguns ao mesmo tempo. Usado nas importações
 * grandes: mandar um lote por vez deixa a rede ociosa esperando cada resposta.
 * Erro em qualquer lote interrompe os seguintes (os que já estão no ar
 * terminam) e é relançado.
 */
export async function enviarEmLotesParalelos<T>(
  itens: T[],
  enviar: (lote: T[]) => Promise<void>,
  opcoes: { tamanho?: number; paralelo?: number; onAvanco?: (enviados: number, total: number) => void } = {},
): Promise<void> {
  const tamanho = Math.max(1, opcoes.tamanho ?? 1000);
  const paralelo = Math.max(1, opcoes.paralelo ?? 3);
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));

  let proximo = 0;
  let enviados = 0;
  let falha: unknown = null;
  const trabalhador = async () => {
    while (falha === null && proximo < lotes.length) {
      const lote = lotes[proximo++];
      try {
        await enviar(lote);
      } catch (e) {
        if (falha === null) falha = e;
        return;
      }
      enviados += lote.length;
      opcoes.onAvanco?.(enviados, itens.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(paralelo, lotes.length) }, trabalhador));
  if (falha !== null) throw falha;
}
