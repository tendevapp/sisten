/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado › Solicitação Extraordinária de Materiais Estruturais
 * (FRM.ALM-0013) — acesso ao Supabase.
 *
 * Tabela `alm_solicitacao_extra` (migration
 * `20261020120000_create_alm_solicitacao_extra`). Código SEM-DDMMYY-NN com
 * índice reiniciado por mês, gerado pelo trigger `alm_sol_extra_antes_gravar`
 * — o registro que entra pela fila offline ganha o código só ao chegar ao
 * servidor. Itens em jsonb: um insert só, o formulário inteiro cabe na fila.
 *
 * A busca de material lê o Cadastro de Itens (`alm_catalogo_itens`), não a ZL0024.
 *
 * Gravar/editar/excluir: autor ou admin (RLS). Regularizar (doc SAP da baixa):
 * qualquer um com login, pela RPC `alm_sol_extra_regularizar`, como o doc SAP
 * da Requisição no Balcão.
 */

import { supabase } from '../db/supabaseClient';
import type { DadosSolExtra, ItemSolExtra, MotivoSolExtra, StatusSolExtra, TurnoSolExtra } from './solicitacaoExtra';
import type { MaterialDisponivel } from './requisicaoBalcao';

/** A tabela ainda não está em `database.types.ts` — mesmo atalho do Kaizen. */
const db = () => (supabase.from as any)('alm_solicitacao_extra');

export interface SolExtra {
  id: string;
  codigo: string | null;
  data: string;
  hora: string | null;
  turno: TurnoSolExtra | null;
  projeto: string | null;
  tramo: string | null;
  itens: ItemSolExtra[];
  motivo: MotivoSolExtra;
  motivo_detalhe: string | null;
  area_reparada_m2: number | null;
  rugosidade_um: number | null;
  observacao: string | null;
  status: StatusSolExtra;
  doc_sap: string | null;
  regularizacao_obs: string | null;
  regularizado_por: string | null;
  regularizado_por_nome: string | null;
  regularizado_em: string | null;
  criado_por: string | null;
  criado_por_nome: string | null;
  created_at: string;
  updated_at: string;
  excluido_em: string | null;
}

/**
 * Itens do Cadastro de Itens do almoxarifado (`alm_catalogo_itens`, FRM.ALM-0016)
 * para a busca do formulário — não a ZL0024: o material desta solicitação é
 * justamente o que ainda não tem saldo lá. Paginado porque o cadastro passa
 * do teto de 1.000 linhas por resposta do PostgREST.
 */
export async function listarCatalogoParaSolicitacao(): Promise<MaterialDisponivel[]> {
  const PAGINA = 1000;
  const itens: MaterialDisponivel[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await (supabase.from as any)('alm_catalogo_itens')
      .select('codigo_sap, descricao, umb, saldo_zl0024')
      .eq('ativo', true)
      .order('codigo_sap')
      .range(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    const linhas = (data || []) as { codigo_sap: string; descricao: string | null; umb: string | null; saldo_zl0024: number | null }[];
    for (const l of linhas) {
      if (!l.codigo_sap) continue;
      itens.push({
        material: l.codigo_sap.trim(),
        descricao: (l.descricao || '').trim(),
        unidade: (l.umb || 'UN').trim(),
        saldo: Number(l.saldo_zl0024) || 0,
      });
    }
    if (linhas.length < PAGINA) return itens;
  }
}

export async function listarSolicitacoesExtra(): Promise<SolExtra[]> {
  const { data, error } = await db()
    .select('*')
    .is('excluido_em', null)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data || []) as SolExtra[];
}

export async function criarSolicitacaoExtra(dados: DadosSolExtra, autorNome: string): Promise<SolExtra> {
  const { data, error } = await db()
    .insert({ ...dados, id: crypto.randomUUID(), criado_por_nome: autorNome })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SolExtra;
}

/** Edição pelo autor ou admin (a RLS recusa os demais; o trigger trava a já regularizada). */
export async function atualizarSolicitacaoExtra(id: string, dados: DadosSolExtra): Promise<void> {
  const { error } = await db().update(dados).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function excluirSolicitacaoExtra(id: string, excluidoPor: string): Promise<void> {
  const { error } = await db()
    .update({ excluido_em: new Date().toISOString(), excluido_por: excluidoPor })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Informa o doc SAP da baixa em uma ou várias solicitações pendentes. Devolve quantas mudaram. */
export async function regularizarSolicitacoesExtra(ids: string[], docSap: string, obs?: string): Promise<number> {
  const { data, error } = await (supabase.rpc as any)('alm_sol_extra_regularizar', {
    p_ids: ids,
    p_doc_sap: docSap,
    p_obs: obs ?? null,
  });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}
