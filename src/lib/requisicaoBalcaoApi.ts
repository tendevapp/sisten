/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Requisição no Balcão — acesso ao Supabase.
 *
 * Tabelas `alm_req_balcao` + `alm_req_balcao_itens` (migration
 * `20260923120000_create_alm_requisicao_balcao`). A escrita passa só pelas
 * RPCs: elas geram o código RQB, conferem o saldo na ZL0024 e aplicam a
 * regra autor/admin.
 */

import { supabase } from '../db/supabaseClient';
import type { PepAplicacao, TipoMovimentoBalcao } from './requisicaoBalcao';

/** As tabelas ainda não estão em `database.types.ts` — mesmo atalho de `almoxarifadoRmApi`. */
const dbReq = () => (supabase.from as any)('alm_req_balcao');
const dbExportacoes = () => (supabase.from as any)('alm_req_balcao_exportacoes');

export interface ReqBalcaoItemRow {
  id: string;
  requisicao_id: string;
  ordem: number;
  material: string;
  descricao: string | null;
  unidade: string | null;
  quantidade: number;
  saldo_zl0024: number | null;
  /** Documento SAP da baixa deste item — vem da importação da planilha concluída. */
  doc_sap: string | null;
  status_processamento: string | null;
}

export interface ReqBalcaoAlteracao {
  id: string;
  acao: 'criacao' | 'edicao' | 'exclusao' | 'doc_sap' | 'exportacao' | 'reabertura' | 'importacao_sap';
  alteracoes: { campo: string; de: string | null; para: string | null }[];
  resumo: string | null;
  alterado_por_nome: string | null;
  created_at: string;
}

export interface ReqBalcaoRow {
  id: string;
  codigo: string;
  data: string;
  turno: string | null;
  tipo_movimento: TipoMovimentoBalcao;
  deposito_origem: string;
  deposito_destino: string | null;
  colaborador_id: string | null;
  colaborador_nome: string;
  colaborador_registro: string | null;
  /** Elemento PEP (WBS) da aplicação; `aplicacao` é a descrição dele. */
  aplicacao_pep: string | null;
  aplicacao: string;
  observacao: string | null;
  doc_sap: string | null;
  doc_sap_em: string | null;
  doc_sap_por: string | null;
  criado_por_id: string | null;
  criado_por_nome: string | null;
  created_at: string;
  updated_at: string | null;
  /** Lote de exportação vigente; nulo = ainda na fila "Não exportadas". */
  exportacao_id: string | null;
  itens: ReqBalcaoItemRow[];
}

export interface ReqBalcaoExportacao {
  id: string;
  arquivo: string;
  exportado_por_id: string | null;
  exportado_por_nome: string | null;
  total_requisicoes: number;
  total_itens: number;
  codigos: string[];
  created_at: string;
}

/** Lista fixa de centros de custo (PEP) do balcão, na ordem da folha. */
export async function listarAplicacoesBalcao(): Promise<PepAplicacao[]> {
  const { data, error } = await (supabase.from as any)('alm_balcao_aplicacoes')
    .select('wbs, nome')
    .eq('ativo', true)
    .order('ordem');
  if (error) throw new Error(error.message);
  return (data || []) as PepAplicacao[];
}

/** Lotes exportados, do mais recente para o mais antigo. */
export async function listarExportacoesBalcao(limite = 100): Promise<ReqBalcaoExportacao[]> {
  const { data, error } = await dbExportacoes()
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return (data || []) as ReqBalcaoExportacao[];
}

/** Registra o lote e vincula as requisições — chamar depois de gerar o arquivo. */
export async function registrarExportacaoBalcao(ids: string[], arquivo: string, por: string): Promise<void> {
  const { error } = await supabase.rpc('alm_req_balcao_registrar_exportacao' as any, {
    p_ids: ids,
    p_arquivo: arquivo,
    p_por: por,
  } as any);
  if (error) throw new Error(error.message);
}

/** Devolve requisições à fila "Não exportadas". */
export async function reabrirExportacaoBalcao(ids: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('alm_req_balcao_reabrir_exportacao' as any, { p_ids: ids } as any);
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

export interface ReqBalcaoInput {
  data: string;
  turno: string | null;
  tipo_movimento: TipoMovimentoBalcao;
  deposito_origem: string;
  deposito_destino: string | null;
  colaborador_id: string | null;
  colaborador_nome: string;
  colaborador_registro: string | null;
  /** A RPC grava a descrição a partir de `fin_pep`. */
  aplicacao_pep: string;
  observacao: string | null;
  criado_por_nome: string;
}

/** Requisições não excluídas, da mais recente para a mais antiga, com os itens. */
export async function listarRequisicoesBalcao(limite = 500): Promise<ReqBalcaoRow[]> {
  const { data, error } = await dbReq()
    .select('*, itens:alm_req_balcao_itens(*)')
    .eq('excluido', false)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return ((data || []) as ReqBalcaoRow[]).map((r) => ({
    ...r,
    itens: [...(r.itens || [])].sort((a, b) => a.ordem - b.ordem),
  }));
}

/** Cria (`id` nulo) ou edita uma requisição. Devolve o código gravado. */
export async function salvarRequisicaoBalcao(
  id: string | null,
  req: ReqBalcaoInput,
  itens: { material: string; quantidade: number }[],
): Promise<string> {
  const { data, error } = await supabase.rpc('alm_req_balcao_salvar' as any, {
    p_id: id,
    p_req: req,
    p_itens: itens,
  } as any);
  if (error) throw new Error(error.message);
  return (data as any)?.codigo ?? '';
}

/** Grava o nº do documento SAP em várias requisições; documento vazio desfaz. */
export async function informarDocSap(ids: string[], doc: string, por: string): Promise<number> {
  const { data, error } = await supabase.rpc('alm_req_balcao_informar_doc_sap' as any, {
    p_ids: ids,
    p_doc: doc,
    p_por: por,
  } as any);
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

/** Log de alterações da requisição, do mais recente para o mais antigo. */
export async function listarAlteracoesBalcao(requisicaoId: string): Promise<ReqBalcaoAlteracao[]> {
  const { data, error } = await (supabase.from as any)('alm_req_balcao_alteracoes')
    .select('id, acao, alteracoes, resumo, alterado_por_nome, created_at')
    .eq('requisicao_id', requisicaoId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as ReqBalcaoAlteracao[];
}

/** Grava o doc. SAP/status lidos da planilha concluída. */
export async function importarSapBalcao(
  linhas: { codigo: string; material: string; doc_sap: string; status: string }[],
  arquivo: string,
  por: string,
): Promise<{ requisicoes: number; itens: number; nao_encontrados: string[] }> {
  const { data, error } = await supabase.rpc('alm_req_balcao_importar_sap' as any, {
    p_linhas: linhas,
    p_arquivo: arquivo,
    p_por: por,
  } as any);
  if (error) throw new Error(error.message);
  return data as any;
}

/** Exclusão lógica — some da tela, permanece no banco. */
export async function excluirRequisicaoBalcao(id: string, por: string): Promise<void> {
  const { error } = await supabase.rpc('alm_req_balcao_excluir' as any, { p_id: id, p_por: por } as any);
  if (error) throw new Error(error.message);
}
