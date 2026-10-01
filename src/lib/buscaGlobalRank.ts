/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Parte pura da busca global (sem `localDb`, sem Supabase): tipos, ranking e
 * composição dos resultados. Fica separada de `buscaGlobal.ts` para ser testada
 * em Node, onde o cliente do banco não existe.
 */

import type { LucideIcon } from 'lucide-react';
import type { SAPRequisicao } from '../types';
import { casarTokens, extrairPalavrasChave, normalizarParaBusca } from './buscaKeywords';

export type GrupoBusca = 'Páginas' | 'Formulários' | 'Solicitações' | 'Rastreio' | 'Materiais';

/** Ordem em que os grupos aparecem na lista. */
export const ORDEM_GRUPOS: GrupoBusca[] = ['Páginas', 'Formulários', 'Solicitações', 'Rastreio', 'Materiais'];

export interface ResultadoBusca {
  /** Único dentro do grupo (serve de `key` e de id do `option`). */
  id: string;
  grupo: GrupoBusca;
  titulo: string;
  subtitulo?: string;
  /** Rota do hash router, com query quando há deep link. */
  path: string;
  icone?: LucideIcon;
}


// ---------------------------------------------------------------------------
// Ranking (puro)
// ---------------------------------------------------------------------------

export interface CamposBusca {
  /** Texto que a pessoa espera ver: casa mais alto quando o termo está nele. */
  principal: string;
  /** Texto auxiliar (descrição, código, grupo): ainda casa, mas pesa menos. */
  extra?: (string | null | undefined)[];
}

/**
 * Filtra por palavras-chave (AND, sem acento) e ordena: 0 = o título começa com
 * o termo, 1 = o título contém todas as palavras, 2 = só casa com o texto
 * auxiliar. Dentro do mesmo peso mantém a ordem original (estável).
 */
export function classificar<T>(itens: T[], termo: string, campos: (item: T) => CamposBusca, limite = Infinity): T[] {
  const tokens = extrairPalavrasChave(termo);
  if (tokens.length === 0) return [];
  const inicio = normalizarParaBusca(termo).trim().replace(/"/g, '');

  const comPeso: { item: T; peso: number; ordem: number }[] = [];
  itens.forEach((item, ordem) => {
    const { principal, extra = [] } = campos(item);
    if (!casarTokens([principal, ...extra], tokens)) return;
    const alvo = normalizarParaBusca(principal);
    const peso = alvo.startsWith(inicio) ? 0 : casarTokens(principal, tokens) ? 1 : 2;
    comPeso.push({ item, peso, ordem });
  });

  return comPeso
    .sort((a, b) => a.peso - b.peso || a.ordem - b.ordem)
    .slice(0, limite)
    .map(r => r.item);
}

/** Só dígitos: pode ser número de solicitação (7) ou de RM (10). */
export const ehSoDigitos = (termo: string) => /^\d+$/.test(termo.trim());


/** Acha RMs pelo número (ou pelo RI = RM + item). Uma linha por RM, no máximo `limite`. */
export function rastreioDeRequisicoes(termo: string, requisicoes: SAPRequisicao[], limite = 4): ResultadoBusca[] {
  const digitos = termo.trim();
  if (!ehSoDigitos(digitos) || digitos.length < 5) return [];

  const porRm = new Map<string, { ri: string; itens: number }>();
  for (const r of requisicoes) {
    if (!r.requisicao_de_compra.startsWith(digitos) && !r.ri.startsWith(digitos)) continue;
    const atual = porRm.get(r.requisicao_de_compra);
    if (atual) atual.itens += 1;
    else porRm.set(r.requisicao_de_compra, { ri: r.ri, itens: 1 });
  }
  return [...porRm.entries()].slice(0, limite).map(([rm, { ri, itens }]) => ({
    id: rm,
    grupo: 'Rastreio' as const,
    titulo: `RM ${rm}`,
    subtitulo: `${itens} ${itens === 1 ? 'item' : 'itens'} no rastreio de compras`,
    path: `/rastreio?ri=${encodeURIComponent(ri)}`,
  }));
}

/** Junta resultados e garante a ordem dos grupos, sem repetir (grupo + id). */
export function combinarResultados(...listas: ResultadoBusca[][]): ResultadoBusca[] {
  const vistos = new Set<string>();
  const todos = listas.flat().filter(r => {
    const chave = `${r.grupo}:${r.id}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
  return ORDEM_GRUPOS.flatMap(g => todos.filter(r => r.grupo === g));
}
