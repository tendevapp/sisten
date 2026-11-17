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

/**
 * Pedido eliminado no SAP (lixeira, `L`) e nenhum outro PO ativo no item.
 * Quem decide é a view (`vw_sap_requisicoes_enriquecidas.po_eliminado`): o PO
 * que a ME5A aponta está com `eflag_e = L` na ZL0132 ou `L` na ME2L.
 *
 * Caso de 17/11: a RM continuava aberta na ME5A apontando para o pedido
 * eliminado e aparecia na Central como "Sem PO". Se o comprador refizer o
 * pedido, o PO novo é ativo e o item volta com ele.
 */
export function itemComPedidoEliminado(r: { po_eliminado?: boolean | null }): boolean {
  return r.po_eliminado === true;
}

/** Itens que a Central de Compras não lista: RM concluída na ME5A ou com o pedido eliminado. */
export function foraDaCentralDeCompras(r: { concluida?: string | null; po_eliminado?: boolean | null }): boolean {
  return itemConcluidoNaMe5a(r) || itemComPedidoEliminado(r);
}
