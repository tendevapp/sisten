/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Inventário Cíclico — aplicar na tela o inventário relido depois de uma ação.
 *
 * Cada contagem relia a lista inteira (200 inventários com itens e contagens,
 * ~380 KB) e o histórico de todos. Monitor de Desempenho, 27/11/2026: ~800
 * leituras dessas num dia, 300 MB, de quatro pessoas contando. Agora a tela
 * relê só o inventário em uso e troca ele na lista e no histórico.
 */

import type { InventarioRow } from './inventarioCiclicoApi';
import type { InventarioHistorico } from './inventarioCiclicoApi';

export function aplicarInventarioRelido(
  inventarios: InventarioRow[],
  historico: InventarioHistorico[] | null,
  relido: InventarioRow,
): { inventarios: InventarioRow[]; historico: InventarioHistorico[] | null } {
  const naLista = inventarios.some((i) => i.id === relido.id);
  const novaLista = naLista
    ? inventarios.map((i) => (i.id === relido.id ? relido : i))
    : [relido, ...inventarios];

  if (!historico) return { inventarios: novaLista, historico };
  const resumo: InventarioHistorico = {
    id: relido.id,
    data: relido.data,
    itens: relido.itens.map((i) => ({
      material: i.material,
      deposito: i.deposito,
      status: i.status,
      contagens: i.contagens.map((c) => ({ id: c.id })),
    })),
  };
  const noHistorico = historico.some((h) => h.id === relido.id);
  return {
    inventarios: novaLista,
    historico: noHistorico ? historico.map((h) => (h.id === relido.id ? resumo : h)) : [...historico, resumo],
  };
}
