/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Pré-montagem — relatório de romaneio de uma ordem já criada.
 *
 * Duas visões da MESMA ordem, para públicos diferentes:
 *
 *  - "Por níveis" (pai/filho, como a BOM indenta) — para controle de
 *    composição: mostra a estrutura de conjunto/subconjunto que originou
 *    cada quantidade, reconstruída ao vivo da BOM com o mesmo filtro de
 *    grupo (zona) que gerou o romaneio congelado da ordem.
 *  - "Consolidado por part number" — uma linha por item, para quem vai
 *    pegar fisicamente: pega tudo de uma vez, sem repetir a mesma peça em
 *    conjuntos diferentes.
 *
 * A visão consolidada vem direto do romaneio CONGELADO (`ordem.itens`) —
 * é o que realmente foi debitado/será debitado, não uma releitura da BOM
 * que poderia ter mudado. A visão por níveis usa a BOM ao vivo só para
 * desenhar a árvore; as quantidades vêm do mesmo romaneio congelado.
 */

import type { Tramo } from './projetos';
import { comAncestrais, folhasDoTramoFiltradas, type ArvoreBom } from './projetosBom';
import { filtroDaZona, zonaPorId } from './projetosZonas';
import type { ProjItem, ProjOrdemItem } from '../types';

/**
 * Campos do item que as duas visões precisam. Uma ordem já gravada
 * (`ProjOrdemItem`) satisfaz de sobra; um rascunho na tela de abertura da
 * ordem monta só estes.
 */
export type RomaneioItemFonte = Pick<ProjOrdemItem, 'item_id' | 'subconjunto' | 'localizador' | 'qtd_total'>;

export interface LinhaPorNivel {
  id: number;
  nivel: number;
  folha: boolean;
  partNumber: string;
  descricao: string;
  /** Quantidade desta ordem — só folhas têm; conjunto (pai) fica em branco. */
  quantidade: number | null;
  /** Recuo visual = `nivel` relativo à raiz do trecho mostrado, não o nível absoluto da BOM. */
  profundidade: number;
}

export interface LinhaConsolidada {
  partNumber: string;
  codSap: string | null;
  descricao: string;
  subconjunto: string | null;
  localizador: string | null;
  quantidade: number;
}

/**
 * Visão "por níveis": reconstrói o trecho da BOM (pai/filho) que gerou o
 * romaneio da ordem — mesmo filtro de zona usado na hora de montá-la — e
 * anota em cada folha a quantidade que está de fato na ordem congelada.
 */
export function montarLinhasPorNivel(
  arvore: ArvoreBom,
  ordem: { tramo: string; zona: string | null; itens?: RomaneioItemFonte[] },
  itemPorId: Map<string, ProjItem>,
): LinhaPorNivel[] {
  const tramo = ordem.tramo as Tramo;
  const zona = zonaPorId(tramo, ordem.zona);
  const filtro = zona ? filtroDaZona(tramo, zona) : {};

  const folhas = folhasDoTramoFiltradas(arvore, tramo, filtro);
  const nos = comAncestrais(arvore, folhas);
  if (!nos.length) return [];

  const nivelBase = Math.min(...nos.map((n) => n.level));

  const qtdPorPn = new Map<string, number>();
  for (const item of ordem.itens ?? []) {
    const pn = itemPorId.get(item.item_id)?.part_number_norm;
    if (pn) qtdPorPn.set(pn, (qtdPorPn.get(pn) ?? 0) + item.qtd_total);
  }

  return nos.map((no) => ({
    id: no.id,
    nivel: no.level,
    folha: no.folha,
    partNumber: no.partNumber || `(linha ${no.id})`,
    descricao: no.descricao || no.description || '',
    quantidade: no.folha ? qtdPorPn.get(no.partNumberNorm) ?? null : null,
    profundidade: no.level - nivelBase,
  }));
}

/** Visão consolidada: uma linha por item do romaneio congelado, ordenada por part number. */
export function montarLinhasConsolidadas(
  itens: RomaneioItemFonte[],
  itemPorId: Map<string, ProjItem>,
): LinhaConsolidada[] {
  return itens
    .map((oi) => {
      const item = itemPorId.get(oi.item_id);
      return {
        partNumber: item?.part_number ?? oi.item_id,
        codSap: item?.cod_sap ?? null,
        descricao: item?.descricao || item?.description || '',
        subconjunto: oi.subconjunto,
        localizador: oi.localizador,
        quantidade: oi.qtd_total,
      };
    })
    .sort((a, b) => a.partNumber.localeCompare(b.partNumber));
}
