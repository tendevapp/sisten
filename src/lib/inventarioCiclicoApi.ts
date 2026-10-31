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
import type { LinhaImportacaoInventario, ResumoImportacaoInventario } from './inventarioCiclicoImportacao';
import type { CausaInventario, ContextoAuditoriaInventario } from './inventarioAuditoria';

export async function contextoAuditoriaInventario(id?: string): Promise<ContextoAuditoriaInventario> {
  const { data, error } = await supabase.rpc('alm_inv_contexto_auditoria' as any, { p_inventario: id ?? null } as any);
  if (error) throw new Error(error.message);
  return data as unknown as ContextoAuditoriaInventario;
}
export async function solicitarAtualizacaoInventario(id: string, janela: number): Promise<void> {
  const { error } = await supabase.rpc('alm_inv_solicitar_atualizacao' as any, { p_inventario: id, p_janela_minutos: janela } as any);
  if (error) throw new Error(error.message);
}
export async function liberarPreparacaoInventario(id: string, extracao: string, obs: string): Promise<void> {
  const { error } = await supabase.rpc('alm_inv_liberar_preparacao' as any, { p_preparacao: id, p_extracao_em: extracao, p_corte_confirmado: true, p_observacao: obs } as any);
  if (error) throw new Error(error.message);
}

export async function importarBaseInventario(linhas: LinhaImportacaoInventario[], arquivo: string, gravar = false): Promise<ResumoImportacaoInventario> {
  const { data, error } = await supabase.rpc('alm_inv_importar_base' as any, {
    p_linhas: linhas, p_arquivo: arquivo, p_gravar: gravar,
  } as any);
  if (error) throw new Error(error.message);
  return data as unknown as ResumoImportacaoInventario;
}

export async function ultimoResumoImportacaoInventario(): Promise<ResumoImportacaoInventario | null> {
  const { data, error } = await (supabase.from as any)('alm_inv_importacoes')
    .select('resumo').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.resumo ?? null;
}

const COLUNAS_CONTAGEM =
  'id, numero, quantidade, divergente, endereco_encontrado, validade, observacao, contado_por_nome, created_at, causa, causa_detalhe, preparacao_id, iniciada_em, duracao_segundos, movimentacoes_controladas';

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

export interface ReservaInventario {
  material: string; deposito: string; minha: boolean; responsavel: string;
  inventario: string | null; item_id: string | null; expira_em: string | null;
}
export async function listarReservasInventario(sessao: string): Promise<ReservaInventario[]> {
  const { data, error } = await supabase.rpc('alm_inv_listar_reservas' as any, { p_sessao: sessao } as any);
  if (error) throw new Error(error.message);
  return data as unknown as ReservaInventario[];
}
export async function definirReservaInventario(sessao: string, itens: ItemParaInventario[]): Promise<ReservaInventario[]> {
  const { data, error } = await supabase.rpc('alm_inv_definir_reserva' as any, { p_sessao: sessao, p_itens: itens } as any);
  if (error) throw new Error(error.message);
  return data as unknown as ReservaInventario[];
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

/** Um inventário só, com itens e contagens — para quem conta fora da tela do inventário. */
export async function buscarInventario(id: string): Promise<InventarioRow | null> {
  const { data, error } = await (supabase.from as any)('alm_inventarios')
    .select(`*, itens:alm_inventario_itens(*, contagens:alm_inventario_contagens(${COLUNAS_CONTAGEM}))`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalizar(data) : null;
}

export async function criarInventario(
  inv: { data: string; criterio: string; observacao: string | null; conferente_nome: string | null; criado_por_nome: string; reserva_sessao?: string },
  itens: ItemParaInventario[],
): Promise<{ id: string; codigo: string }> {
  const { data, error } = await supabase.rpc('alm_inv_criar_auditado' as any, { p_inv: inv, p_itens: itens } as any);
  if (error) throw new Error(error.message);
  return { id: (data as any)?.id, codigo: (data as any)?.codigo ?? '' };
}

export async function adicionarItensInventario(id: string, itens: ItemParaInventario[], sessao?: string): Promise<number> {
  const { data, error } = await supabase.rpc('alm_inv_adicionar_reservados' as any, { p_id: id, p_itens: itens, p_sessao: sessao ?? null } as any);
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
  /** Hora da importação da ZL0024 usada na comparação — para o aviso de divergência. */
  zl0024_importada_em?: string | null;
}

/**
 * Grava uma contagem (imutável). O banco compara com o saldo da rodada
 * liberada, se houver, ou com a ZL0024 atual — não depende de liberação.
 */
export async function registrarContagem(
  itemId: string,
  c: { quantidade: number; endereco: string | null; validade: string | null; observacao: string | null; por: string;
    causa: CausaInventario | null; causaDetalhe: string | null; iniciadaEm: string },
): Promise<ResultadoContagem> {
  const { data, error } = await supabase.rpc('alm_inv_registrar_contagem_auditada' as any, {
    p_item_id: itemId,
    p_quantidade: c.quantidade,
    p_endereco: c.endereco,
    p_validade: c.validade,
    p_observacao: c.observacao,
    p_por: c.por,
    // A rodada (se liberada) é achada pelo banco; "sem movimentação" não é mais confirmado na tela.
    p_causa: c.causa, p_causa_detalhe: c.causaDetalhe, p_preparacao: null, p_iniciada_em: c.iniciadaEm, p_sem_movimentacao: false,
  } as any);
  if (error) throw new Error(error.message);
  return data as ResultadoContagem;
}

/** Recusa nova contagem: revela o saldo da ZL0024 e grava o alerta. */
export async function encerrarItemInventario(
  itemId: string,
  causa: CausaInventario,
  detalhe: string,
): Promise<{ status: StatusItemInventario; saldo_sistema: number; diferenca: number; alerta: string }> {
  const { data, error } = await supabase.rpc('alm_inv_encerrar_auditado' as any, { p_item_id: itemId, p_causa: causa, p_detalhe: detalhe } as any);
  if (error) throw new Error(error.message);
  return data as any;
}

/** Exclusão lógica — autor só enquanto nenhum item foi contado; administradores podem excluir qualquer inventário criado. */
export async function excluirInventario(id: string, por: string): Promise<void> {
  const { error } = await supabase.rpc('alm_inv_excluir' as any, { p_id: id, p_por: por } as any);
  if (error) throw new Error(error.message);
}
