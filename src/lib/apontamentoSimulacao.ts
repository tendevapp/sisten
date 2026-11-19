/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Apontamento de contagem da Simulação de baixas (TEMPORÁRIO) — não é
 * inventário: sem travas, sem segunda contagem, sem mexer no saldo. Só recebe
 * o físico contado ao lado do físico esperado da simulação.
 *
 * Entram na lista só as posições com saldo na ZL0024 e que não são EPI do
 * Book (EPI sai pela Ficha de EPI e tem conferência própria).
 *
 * Módulo puro; a gravação fica em `apontamentoSimulacaoApi.ts`.
 */

import { chaveMaterial } from './requisicaoBalcao';
import type { PosicaoSimulada } from './simulacaoBaixas';

export interface ApontamentoSimulacao {
  id?: string;
  zl_em: string;
  material: string;
  deposito: string;
  unidade: string;
  descricao: string | null;
  posicao: string | null;
  esperado: number | null;
  contado: number;
  observacao: string | null;
  contado_por_nome: string | null;
  contado_em?: string;
}

/** `material|depósito|UM` — a mesma chave da tabela da simulação. */
export const chaveApontamento = (p: Pick<PosicaoSimulada, 'material' | 'deposito' | 'unidade'>) =>
  [p.material, p.deposito, p.unidade].join('|');

/**
 * Depósitos fora da conferência: 0105 (Transferência Produção, só destino) e
 * 0006, a pedido do almoxarifado em 19/11.
 */
export const DEPOSITOS_FORA_DA_CONTAGEM: ReadonlySet<string> = new Set(['0105', '0006']);
const deposito4 = (d: string) => String(d ?? '').trim().padStart(4, '0');

export interface PosicoesParaContar {
  contar: PosicaoSimulada[];
  /** Saldo SAP vazio, zero ou negativo na ZL0024 (ou UM diferente — saldo não lido). */
  semSaldo: number;
  epi: number;
  /** Em depósito fora da conferência (`DEPOSITOS_FORA_DA_CONTAGEM`). */
  deposito: number;
}

export function posicoesParaContar(posicoes: PosicaoSimulada[], codigosEpi: ReadonlySet<string>): PosicoesParaContar {
  const out: PosicoesParaContar = { contar: [], semSaldo: 0, epi: 0, deposito: 0 };
  for (const p of posicoes) {
    if (DEPOSITOS_FORA_DA_CONTAGEM.has(deposito4(p.deposito))) { out.deposito++; continue; }
    if (codigosEpi.has(chaveMaterial(p.material))) { out.epi++; continue; }
    if (p.saldo == null || p.saldo <= 0) { out.semSaldo++; continue; }
    out.contar.push(p);
  }
  return out;
}

export type SituacaoApontamento = 'contar' | 'coincide' | 'diferenca';

export function situacaoApontamento(esperado: number | null, contado: number | null | undefined): SituacaoApontamento {
  if (contado == null) return 'contar';
  if (esperado == null) return 'diferenca';
  return Math.round((contado - esperado) * 1e6) === 0 ? 'coincide' : 'diferenca';
}

export function diferencaApontamento(esperado: number | null, contado: number | null | undefined): number | null {
  if (contado == null || esperado == null) return null;
  return Math.round((contado - esperado) * 1e6) / 1e6;
}
