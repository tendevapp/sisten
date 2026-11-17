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
 * Item que não veio na última carga da ME5A (`presente_ultima_carga = false`):
 * a RM saiu do SAP e sai da Central. A trava de `cargaMe5a.ts` impede que uma
 * ME5A filtrada derrube RMs abertas por engano.
 *
 * Pedido eliminado no SAP NÃO tira o item: enquanto a RM estiver na ME5A ele
 * volta a "Sem PO" (decisão de 17/11). A view só marca `po_eliminado` para
 * consulta.
 */
export function itemForaDaUltimaMe5a(r: { presente_ultima_carga?: boolean | null }): boolean {
  return r.presente_ultima_carga === false;
}

/** Itens que a Central de Compras não lista: RM concluída na ME5A ou ausente da última carga. */
export function foraDaCentralDeCompras(r: { concluida?: string | null; presente_ultima_carga?: boolean | null }): boolean {
  return itemConcluidoNaMe5a(r) || itemForaDaUltimaMe5a(r);
}
