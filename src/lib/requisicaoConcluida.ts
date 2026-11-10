/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coluna "Concluída" da ME5A (`sap_me5a_rc.concluida`): o SAP marca com `X`
 * o item de RM encerrado — não há mais nada a comprar nele. A Central de
 * Compras tira esses itens da lista, como já faz com os eliminados.
 *
 * Caso de 10/11: RM 1100335473 item 10 (lanterna tática) seguia como "Sem PO"
 * porque o pedido 4100468485 da ME5A não está na ZL0132, mas o item já estava
 * concluído no SAP.
 */

export function itemConcluidoNaMe5a(r: { concluida?: string | null }): boolean {
  return String(r.concluida ?? '').trim().toUpperCase() === 'X';
}
