/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos › Pré-montagem — o que falta separar num romaneio.
 *
 * A separação de um kit pode levar mais de uma ida à bancada: fecha a tela,
 * volta depois e continua. Para quem volta, interessa primeiro o que falta
 * (com a quantidade a separar e onde está o item); o que já foi separado vira
 * um resumo recolhível. Regras puras aqui, sem React, para testar.
 */

import type { ProjItem, ProjOrdemItem } from '../types';

type ItemRomaneio = Pick<ProjOrdemItem, 'id' | 'separado' | 'qtd_separada' | 'qtd_total'>;

/**
 * Localização para buscar o item: a gravada no romaneio na abertura da ordem
 * e, sem ela, a atual do cadastro do projeto.
 */
export function localizacaoDoItem(
  oi: Pick<ProjOrdemItem, 'localizador'>,
  item?: Pick<ProjItem, 'localizador'> | null,
): string | null {
  return oi.localizador?.trim() || item?.localizador?.trim() || null;
}

/**
 * Divide o romaneio em "faltam separar" e "já separados" pelo estado de
 * quando a tela abriu (`idsSeparadosAoAbrir`): o item marcado agora continua
 * na lista de cima, para dar para ajustar a quantidade sem ele sumir; o que já
 * vinha separado de antes vai para o resumo.
 */
export function dividirRomaneio<T extends ItemRomaneio>(
  itens: T[],
  idsSeparadosAoAbrir: ReadonlySet<string>,
): { pendentes: T[]; anteriores: T[] } {
  const pendentes: T[] = [];
  const anteriores: T[] = [];
  for (const i of itens) (idsSeparadosAoAbrir.has(i.id) ? anteriores : pendentes).push(i);
  return { pendentes, anteriores };
}

/** Itens que podem sair do romaneio: nada separado, então nada debitado. */
export function itensRemoviveis<T extends ItemRomaneio>(itens: T[]): T[] {
  return itens.filter((i) => !i.separado && !(Number(i.qtd_separada) > 0));
}

/** Contagem para o cabeçalho: itens e peças separados × que faltam. */
export function resumoSeparacao(itens: ItemRomaneio[]): {
  separados: number;
  faltam: number;
  pecasSeparadas: number;
  pecasFaltam: number;
} {
  let separados = 0;
  let pecasSeparadas = 0;
  let pecasFaltam = 0;
  for (const i of itens) {
    if (i.separado) {
      separados++;
      pecasSeparadas += Number(i.qtd_separada) || 0;
    } else {
      pecasFaltam += Number(i.qtd_total) || 0;
    }
  }
  return { separados, faltam: itens.length - separados, pecasSeparadas, pecasFaltam };
}
