/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Configuração da abertura de RM (`sup_rm_config`).
 * Hoje guarda o comprador fixo (EKGRP) que sobrepõe o setor solicitante.
 */

import { supabase } from '../db/supabaseClient';

export interface RmConfig {
  comprador_fixo_ativo: boolean;
  comprador_fixo_codigo: string;
}

/** Vale quando a tabela não responde: a regra combinada é 358 para toda RM. */
export const RM_CONFIG_PADRAO: RmConfig = {
  comprador_fixo_ativo: true,
  comprador_fixo_codigo: '358',
};

export async function obterRmConfig(): Promise<RmConfig> {
  try {
    const { data, error } = await (supabase as any)
      .from('sup_rm_config')
      .select('comprador_fixo_ativo, comprador_fixo_codigo')
      .eq('id', 'rm')
      .maybeSingle();
    if (error || !data) return RM_CONFIG_PADRAO;
    return {
      comprador_fixo_ativo: data.comprador_fixo_ativo !== false,
      comprador_fixo_codigo: String(data.comprador_fixo_codigo || '').trim() || RM_CONFIG_PADRAO.comprador_fixo_codigo,
    };
  } catch {
    return RM_CONFIG_PADRAO;
  }
}

export async function salvarRmConfig(config: RmConfig, userId?: string): Promise<void> {
  const codigo = config.comprador_fixo_codigo.trim();
  if (config.comprador_fixo_ativo && !codigo) throw new Error('Informe o código do comprador.');

  const { error } = await (supabase as any)
    .from('sup_rm_config')
    .upsert({
      id: 'rm',
      comprador_fixo_ativo: config.comprador_fixo_ativo,
      comprador_fixo_codigo: codigo || RM_CONFIG_PADRAO.comprador_fixo_codigo,
      updated_at: new Date().toISOString(),
      updated_by: userId ?? null,
    }, { onConflict: 'id' });
  if (error) throw new Error(`Erro ao salvar configuração da RM: ${error.message}`);
}

/** Código que sobrepõe tudo na RM, ou `undefined` quando a regra está desligada. */
export function compradorFixoRm(config: RmConfig): string | undefined {
  const codigo = config.comprador_fixo_codigo.trim();
  return config.comprador_fixo_ativo && codigo ? codigo : undefined;
}
