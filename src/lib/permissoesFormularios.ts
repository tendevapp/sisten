/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regra única de edição de respostas de formulário: **só o autor do
 * registro ou um admin edita** (criar/alterar/enviar/reabrir/excluir/
 * restaurar). Os demais só visualizam.
 *
 * A fonte da verdade é a RLS do Postgres (migration
 * `20260902160000_formularios_rls_autor_ou_admin.sql`): mesmo que a UI
 * deixe escapar um botão, o banco recusa o UPDATE/DELETE de quem não é
 * autor nem admin. Esta função existe só para o cliente não oferecer uma
 * ação que vai voltar 403 — espelha exatamente a condição
 * `public.form_pode_editar(dono)` do banco.
 */

type ComDono = {
  /** Portaria / Expedição */
  criado_por?: string | null;
  /** RH — ASE Hora Extra */
  solicitante_id?: string | null;
};

/** Extrai o id do dono do registro, seja qual for a convenção da tabela. */
export function donoDoRegistro(registro: ComDono | null | undefined): string | null {
  if (!registro) return null;
  return registro.criado_por ?? registro.solicitante_id ?? null;
}

/**
 * `true` se o usuário pode editar/excluir a resposta: é admin ou é o autor.
 * Registros antigos sem dono gravado (`criado_por`/`solicitante_id` nulo)
 * ficam editáveis só por admin — igual à RLS.
 */
export function podeEditarFormulario(
  user: { id: string; roles?: readonly string[] | null } | null | undefined,
  registro: ComDono | null | undefined,
): boolean {
  if (!user) return false;
  if (user.roles?.includes('admin')) return true;
  const dono = donoDoRegistro(registro);
  return dono != null && dono === user.id;
}
