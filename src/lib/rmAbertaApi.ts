/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lista de RMs abertas por material (RPC `alm_rm_abertas`) para a Solicitação
 * Extraordinária. Guarda a última leitura no aparelho: o formulário é
 * preenchido no pátio, e sem rede a busca continua priorizando o que tem RM
 * (o banco confere de novo quando a fila sobe).
 */

import { supabase } from '../db/supabaseClient';
import { indexarRmAbertas, type LinhaRmAberta, type RmAbertaMaterial } from './rmAberta';

const CHAVE_CACHE = 'sisten.alm.rmAbertas';
const PAGINA = 1000;

/** Mapa material → RM aberta; nulo quando nem a rede nem a cópia do aparelho responderam. */
export async function carregarRmAbertas(): Promise<Map<string, RmAbertaMaterial> | null> {
  try {
    const linhas: LinhaRmAberta[] = [];
    // Paginado: o PostgREST corta em 1.000 linhas sem avisar.
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await (supabase as any).rpc('alm_rm_abertas').range(de, de + PAGINA - 1);
      if (error) throw error;
      const pagina = (data || []) as LinhaRmAberta[];
      linhas.push(...pagina);
      if (pagina.length < PAGINA) break;
    }
    try { localStorage.setItem(CHAVE_CACHE, JSON.stringify(linhas)); } catch { /* sem armazenamento */ }
    return indexarRmAbertas(linhas);
  } catch (erro) {
    console.warn('RMs abertas indisponíveis; usando a cópia do aparelho.', erro);
    try {
      const salvo = localStorage.getItem(CHAVE_CACHE);
      return salvo ? indexarRmAbertas(JSON.parse(salvo) as LinhaRmAberta[]) : null;
    } catch {
      return null;
    }
  }
}
