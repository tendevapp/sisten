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
 * Localização para buscar a peça: a posição do Cadastro de Itens › Itens BOM
 * (`alm_bom_itens_cadastro.posicao_estoque`, mantida pelo almoxarifado — é a
 * que vale hoje); sem ela, a gravada no romaneio na abertura e, por fim, a do
 * cadastro do projeto.
 */
export function localizacaoDoItem(
  oi: Pick<ProjOrdemItem, 'localizador'>,
  item?: Pick<ProjItem, 'localizador'> | null,
  cadastroBom?: { posicao_estoque: string | null } | null,
): string | null {
  return cadastroBom?.posicao_estoque?.trim() || oi.localizador?.trim() || item?.localizador?.trim() || null;
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

/**
 * Numeração digitada na nova ordem ("3143, 3158" ou "T1-3143"), opcional: a
 * bancada às vezes monta kit pulmão, sem saber para qual torre vai. Cada
 * número vira o id da unidade (`T1-3143`) e precisa estar entre as
 * disponíveis; o que não estiver volta em `invalidos`, repetido é ignorado.
 */
export function interpretarNumeracaoTramos(
  texto: string,
  tramo: string,
  disponiveis: ReadonlySet<string>,
): { ids: string[]; invalidos: string[] } {
  const ids: string[] = [];
  const invalidos: string[] = [];
  for (const parte of texto.split(/[\s,;]+/)) {
    const bruto = parte.trim().toUpperCase();
    if (!bruto) continue;
    const id = /^\d+$/.test(bruto) ? `${tramo}-${bruto}` : bruto;
    if (ids.includes(id) || invalidos.includes(bruto)) continue;
    if (disponiveis.has(id)) ids.push(id);
    else invalidos.push(bruto);
  }
  return { ids, invalidos };
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
