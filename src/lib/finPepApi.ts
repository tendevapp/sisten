/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Financeiro > Estrutura PEP (WBS Element) — API Supabase.
 *
 * Operações com a tabela `fin_pep`: listagem filtrada, KPIs, upsert em lote e
 * substituição completa da tabela na importação.
 */

import { supabase } from '../db/supabaseClient';
import type { FinPep, FinPepInput } from '../types';

const db = (tabela: string) => (supabase.from as any)(tabela);

export interface FiltrosPep {
  definicao_projeto?: string;
  centro_lucro?: string;
  nivel?: number;
  busca?: string;
}

export async function listarPep(filtros?: FiltrosPep): Promise<FinPep[]> {
  let query = db('fin_pep')
    .select('*')
    .order('nivel', { ascending: true })
    .order('wbs_element', { ascending: true });

  if (filtros?.definicao_projeto && filtros.definicao_projeto !== 'Todos') {
    query = query.eq('definicao_projeto', filtros.definicao_projeto);
  }
  if (filtros?.centro_lucro && filtros.centro_lucro !== 'Todos') {
    query = query.eq('centro_lucro', filtros.centro_lucro);
  }
  if (filtros?.nivel != null && !isNaN(filtros.nivel)) {
    query = query.eq('nivel', filtros.nivel);
  }
  if (filtros?.busca) {
    const q = filtros.busca.trim();
    if (q) {
      query = query.or(`wbs_element.ilike.%${q}%,nome.ilike.%${q}%,definicao_projeto.ilike.%${q}%,centro_lucro.ilike.%${q}%`);
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as FinPep[];
}

export async function buscarPepPorWbs(wbs: string): Promise<FinPep | null> {
  const { data, error } = await db('fin_pep')
    .select('*')
    .eq('wbs_element', wbs.trim())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as FinPep | null;
}

export async function excluirPep(id: string): Promise<void> {
  const { error } = await db('fin_pep').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function limparTodosPep(): Promise<void> {
  // Deleta todas as linhas via query sem restrição de ID
  const { error } = await db('fin_pep').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw new Error(error.message);
}

/**
 * Importa linhas de PEP em lote (batches de até 500 registros para alta performance).
 * Suporta modo 'replace' (limpa tudo antes de inserir) ou 'upsert' (atualiza existentes por wbs_element).
 */
export async function importarPepEmLote(
  linhas: FinPepInput[],
  modo: 'upsert' | 'replace' = 'upsert',
  usuarioNome?: string,
  onProgresso?: (percent: number) => void,
): Promise<{ inseridos: number; total: number }> {
  if (!linhas.length) return { inseridos: 0, total: 0 };

  if (modo === 'replace') {
    await limparTodosPep();
  }

  const BATCH_SIZE = 250;
  let gravados = 0;
  const agora = new Date().toISOString();

  for (let i = 0; i < linhas.length; i += BATCH_SIZE) {
    const chunk = linhas.slice(i, i + BATCH_SIZE).map(item => ({
      ...item,
      importado_em: agora,
      importado_por: usuarioNome || 'Sistema',
      updated_at: agora,
    }));

    const { error } = await db('fin_pep').upsert(chunk, {
      onConflict: 'wbs_element',
    });

    if (error) throw new Error(`Falha no lote ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);

    gravados += chunk.length;
    if (onProgresso) {
      onProgresso(Math.round((gravados / linhas.length) * 100));
    }
  }

  return { inseridos: gravados, total: linhas.length };
}
