/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Leitura das retiradas sem baixa no SAP para o Cadastro de Itens
 * (ver `baixasPendentesCatalogo.ts`). Pagina: o PostgREST corta em 1.000.
 */

import { supabase } from '../db/supabaseClient';
import { buscarTudo } from './buscarTudo';
import { baixasPendentesPorMaterial, type BaixaPendenteMaterial, type MovimentoSemBaixa } from './baixasPendentesCatalogo';

export async function listarBaixasPendentesPorMaterial(): Promise<Map<string, BaixaPendenteMaterial>> {
  if (!supabase) return new Map();
  const linhas = await buscarTudo<MovimentoSemBaixa>((de, ate) => (supabase as any)
    .rpc('alm_baixas_pendentes_por_material')
    .order('codigo', { ascending: true })
    .order('material', { ascending: true })
    .order('deposito', { ascending: true })
    .range(de, ate));
  return baixasPendentesPorMaterial(linhas);
}
