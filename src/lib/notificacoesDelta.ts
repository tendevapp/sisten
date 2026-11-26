/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Notificações por delta. O cabeçalho buscava as 100 últimas inteiras a cada
 * 90 s com a aba visível: era a leitura mais chamada pelos aparelhos (14 mil
 * em 4 dias, 237 MB — Monitor de Desempenho, 26/11/2026), quase sempre para
 * trazer as mesmas linhas. Agora traz só as criadas depois da mais recente do
 * aparelho; a leitura completa (que pega as marcadas como lidas ou excluídas
 * em outro aparelho) fica a cada `LEITURA_COMPLETA_MS`.
 */

export const LEITURA_COMPLETA_MS = 10 * 60_000;

interface NotificacaoMinima { id: string; created_at: string }

export function maisRecente(lista: NotificacaoMinima[]): string | null {
  let max: string | null = null;
  for (const item of lista) if (item.created_at && (!max || item.created_at > max)) max = item.created_at;
  return max;
}

/** Junta as novas no cache: a versão do servidor vale, sem repetir, mais recentes primeiro, até `limite`. */
export function mesclarNotificacoes<T extends NotificacaoMinima>(atuais: T[], novas: T[], limite: number): T[] {
  const porId = new Map<string, T>();
  for (const item of atuais) porId.set(item.id, item);
  for (const item of novas) porId.set(item.id, item);
  return [...porId.values()].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, limite);
}

export function precisaLeituraCompleta(p: { temCache: boolean; ultimaCompletaEm: number | null; agora: number }): boolean {
  if (!p.temCache || p.ultimaCompletaEm === null) return true;
  return p.agora - p.ultimaCompletaEm >= LEITURA_COMPLETA_MS;
}
