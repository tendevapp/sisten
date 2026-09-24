/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Inventário Cíclico — acesso ao Supabase.
 *
 * Tabelas `alm_inventarios`, `alm_inventario_itens` e
 * `alm_inventario_contagens` (migration
 * `20260924160000_create_alm_inventario_ciclico`). Escrita só pelas RPCs.
 *
 * As colunas das contagens vão listadas uma a uma: `saldo_ref` não tem
 * grant de leitura (é o que mantém a contagem cega), e um `*` ali falha.
 */

import { supabase } from '../db/supabaseClient';
import type { ContagemInventario, ItemInventario, StatusItemInventario } from './inventarioCiclico';

const COLUNAS_CONTAGEM =
  'id, numero, quantidade, divergente, endereco_encontrado, validade, observacao, contado_por_nome, created_at';

export interface InventarioRow {
  id: string;
  codigo: string;
  data: string;
  criterio: string | null;
  observacao: string | null;
  conferente_nome: string | null;
  status: 'aberto' | 'concluido';
  concluido_em: string | null;
  criado_por_id: string | null;
  criado_por_nome: string | null;
  created_at: string;
  itens: ItemInventario[];
}

export interface ItemParaInventario {
  material: string;
  deposito: string;
  classe?: string | null;
}

function normalizar(r: any): InventarioRow {
  return {
    ...r,
    itens: [...(r.itens || [])]
      .map((i: any) => ({
        ...i,
        saldo_sistema: i.saldo_sistema == null ? null : Number(i.saldo_sistema),
        qtd_final: i.qtd_final == null ? null : Number(i.qtd_final),
        diferenca: i.diferenca == null ? null : Number(i.diferenca),
        contagens: [...(i.contagens || [])]
          .map((c: any) => ({ ...c, quantidade: Number(c.quantidade) }) as ContagemInventario)
          .sort((a, b) => a.numero - b.numero),
      }))
      .sort((a: ItemInventario, b: ItemInventario) => a.ordem - b.ordem),
  };
}

/** Inventários não excluídos, do mais recente para o mais antigo, com itens e contagens. */
export async function listarInventarios(limite = 200): Promise<InventarioRow[]> {
  const { data, error } = await (supabase.from as any)('alm_inventarios')
    .select(`*, itens:alm_inventario_itens(*, contagens:alm_inventario_contagens(${COLUNAS_CONTAGEM}))`)
    .eq('excluido', false)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return ((data || []) as any[]).map(normalizar);
}

export async function criarInventario(
  inv: { data: string; criterio: string; observacao: string | null; conferente_nome: string | null; criado_por_nome: string },
  itens: ItemParaInventario[],
): Promise<{ id: string; codigo: string }> {
  const { data, error } = await supabase.rpc('alm_inv_criar' as any, { p_inv: inv, p_itens: itens } as any);
  if (error) throw new Error(error.message);
  return { id: (data as any)?.id, codigo: (data as any)?.codigo ?? '' };
}

export async function adicionarItensInventario(id: string, itens: ItemParaInventario[]): Promise<number> {
  const { data, error } = await supabase.rpc('alm_inv_adicionar_itens' as any, { p_id: id, p_itens: itens } as any);
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

export async function removerItemInventario(itemId: string): Promise<void> {
  const { error } = await supabase.rpc('alm_inv_remover_item' as any, { p_item_id: itemId } as any);
  if (error) throw new Error(error.message);
}

export interface ResultadoContagem {
  numero: number;
  divergente: boolean;
  status: StatusItemInventario;
  pode_recontar: boolean;
  /** Só vem quando o item encerrou. */
  saldo_sistema: number | null;
  diferenca: number | null;
}

/** Grava uma contagem (imutável). O banco compara com a ZL0024. */
export async function registrarContagem(
  itemId: string,
  c: { quantidade: number; endereco: string | null; validade: string | null; observacao: string | null; por: string },
): Promise<ResultadoContagem> {
  const { data, error } = await supabase.rpc('alm_inv_registrar_contagem' as any, {
    p_item_id: itemId,
    p_quantidade: c.quantidade,
    p_endereco: c.endereco,
    p_validade: c.validade,
    p_observacao: c.observacao,
    p_por: c.por,
  } as any);
  if (error) throw new Error(error.message);
  return data as ResultadoContagem;
}

/** Recusa nova contagem: revela o saldo da ZL0024 e grava o alerta. */
export async function encerrarItemInventario(
  itemId: string,
  por: string,
): Promise<{ status: StatusItemInventario; saldo_sistema: number; diferenca: number; alerta: string }> {
  const { data, error } = await supabase.rpc('alm_inv_encerrar_item' as any, { p_item_id: itemId, p_por: por } as any);
  if (error) throw new Error(error.message);
  return data as any;
}

/** Exclusão lógica — só enquanto nenhum item foi contado. */
export async function excluirInventario(id: string, por: string): Promise<void> {
  const { error } = await supabase.rpc('alm_inv_excluir' as any, { p_id: id, p_por: por } as any);
  if (error) throw new Error(error.message);
}
