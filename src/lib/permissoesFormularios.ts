/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regra única de edição de respostas de formulário: **só o autor do
 * registro ou um admin edita** (criar/alterar/enviar/reabrir/excluir/
 * restaurar). Os demais só visualizam.
 *
 * Exceção operacional da Portaria & Segurança Patrimonial
 * (`podeEditarRegistroPortaria`, espelhando `public.port_pode_editar_no_dia`):
 * - Admin edita qualquer registro em qualquer data.
 * - Usuários vinculados ao setor Portaria (id '19') podem alterar registros da
 *   Portaria durante o próprio dia em que o registro foi realizado (inclusive
 *   a partir de outros aparelhos/usuários da equipe).
 * - Após finalizar o dia (dia seguinte), nenhum usuário não-admin altera o
 *   registro — nem o autor nem quem assume a passagem de plantão seguinte.
 */

export const SETOR_PORTARIA_ID = '19';

type UsuarioPermissao = {
  id: string;
  roles?: readonly string[] | null;
  sector_id?: string | null;
  setor_id?: string | null;
};

type ComDono = {
  /** Portaria / Expedição */
  criado_por?: string | null;
  /** Almoxarifado — Recebimento (cargas / conferências) */
  criado_por_id?: string | null;
  /** RH — ASE Hora Extra */
  solicitante_id?: string | null;
};

type RegistroPortaria = ComDono & {
  data?: string | null;
  data_entrada?: string | null;
  created_at?: string | null;
};

const DATA_ISO_SIMPLES = /^(\d{4}-\d{2}-\d{2})/;

/** Data atual no fuso local em YYYY-MM-DD (evita virada antecipada do UTC). */
export function hojeLocalISO(agora: Date = new Date()): string {
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Verifica se o usuário está vinculado ao setor Portaria (core_setores.id = '19'). */
export function ehSetorPortaria(user: UsuarioPermissao | null | undefined): boolean {
  if (!user) return false;
  const secId = user.sector_id ?? user.setor_id ?? null;
  return secId === SETOR_PORTARIA_ID;
}

/** Extrai o id do dono do registro, seja qual for a convenção da tabela. */
export function donoDoRegistro(registro: ComDono | null | undefined): string | null {
  if (!registro) return null;
  return registro.criado_por ?? registro.criado_por_id ?? registro.solicitante_id ?? null;
}

/** Extrai a data operacional (YYYY-MM-DD) de um registro da Portaria. */
export function dataDoRegistroPortaria(registro: RegistroPortaria | null | undefined): string | null {
  if (!registro) return null;
  for (const candidato of [registro.data, registro.data_entrada]) {
    if (candidato) {
      const m = DATA_ISO_SIMPLES.exec(candidato.trim());
      if (m) return m[1];
    }
  }
  if (registro.created_at) {
    const dt = new Date(registro.created_at);
    if (!Number.isNaN(dt.getTime())) return hojeLocalISO(dt);
  }
  return null;
}

/** `true` quando o registro pertence ao dia corrente (`hojeLocalISO`). */
export function ehMesmoDiaPortaria(
  registro: RegistroPortaria | null | undefined,
  agora: Date = new Date(),
): boolean {
  const dia = dataDoRegistroPortaria(registro);
  if (!dia) return false;
  return dia === hojeLocalISO(agora);
}

/**
 * `true` se o usuário pode editar/excluir a resposta: é admin ou é o autor.
 * Registros antigos sem dono gravado (`criado_por`/`solicitante_id` nulo)
 * ficam editáveis só por admin — igual à RLS.
 */
export function podeEditarFormulario(
  user: UsuarioPermissao | null | undefined,
  registro: ComDono | null | undefined,
): boolean {
  if (!user) return false;
  if (user.roles?.includes('admin')) return true;
  const dono = donoDoRegistro(registro);
  return dono != null && dono === user.id;
}

/**
 * Regra de edição para o módulo Portaria & Segurança Patrimonial:
 * - Admin: sempre pode editar/excluir/restaurar.
 * - Demais usuários: somente no mesmo dia em que o registro foi realizado.
 *   Durante esse dia, qualquer usuário vinculado ao setor Portaria pode
 *   alterar os registros (inclusive de outro aparelho); usuários de outros
 *   setores só alteram o próprio registro no mesmo dia.
 */
export function podeEditarRegistroPortaria(
  user: UsuarioPermissao | null | undefined,
  registro: RegistroPortaria | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (!user || !registro) return false;
  if (user.roles?.includes('admin')) return true;
  if (!ehMesmoDiaPortaria(registro, agora)) return false;
  if (ehSetorPortaria(user)) return true;
  const dono = donoDoRegistro(registro);
  return dono != null && dono === user.id;
}

/**
 * Ação operacional de dar saída de veículo/carreta/equipamento ainda no pátio:
 * atravessa a virada do dia (entrada noturna, saída na manhã seguinte), sem
 * liberar alteração ou exclusão do registro do dia anterior.
 */
export function podeRegistrarSaidaPortaria(
  user: UsuarioPermissao | null | undefined,
  registro: ComDono | null | undefined,
): boolean {
  if (!user || !registro) return false;
  if (user.roles?.includes('admin')) return true;
  if (ehSetorPortaria(user)) return true;
  return podeEditarFormulario(user, registro);
}
