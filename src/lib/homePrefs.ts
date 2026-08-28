/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Preferências locais da tela Início: páginas visitadas recentemente e páginas
 * favoritas (fixadas) por usuário. Tudo em `localStorage` — é conveniência de
 * navegação, não dado de negócio, então não passa pelo Supabase nem pelo
 * `localDb`. Toda leitura/escrita é defensiva (janela anônima, storage cheio).
 */

const RECENT_KEY = 'sisten:paginas-recentes';
const FAV_PREFIX = 'sisten:paginas-favoritas:';
const RECENT_LIMIT = 16;

export interface RecentPage {
  path: string;
  at: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage indisponível — silencioso de propósito */
  }
}

/** Rotas que não fazem sentido no histórico de "recentes". */
const IGNORED = new Set(['/', '/login', '/cadastro', '/reset-password', '/perfil']);

export function recordRecentPage(path: string): void {
  if (!path || IGNORED.has(path)) return;
  const pathOnly = path.split('?')[0];
  if (IGNORED.has(pathOnly)) return;
  const list = read<RecentPage[]>(RECENT_KEY, []).filter(p => p.path !== pathOnly);
  list.unshift({ path: pathOnly, at: Date.now() });
  write(RECENT_KEY, list.slice(0, RECENT_LIMIT));
}

export function getRecentPages(): RecentPage[] {
  return read<RecentPage[]>(RECENT_KEY, []).filter(p => p && typeof p.path === 'string');
}

export function getFavoritePages(userId: string): string[] {
  return read<string[]>(`${FAV_PREFIX}${userId}`, []).filter(p => typeof p === 'string');
}

export function isFavoritePage(userId: string, path: string): boolean {
  return getFavoritePages(userId).includes(path);
}

/** Fixa ou desfixa uma página. Retorna a lista atualizada. */
export function toggleFavoritePage(userId: string, path: string): string[] {
  const current = getFavoritePages(userId);
  const next = current.includes(path)
    ? current.filter(p => p !== path)
    : [path, ...current];
  write(`${FAV_PREFIX}${userId}`, next);
  return next;
}
