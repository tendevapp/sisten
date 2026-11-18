/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Itens de ficha de EPI que saíram por extraordinária: sem saldo no depósito
 * de EPI na entrega, a ficha abre sozinha uma Retirada sem Saldo (RSS,
 * `alm_solicitacao_extra` com origem 'ficha_epi') com esses itens.
 *
 * Módulo puro. Alimenta o filtro das fichas emitidas e a análise de consumo;
 * a ficha em si (documento) não mostra nada.
 */

import { chaveMaterial } from './requisicaoBalcao';

/** Linha lida de `alm_solicitacao_extra` (origem 'ficha_epi'). */
export interface RssDeFicha {
  codigo: string;
  origem_id: string | null;
  origem_ref: string | null;
  itens: { material?: string | null }[] | null;
}

export interface ExtraordinariaDaFicha {
  /** Códigos das RSS abertas pela ficha. */
  codigos: string[];
  /** `chaveMaterial` dos itens que saíram por elas. */
  materiais: Set<string>;
}

/**
 * Agrupa as RSS pela ficha (id). RSS antiga sem `origem_id` casa pelo código
 * da ficha (`origem_ref`) via `idPorCodigo`.
 */
export function extraordinariasPorFicha(
  rss: RssDeFicha[],
  idPorCodigo: ReadonlyMap<string, string> = new Map(),
): Map<string, ExtraordinariaDaFicha> {
  const mapa = new Map<string, ExtraordinariaDaFicha>();
  for (const s of rss) {
    const fichaId = s.origem_id || (s.origem_ref ? idPorCodigo.get(s.origem_ref) : undefined);
    if (!fichaId) continue;
    const atual = mapa.get(fichaId) ?? { codigos: [], materiais: new Set<string>() };
    if (!atual.codigos.includes(s.codigo)) atual.codigos.push(s.codigo);
    (s.itens || []).forEach(i => { const k = chaveMaterial(i.material); if (k) atual.materiais.add(k); });
    mapa.set(fichaId, atual);
  }
  return mapa;
}

/** O item (ficha + código SAP) saiu pela extraordinária? */
export function itemSaiuExtraordinario(
  mapa: ReadonlyMap<string, ExtraordinariaDaFicha>,
  fichaId: string,
  codigoSap: string | null | undefined,
): boolean {
  const k = chaveMaterial(codigoSap);
  return !!k && !!mapa.get(fichaId)?.materiais.has(k);
}
