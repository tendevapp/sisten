/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Geração de identificadores no cliente — fonte única.
 *
 * Havia três cópias desta função dentro de localDb.ts, além de usos diretos de
 * `crypto.randomUUID` sem guarda. A guarda importa: `crypto.randomUUID` só
 * existe em contexto seguro, e o dev server sobe em `http://0.0.0.0:3000` —
 * quem abre pelo IP da rede não tem a API.
 */

export function gerarUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Id de item de solicitação.
 *
 * Precisa ser estável: os anexos apontam para ele
 * (`request_attachments.request_item_id`). Por isso é gerado quando a linha
 * nasce no formulário, e não derivado da posição — índice escorrega assim que
 * um item é removido ou reordenado numa edição.
 */
export const novoItemId = (): string => `ri_${gerarUUID()}`;
