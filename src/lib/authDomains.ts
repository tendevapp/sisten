/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Domínios de e-mail corporativos autorizados a criar cadastro no sistema.
 * Qualquer outro e-mail é recusado tanto no auto-cadastro (tela Signup) quanto
 * em `localDb.signup`, para a regra não depender só da validação da UI.
 */
export const DOMINIOS_CADASTRO_PERMITIDOS = [
  'ten.ind.br',
  'agnet.com.br',
  'agterceiro.com.br',
] as const;

/** Mensagem única de recusa, para UI e lib não divergirem. */
export const MSG_DOMINIO_NAO_PERMITIDO =
  `Cadastro restrito a e-mails corporativos: ${DOMINIOS_CADASTRO_PERMITIDOS.map(d => '@' + d).join(', ')}.`;

/**
 * `true` se o e-mail pertence a um domínio autorizado. Aceita subdomínios
 * (`fulano@rh.ten.ind.br`), mas não domínios que apenas terminam com o texto
 * (`fulano@fake-ten.ind.br` é recusado).
 */
export function emailDominioPermitido(email: string): boolean {
  const normalizado = (email || '').trim().toLowerCase();
  const at = normalizado.lastIndexOf('@');
  if (at === -1) return false;
  const dominio = normalizado.slice(at + 1);
  if (!dominio) return false;
  return DOMINIOS_CADASTRO_PERMITIDOS.some(d => dominio === d || dominio.endsWith('.' + d));
}
