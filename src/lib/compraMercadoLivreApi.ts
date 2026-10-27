/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Central de Compras — I/O de `sup_ml_itens` (itens destinados à compra pelo
 * Mercado Livre). Supabase direto, mesmo padrão de `diligenciamentoApi.ts`:
 * tabela nova fora de `database.types.ts`, daí o `as any` no `.from()`.
 * As regras estão em `compraMercadoLivre.ts`.
 */

import { supabase } from '../db/supabaseClient';
import type { ItemMercadoLivre } from './compraMercadoLivre';

interface Usuario { id: string; nome: string }

export async function listarItensMercadoLivre(): Promise<ItemMercadoLivre[]> {
  const { data, error } = await (supabase as any).from('sup_ml_itens').select('*');
  if (error) throw new Error(error.message);
  return (data || []) as ItemMercadoLivre[];
}

export interface DadosItemMl {
  ri: string;
  rm: string | null;
  item_reqc: string | null;
  material_code: string | null;
  texto_breve: string | null;
  qtd: number | null;
  unidade: string | null;
}

/**
 * Destina o item ao ML (ou troca o link). Upsert por `ri`; o corpo não leva
 * `numero_compra`, então trocar o link de um item já comprado não apaga a compra.
 */
export async function salvarLinkMercadoLivre(
  item: DadosItemMl,
  link: string,
  usuario: Usuario,
  jaExiste: boolean,
): Promise<void> {
  const agora = new Date().toISOString();
  const autoria = jaExiste
    ? {}
    : { criado_por_id: usuario.id, criado_por_nome: usuario.nome };
  const { error } = await (supabase as any)
    .from('sup_ml_itens')
    .upsert({
      ...item,
      link,
      ...autoria,
      atualizado_por_id: usuario.id,
      atualizado_por_nome: usuario.nome,
      updated_at: agora,
    }, { onConflict: 'ri' });
  if (error) throw new Error(error.message);
}

/** Tira o item do ML (volta a ser só um item da Central). */
export async function removerItemMercadoLivre(ri: string): Promise<void> {
  const { error } = await (supabase as any).from('sup_ml_itens').delete().eq('ri', ri);
  if (error) throw new Error(error.message);
}

/**
 * Grava o número da compra do ML em vários itens de uma vez (o carrinho
 * fechado). `numero` null desfaz o vínculo.
 */
export async function registrarCompraMercadoLivre(
  ris: string[],
  numero: string | null,
  usuario: Usuario,
): Promise<void> {
  if (ris.length === 0) return;
  const agora = new Date().toISOString();
  const { error } = await (supabase as any)
    .from('sup_ml_itens')
    .update({
      numero_compra: numero,
      compra_registrada_em: numero ? agora : null,
      compra_registrada_por_nome: numero ? usuario.nome : null,
      atualizado_por_id: usuario.id,
      atualizado_por_nome: usuario.nome,
      updated_at: agora,
    })
    .in('ri', ris);
  if (error) throw new Error(error.message);
}
