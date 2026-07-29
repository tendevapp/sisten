/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Busca no catálogo de materiais SAP.
 *
 * O catálogo tem 172 mil linhas e descrições em SAP-ês abreviado
 * ("LUVA FM FM197 1/2\" NPT 300#"), onde quase-duplicatas só se distinguem
 * pelo texto técnico. A busca antiga era `ilike '%frase inteira%'` em
 * `description`, sem índice: 1398 ms por tecla, e não achava o item quando a
 * pessoa digitava os atributos fora da ordem do cadastro.
 *
 * A normalização abaixo é do cliente, e serve para a UI decidir: se vale
 * consultar, se o termo é código ou texto, e quais tokens destacar no
 * resultado. O casamento de verdade é da RPC `buscar_materiais`, que normaliza
 * de novo no banco — de propósito: regra de tela não é regra.
 */

export type TipoTermo = 'codigo' | 'texto' | 'curto';

export interface TermoNormalizado {
  tipo: TipoTermo;
  /** Termo sem acento, em caixa alta, espaços colapsados. */
  normalizado: string;
  /** Tokens não vazios do termo normalizado. Vazio quando `tipo` é 'curto'. */
  tokens: string[];
}

/** Abaixo disto a busca devolveria meio catálogo — não vale a consulta. */
const MIN_TEXTO = 2;
/** Prefixo de código curto demais devolve milhares de linhas sem utilidade. */
const MIN_CODIGO = 4;

export function normalizarTermo(bruto: string): TermoNormalizado {
  const normalizado = (bruto ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');

  const vazio = (tipo: TipoTermo): TermoNormalizado => ({ tipo, normalizado, tokens: [] });

  if (normalizado === '') return vazio('curto');

  if (/^\d+$/.test(normalizado)) {
    return normalizado.length >= MIN_CODIGO
      ? { tipo: 'codigo', normalizado, tokens: [normalizado] }
      : vazio('curto');
  }

  if (normalizado.length < MIN_TEXTO) return vazio('curto');

  return { tipo: 'texto', normalizado, tokens: normalizado.split(' ') };
}
