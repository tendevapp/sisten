/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A tela da Requisição no Balcão carrega as 500 mais recentes (pela data da
 * requisição) e todas as que ainda têm trabalho. A concluída e antiga fica fora,
 * e a busca e o filtro de período, que só filtravam o que estava na tela, não a
 * achavam — em 19/11 a RQB-101126-17 (retirada sem saldo de 10/11) ganhou doc.
 * SAP e sumiu da lista. Estas regras dizem o que buscar no banco além da lista.
 */

import { dataLocalDeTimestamp, dentroDoPeriodo, periodoAtivo, type FiltroPeriodo } from './requisicaoBalcaoAuditoria';

export type BuscaNoHistorico =
  | { tipo: 'codigo'; prefixo: string }
  | { tipo: 'doc'; doc: string };

/**
 * Código RQB (a partir de "RQB-10") ou doc. SAP (8 a 10 dígitos) vão ao banco.
 * Nome, aplicação e material ficam só na lista: pelo histórico todo seriam
 * centenas de requisições a cada tecla.
 */
export function buscaNoHistorico(busca: string): BuscaNoHistorico | null {
  const t = busca.trim().toUpperCase();
  const cod = /^RQB-?(\d{2,6})(-\d{0,3})?$/.exec(t);
  if (cod) return { tipo: 'codigo', prefixo: `RQB-${cod[1]}${cod[2] ?? ''}` };
  if (/^\d{8,10}$/.test(t)) return { tipo: 'doc', doc: t };
  return null;
}

/**
 * Faixa de datas de criação do período que a lista não cobre. `completoDesde`
 * é a data da última das recentes ('' = a lista tem todas); o próprio dia pode
 * ter ficado pela metade, então entra na faixa. null = nada a buscar.
 */
export function faixaForaDaLista(p: FiltroPeriodo, completoDesde: string): { de: string; ate: string } | null {
  if (!completoDesde || !periodoAtivo(p) || p.base !== 'criacao') return null;
  const ate = p.ate && p.ate < completoDesde ? p.ate : completoDesde;
  if (p.de && p.de > ate) return null;
  return { de: p.de, ate };
}

/** Lotes exportados no período (base exportação): as requisições deles podem ser bem mais antigas. */
export function lotesNoPeriodo(p: FiltroPeriodo, lotes: { id: string; created_at: string }[]): string[] {
  if (!periodoAtivo(p) || p.base !== 'exportacao') return [];
  return lotes.filter((l) => dentroDoPeriodo(p, null, dataLocalDeTimestamp(l.created_at))).map((l) => l.id);
}

/** Junta o que veio do banco à lista (a versão nova vence) e mantém a ordem da tela: data e criação, mais recente primeiro. */
export function mesclarRequisicoes<T extends { id: string; data: string; created_at?: string | null }>(lista: T[], extras: T[]): T[] {
  if (extras.length === 0) return lista;
  const porId = new Map(lista.map((r) => [r.id, r]));
  for (const r of extras) porId.set(r.id, r);
  return [...porId.values()].sort((a, b) => (b.data === a.data
    ? (b.created_at || '').localeCompare(a.created_at || '')
    : b.data.localeCompare(a.data)));
}
