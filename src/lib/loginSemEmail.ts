/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Usuários sem e-mail corporativo.
 *
 * Parte do efetivo de campo não tem caixa de e-mail, mas precisa entrar no
 * SISTEN. Para essa gente o administrador cria o acesso com um identificador
 * `nome.sobrenome` e uma senha provisória — não há auto-cadastro nem link de
 * confirmação, porque não há para onde mandar.
 *
 * O Supabase Auth só sabe autenticar por e-mail, então o identificador vira
 * `nome.sobrenome@sisten.local` no Auth. `sisten.local` não é um domínio
 * roteável: nenhuma mensagem sai, ninguém recebe, e o endereço nunca colide
 * com uma caixa real. Da tela de login para dentro, o usuário digita só
 * `nome.sobrenome`; o domínio é colado aqui.
 */

/** Domínio técnico, nunca exibido ao usuário. */
export const DOMINIO_LOGIN_INTERNO = 'sisten.local';

/** Tira acento, espaço e pontuação; sobra [a-z0-9] para montar o identificador. */
function normalizarParte(texto: string): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Monta `nome.sobrenome` a partir do nome completo, usando o primeiro nome e o
 * último sobrenome — "José da Silva Pereira" vira `jose.pereira`. Partículas
 * ("da", "de", "dos"...) não entram: são o que mais gera identificador
 * estranho quando se pega o segundo termo cegamente.
 *
 * Nome com uma palavra só devolve só ela; nome vazio devolve string vazia,
 * e cabe a quem chama exigir o preenchimento.
 */
export function gerarUsuarioLogin(nomeCompleto: string): string {
  const particulas = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'della', 'van', 'von', 'la', 'le']);

  const partes = (nomeCompleto || '')
    .trim()
    .split(/\s+/)
    .map(normalizarParte)
    .filter(p => p.length > 0);

  if (partes.length === 0) return '';

  const relevantes = partes.filter(p => !particulas.has(p));
  const base = relevantes.length > 0 ? relevantes : partes;
  if (base.length === 1) return base[0];

  return `${base[0]}.${base[base.length - 1]}`;
}

/** Identificador válido: minúsculas, números e pontos, sem ponto nas pontas nem duplicado. */
export function usuarioLoginValido(usuario: string): boolean {
  const u = (usuario || '').trim();
  if (u.length < 3 || u.length > 60) return false;
  return /^[a-z0-9]+(\.[a-z0-9]+)*$/.test(u);
}

/**
 * Endereço que vai para o Supabase Auth. Se o usuário digitou um e-mail de
 * verdade, ele passa direto; se digitou só o identificador, recebe o domínio
 * interno. É o que permite a mesma tela de login servir aos dois públicos.
 */
export function emailDeLogin(identificador: string): string {
  const entrada = (identificador || '').trim().toLowerCase();
  if (!entrada) return '';
  return entrada.includes('@') ? entrada : `${entrada}@${DOMINIO_LOGIN_INTERNO}`;
}

/** `true` quando o endereço é um identificador interno, não uma caixa real. */
export function ehEmailInterno(email: string | null | undefined): boolean {
  return (email || '').trim().toLowerCase().endsWith(`@${DOMINIO_LOGIN_INTERNO}`);
}

/**
 * O que mostrar na tela. Para usuário sem e-mail, exibir
 * `fulano@sisten.local` sugeriria uma caixa que não existe — mostra-se só
 * `fulano`.
 */
export function rotuloIdentificador(email: string | null | undefined): string {
  const e = (email || '').trim();
  if (!ehEmailInterno(e)) return e;
  return e.slice(0, e.lastIndexOf('@')).toLowerCase();
}
