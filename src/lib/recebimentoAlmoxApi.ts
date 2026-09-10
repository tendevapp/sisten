/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Recebimento — acesso ao Supabase.
 *
 * Segue o padrão dos módulos próprios (`projetosApi`, `facilitiesApi`):
 * Supabase direto, `.from()` com `as any` porque as tabelas novas ainda não
 * estão em `database.types.ts`, exclusão lógica (`softDelete.ts`).
 *
 * As gravações vão por RPC (`alm_receb_registrar_*`): cada uma grava em
 * várias tabelas numa transação e o código do registro é gerado no banco,
 * a partir dos códigos do próprio dia — dois celulares que voltam do offline
 * juntos não colidem.
 */

import { supabase } from '../db/supabaseClient';
import { comprimirImagemUpload, type PreparedAttachment } from './imageCompression';
import { apenasVigentes, marcarExcluido } from './softDelete';
import { isProjetoItem } from './rastreio';
import type { EnrichedSAPRecord } from '../types';
import {
  hojeISO,
  type AnexoRecebimento,
  type DestinoPrevisto,
  type FontePedido,
  type TipoDivergencia,
  type TipoEmbalagem,
  type TipoItemConferencia,
} from './recebimentoAlmox';

const db = (tabela: string) => (supabase.from as any)(tabela);

const BUCKET = 'alm-recebimento';

const semZeros = (v?: string | null): string => String(v ?? '').trim().replace(/^0+/, '');

// ---------------------------------------------------------------------------
// Contingência: lista de itens do PO para o F2
// ---------------------------------------------------------------------------

export interface LinhaPedidoPO {
  linhaRef: string | null;
  materialCode: string;
  descricao: string;
  unidade: string;
  rm: string | null;
  fornecedor: string | null;
  qtdPedido: number | null;
  qtdJaFornecida: number | null;
}

export interface ResultadoLinhasPedido {
  fonte: FontePedido;
  fornecedor: string | null;
  linhas: LinhaPedidoPO[];
}

/**
 * Carrega as linhas de um PO com dupla contingência:
 *
 *  1. `cache_sap` — o dataset ZL0132 já sincronizado no aparelho (passado em
 *     `records`). Instantâneo e funciona offline; é o caminho normal.
 *  2. `supabase`  — quando o cache não tem o PO (aparelho novo, sync
 *     pendente), busca `alm_receb_po_linhas` no banco.
 *
 * Nos dois casos vazios a tela cai para digitação manual (`fonte: 'manual'`).
 */
export async function carregarLinhasPedido(
  pedido: string,
  records: EnrichedSAPRecord[] = [],
): Promise<ResultadoLinhasPedido> {
  const alvo = semZeros(pedido);
  if (!alvo) return { fonte: 'manual', fornecedor: null, linhas: [] };

  const doCache = records
    .filter((r) => semZeros(r.documento_compra) === alvo)
    .map<LinhaPedidoPO>((r) => ({
      linhaRef: r.ri_po || null,
      materialCode: String(r.material_code ?? ''),
      descricao: r.texto_breve ?? '',
      unidade: r.unidade_medida ?? '',
      rm: r.requisicao_de_compra ?? null,
      fornecedor: r.fornecedor_name ?? null,
      qtdPedido: typeof r.qtd_po === 'number' ? r.qtd_po : null,
      qtdJaFornecida: typeof r.qtd_fornecida_po === 'number' ? r.qtd_fornecida_po : null,
    }));

  if (doCache.length) {
    return { fonte: 'cache_sap', fornecedor: doCache[0].fornecedor, linhas: doCache };
  }

  const { data, error } = await supabase.rpc('alm_receb_po_linhas' as any, { p_pedido: pedido } as any);
  if (error) {
    console.warn('alm_receb_po_linhas falhou; conferência seguirá manual.', error);
    return { fonte: 'manual', fornecedor: null, linhas: [] };
  }

  const linhas = ((data ?? []) as any[]).map<LinhaPedidoPO>((z) => ({
    linhaRef: z.linha_ref ?? null,
    materialCode: String(z.material_code ?? ''),
    descricao: z.descricao ?? '',
    unidade: z.unidade ?? '',
    rm: z.rm ?? null,
    fornecedor: z.fornecedor ?? null,
    qtdPedido: z.qtd_pedido == null ? null : Number(z.qtd_pedido),
    qtdJaFornecida: z.qtd_ja_fornecida == null ? null : Number(z.qtd_ja_fornecida),
  }));

  if (!linhas.length) return { fonte: 'manual', fornecedor: null, linhas: [] };
  return { fonte: 'supabase', fornecedor: linhas[0].fornecedor, linhas };
}

/**
 * Transportadoras para o autocompletar do campo da ficha cega. União de três
 * fontes, dedup por chave normalizada, tudo em MAIÚSCULAS (o form é maiúsculo):
 *
 *  1. `sup_diligenciamento_itens.transportadora` — o que o comprador preencheu
 *     nos itens ainda **sem MIGO** (é a lista que o usuário pediu);
 *  2. `sup_transportadoras.nome` — o cadastro;
 *  3. `alm_receb_cargas.transportadora` — o que já foi digitado aqui, então uma
 *     transportadora nova digitada hoje entra nas buscas futuras sozinha.
 */
export async function listarTransportadorasSugeridas(): Promise<string[]> {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();
  const vistos = new Map<string, string>();
  const add = (v: unknown) => {
    const s = String(v ?? '').trim();
    if (!s) return;
    const k = norm(s);
    if (!vistos.has(k)) vistos.set(k, k);
  };

  const [dil, cad, cargas] = await Promise.all([
    db('sup_diligenciamento_itens').select('transportadora'),
    db('sup_transportadoras').select('nome'),
    db('alm_receb_cargas').select('transportadora'),
  ]);

  (dil.data ?? []).forEach((r: any) => add(r.transportadora));
  (cad.data ?? []).forEach((r: any) => add(r.nome));
  (cargas.data ?? []).forEach((r: any) => add(r.transportadora));

  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** `projeto`, `consumo` ou `misto` a partir dos códigos de material das linhas. */
export function classificarTipoItem(materiais: string[]): TipoItemConferencia {
  let p = false;
  let c = false;
  for (const m of materiais) (isProjetoItem(m) ? (p = true) : (c = true));
  if (p && c) return 'misto';
  return p ? 'projeto' : 'consumo';
}

// ---------------------------------------------------------------------------
// Evidências (regra 1 do CLAUDE.md — nada sobe cru)
// ---------------------------------------------------------------------------

export async function subirEvidencia(
  arquivo: File | PreparedAttachment,
  codigo: string,
): Promise<AnexoRecebimento> {
  const preparado = 'blob' in arquivo;
  const blob = preparado ? arquivo.blob : await comprimirImagemUpload(arquivo);
  const nome = arquivo.name;
  const tipo = preparado ? arquivo.mimeType : blob === arquivo ? arquivo.type : 'image/jpeg';
  const extensao = (nome.split('.').pop() || 'jpg').toLowerCase();
  const path = `${codigo}/${Math.random().toString(36).slice(2, 9)}.${extensao}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: tipo, upsert: false });
  if (error) throw new Error(`Falha no upload da evidência: ${error.message}`);
  return { path, nome, tipo };
}

/** URLs assinadas de 24 h para pré-visualizar evidências. */
export async function assinarEvidencias(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 24);
  const mapa: Record<string, string> = {};
  (data ?? []).forEach((item: any) => {
    if (item?.path && item?.signedUrl) mapa[item.path] = item.signedUrl;
  });
  return mapa;
}

// ---------------------------------------------------------------------------
// F1 — Ficha cega de volumes
// ---------------------------------------------------------------------------

export interface CargaInput {
  data: string;
  hora?: string | null;
  transportadora: string;
  veiculo_placa?: string | null;
  motorista?: string | null;
  doc_transporte?: string | null;
  nota_fiscal?: string | null;
  nro_pedido?: string | null;
  qtd_volumes_declarada?: number | null;
  qtd_volumes_contada: number;
  tipo_embalagem?: TipoEmbalagem | null;
  lacre_integro?: boolean | null;
  avaria_aparente?: boolean;
  avaria_descricao?: string | null;
  peso_declarado?: number | null;
  destino_previsto?: DestinoPrevisto;
  evidencias: AnexoRecebimento[];
  observacao?: string | null;
  criado_por_id?: string | null;
  criado_por_nome: string;
}

export async function registrarCarga(carga: CargaInput): Promise<{ id: string; codigo: string; divergencia: boolean }> {
  const { data, error } = await supabase.rpc('alm_receb_registrar_carga' as any, { p_carga: carga } as any);
  if (error) throw new Error(error.message);
  return data as { id: string; codigo: string; divergencia: boolean };
}

// ---------------------------------------------------------------------------
// F2 — Recebimento e contagem
// ---------------------------------------------------------------------------

export interface ConferenciaItemInput {
  linha_ref?: string | null;
  /** PO da linha — uma conferência pode misturar itens de vários pedidos. */
  nro_pedido?: string | null;
  material_code?: string | null;
  descricao?: string | null;
  unidade?: string | null;
  qtd_pedido?: number | null;
  qtd_ja_fornecida?: number | null;
  qtd_recebida: number;
  conferido: boolean;
  divergencia: boolean;
  tipo_divergencia?: TipoDivergencia | null;
  item_manual?: boolean;
  /** Recebimento parcial deste lote — não conta como falta / NC. */
  parcial?: boolean;
  observacao?: string | null;
  evidencias?: AnexoRecebimento[];
}

export interface ConferenciaInput {
  data: string;
  carga_id?: string | null;
  nro_pedido?: string | null;
  /** Todos os POs conferidos (o `nro_pedido` é o principal / 1º). */
  pedidos?: string[];
  fornecedor?: string | null;
  rm?: string | null;
  tipo_item: TipoItemConferencia;
  deposito?: string | null;
  fonte_pedido: FontePedido;
  evidencias: AnexoRecebimento[];
  observacao?: string | null;
  criado_por_id?: string | null;
  criado_por_nome: string;
  itens: ConferenciaItemInput[];
  /** Preenchido só quando há divergência — vira a NCR consolidada. */
  nc?: {
    tipo: TipoDivergencia | 'volume' | 'outros';
    severidade?: 'baixa' | 'media' | 'alta';
    descricao: string;
    responsavel?: string | null;
    itens_resumo: {
      material_code: string;
      descricao: string;
      qtd_pedido: number | null;
      qtd_recebida: number;
      tipo_divergencia: string | null;
    }[];
  } | null;
}

export async function registrarConferencia(
  conf: ConferenciaInput,
): Promise<{ id: string; codigo: string; nc_codigo: string | null; itens_divergentes: number; tem_nc: boolean }> {
  const { itens, nc, ...cab } = conf;
  const { data, error } = await supabase.rpc('alm_receb_registrar_conferencia' as any, {
    p_cab: cab,
    p_itens: itens,
    p_nc: nc ?? null,
  } as any);
  if (error) throw new Error(error.message);
  return data as { id: string; codigo: string; nc_codigo: string | null; itens_divergentes: number; tem_nc: boolean };
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export interface CargaRow {
  id: string;
  codigo: string;
  data: string;
  hora: string | null;
  transportadora: string;
  veiculo_placa: string | null;
  motorista: string | null;
  doc_transporte: string | null;
  nota_fiscal: string | null;
  nro_pedido: string | null;
  qtd_volumes_declarada: number | null;
  qtd_volumes_contada: number;
  tipo_embalagem: TipoEmbalagem | null;
  lacre_integro: boolean | null;
  avaria_aparente: boolean;
  avaria_descricao: string | null;
  peso_declarado: number | null;
  destino_previsto: DestinoPrevisto;
  evidencias: AnexoRecebimento[];
  observacao: string | null;
  divergencia: boolean;
  status: 'recebida' | 'em_conferencia' | 'conferida' | 'divergente';
  criado_por_id: string | null;
  criado_por_nome: string | null;
  created_at: string;
}

export interface ConferenciaItemRow extends ConferenciaItemInput {
  id: string;
  evidencias: AnexoRecebimento[];
}

export interface ConferenciaRow {
  id: string;
  codigo: string;
  data: string;
  carga_id: string | null;
  nro_pedido: string | null;
  pedidos: string[];
  fornecedor: string | null;
  rm: string | null;
  tipo_item: TipoItemConferencia;
  deposito: string | null;
  fonte_pedido: FontePedido;
  total_itens: number;
  itens_ok: number;
  itens_divergentes: number;
  tem_nc: boolean;
  encaminhado_projetos: boolean;
  evidencias: AnexoRecebimento[];
  observacao: string | null;
  status: 'rascunho' | 'concluida';
  criado_por_id: string | null;
  criado_por_nome: string | null;
  created_at: string;
  itens: ConferenciaItemRow[];
  nc: NaoConformidadeRow[];
}

export interface AlteracaoRow {
  id: string;
  entidade: 'carga' | 'conferencia' | 'nc';
  entidade_id: string;
  codigo: string | null;
  alteracoes: { campo: string; de: string | null; para: string | null }[];
  resumo: string | null;
  alterado_por_nome: string | null;
  created_at: string;
}

export interface NcAcao {
  texto: string | null;
  evidencias: AnexoRecebimento[];
  por_id: string | null;
  por_nome: string | null;
  em: string;
}

export interface NaoConformidadeRow {
  id: string;
  codigo: string;
  conferencia_id: string | null;
  carga_id: string | null;
  nro_pedido: string | null;
  fornecedor: string | null;
  tipo: string;
  severidade: 'baixa' | 'media' | 'alta';
  descricao: string;
  itens_resumo: any[];
  evidencias: AnexoRecebimento[];
  acoes: NcAcao[];
  status: 'aberta' | 'em_tratativa' | 'resolvida';
  responsavel: string | null;
  resolucao: string | null;
  resolvida_em: string | null;
  created_at: string;
}

export async function listarCargas(incluirExcluidas = false): Promise<CargaRow[]> {
  const { data, error } = await apenasVigentes(db('alm_receb_cargas').select('*'), incluirExcluidas)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CargaRow[];
}

export async function listarConferencias(incluirExcluidas = false): Promise<ConferenciaRow[]> {
  const { data, error } = await apenasVigentes(
    db('alm_receb_conferencias').select(
      '*, itens:alm_receb_conferencia_itens(*), nc:alm_receb_nc(*)',
    ),
    incluirExcluidas,
  )
    .order('data', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ConferenciaRow[];
}

export async function listarNaoConformidades(incluirExcluidas = false): Promise<NaoConformidadeRow[]> {
  const { data, error } = await apenasVigentes(db('alm_receb_nc').select('*'), incluirExcluidas)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as NaoConformidadeRow[];
}

export interface NcPatch {
  status?: 'aberta' | 'em_tratativa' | 'resolvida';
  severidade?: 'baixa' | 'media' | 'alta';
  responsavel?: string | null;
  descricao?: string | null;
  tipo?: string;
  resolucao?: string | null;
  /** Lista completa de fotos gerais da NCR (existentes + novas). */
  evidencias?: AnexoRecebimento[];
}

/**
 * Edita a NCR e/ou registra um andamento da tratativa. `acao` (texto + fotos)
 * vira uma entrada em `acoes[]`. Toda mudança de campo é logada em
 * `alm_receb_alteracoes` (entidade `nc`). Sem trava de autor — a tratativa
 * da não conformidade é de quem a conduz.
 */
export async function editarNc(
  id: string,
  patch: NcPatch,
  acao: { texto?: string | null; evidencias?: AnexoRecebimento[] } | null,
  user: { id?: string | null; nome: string },
): Promise<{ id: string; codigo: string; alteracoes: number }> {
  const { data, error } = await supabase.rpc('alm_receb_editar_nc' as any, {
    p_id: id,
    p_patch: patch,
    p_acao: acao ?? null,
    p_user: { id: user.id ?? null, nome: user.nome },
  } as any);
  if (error) throw new Error(error.message);
  return data as { id: string; codigo: string; alteracoes: number };
}

/** Atalho da lista: troca só o status da NCR (passa pelo mesmo RPC, então loga). */
export async function atualizarNaoConformidade(
  id: string,
  campos: NcPatch,
  user: { id?: string | null; nome: string },
): Promise<void> {
  await editarNc(id, campos, null, user);
}

/** Marca que as linhas de projeto já foram levadas ao módulo Projetos. */
export async function marcarEncaminhadoProjetos(conferenciaId: string): Promise<void> {
  const { error } = await db('alm_receb_conferencias')
    .update({ encaminhado_projetos: true })
    .eq('id', conferenciaId);
  if (error) throw new Error(error.message);
}

export async function excluirCarga(id: string, usuarioId?: string | null): Promise<void> {
  const { error } = await db('alm_receb_cargas').update(marcarExcluido(usuarioId)).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function excluirConferencia(id: string, usuarioId?: string | null): Promise<void> {
  const marca = marcarExcluido(usuarioId);
  // A conferência primeiro: se a RLS barrar (não é autor/admin), nada de NCR órfã.
  const { error } = await db('alm_receb_conferencias').update(marca).eq('id', id);
  if (error) throw new Error(error.message);
  await db('alm_receb_nc').update(marca).eq('conferencia_id', id);
}

// ---------------------------------------------------------------------------
// Edição pelo autor + log de alterações
// ---------------------------------------------------------------------------

/** Campos editáveis da ficha cega (o que a UI manda no patch). */
export interface CargaPatch {
  data?: string;
  hora?: string | null;
  transportadora?: string;
  veiculo_placa?: string | null;
  motorista?: string | null;
  doc_transporte?: string | null;
  nota_fiscal?: string | null;
  nro_pedido?: string | null;
  qtd_volumes_declarada?: number | null;
  qtd_volumes_contada?: number;
  tipo_embalagem?: TipoEmbalagem | null;
  lacre_integro?: boolean | null;
  avaria_aparente?: boolean;
  avaria_descricao?: string | null;
  peso_declarado?: number | null;
  destino_previsto?: DestinoPrevisto;
  observacao?: string | null;
  evidencias?: AnexoRecebimento[];
}

export async function editarCarga(
  id: string,
  patch: CargaPatch,
  user: { id?: string | null; nome: string },
): Promise<{ id: string; codigo: string; alteracoes: number }> {
  const { data, error } = await supabase.rpc('alm_receb_editar_carga' as any, {
    p_id: id,
    p_patch: patch,
    p_user: { id: user.id ?? null, nome: user.nome },
  } as any);
  if (error) throw new Error(error.message);
  return data as { id: string; codigo: string; alteracoes: number };
}

export interface ConferenciaCabPatch {
  nro_pedido?: string | null;
  pedidos?: string[];
  fornecedor?: string | null;
  rm?: string | null;
  deposito?: string | null;
  observacao?: string | null;
  carga_id?: string | null;
  tipo_item?: TipoItemConferencia;
  evidencias?: AnexoRecebimento[];
}

/**
 * Edita a conferência. `itens` opcional: quando enviado, substitui a lista
 * inteira, recalcula os contadores/`tem_nc` e abre uma NCR se passou a ter
 * divergência e ainda não houver uma.
 */
export async function editarConferencia(
  id: string,
  cab: ConferenciaCabPatch,
  itens: ConferenciaItemInput[] | null,
  user: { id?: string | null; nome: string },
): Promise<{ id: string; codigo: string; nc_codigo: string | null; tem_nc: boolean; alteracoes: number }> {
  const { data, error } = await supabase.rpc('alm_receb_editar_conferencia' as any, {
    p_id: id,
    p_cab: cab,
    p_itens: itens ?? null,
    p_user: { id: user.id ?? null, nome: user.nome },
  } as any);
  if (error) throw new Error(error.message);
  return data as { id: string; codigo: string; nc_codigo: string | null; tem_nc: boolean; alteracoes: number };
}

/** Log de alterações de um registro, mais recente primeiro. */
export async function listarAlteracoes(
  entidade: 'carga' | 'conferencia' | 'nc',
  entidadeId: string,
): Promise<AlteracaoRow[]> {
  const { data, error } = await db('alm_receb_alteracoes')
    .select('*')
    .eq('entidade', entidade)
    .eq('entidade_id', entidadeId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AlteracaoRow[];
}

export { hojeISO };
