/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Gravação do apontamento de contagem da Simulação de baixas (TEMPORÁRIO,
 * `alm_simulacao_apontamentos`). Grava por corte da ZL0024 (recontar no
 * mesmo corte sobrescreve), mas a tela lê a contagem mais recente de cada
 * material × depósito × UM: reimportar a ZL0024 não apaga o que já foi contado.
 */

import { supabase } from '../db/supabaseClient';
import { buscarTudo } from './buscarTudo';
import type { ApontamentoSimulacao } from './apontamentoSimulacao';

const tabela = () => (supabase.from as any)('alm_simulacao_apontamentos');

/** Todas as contagens, de todos os cortes, da mais antiga para a mais recente. */
export async function listarApontamentosSimulacao(): Promise<ApontamentoSimulacao[]> {
  const data = await buscarTudo<ApontamentoSimulacao>((de, ate) =>
    tabela().select('*').order('contado_em').order('id').range(de, ate));
  return data.map(a => ({
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
