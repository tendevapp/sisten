/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Consulta da data da ultima saida/consumo por material na MB51 para o
 * Cadastro de Itens. Usa a RPC agregada `alm_ultimo_movimento_por_material`
 * e faz fallback automatico para leitura paginada de `sap_mb51_mov` caso a
 * migration ainda nao tenha sido aplicada no ambiente.
 */

import { supabase } from '../db/supabaseClient';
import { buscarTudo } from './buscarTudo';
import {
  TMV_CONSUMO_SAIDA,
  TMV_TRANSFERENCIA_SAIDA,
  ultimosMovimentosPorMaterial,
  type LinhaUltimoMovimento,
  type UltimoMovimentoMaterial,
} from './ultimoMovimentoCatalogo';

const VALIDADE_CACHE_MS = 10 * 60 * 1000;
let cache: { em: number; mapa: Map<string, UltimoMovimentoMaterial> } | null = null;
let emAndamento: Promise<Map<string, UltimoMovimentoMaterial>> | null = null;

function ehErroRpcAusente(err: unknown): boolean {
  const e = err as { code?: string; message?: string; status?: number } | null;
  if (!e) return false;
  if (e.code === 'PGRST202' || e.code === '42883' || e.status === 404) return true;
  const msg = String(e.message ?? '').toLowerCase();
  return msg.includes('alm_ultimo_movimento_por_material') && (msg.includes('could not find') || msg.includes('does not exist'));
}

async function listarViaFallbackMb51(): Promise<LinhaUltimoMovimento[]> {
  const filtroOr = `tipo_movimento.in.(${TMV_CONSUMO_SAIDA.join(',')}),and(tipo_movimento.eq.${TMV_TRANSFERENCIA_SAIDA},qtd_um_registro.lt.0)`;
  const linhas = await buscarTudo<{ material: string; data_lancamento: string; tipo_movimento: string | null }>((de, ate) =>
    (supabase as any)
      .from('sap_mb51_mov')
      .select('material, data_lancamento, tipo_movimento')
      .or(filtroOr)
      .not('material', 'is', null)
      .not('data_lancamento', 'is', null)
      .order('data_lancamento', { ascending: false })
      .order('id', { ascending: false })
      .range(de, ate),
  );
  return linhas.map((l) => ({
    material: l.material,
    ultima_data: l.data_lancamento,
    tipo_movimento: l.tipo_movimento,
  }));
}

/** Mapa de codigo SAP normalizado -> ultima saida/consumo registrada na MB51. */
export async function listarUltimosMovimentosPorMaterial(
  forcar = false,
): Promise<Map<string, UltimoMovimentoMaterial>> {
  if (!supabase) return new Map();
  if (!forcar && cache && Date.now() - cache.em < VALIDADE_CACHE_MS) {
    return cache.mapa;
  }
  if (!forcar && emAndamento) {
    return emAndamento;
  }

  const tarefa = (async () => {
    let linhas: LinhaUltimoMovimento[];
    try {
      linhas = await buscarTudo<LinhaUltimoMovimento>((de, ate) =>
        (supabase as any)
          .rpc('alm_ultimo_movimento_por_material')
          .order('material', { ascending: true })
          .range(de, ate),
      );
    } catch (err) {
      if (!ehErroRpcAusente(err)) throw err;
      linhas = await listarViaFallbackMb51();
    }

    const mapa = ultimosMovimentosPorMaterial(linhas);
    cache = { em: Date.now(), mapa };
    return mapa;
  })();

  emAndamento = tarefa;
  try {
    return await tarefa;
  } finally {
    if (emAndamento === tarefa) emAndamento = null;
  }
}
