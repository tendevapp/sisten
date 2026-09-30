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
import { localDb } from '../db/localDb';
import type { EstoqueItem } from '../types';
import { ORIGEM_FICHA_EPI, type PepAplicacao, type TipoMovimentoBalcao } from './requisicaoBalcao';
import { ehRespostaOffline } from './offline/configFormularios';

/** As tabelas ainda não estão em `database.types.ts` — mesmo atalho de `almoxarifadoRmApi`. */
const dbReq = () => (supabase.from as any)('alm_req_balcao');
const dbExportacoes = () => (supabase.from as any)('alm_req_balcao_exportacoes');

/**
 * Puxa a posição de estoque da ZL0024 diretamente do Supabase (`sap_zl0024_stk`),
 * garantindo que a tela e o formulário de balcão trabalhem com saldos em tempo real.
 */
export async function buscarEstoqueBalcao(forcar = true): Promise<EstoqueItem[]> {
  return localDb.fetchEstoque(forcar);
}

export interface ReqBalcaoItemRow {
  id: string;
  requisicao_id: string;
  ordem: number;
  material: string;
  descricao: string | null;
  unidade: string | null;
  quantidade: number;
  saldo_zl0024: number | null;
  aplicacao_pep?: string | null;
  aplicacao?: string | null;
  deposito?: string | null;
  deposito_destino?: string | null;
  sem_saldo?: boolean | null;
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
  /** Gerada por outro formulário e ainda não confirmada pelo almoxarifado: não exporta. */
  pendente_confirmacao?: boolean | null;
  /** De onde veio (ex.: 'ficha_epi') e a referência (código da ficha). */
  origem?: string | null;
  origem_ref?: string | null;
  confirmada_por?: string | null;
  confirmada_em?: string | null;
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
  aplicacao?: string | null;
  observacao: string | null;
  criado_por_nome: string;
  /** Edição de requisição pendente: confirma e libera para exportação. */
  confirmar?: boolean;
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

export interface ReqBalcaoItemInput {
  material: string;
  quantidade: number;
  aplicacao_pep?: string | null;
  aplicacao?: string | null;
  deposito?: string | null;
  deposito_destino?: string | null;
  descricao?: string | null;
  unidade?: string | null;
}

/** Cria (`id` nulo) ou edita uma requisição. Devolve o código gravado. */
export async function salvarRequisicaoBalcao(
  id: string | null,
  req: ReqBalcaoInput,
  itens: ReqBalcaoItemInput[],
): Promise<string> {
  const { data, error } = await supabase.rpc('alm_req_balcao_salvar' as any, {
    p_id: id,
    p_req: req,
    p_itens: itens,
  } as any);
  if (error) throw new Error(error.message);
  return (data as any)?.codigo ?? '';
}

export interface RequisicaoPendenteInput {
  data: string;
  colaborador_id: string | null;
  colaborador_nome: string;
  colaborador_registro: string | null;
  /** PEP sugerido pelo setor; o almoxarifado confirma ou troca. */
  pep: PepAplicacao;
  observacao: string | null;
  /** Código da ficha que originou a saída (ex.: EPI-300926-01). */
  origemRef: string;
  criadoPorNome: string;
  itens: { material: string; quantidade: number; descricao: string; unidade: string; deposito: string }[];
}

export interface RequisicaoPendenteCriada {
  /** Vazio quando gravada offline: o código nasce quando a fila sobe. */
  codigo: string;
  offline: boolean;
  /** `false` = o banco não conhece a pendência (migration não aplicada): a requisição saiu como comum. */
  pendente: boolean;
}

/**
 * Cria a saída de estoque da Ficha de EPI já preenchida e PENDENTE de
 * confirmação — não entra na exportação até o almoxarifado abrir, conferir o
 * PEP e liberar.
 */
export async function criarRequisicaoPendenteDeFicha(input: RequisicaoPendenteInput): Promise<RequisicaoPendenteCriada> {
  const depositoOrigem = input.itens[0]?.deposito ?? '';
  const { data, error } = await supabase.rpc('alm_req_balcao_salvar' as any, {
    p_id: null,
    p_req: {
      data: input.data,
      turno: null,
      tipo_movimento: 'saida',
      deposito_origem: depositoOrigem,
      deposito_destino: null,
      colaborador_id: input.colaborador_id,
      colaborador_nome: input.colaborador_nome,
      colaborador_registro: input.colaborador_registro,
      aplicacao_pep: input.pep.wbs,
      aplicacao: input.pep.nome,
      observacao: input.observacao,
      criado_por_nome: input.criadoPorNome,
      pendente_confirmacao: true,
      origem: ORIGEM_FICHA_EPI,
      origem_ref: input.origemRef,
    },
    p_itens: input.itens.map((i) => ({
      material: i.material,
      quantidade: i.quantidade,
      aplicacao_pep: input.pep.wbs,
      aplicacao: input.pep.nome,
      descricao: i.descricao,
      unidade: i.unidade,
      deposito: i.deposito,
    })),
  } as any);
  if (error) throw new Error(error.message);
  if (ehRespostaOffline(data)) return { codigo: '', offline: true, pendente: true };
  const row = data as { codigo?: string; pendente_confirmacao?: boolean } | null;
  return { codigo: row?.codigo ?? '', offline: false, pendente: row?.pendente_confirmacao === true };
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
