/**
 * Interpreta a resposta do Supabase Auth ao trocar a senha (`auth.updateUser`).
 *
 * O Supabase recusa a troca quando a nova senha é igual à atual
 * (`same_password`). Depois de um reset pelo admin a "atual" é a provisória —
 * e é comum o admin redefinir com a senha que o colaborador já usava, ou o
 * colaborador querer manter a provisória. Nesse caso a senha desejada já está
 * gravada, então a troca conta como feita (`mantida`) e a exigência de troca é
 * cumprida. O mesmo cobre a segunda tentativa depois de uma resposta perdida
 * na rede do pátio: a primeira gravou, a segunda volta `same_password`.
 */

/** `erro` vem preenchido sempre que `ok` é falso. */
export interface ResultadoTrocaSenha {
  ok: boolean;
  mantida?: boolean;
  erro?: string;
}

interface ErroAuth {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
  reasons?: string[];
}

const SEM_CONEXAO = 'Sem conexão com o servidor. Verifique o sinal e tente de novo.';

export function interpretarErroTrocaSenha(err: ErroAuth | null | undefined): ResultadoTrocaSenha {
  if (!err) return { ok: true, mantida: false };
  const codigo = err.code || '';
  const msg = (err.message || '').toLowerCase();

  if (codigo === 'same_password' || msg.includes('different from the old password')) {
    return { ok: true, mantida: true };
  }
  if (codigo === 'weak_password' || msg.includes('weak') || msg.includes('at least')) {
    if (err.reasons?.includes('pwned')) {
      return { ok: false, erro: 'Essa senha aparece em listas de senhas vazadas. Escolha outra.' };
    }
    return { ok: false, erro: 'Senha fraca para o servidor. Use pelo menos 6 caracteres, misturando letras e números.' };
  }
  if (
    codigo === 'session_not_found' || codigo === 'bad_jwt' || codigo === 'session_expired'
    || err.status === 401 || err.status === 403 || msg.includes('auth session missing')
  ) {
    return { ok: false, erro: 'Sua sessão expirou. Toque em Sair, entre de novo com a senha provisória e defina a nova senha.' };
  }
  if (codigo === 'reauthentication_needed') {
    return { ok: false, erro: 'O servidor pediu nova confirmação de identidade. Toque em Sair e entre de novo.' };
  }
  if (
    err.name === 'AuthRetryableFetchError' || err.status === 0
    || msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')
  ) {
    return { ok: false, erro: SEM_CONEXAO };
  }
  return { ok: false, erro: `Não foi possível salvar a nova senha${err.message ? ` (${err.message})` : ''}. Tente de novo.` };
}

/** Falha que nem chegou ao Supabase (exceção no fetch). */
export function erroTrocaSenhaSemResposta(): ResultadoTrocaSenha {
  return { ok: false, erro: SEM_CONEXAO };
}
