/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Entrega parcial: comparação entre o que a RM pediu e o que os pedidos já
 * FORNECERAM (coluna `qtd_fornecida` da ZL0132, exposta pela view como
 * `qtd_fornecida_po` por linha e `qtd_fornecida_total` por item de RM).
 *
 * Lógica pura, sem React, para a Central de Compras e quem mais precisar.
 */

import type { EnrichedSAPRecord } from '../types';

export interface EntregaParcial {
  /** Quanto já foi fornecido somando todos os pedidos do item de RM. */
  fornecido: number;
  /** Quanto a RM pediu. */
  solicitado: number;
  /** Diferença que ainda falta (negativa quando veio a mais). */
  faltando: number;
  /** Quanto da RM já foi atendido, em % (80 de 115 = 70). Pode passar de 100. */
  percentual: number;
  /** Chegou parte: fornecido entre 1 e o total pedido pela RM. */
  parcial: boolean;
  /** Veio mais do que a RM pediu. */
  excedente: boolean;
}

/** Folga para ruído de ponto flutuante em quantidades fracionadas (kg, m³). */
const EPSILON = 0.001;

/**
 * Avalia a entrega de um item de RM, ou `null` quando não há o que comparar.
 *
 * Retorna `null` — em vez de "completo" — nos casos em que a comparação não
 * significa nada:
 *
 * - **sem PO**: não há fornecimento a acompanhar;
 * - **RM de serviço (17…) e item de contrato**: na ZL0132 a `qtd_fornecida`
 *   desses vem em VALOR (R$), não em quantidade — comparar com a qtd da RM
 *   marcaria todo contrato como divergente;
 * - **sem informação de fornecimento**: a coluna veio vazia;
 * - **nada fornecido ainda**: item comprado e ainda não entregue não é entrega
 *   parcial — é entrega pendente, que o recorte "Sem MIGO" já mostra.
 */
export function avaliarEntregaParcial(r: EnrichedSAPRecord): EntregaParcial | null {
  if (r.status_requisicao !== 'Processado') return null;
  if (r.is_contrato) return null;
  if (String(r.requisicao_de_compra || '').trim().startsWith('17')) return null;

  // Quando a linha possui quantidade de pedido especifica (visao por PO / ri_po),
  // a entrega parcial avalia o fornecimento daquele pedido (qtd_fornecida_po vs qtd_po).
  // Se a linha nao tiver qtd_po (ex: visao agregada por RM), compara com a RM.
  const temQtdPo = typeof r.qtd_po === 'number' && r.qtd_po > 0;
  const solicitado = temQtdPo ? r.qtd_po : r.qtd_requisicao;
  const fornecido = temQtdPo
    ? (typeof r.qtd_fornecida_po === 'number' ? r.qtd_fornecida_po : r.qtd_fornecida_total)
    : (r.qtd_fornecida_total ?? r.qtd_fornecida_po);

  if (fornecido === undefined || fornecido === null) return null;
  if (!solicitado || solicitado <= 0) return null;
  if (fornecido <= EPSILON) return null;

  const faltando = solicitado - fornecido;
  return {
    fornecido,
    solicitado,
    faltando,
    percentual: (fornecido / solicitado) * 100,
    parcial: faltando > EPSILON,
    excedente: faltando < -EPSILON,
  };
}

/** Item cuja quantidade fornecida difere da pedida na RM (a menos ou a mais). */
export function temDivergenciaDeEntrega(r: EnrichedSAPRecord): boolean {
  const avaliacao = avaliarEntregaParcial(r);
  return !!avaliacao && (avaliacao.parcial || avaliacao.excedente);
}
