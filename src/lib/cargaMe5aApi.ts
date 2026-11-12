/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Referência de tamanho da ME5A para a trava de carga filtrada
 * (`cargaMe5a.ts`): a maior quantidade de linhas lidas nas últimas cargas.
 * Falha de rede não bloqueia a importação — devolve 0 (sem histórico).
 */

import { supabase } from '../db/supabaseClient';

export async function referenciaCargaMe5a(ultimas = 15): Promise<number> {
  try {
    const { data, error } = await (supabase.from as any)('import_logs')
      .select('records_read')
      .eq('type', 'ME5A')
      .order('created_at', { ascending: false })
      .limit(ultimas);
    if (error) return 0;
    return Math.max(0, ...((data ?? []) as { records_read: number | null }[]).map((r) => Number(r.records_read) || 0));
  } catch {
    return 0;
  }
}
