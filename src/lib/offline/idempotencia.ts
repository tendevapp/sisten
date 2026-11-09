/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * RPC dos formulários enviada pelo porteiro `ops_executar_idempotente`
 * (migration 20261109210000): a chamada leva uma chave gerada no aparelho,
 * guardada junto da operação na fila. Se o servidor gravou mas a resposta não
 * chegou a tempo (25 s), o reenvio com a mesma chave devolve a resposta
 * guardada em vez de gravar de novo — em 06/11 isso duplicaria uma requisição
 * no balcão.
 */

export const RPC_IDEMPOTENTE = 'ops_executar_idempotente';

export interface ChamadaIdempotente {
  caminho: string;
  corpo: string;
}

/**
 * Troca `…/rpc/<nome>` por `…/rpc/ops_executar_idempotente` e embrulha os
 * argumentos em `{ p_chave, p_rpc, p_args }`. Devolve `null` quando o corpo
 * não é um objeto JSON (aí a chamada segue como veio).
 */
export function chamadaIdempotente(
  caminho: string,
  rpc: string,
  corpo: string | null | undefined,
  chave: string,
): ChamadaIdempotente | null {
  if (rpc === RPC_IDEMPOTENTE) return null;
  let args: unknown = {};
  if (corpo && corpo.trim()) {
    try {
      args = JSON.parse(corpo);
    } catch {
      return null;
    }
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  const nome = rpc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const novoCaminho = caminho.replace(new RegExp(`/rpc/${nome}(?=$|[?/])`), `/rpc/${RPC_IDEMPOTENTE}`);
  if (novoCaminho === caminho) return null;
  return { caminho: novoCaminho, corpo: JSON.stringify({ p_chave: chave, p_rpc: rpc, p_args: args }) };
}
