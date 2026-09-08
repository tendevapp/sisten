/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regras de visibilidade do módulo Demandas.
 *
 * Um quadro pertence a um setor. Um usuário enxerga um quadro quando:
 *  - é administrador (vê todos); ou
 *  - o setor do quadro está entre os que ele acompanha — o próprio setor mais
 *    os que o admin liberou em `profile.demandas_setores`; ou
 *  - o quadro foi compartilhado com ele (`membros_extra`); ou
 *  - foi ele quem criou o quadro.
 *
 * A RLS do banco é permissiva de propósito (ver a migration): o filtro fino é
 * aqui, no mesmo modelo já usado para solicitações (`lib/solicitacoes.ts`).
 */

import type { DemQuadro, Profile, Sector } from '../types';

/** É admin? (curinga que vê tudo). */
function ehAdmin(user: Profile): boolean {
  return user.roles.includes('admin');
}

/**
 * Setores cujos quadros o usuário acompanha. Admin → todos os setores
 * conhecidos; demais → próprio setor + `demandas_setores` (dedup).
 */
export function setoresVisiveis(user: Profile, sectors: Sector[]): string[] {
  if (ehAdmin(user)) return sectors.map(s => s.id);
  const ids = new Set<string>();
  if (user.sector_id) ids.add(user.sector_id);
  for (const id of user.demandas_setores ?? []) ids.add(id);
  return Array.from(ids);
}

/** O usuário pode ver este quadro? */
export function podeVerQuadro(user: Profile, quadro: DemQuadro, sectors: Sector[]): boolean {
  if (ehAdmin(user)) return true;
  if (quadro.criado_por && quadro.criado_por === user.id) return true;
  if (quadro.membros_extra?.includes(user.id)) return true;
  return setoresVisiveis(user, sectors).includes(quadro.setor_id);
}

/**
 * O usuário pode gerenciar o quadro (renomear, cor, arquivar, compartilhar,
 * gerir buckets, excluir)? Criador, admin, ou gestor de um setor que ele
 * acompanha e que é o dono do quadro.
 */
export function podeGerenciarQuadro(user: Profile, quadro: DemQuadro, sectors: Sector[]): boolean {
  if (ehAdmin(user)) return true;
  if (quadro.criado_por && quadro.criado_por === user.id) return true;
  return (
    user.roles.includes('gestor')
    && setoresVisiveis(user, sectors).includes(quadro.setor_id)
  );
}

/**
 * Edição de tarefas é aberta dentro de um quadro visível — quem vê o quadro
 * cria, move e edita os cartões.
 */
export function podeEditarTarefa(user: Profile, quadro: DemQuadro, sectors: Sector[]): boolean {
  return podeVerQuadro(user, quadro, sectors);
}

/** Setores em que o usuário pode abrir um quadro novo. */
export function setoresParaNovoQuadro(user: Profile, sectors: Sector[]): Sector[] {
  const permitidos = new Set(setoresVisiveis(user, sectors));
  return sectors.filter(s => permitidos.has(s.id));
}

/** Filtra a lista de quadros ao que o usuário pode ver. */
export function filtrarQuadrosVisiveis(user: Profile, quadros: DemQuadro[], sectors: Sector[]): DemQuadro[] {
  return quadros.filter(q => podeVerQuadro(user, q, sectors));
}
