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
import { DEPOSITO_EPI, ORIGEM_FICHA_EPI, type PepAplicacao, type TipoMovimentoBalcao } from './requisicaoBalcao';
import { ehRespostaOffline } from './offline/configFormularios';
import { buscarTudo } from './buscarTudo';

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
  acao: 'criacao' | 'edicao' | 'exclusao' | 'doc_sap' | 'exportacao' | 'reabertura' | 'importacao_sap' | 'restauracao';
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

const comItensOrdenados = (r: ReqBalcaoRow): ReqBalcaoRow => ({
  ...r,
  itens: [...(r.itens || [])].sort((a, b) => a.ordem - b.ordem),
});

/**
 * Requisições não excluídas, da mais recente para a mais antiga, com os itens:
 * as `limite` mais recentes **mais todas as que ainda têm trabalho** — pendente
 * de confirmação, não exportada ou sem documento SAP —, por antigas que sejam.
 *
 * A requisição de uma retirada sem saldo (RSS) ou da ficha de EPI nasce com a
 * data da retirada, que pode estar semanas atrás. Só as pendentes não bastavam:
 * ao confirmar, ela deixava de ser pendente e, fora das 500 mais recentes,
 * sumia também de "Não exportadas" — e não ia para o SAP (10/11, RSS do
 * dia 30/10 baixadas pelo almoxarifado).
 */
export async function listarRequisicoesBalcao(limite = 500): Promise<ReqBalcaoRow[]> {
  const [recentes, emAberto] = await Promise.all([
    dbReq()
      .select('*, itens:alm_req_balcao_itens(*)')
      .eq('excluido', false)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limite),
    buscarTudo<ReqBalcaoRow>((de, ate) => dbReq()
      .select('*, itens:alm_req_balcao_itens(*)')
      .eq('excluido', false)
      .or('pendente_confirmacao.eq.true,exportacao_id.is.null,doc_sap.is.null')
      .order('data', { ascending: false })
      .order('id', { ascending: true })
      .range(de, ate)),
  ]);
  if (recentes.error) throw new Error(recentes.error.message);
  const porId = new Map<string, ReqBalcaoRow>();
  for (const r of [...(recentes.data || []), ...emAberto] as ReqBalcaoRow[]) porId.set(r.id, r);
  // Importação parcial: a RQB já tem doc. SAP, mas algum item não — fica na aba
  // Exportadas mesmo fora das recentes. Poucas; erro aqui não derruba a lista.
  try {
    const parciais = await buscarTudo<{ requisicao_id: string }>((de, ate) => (supabase.from as any)('alm_req_balcao_itens')
      .select('requisicao_id, req:alm_req_balcao!inner(doc_sap, excluido)')
      .is('doc_sap', null)
      .not('req.doc_sap', 'is', null)
      .eq('req.excluido', false)
      .order('id', { ascending: true })
      .range(de, ate));
    const faltam = [...new Set(parciais.map((p) => p.requisicao_id))].filter((id) => !porId.has(id));
    for (let i = 0; i < faltam.length; i += 100) {
      const { data, error } = await dbReq().select('*, itens:alm_req_balcao_itens(*)').in('id', faltam.slice(i, i + 100));
      if (error) throw error;
      for (const r of (data || []) as ReqBalcaoRow[]) porId.set(r.id, r);
    }
  } catch (err) {
    console.warn('Requisição no Balcão: não carregou as importações parciais.', err);
  }
  return [...porId.values()]
    .sort((a, b) => (b.data === a.data ? (b.created_at || '').localeCompare(a.created_at || '') : b.data.localeCompare(a.data)))
    .map(comItensOrdenados);
}

/** Uma requisição pelo código, com os itens — para abrir uma que esteja fora da lista. */
export async function buscarRequisicaoBalcaoPorCodigo(codigo: string): Promise<ReqBalcaoRow | null> {
  const { data, error } = await dbReq()
    .select('*, itens:alm_req_balcao_itens(*)')
    .eq('codigo', codigo)
    .eq('excluido', false)
    .limit(1);
  if (error) throw new Error(error.message);
  const r = ((data || []) as ReqBalcaoRow[])[0];
  return r ? comItensOrdenados(r) : null;
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
  /**
   * Id da ficha. É ele que liga a requisição: sem rede o código da ficha é
   * provisório e pode mudar no envio; o id a fila troca pelo real.
   */
  origemId?: string | null;
  criadoPorNome: string;
  itens: { material: string; quantidade: number; descricao: string; unidade: string; deposito: string }[];
  /** Padrão `ficha_epi`. A retirada sem saldo usa `ORIGEM_RETIRADA_SEM_SALDO`. */
  origem?: string;
  /** Padrão `true`. A baixa da retirada sem saldo já sai conferida pelo almoxarifado. */
  pendenteConfirmacao?: boolean;
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
  const depositoOrigem = input.itens[0]?.deposito || DEPOSITO_EPI;
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
      pendente_confirmacao: input.pendenteConfirmacao ?? true,
      origem: input.origem ?? ORIGEM_FICHA_EPI,
      origem_ref: input.origemRef,
      origem_id: input.origemId ?? null,
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

/** Requisição viva gerada pela ficha de EPI (pelo id da ficha, nunca pelo código). */
export async function codigoRequisicaoDaFicha(fichaId: string): Promise<string | null> {
  const { data, error } = await dbReq()
    .select('codigo')
    .eq('origem', ORIGEM_FICHA_EPI)
    .eq('origem_id', fichaId)
    .eq('excluido', false)
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data || []) as { codigo: string | null }[])[0]?.codigo || null;
}

/** Código da requisição já gerada por outro formulário (para não gerar duas vezes). */
export async function codigoRequisicaoPorOrigem(origem: string, origemRef: string): Promise<string | null> {
  const { data, error } = await dbReq()
    .select('codigo')
    .eq('origem', origem)
    .eq('origem_ref', origemRef)
    .eq('excluido', false)
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data || []) as { codigo: string | null }[])[0]?.codigo ?? null;
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

/** Limites de um dia local como instante UTC, para filtrar `created_at`. */
const inicioDoDia = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : null);
const fimDoDia = (d: string) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : null);

/** Evento do log geral — o de uma requisição mais o código e o id dela. */
export interface ReqBalcaoAlteracaoGeral extends ReqBalcaoAlteracao {
  requisicao_id: string;
  codigo: string | null;
}

/**
 * Log de todas as requisições num período (datas locais, inclusivas), do mais
 * recente para o mais antigo. Pagina: passa de mil eventos em poucos dias.
 */
export async function listarLogGeralBalcao(de: string, ate: string): Promise<ReqBalcaoAlteracaoGeral[]> {
  const inicio = inicioDoDia(de);
  const fim = fimDoDia(ate);
  return buscarTudo<ReqBalcaoAlteracaoGeral>((a, b) => {
    let q = (supabase.from as any)('alm_req_balcao_alteracoes')
      .select('id, requisicao_id, codigo, acao, alteracoes, resumo, alterado_por_nome, created_at');
    if (inicio) q = q.gte('created_at', inicio);
    if (fim) q = q.lte('created_at', fim);
    return q.order('created_at', { ascending: false }).order('id', { ascending: true }).range(a, b);
  });
}

/** Linha que a prévia leu mas não mandou gravar — só vai para o log. */
export interface LinhaNaoEnviadaBalcao {
  codigo: string;
  material: string;
  doc_sap: string;
  status: string;
  /** Situação na prévia: igual, nao_encontrado ou sem_doc (linha sem doc. SAP). */
  situacao: string;
}

/** Resumo da leitura da planilha, gravado no log da importação. */
export interface LeituraImportacaoBalcao {
  coluna_sap: string;
  total_linhas: number;
  sem_codigo: number;
  sem_doc_sap: number;
  nao_enviadas: LinhaNaoEnviadaBalcao[];
}

/** Grava o doc. SAP/status lidos da planilha concluída e registra a importação. */
export async function importarSapBalcao(
  linhas: { codigo: string; material: string; doc_sap: string; status: string }[],
  arquivo: string,
  por: string,
  leitura?: LeituraImportacaoBalcao,
): Promise<{ requisicoes: number; itens: number; iguais?: number; nao_encontrados: string[]; importacao_id?: string }> {
  const { data, error } = await supabase.rpc('alm_req_balcao_importar_sap' as any, {
    p_linhas: linhas,
    p_arquivo: arquivo,
    p_por: por,
    p_leitura: leitura ?? null,
  } as any);
  if (error) throw new Error(error.message);
  return data as any;
}

export type ResultadoLinhaImportacao = 'gravado' | 'igual' | 'nao_encontrado' | 'sem_doc' | 'fora_da_gravacao';

export interface LinhaImportacaoLog {
  codigo: string;
  material: string;
  doc_sap: string | null;
  status?: string | null;
  resultado: ResultadoLinhaImportacao;
  motivo?: string;
  lote?: string | null;
  doc_anterior?: string | null;
  ordem?: number;
}

/** Uma importação da planilha concluída (`alm_req_balcao_importacoes`). */
export interface ImportacaoBalcao {
  id: string;
  arquivo: string | null;
  coluna_sap: string | null;
  importado_por_nome: string | null;
  created_at: string;
  total_linhas: number;
  sem_codigo: number;
  sem_doc_sap: number;
  enviadas: number;
  gravados: number;
  iguais: number;
  nao_encontrados: number;
  requisicoes: number;
  docs: string[];
  lotes: string[];
  detalhe: LinhaImportacaoLog[];
  /** Montada a partir do log antigo: só as linhas que gravaram algo. */
  reconstruida: boolean;
}

/** Importações da planilha concluída num período (datas locais, inclusivas). */
export async function listarImportacoesBalcao(de: string, ate: string): Promise<ImportacaoBalcao[]> {
  const inicio = inicioDoDia(de);
  const fim = fimDoDia(ate);
  return buscarTudo<ImportacaoBalcao>((a, b) => {
    let q = (supabase.from as any)('alm_req_balcao_importacoes').select('*');
    if (inicio) q = q.gte('created_at', inicio);
    if (fim) q = q.lte('created_at', fim);
    return q.order('created_at', { ascending: false }).order('id', { ascending: true }).range(a, b);
  }, 200);
}

export interface PendenteLoteBalcao {
  requisicao_id: string;
  codigo: string;
  tipo: string;
  ordem: number;
  material: string;
  descricao: string | null;
  quantidade: number;
  unidade: string | null;
  deposito: string | null;
}

export interface DocMb51SemVinculo {
  doc: string;
  tipo: string;
  data: string;
  linhas: number;
  /** Materiais de item sem doc. do lote que aparecem nesse documento. */
  materiais_pendentes: number;
}

/** Lote exportado × o que voltou da planilha concluída. */
export interface LoteImportacaoBalcao {
  exportacao_id: string;
  arquivo: string;
  exportada_em: string;
  data_exportacao: string;
  exportado_por: string | null;
  total_requisicoes: number;
  total_itens: number;
  requisicoes_vigentes: number;
  itens_vigentes: number;
  itens_com_doc: number;
  itens_sem_doc: number;
  docs_lote: string | null;
  importacoes: number;
  ultima_importacao_em: string | null;
  pendentes: PendenteLoteBalcao[];
  mb51_sem_vinculo: DocMb51SemVinculo[];
}

/** Por lote exportado no período: itens com/sem doc. SAP e docs da MB51 sem vínculo. */
export async function listarLotesImportacaoBalcao(de: string, ate: string): Promise<LoteImportacaoBalcao[]> {
  return buscarTudo<LoteImportacaoBalcao>((a, b) => (supabase.rpc as any)('alm_req_balcao_lotes_importacao', {
    p_de: de || null,
    p_ate: ate || null,
  }).range(a, b));
}

/**
 * Exclusão lógica — some da tela, permanece no banco. O banco recusa a de uma
 * retirada sem saldo viva (exclua a retirada) e exige `motivo` (10+ caracteres)
 * na de Ficha de EPI entregue; o motivo vai para o log.
 */
export async function excluirRequisicaoBalcao(id: string, por: string, motivo?: string): Promise<void> {
  const { error } = await supabase.rpc('alm_req_balcao_excluir' as any, { p_id: id, p_por: por, p_motivo: motivo?.trim() || null } as any);
  if (error) throw new Error(error.message);
}
