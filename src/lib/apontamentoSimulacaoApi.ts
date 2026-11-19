/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Gravação do apontamento de contagem da Simulação de baixas (TEMPORÁRIO,
 * `alm_simulacao_apontamentos`). Uma rodada por corte da ZL0024; recontar o
 * mesmo material × depósito × UM sobrescreve.
 */

import { supabase } from '../db/supabaseClient';
import type { ApontamentoSimulacao } from './apontamentoSimulacao';

const tabela = () => (supabase.from as any)('alm_simulacao_apontamentos');

export async function listarApontamentosSimulacao(zlEm: string): Promise<ApontamentoSimulacao[]> {
  const { data, error } = await tabela().select('*').eq('zl_em', zlEm).order('contado_em');
  if (error) throw new Error(error.message);
  return ((data ?? []) as ApontamentoSimulacao[]).map(a => ({
    ...a,
    contado: Number(a.contado),
    esperado: a.esperado == null ? null : Number(a.esperado),
  }));
}

export async function salvarApontamentoSimulacao(a: ApontamentoSimulacao): Promise<ApontamentoSimulacao> {
  const { data, error } = await tabela()
    .upsert({ ...a, contado_em: new Date().toISOString() }, { onConflict: 'zl_em,material,deposito,unidade' })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return { ...data, contado: Number(data.contado), esperado: data.esperado == null ? null : Number(data.esperado) } as ApontamentoSimulacao;
}
