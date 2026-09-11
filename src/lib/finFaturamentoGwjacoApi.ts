/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Financeiro > Faturamento GW Jacobina — acesso ao Supabase.
 *
 * Segue o padrão dos módulos próprios (`projetosApi`, `recebimentoAlmoxApi`):
 * Supabase direto, `.from()` com `as any` porque a tabela ainda não está em
 * `database.types.ts`. Cadastro de torre/tramo novo é INSERT direto (RLS
 * garante autor/admin); edição de um lançamento existente passa pela RPC
 * `fin_fat_editar`, que grava o diff em `fin_fat_alteracoes`.
 */

import { supabase } from '../db/supabaseClient';
import type { FinFatGwjaco, FinFatAlteracao } from '../types';

const db = (tabela: string) => (supabase.from as any)(tabela);

export interface FinFatPatch {
  torre_numero?: number;
  tramo?: string;
  serie?: number | null;
  codigo_cliente?: string | null;
  projeto_codigo?: string | null;
  nota_fiscal?: string | null;
  data_faturado?: string | null;
  semana_faturamento?: number | null;
  data_expedido?: string | null;
  data_tramos_previstos?: string | null;
  observacao?: string | null;
}

export async function listarFaturamentoGwjaco(projeto = 'GW_JACOBINA'): Promise<FinFatGwjaco[]> {
  const { data, error } = await db('fin_fat_gwjaco')
    .select('*')
    .eq('projeto', projeto)
    .order('torre_numero', { ascending: true })
    .order('tramo', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as FinFatGwjaco[];
}

/** Cadastra uma torre+tramo nova (INSERT direto — RLS trava autor/admin no update depois). */
export async function criarLancamentoFaturamento(
  patch: FinFatPatch & { projeto?: string },
): Promise<FinFatGwjaco> {
  // Best-effort: liga ao catálogo de proj_tramos_gwjaco se já existir a mesma torre/tramo.
  const projeto = patch.projeto ?? 'GW_JACOBINA';
  let tramo_id: string | null = null;
  let serie = patch.serie ?? null;
  if (patch.torre_numero != null && patch.tramo) {
    const { data: catalogo } = await db('proj_tramos_gwjaco')
      .select('id, serie')
      .eq('projeto', projeto)
      .eq('torre_numero', patch.torre_numero)
      .eq('tramo', patch.tramo)
      .maybeSingle();
    if (catalogo) {
      tramo_id = catalogo.id;
      serie = serie ?? catalogo.serie;
    }
  }

  const { data, error } = await db('fin_fat_gwjaco')
    .insert({ ...patch, projeto, serie, tramo_id })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as FinFatGwjaco;
}

export async function editarLancamentoFaturamento(
  id: string,
  patch: FinFatPatch,
  user: { id?: string | null; nome: string },
): Promise<{ id: string; alteracoes: number }> {
  const { data, error } = await supabase.rpc('fin_fat_editar' as any, {
    p_id: id,
    p_patch: patch,
    p_user: { id: user.id ?? null, nome: user.nome },
  } as any);
  if (error) throw new Error(error.message);
  return data as { id: string; alteracoes: number };
}

export async function excluirLancamentoFaturamento(id: string): Promise<void> {
  const { error } = await db('fin_fat_gwjaco').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Log de alterações de um lançamento, mais recente primeiro. */
export async function listarAlteracoesFaturamento(fatId: string): Promise<FinFatAlteracao[]> {
  const { data, error } = await db('fin_fat_alteracoes')
    .select('*')
    .eq('fat_id', fatId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FinFatAlteracao[];
}
