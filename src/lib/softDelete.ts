/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exclusão lógica dos formulários operacionais.
 *
 * O "Excluir" das telas de formulário (Portaria, Logística/Expedição, RH/ASE)
 * nunca apaga a linha: grava `excluido_em`/`excluido_por` e o registro some das
 * listagens, mas continua no banco e pode ser restaurado por um administrador.
 *
 * Toda tabela de formulário tem as colunas `excluido_em timestamptz` (nulo =
 * vigente) e `excluido_por text references core_perfis(id)`. Ver `db/README.md`.
 */

export const CAMPO_EXCLUIDO = 'excluido_em';

/** Objeto de update que marca uma linha como excluída (soft-delete). */
export const marcarExcluido = (excluidoPor?: string | null) => ({
  excluido_em: new Date().toISOString(),
  excluido_por: excluidoPor ?? null,
});

/** Objeto de update que reverte a exclusão lógica. */
export const marcarRestaurado = () => ({
  excluido_em: null as string | null,
  excluido_por: null as string | null,
});

/**
 * Aplica o filtro padrão "não excluídos" a uma query do supabase-js.
 * Passe `incluirExcluidos` para desligar o filtro (toggle "Mostrar excluídos").
 */
export function apenasVigentes<Q>(query: Q, incluirExcluidos = false): Q {
  return incluirExcluidos ? query : (query as any).is(CAMPO_EXCLUIDO, null);
}

/**
 * Remove filhos excluídos de um embed do PostgREST (o filtro `.is()` do
 * supabase-js não alcança recursos aninhados de forma confiável, então a
 * limpeza é feita na resposta).
 */
export function semExcluidos<R extends { excluido_em?: string | null } = any>(
  lista: R[] | null | undefined,
  incluirExcluidos = false,
): R[] {
  const arr = lista ?? [];
  return incluirExcluidos ? arr : arr.filter((x) => !x?.excluido_em);
}
