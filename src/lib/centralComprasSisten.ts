/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Central de Compras — vínculo com a solicitação do SISTEN que originou a RM.
 *
 * A ponte é o número da RM (`Request.linked_rm_number`, gravado em Abrir RM >
 * aba Abertas) mais o código do material: uma solicitação pode ter vários
 * itens, e cada um vira uma linha da RM no SAP com o mesmo MATNR que saiu na
 * planilha de abertura (ver `lib/almoxarifadoRm.ts`).
 *
 * Serve a três coisas na Central de Compras: mostrar o número da solicitação
 * ao lado da RM, sinalizar item genérico com a observação de quem pediu, e
 * substituir por essa observação o texto técnico do catálogo no texto da
 * cotação — que para item genérico não descreve nada de específico.
 */

import type { Request, RequestItem } from '../types';

export interface VinculoSistenRm {
  requestNumber: string;
  item: RequestItem;
}

/** Tolera zero à esquerda dos dois lados — mesmo padrão usado no resto da Central de Compras. */
function normalizarChave(valor: string | null | undefined): string {
  const s = (valor || '').trim();
  const semZeros = s.replace(/^0+/, '');
  return semZeros || s;
}

function chaveVinculo(rm: string | null | undefined, materialCode: string | null | undefined): string {
  return `${normalizarChave(rm)}::${normalizarChave(materialCode)}`;
}

/**
 * Monta o índice `RM + material` → solicitação/item do SISTEN.
 *
 * Só entram solicitações de compra com RM vinculada. Quando duas linhas
 * colidem na mesma chave (material repetido na mesma solicitação, ou RM
 * vinculada por engano a mais de uma), a primeira encontrada vale — mesmo
 * critério usado no restante do módulo de Abrir RM.
 */
export function indexarVinculosSistenPorRm(
  requests: Request[],
  itensPorRequest: Map<string, RequestItem[]>,
): Map<string, VinculoSistenRm> {
  const indice = new Map<string, VinculoSistenRm>();

  for (const request of requests) {
    if (!request.linked_rm_number) continue;

    const itens = itensPorRequest.get(request.id) || [];
    for (const item of itens) {
      if (!item.sap_code) continue;

      const chave = chaveVinculo(request.linked_rm_number, item.sap_code);
      if (!indice.has(chave)) {
        indice.set(chave, { requestNumber: request.number, item });
      }
    }
  }

  return indice;
}

/** Busca o vínculo pela RM e código de material, com a mesma tolerância a zero à esquerda. */
export function buscarVinculoSistenRm(
  indice: Map<string, VinculoSistenRm>,
  rm: string | null | undefined,
  materialCode: string | null | undefined,
): VinculoSistenRm | null {
  return indice.get(chaveVinculo(rm, materialCode)) || null;
}

/**
 * Texto a usar no lugar do texto técnico do catálogo, no texto da cotação.
 *
 * Só substitui quando o item é genérico e tem observação escrita — o
 * catálogo SAP não descreve item genérico (é um código só para várias coisas
 * parecidas), então o texto técnico dele não serve; a observação de quem
 * pediu é a especificação real daquela compra. Fora desse caso devolve
 * `null`, e quem chamou usa o texto técnico do catálogo como sempre.
 */
export function textoTecnicoParaCotacao(vinculo: VinculoSistenRm | null): string | null {
  if (!vinculo || !vinculo.item.is_generic) return null;
  const obs = (vinculo.item.observation || '').trim();
  return obs || null;
}
