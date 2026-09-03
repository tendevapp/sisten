/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Expiração de sessão à meia-noite: o usuário não deve permanecer logado
 * de um dia para o outro. Ao autenticar, marca-se o dia local (AAAA-MM-DD);
 * quando o dia vira, o App força logout.
 *
 * Guardado em `localStorage` (não `sessionStorage`) de propósito: precisa
 * sobreviver ao fechar/reabrir a aba para ainda valer no dia seguinte.
 */

const CHAVE_DIA_SESSAO = 'sisten_sessao_dia';

/** Dia local no formato AAAA-MM-DD (fuso do dispositivo, não UTC). */
export function diaLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Registra o dia em que a sessão atual foi aberta. Chamar ao autenticar. */
export function marcarDiaSessao(d: Date = new Date()): void {
  try {
    localStorage.setItem(CHAVE_DIA_SESSAO, diaLocal(d));
  } catch {
    /* modo privado / storage indisponível: sem marcação, não força logout */
  }
}

/** Limpa a marcação. Chamar no logout / SIGNED_OUT. */
export function limparDiaSessao(): void {
  try {
    localStorage.removeItem(CHAVE_DIA_SESSAO);
  } catch {
    /* ignore */
  }
}

/**
 * `true` quando existe uma sessão marcada e o dia local já mudou desde
 * então — ou seja, virou a meia-noite com o usuário logado.
 */
export function sessaoExpirouNoDia(agora: Date = new Date()): boolean {
  try {
    const marcado = localStorage.getItem(CHAVE_DIA_SESSAO);
    return !!marcado && marcado !== diaLocal(agora);
  } catch {
    return false;
  }
}
