/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Rede de pátio: Wi-Fi conectado, sem internet de verdade. A requisição não
 * falha — fica pendurada.
 *
 * 26/11/2026: "Comprimindo & Salvando…" e "Sincronizando…" presos ao mesmo
 * tempo num iPhone, e 13 registros parados num Android que reportava
 * "online". Causa: toda chamada do Supabase pede o token (`getSession`); token
 * vencido dispara UMA renovação, compartilhada por todas as chamadas
 * (`refreshingDeferred` do auth-js), e essa renovação ia pelo nosso fetch sem
 * prazo. Rede muda → a renovação nunca termina → salvar, sincronizar e ler
 * esperam para sempre. O iPhone congela o app em segundo plano, então o token
 * costuma estar vencido justamente quando a pessoa volta para salvar.
 *
 * Com prazo, a renovação falha como erro de rede (o auth-js guarda a falha
 * por 60 s e não tenta de novo nesse tempo) e a gravação cai na fila do
 * aparelho em nome de quem estava logado (`usuarioDaSessaoGuardada`).
 */

/** Renovação de sessão. Curto: enquanto ela espera, o app inteiro espera. */
export const PRAZO_AUTH_MS = 8_000;
/** Login e demais chamadas de autenticação: a pessoa está olhando e a rede pode ser só lenta. */
export const PRAZO_AUTH_LOGIN_MS = 25_000;
/** Link assinado de foto: a tela de salvar aguarda o link depois de gravar. */
export const PRAZO_LINK_ASSINADO_MS = 12_000;

/** A renovação silenciosa do token (a que todas as chamadas compartilham). */
export function ehRenovacaoDeSessao(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname.includes('/auth/v1/token') && u.searchParams.get('grant_type') === 'refresh_token';
  } catch {
    return false;
  }
}

/** Prazo do transporte para esta URL, ou `null` (sem prazo aqui). */
export function prazoDaRequisicao(url: string): number | null {
  let caminho: string;
  try { caminho = new URL(url).pathname; } catch { return null; }
  if (caminho.includes('/auth/v1/')) return ehRenovacaoDeSessao(url) ? PRAZO_AUTH_MS : PRAZO_AUTH_LOGIN_MS;
  if (/\/storage\/v1\/object\/sign(\/|$)/.test(caminho)) return PRAZO_LINK_ASSINADO_MS;
  return null;
}

/**
 * Depois de uma autenticação que esgotou o prazo, as próximas falham na hora
 * por um tempo. O auth-js tenta de novo com espera crescente por até 30 s;
 * sem a pausa, cada tentativa esperaria o prazo inteiro e a tela ficaria
 * presa esse tempo todo.
 */
export function criarPausaAuth(duracaoMs: number) {
  let ate = 0;
  return {
    registrarFalha(agora: number) { ate = agora + duracaoMs; },
    registrarSucesso() { ate = 0; },
    ativa(agora: number) { return agora < ate; },
  };
}

/**
 * Id de quem estava logado, pela sessão que o Supabase guarda no
 * localStorage (`sb-<projeto>-auth-token`). Serve quando a sessão venceu e não
 * renovou por falta de rede: a requisição sai com a chave anônima, mas a
 * gravação ainda é dessa pessoa — entra na fila dela e sobe com o token novo.
 * Deslogado não tem a chave: devolve `null`.
 */
export function usuarioDaSessaoGuardada(entradas: [string, string | null][]): string | null {
  for (const [chave, valor] of entradas) {
    if (!/^sb-.+-auth-token$/.test(chave) || !valor) continue;
    try {
      const sessao = JSON.parse(valor);
      const id = sessao?.user?.id ?? sessao?.currentSession?.user?.id;
      if (typeof id === 'string' && id) return id;
    } catch { /* ignora */ }
  }
  return null;
}
