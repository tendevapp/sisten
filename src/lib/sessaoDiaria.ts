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
const CHAVE_CURRENT_USER = 'sisten_current_user';

/** Identificadores e e-mails de usuários TV / Wallboard com sessão permanente */
const USUARIOS_TV_FIXOS = new Set([
  'tv.fin',
  'tv.fin@sisten.local',
]);

function ehIdentificadorTv(identificadorOuEmail: string): boolean {
  const norm = (identificadorOuEmail || '').trim().toLowerCase();
  if (!norm) return false;
  if (USUARIOS_TV_FIXOS.has(norm)) return true;
  const loginSemDominio = norm.includes('@') ? norm.slice(0, norm.indexOf('@')) : norm;
  if (loginSemDominio === 'tv.fin' || loginSemDominio.startsWith('tv.') || loginSemDominio.startsWith('tv_')) {
    return true;
  }
  return false;
}

/**
 * Avalia se um usuário, e-mail ou perfil possui sessão permanente (TV / Wallboard).
 * Contas como `tv.fin` (e similares de TV/quiosque) NUNCA sofrem logout automático
 * por virada de dia ou inatividade.
 */
export function usuarioSessaoPermanente(
  usuarioOuEmail?: string | null | { email?: string | null; cargo?: string | null; name?: string | null }
): boolean {
  if (!usuarioOuEmail) return false;

  if (typeof usuarioOuEmail === 'object') {
    const email = (usuarioOuEmail.email || '').trim().toLowerCase();
    const cargo = (usuarioOuEmail.cargo || '').trim().toUpperCase();
    const name = (usuarioOuEmail.name || '').trim().toUpperCase();
    if (cargo === 'TV' || name.startsWith('TV ')) return true;
    return ehIdentificadorTv(email);
  }

  return ehIdentificadorTv(usuarioOuEmail);
}

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
 * Usuários com sessão permanente (como `tv.fin` ou cargo TV) NUNCA expiram
 * e sempre retornam `false`.
 */
export function sessaoExpirouNoDia(
  agora: Date = new Date(),
  usuarioOuEmail?: string | null | { email?: string | null; cargo?: string | null; name?: string | null }
): boolean {
  if (usuarioSessaoPermanente(usuarioOuEmail)) {
    return false;
  }

  // Se nenhum usuario foi passado explicitamente, tenta verificar se o usuario em cache local e TV
  if (!usuarioOuEmail) {
    try {
      const cached = localStorage.getItem(CHAVE_CURRENT_USER);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (usuarioSessaoPermanente(parsed)) return false;
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const marcado = localStorage.getItem(CHAVE_DIA_SESSAO);
    return !!marcado && marcado !== diaLocal(agora);
  } catch {
    return false;
  }
}

