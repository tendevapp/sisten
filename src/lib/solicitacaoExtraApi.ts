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
 *
 * Tipo Sem Saldo (migration `20261026120000_alm_sol_extra_sem_saldo`): código
 * RSS, aprovação do gestor do setor solicitante pela RPC `alm_sol_extra_aprovar`
 * e baixa do almoxarifado pela `alm_sol_extra_baixar`, que grava o código da
 * Requisição no Balcão gerada. Aprovação e baixa não entram na fila offline:
 * são de escritório e o resultado depende do servidor.
 */

import { supabase } from '../db/supabaseClient';
import type { PreparedAttachment } from './imageCompression';
import type {
  AprovacaoSolExtra, DadosSolExtra, FotoSolExtra, ItemSolExtra, MotivoSolExtra, StatusSolExtra, TipoSolExtra, TurnoSolExtra,
} from './solicitacaoExtra';
import type { MaterialDisponivel } from './requisicaoBalcao';

/** A tabela ainda não está em `database.types.ts` — mesmo atalho do Kaizen. */
const db = () => (supabase.from as any)('alm_solicitacao_extra');

export interface SolExtra {
  id: string;
  tipo: TipoSolExtra;
  codigo: string | null;
  data: string;
  hora: string | null;
  turno: TurnoSolExtra | null;
  projeto: string | null;
  tramo: string | null;
  itens: ItemSolExtra[];
  motivo: MotivoSolExtra | null;
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
  retirante_id: string | null;
  retirante_nome: string | null;
  retirante_matricula: string | null;
  setor_solicitante_id: string | null;
  setor_solicitante_nome: string | null;
  aprovacao_status: AprovacaoSolExtra | null;
  aprovado_por: string | null;
  aprovado_por_nome: string | null;
  aprovado_em: string | null;
  aprovacao_obs: string | null;
  /** Requisição no Balcão (RQB) que deu baixa na retirada sem saldo. */
  requisicao_balcao_codigo: string | null;
  fotos: FotoSolExtra[];
  assinatura_retirante: string | null;
  assinatura_retirante_em: string | null;
  /** PEP escolhido no registro (null = a definir na baixa). */
  aplicacao_pep?: string | null;
  aplicacao?: string | null;
  origem?: string | null;
  origem_ref?: string | null;
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

/** Registro gravado antes da coluna `tipo` (ou cópia offline antiga) é de Projeto. */
const comTipo = (rows: unknown[]): SolExtra[] =>
  (rows as SolExtra[]).map(r => ({ ...r, tipo: r.tipo ?? 'PROJETO', fotos: Array.isArray(r.fotos) ? r.fotos : [] }));

export async function listarSolicitacoesExtra(): Promise<SolExtra[]> {
  const { data, error } = await db()
    .select('*')
    .is('excluido_em', null)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return comTipo(data || []);
}

/**
 * Todas as saídas pendentes, de Projeto e Sem Saldo: o saldo da ZL0024 é
 * repartido entre elas para dizer quais já dá para regularizar. São poucas.
 */
export async function listarSolicitacoesExtraPendentes(): Promise<SolExtra[]> {
  const { data, error } = await db()
    .select('*')
    .eq('status', 'PENDENTE')
    .is('excluido_em', null)
    .order('data', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  return comTipo(data || []);
}

/**
 * Retiradas sem saldo de um recorte — sem o teto de 1.000 do PostgREST
 * importar aqui: as pendentes são poucas; o histórico da Aprovação vem limitado.
 */
export async function listarRetiradasSemSaldo(filtro: {
  status?: StatusSolExtra;
  aprovacao?: AprovacaoSolExtra;
  setores?: string[];
} = {}): Promise<SolExtra[]> {
  let q = db().select('*').eq('tipo', 'SEM_SALDO').is('excluido_em', null);
  if (filtro.status) q = q.eq('status', filtro.status);
  if (filtro.aprovacao) q = q.eq('aprovacao_status', filtro.aprovacao);
  if (filtro.setores) q = q.in('setor_solicitante_id', filtro.setores.length ? filtro.setores : ['__nenhum__']);
  const { data, error } = await q
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return comTipo(data || []);
}

/**
 * Só a contagem, para a bolinha do menu: o menu relê a cada poucos minutos em
 * toda aba aberta, e baixar as linhas inteiras (com itens) só para contar
 * pesava no banco.
 */
export async function contarRetiradasSemSaldo(filtro: {
  status?: StatusSolExtra;
  aprovacao?: AprovacaoSolExtra;
  setores?: string[];
} = {}): Promise<number> {
  let q = db().select('id', { count: 'exact', head: true }).eq('tipo', 'SEM_SALDO').is('excluido_em', null);
  if (filtro.status) q = q.eq('status', filtro.status);
  if (filtro.aprovacao) q = q.eq('aprovacao_status', filtro.aprovacao);
  if (filtro.setores) q = q.in('setor_solicitante_id', filtro.setores.length ? filtro.setores : ['__nenhum__']);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * `id` vem de fora quando há fotos: elas sobem antes, na pasta do registro,
 * e o insert já leva os caminhos (um insert só — cabe na fila offline).
 */
export async function criarSolicitacaoExtra(dados: DadosSolExtra, autorNome: string, id: string = crypto.randomUUID()): Promise<SolExtra> {
  const { data, error } = await db()
    .insert({ ...dados, id, criado_por_nome: autorNome })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { ...(data as SolExtra), tipo: (data as SolExtra)?.tipo ?? dados.tipo };
}

/** A solicitação que outro formulário já abriu (para não abrir duas). */
export async function solicitacaoExtraPorOrigem(origem: string, origemRef: string): Promise<SolExtra | null> {
  const { data, error } = await db()
    .select('*')
    .eq('origem', origem)
    .eq('origem_ref', origemRef)
    .is('excluido_em', null)
    .limit(1);
  if (error) throw new Error(error.message);
  const [row] = comTipo(data || []);
  return row ?? null;
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

// ---------------------------------------------------------------------------
// Fotos dos itens (regra 1 do CLAUDE.md: chegam aqui já comprimidas/carimbadas)
// ---------------------------------------------------------------------------

const BUCKET_FOTOS = 'alm-recebimento';

/** Sobe uma foto já preparada (`prepararFotoCarimbada`) para a pasta da solicitação. */
export async function subirFotoSolExtra(solicitacaoId: string, foto: PreparedAttachment): Promise<FotoSolExtra> {
  const extensao = (foto.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `solicitacao-extra/${solicitacaoId}/${Math.random().toString(36).slice(2, 9)}.${extensao}`;
  const { error } = await supabase.storage.from(BUCKET_FOTOS).upload(path, foto.blob, { contentType: foto.mimeType, upsert: false });
  if (error) throw new Error(`Falha no upload da foto: ${error.message}`);
  return { path, nome: foto.name, tipo: foto.mimeType };
}

/** URLs assinadas (24 h) das fotos, por caminho. */
export async function assinarFotosSolExtra(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrls(paths, 60 * 60 * 24);
  const mapa: Record<string, string> = {};
  (data ?? []).forEach((item: { path: string | null; signedUrl: string }) => {
    if (item?.path && item?.signedUrl) mapa[item.path] = item.signedUrl;
  });
  return mapa;
}

/** Gestor aprova (ou reprova, com motivo) uma ou várias retiradas sem saldo. Devolve quantas mudaram. */
export async function aprovarRetiradasSemSaldo(ids: string[], aprovar: boolean, obs?: string): Promise<number> {
  const { data, error } = await (supabase.rpc as any)('alm_sol_extra_aprovar', {
    p_ids: ids,
    p_aprovar: aprovar,
    p_obs: obs?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

/** Almoxarifado dá baixa na retirada sem saldo com a requisição no balcão gerada. */
export async function baixarRetiradaSemSaldo(id: string, requisicaoCodigo: string, obs?: string): Promise<number> {
  const { data, error } = await (supabase.rpc as any)('alm_sol_extra_baixar', {
    p_id: id,
    p_requisicao_codigo: requisicaoCodigo,
    p_obs: obs?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

/**
 * Reescolhe o depósito dos itens da Requisição no Balcão pendente da retirada
 * pelo saldo atual da ZL0024 (ela nasce no 0004, quando ainda não há saldo).
 * Mantém o PEP já escolhido. Devolve o código RQB, ou null se não houver
 * requisição pendente.
 */
export async function atualizarDepositosRequisicaoDaRetirada(codigoRss: string): Promise<string | null> {
  const { data, error } = await (supabase.rpc as any)('alm_sol_extra_atualizar_depositos_rqb', { p_codigo_rss: codigoRss });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}
