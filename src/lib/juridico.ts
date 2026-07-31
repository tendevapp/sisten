/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chamado com destino Jurídico — tipos de chamado, tipos de contrato e a
 * estimativa de prazo (SLA) mostrada no formulário de Nova Solicitação.
 */

export const NOME_SETOR_JURIDICO = 'Jurídico';

export const TIPOS_CHAMADO_JURIDICO = [
  'Análise de Minuta',
  'Elaboração de Novo Contrato',
  'Aditivo Contratual',
  'Distrato / Rescisão',
  'Consulta Jurídica Geral',
  'Suporte a Cotação / Suprimentos',
] as const;

// Taxonomia inicial e genérica — sem regra de negócio definida ainda; fácil
// de ajustar depois (é só uma lista).
export const TIPOS_CONTRATO_JURIDICO = [
  'Fornecimento',
  'Serviço',
  'Locação',
  'Obra',
  'Confidencialidade (NDA)',
  'Outro',
] as const;

// Prazo genérico por criticidade (dias úteis), enquanto a regra de negócio
// definitiva (por tipo de chamado + prioridade) não é definida. Fácil de
// substituir por uma matriz tipo×prioridade quando essa regra existir.
const SLA_DIAS_UTEIS_POR_CRITICIDADE: Record<number, number> = {
  5: 1,
  4: 2,
  3: 3,
  2: 5,
  1: 10,
};

function ehFimDeSemana(d: Date): boolean {
  const dia = d.getDay();
  return dia === 0 || dia === 6;
}

/** Soma dias úteis (pula sábado/domingo; não considera feriados). */
export function somarDiasUteis(inicio: Date, dias: number): Date {
  const d = new Date(inicio);
  let somados = 0;
  while (somados < dias) {
    d.setDate(d.getDate() + 1);
    if (!ehFimDeSemana(d)) somados++;
  }
  return d;
}

/** Data-alvo do SLA de um chamado jurídico, pela criticidade (1-5) do pedido. */
export function calcularPrazoSlaJuridico(criticality: number, hoje: Date = new Date()): Date {
  const dias = SLA_DIAS_UTEIS_POR_CRITICIDADE[criticality] ?? 5;
  return somarDiasUteis(hoje, dias);
}
