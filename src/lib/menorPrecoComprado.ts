/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Menor preço unitário já pago por material — a referência que o mapa
 * comparativo mostra ao lado das ofertas, para o comprador ver se uma compra
 * anterior saiu mais barata que qualquer proposta atual.
 *
 * Lê só pedidos (o que foi efetivamente comprado, em BRL), a partir de
 * `INICIO_HISTORICO_COMPRAS`. Reaproveita `amostrasDePedidos`, então serviço e
 * contrato-quadro já ficam de fora e o preço é o mesmo da aba Preço Médio.
 */

import type { HistoricoPedidoView } from '../types';
import { amostrasDePedidos } from './precoMedio';

/** Compras anteriores a essa data não entram — preço antigo não é referência. */
export const INICIO_HISTORICO_COMPRAS = '2026-01-01';

export interface MenorPrecoComprado {
  /** Preço unitário em BRL. */
  preco: number;
  fornecedor: string;
  /** AAAA-MM-DD. */
  data: string;
  pedido: string;
  qtd: number;
  /** Quantas compras do material entraram na comparação. */
  compras: number;
}

/** Código SAP chega com e sem zeros à esquerda conforme a origem (RM, cotação, pedido). */
export function chaveMaterialSap(codigo: string | null | undefined): string {
  return String(codigo ?? '').trim().replace(/^0+/, '');
}

/**
 * Menor preço por material. Em empate de preço fica a compra mais recente.
 * `ignorar` recebe os códigos genéricos (um código para vários produtos), cujo
 * preço não é comparável item a item.
 */
export function menorPrecoPorMaterial(
  pedidos: readonly HistoricoPedidoView[],
  ignorar: ReadonlySet<string> = new Set(),
  desde: string = INICIO_HISTORICO_COMPRAS,
): Map<string, MenorPrecoComprado> {
  const ignorados = new Set([...ignorar].map(chaveMaterialSap));
  const out = new Map<string, MenorPrecoComprado>();

  for (const a of amostrasDePedidos(pedidos)) {
    if (a.data < desde) continue;
    const chave = chaveMaterialSap(a.material);
    if (!chave || ignorados.has(chave)) continue;

    const atual = out.get(chave);
    const compras = (atual?.compras ?? 0) + 1;
    const melhor = !atual || a.preco < atual.preco || (a.preco === atual.preco && a.data > atual.data);
    out.set(chave, melhor
      ? { preco: a.preco, fornecedor: a.fornecedor, data: a.data, pedido: a.documento, qtd: a.qtd, compras }
      : { ...atual, compras });
  }
  return out;
}
