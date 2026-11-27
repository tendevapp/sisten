/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Movimentações (MB51) no aparelho: rebaixar só o que mudou.
 *
 * Monitor de Desempenho, 27/11/2026: um só aparelho baixou 853 MB de
 * `vw_mb51_classificado` num dia — ~78 mil linhas (~62 MB) a cada "Atualizar"
 * e a cada importação, inclusive a da ZL0024, que não mexe na MB51.
 *
 * A importação da MB51 só acrescenta linhas (id sequencial) e sobe o carimbo
 * `mb51_mov_estoque`. Então: carimbo igual → usa a cópia; carimbo novo →
 * baixa só `id > maior id da cópia` e confere a contagem; uma vez por dia (ou
 * se a contagem não bater) baixa tudo, para pegar linha apagada e mudança de
 * classificação (descrição do TMV, PEP), que não sobem o carimbo.
 */

export const COMPLETO_A_CADA_MS = 24 * 60 * 60_000;

export interface MetaMb51 {
  /** Carimbo `mb51_mov_estoque` lido antes do último download (null = indisponível). */
  versao: number | null;
  maiorId: number;
  /** Último download completo. */
  completoEm: string;
}

export type PlanoMb51 = 'usar_cache' | 'delta' | 'completo';

export function planoMb51(p: { temCache: boolean; meta: MetaMb51 | null; versaoRemota: number | null; agora: number }): PlanoMb51 {
  if (!p.temCache || !p.meta) return 'completo';
  const completoEm = Date.parse(p.meta.completoEm);
  if (!Number.isFinite(completoEm) || p.agora - completoEm >= COMPLETO_A_CADA_MS) return 'completo';
  if (p.versaoRemota !== null && p.versaoRemota === p.meta.versao) return 'usar_cache';
  return 'delta';
}

export function maiorIdMb51(linhas: { id: number }[]): number {
  let maior = 0;
  for (const l of linhas) if (Number(l.id) > maior) maior = Number(l.id);
  return maior;
}

/** Cópia + linhas novas; a nova vence em id repetido. Mantém a ordem por id. */
export function mesclarMb51<T extends { id: number }>(locais: T[], novas: T[]): T[] {
  if (novas.length === 0) return locais;
  const porId = new Map<number, T>();
  for (const l of locais) porId.set(Number(l.id), l);
  for (const n of novas) porId.set(Number(n.id), n);
  return [...porId.values()].sort((a, b) => Number(a.id) - Number(b.id));
}
