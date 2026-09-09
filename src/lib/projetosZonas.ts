/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Pré-montagem — zonas de separação dentro de um tramo.
 *
 * T1 é o único tramo cuja BOM sustenta mais de uma frente física de
 * montagem: Escada de Acesso, Plataforma Inferior e Plataforma
 * Superior/Média são bancadas distintas, separadas em momentos diferentes,
 * mas todas compõem o MESMO kit físico do tramo (confirmado na BOM real:
 * `PLATAFORMA MEDIA` só existe em S1, `PLATAFORMA INFERIOR` concentra 231
 * das suas 309 linhas em S1). Os outros tramos (T2..T5) não têm essa
 * divisão — continuam com romaneio único, como sempre.
 *
 * Uma peça comum (parafuso, arruela) aparece em vários grupos e níveis ao
 * mesmo tempo dentro do tramo — por isso a quantidade de cada zona vem de
 * filtrar as linhas BRUTAS da BOM por grupo (`consumoPorTramoFiltrado`),
 * nunca de fatiar depois de já consolidado.
 *
 * A 4ª zona ("Estrutural / Elétrico / Outros") é um catch-all deliberado:
 * a BOM de T1 tem ~130 linhas em grupos que não são nenhuma das 3 zonas
 * nomeadas (ELETRICO, ESTRUTURAL, LONA, OLHAL, PORTA, SOLDAVEL, Montagem
 * geral) e sem sinal confiável de qual bancada física as separa. Em vez de
 * adivinhar e arriscar mandar peça pra bancada errada, elas ficam numa 4ª
 * zona explícita — nenhum item do tramo fica de fora do romaneio.
 */

import type { Tramo } from './projetos';
import { consumoPorTramoFiltrado, type ArvoreBom, type ConsumoItem } from './projetosBom';

export type ZonaId = 'plataforma_sup_media' | 'plataforma_inferior' | 'escada_acesso' | 'outros';

export interface ZonaDef {
  id: ZonaId;
  rotulo: string;
  /** grupo_norm (BOM.group normalizado) que pertence a esta zona. Vazio = catch-all. */
  grupos: string[];
}

const ZONAS_T1: ZonaDef[] = [
  { id: 'plataforma_sup_media', rotulo: 'Plataforma Superior e Média', grupos: ['PLATAFORMA SUPERIOR', 'PLATAFORMA MEDIA'] },
  { id: 'plataforma_inferior', rotulo: 'Plataforma Inferior', grupos: ['PLATAFORMA INFERIOR'] },
  { id: 'escada_acesso', rotulo: 'Escada de Acesso', grupos: ['ESCADA', 'ESCADA DE ACESSO'] },
  { id: 'outros', rotulo: 'Estrutural / Elétrico / Outros', grupos: [] },
];

/**
 * Só T1 tem zonas por decisão do usuário — os outros tramos separam o
 * romaneio inteiro de uma vez, sem essa divisão.
 */
const ZONAS_POR_TRAMO: Partial<Record<Tramo, ZonaDef[]>> = {
  T1: ZONAS_T1,
};

/** `null` = tramo sem divisão em zona (T2..T5): a tela oferece "o tramo inteiro". */
export function zonasDoTramo(tramo: Tramo): ZonaDef[] | null {
  return ZONAS_POR_TRAMO[tramo] ?? null;
}

/** Acha a zona pelo id salvo em `proj_ordens_premontagem.zona`. Null se o tramo não tem zona ou o id não bate. */
export function zonaPorId(tramo: Tramo, zonaId?: string | null): ZonaDef | null {
  if (!zonaId) return null;
  return zonasDoTramo(tramo)?.find((z) => z.id === zonaId) ?? null;
}

/** Grupos cobertos pelas zonas NOMEADAS (todas exceto o catch-all) — a base do residual. */
function gruposNomeados(zonas: ZonaDef[]): string[] {
  return zonas.filter((z) => z.grupos.length > 0).flatMap((z) => z.grupos);
}

/**
 * O filtro de grupo (`incluirGrupos`/`excluirGrupos`) que define uma zona —
 * zona nomeada filtra pelos seus grupos, o catch-all pega o residual das
 * zonas nomeadas. Único lugar que decide isso; `consumoDaZona` e o relatório
 * de romaneio por níveis consomem daqui, nunca duplicam a regra.
 */
export function filtroDaZona(tramo: Tramo, zona: ZonaDef): { incluirGrupos?: string[]; excluirGrupos?: string[] } {
  if (zona.grupos.length > 0) return { incluirGrupos: zona.grupos };
  const todas = zonasDoTramo(tramo) ?? [];
  return { excluirGrupos: gruposNomeados(todas) };
}

/**
 * Consumo (por torre) de uma zona específica do tramo. Zona nomeada filtra
 * pelos seus grupos; o catch-all pega tudo que sobrou das zonas nomeadas.
 */
export function consumoDaZona(arvore: ArvoreBom, tramo: Tramo, zona: ZonaDef): Map<string, ConsumoItem> {
  return consumoPorTramoFiltrado(arvore, filtroDaZona(tramo, zona)).get(tramo) ?? new Map();
}

/**
 * `T1-3143` + zonas já separadas naquele tramo → o que ainda falta separar.
 * Uma ordem sem `zona` (tramo sem divisão) conta como "tudo separado de uma
 * vez" — não se aplica a tramos com `zonasDoTramo` definido.
 */
export function zonasPendentes(tramo: Tramo, zonasJaSeparadas: Set<ZonaId>): ZonaDef[] {
  const todas = zonasDoTramo(tramo);
  if (!todas) return [];
  return todas.filter((z) => !zonasJaSeparadas.has(z.id));
}

/** Rótulo de exibição: "T1 · Escada de Acesso", ou só o tramo quando não há zona. */
export function rotuloTramoComZona(tramo: Tramo, zona?: ZonaDef | null): string {
  return zona ? `${tramo} · ${zona.rotulo}` : tramo;
}
