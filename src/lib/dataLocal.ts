/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Data do calendário no fuso do aparelho, em ISO (AAAA-MM-DD).
 *
 * `new Date().toISOString().slice(0, 10)` devolve a data em UTC: em UTC-3,
 * das 21h à meia-noite já é "amanhã". Isso fazia código de registro (RID,
 * RNC, protocolo SUP) sair com a data do dia seguinte, a data padrão dos
 * formulários vir adiantada e o que vence hoje aparecer como atrasado.
 */

/** Data ISO local de um `Date` (sem passar por UTC). */
export function paraISOLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Hoje, no fuso do aparelho. */
export function dataHojeLocal(agora: Date = new Date()): string {
  return paraISOLocal(agora);
}

/** Hoje somado de `dias` dias corridos (negativo volta), no fuso do aparelho. */
export function dataLocalMaisDias(dias: number, agora: Date = new Date()): string {
  const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + dias);
  return paraISOLocal(d);
}
