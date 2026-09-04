/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pedido de contrato x compra spot.
 *
 * A ZL0132 guarda, por linha de pedido, o contrato guarda-chuva que originou o
 * item (`contrato`, o `EKPO-KONNR` do SAP, coluna "Contr."). Quando esse campo
 * vem preenchido, o PO é um call-off de contrato; vazio, é compra spot.
 *
 * Dois marcadores que PARECEM servir e não servem:
 *  - `tipo_doc_compra = ZP06` é "Serviço", não contrato — existe serviço avulso
 *    (dos 6.181 itens ZP06 da base, só 885 têm contrato).
 *  - `doc_compra_ref` usa as faixas 31x e 37x (documento de cotação). Contrato
 *    nesta instalação vive na faixa 5* (51..59), a mesma da ME3N.
 *
 * `item_contrato` também não serve de teste: vem `'0'` — nunca nulo — nas
 * linhas sem contrato.
 */

import { EnrichedSAPRecord } from '../types';

/** Valores que a ZL0132 usa para dizer "não tem" neste par de campos. */
const VAZIOS = new Set(['', '0', '—', 'null', 'undefined']);

/**
 * Número de contrato vindo de qualquer fonte da ZL0132 (view enriquecida,
 * histórico agregado, cache local), ou `null` quando o campo é um dos vazios
 * que o SAP escreve no lugar de nulo.
 */
export function normalizaContrato(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return VAZIOS.has(s.toLowerCase()) ? null : s;
}

const limpar = normalizaContrato;

/**
 * Número do contrato guarda-chuva do pedido desta linha, ou `null` em compra
 * spot. Só faz sentido em item com PO — sem pedido não há referência a contrato.
 */
export function numeroContratoPO(r: EnrichedSAPRecord): string | null {
  return limpar(r.contrato_po);
}

/** Item do contrato (`'10'`, `'20'`…) correspondente ao `numeroContratoPO`. */
export function itemContratoPO(r: EnrichedSAPRecord): string | null {
  return limpar(r.item_contrato_po);
}

/**
 * Item amarrado a contrato — por qualquer um dos dois caminhos que o SAP usa:
 *
 *  1. o PO foi criado por referência a um contrato (`contrato_po`);
 *  2. o item da RM é de categoria `D` no ME5A (`is_contrato`), caso em que o
 *     fornecimento já nasce amarrado e muitas vezes nem gera linha na ZL0132.
 *
 * São populações diferentes e ambas contam como "não é compra spot".
 */
export function ehItemDeContrato(r: EnrichedSAPRecord): boolean {
  return !!r.is_contrato || numeroContratoPO(r) !== null;
}

/**
 * Origem da compra de um item JÁ pedido. Itens sem PO devolvem `null`: ainda
 * não se sabe se serão atendidos por contrato ou por cotação.
 */
export function origemCompra(r: EnrichedSAPRecord): 'contrato' | 'spot' | null {
  if (ehItemDeContrato(r)) return 'contrato';
  return r.status_requisicao === 'Processado' ? 'spot' : null;
}

export interface SpendContratado {
  /** Valor dos itens de contrato (só os que têm valor na base). */
  valor: number;
  /** Valor de todos os itens com pedido — denominador da participação. */
  valorTotal: number;
  /** Participação do contratado no spend do período (0..1). */
  participacao: number;
  itens: number;
  /** Contratos distintos citados pelos pedidos do período. */
  contratos: number;
  /** Pedidos (documentos) distintos com referência a contrato. */
  pedidos: number;
}

/**
 * Spend contratado x spend total do recorte. Segue a regra de cobertura do
 * módulo de suprimentos: só entra no valor quem tem `valor_total` numérico —
 * item de contrato sem valor na base conta em `itens`, não em `valor`.
 */
export function calcSpendContratado(records: EnrichedSAPRecord[]): SpendContratado {
  let valor = 0;
  let valorTotal = 0;
  let itens = 0;
  const contratos = new Set<string>();
  const pedidos = new Set<string>();

  for (const r of records) {
    const temValor = typeof r.valor_total === 'number' && Number.isFinite(r.valor_total);
    if (r.status_requisicao === 'Processado' && temValor) valorTotal += r.valor_total!;
    if (!ehItemDeContrato(r)) continue;
    itens++;
    if (temValor) valor += r.valor_total!;
    const contrato = numeroContratoPO(r);
    if (contrato) contratos.add(contrato);
    if (r.documento_compra) pedidos.add(r.documento_compra);
  }

  return {
    valor,
    valorTotal,
    participacao: valorTotal > 0 ? valor / valorTotal : 0,
    itens,
    contratos: contratos.size,
    pedidos: pedidos.size,
  };
}
