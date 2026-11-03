/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Suprimentos › Ava. Fornecedor — acesso ao banco.
 *
 * Códigos OCF-DDMMYY-NN (ocorrências) e AVF-DDMMYY-NN (FRM.SUP-0005) saem do
 * trigger `sup_aval_antes_gravar`, com índice reiniciado por mês — o registro
 * que entra pela fila offline ganha o código quando chega ao servidor.
 * Regras puras em `avaliacaoFornecedores.ts`.
 */

import { supabase } from '../db/supabaseClient';
import type {
  DecisaoFrm, ItemOcorrencia, LinhaPainel, RefPendencia, RespostasFrm,
} from './avaliacaoFornecedores';

const tabOc = () => (supabase.from as any)('sup_aval_ocorrencias');
const tabFrm = () => (supabase.from as any)('sup_aval_frm');
const tabDisp = () => (supabase.from as any)('sup_aval_sugestoes_dispensadas');
const rpc = (nome: string, args: Record<string, unknown>) => (supabase.rpc as any)(nome, args);

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface FornecedorOpcao {
  fornecedor_codigo: string | null;
  fornecedor_nome: string;
  cnpj: string | null;
  pedidos?: number;
  ultimo_pedido?: string | null;
}

export interface PedidoFornecedor {
  nro_pedido: string;
  data_pedido: string | null;
  fornecedor_codigo: string | null;
  fornecedor_nome: string | null;
  cnpj: string | null;
  itens: number;
  valor: number;
  resumo: string | null;
  comprador: string | null;
}

export interface RegistroOcorrencia {
  id: string;
  codigo: string | null;
  data_registro: string;
  fornecedor_codigo: string | null;
  fornecedor_nome: string;
  fornecedor_cnpj: string | null;
  nro_pedido: string | null;
  nota_fiscal: string | null;
  material_resumo: string | null;
  estrelas: number | null;
  ocorrencias: ItemOcorrencia[];
  impactos: string[];
  acoes: string[];
  acao_descricao: string | null;
  recomendacao: string | null;
  origem: 'MANUAL' | 'PENDENCIAS';
  origem_refs: string[];
  criado_por: string | null;
  criado_por_nome: string | null;
  created_at: string;
  updated_at: string;
}

export type NovoRegistroOcorrencia = Omit<
  RegistroOcorrencia,
  'id' | 'codigo' | 'criado_por' | 'criado_por_nome' | 'created_at' | 'updated_at'
>;

export interface AvaliacaoFrm {
  id: string;
  codigo: string | null;
  data_avaliacao: string;
  periodo_meses: number;
  tipo: 'MATERIAIS';
  fornecedor_codigo: string | null;
  fornecedor_nome: string;
  fornecedor_cnpj: string | null;
  respostas: RespostasFrm;
  justificativas: Record<string, string>;
  notas_criterio: Record<string, number>;
  nota_final: number;
  classificacao: string;
  decisao: DecisaoFrm;
  justificativa_final: string | null;
  resp_avaliacao: string | null;
  resumo_periodo: ResumoPeriodoFrm;
  criado_por: string | null;
  criado_por_nome: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResumoPeriodoFrm {
  inicio?: string;
  fim?: string;
  pedidos?: number;
  itens?: number;
  valor?: number;
  otd?: number | null;
  registros?: number;
  ocorrencias?: number;
  por_categoria?: Record<string, number>;
}

export type NovaAvaliacaoFrm = Omit<
  AvaliacaoFrm,
  'id' | 'codigo' | 'criado_por' | 'criado_por_nome' | 'created_at' | 'updated_at'
>;

export interface SugestaoRegistro {
  nro_pedido: string;
  fornecedor_codigo: string | null;
  fornecedor_nome: string | null;
  comprador_id: string | null;
  comprador_nome: string | null;
  data: string;
  refs: RefPendencia[];
}

// ---------------------------------------------------------------------------
// Fornecedores e pedidos (ZL0132)
// ---------------------------------------------------------------------------

export async function buscarFornecedores(termo: string): Promise<FornecedorOpcao[]> {
  const { data, error } = await rpc('sup_aval_buscar_fornecedores', { p_termo: termo, p_limite: 20 });
  if (error) throw new Error(error.message);
  return (data || []) as FornecedorOpcao[];
}

export async function listarPedidos(filtro: { fornecedorCodigo?: string | null; po?: string | null }): Promise<PedidoFornecedor[]> {
  if (!filtro.fornecedorCodigo && !filtro.po) return [];
  const { data, error } = await rpc('sup_aval_pedidos', {
    p_fornecedor_codigo: filtro.fornecedorCodigo || null,
    p_po: filtro.po || null,
  });
  if (error) throw new Error(error.message);
  return ((data || []) as any[]).map(p => ({ ...p, itens: Number(p.itens) || 0, valor: Number(p.valor) || 0 }));
}

// ---------------------------------------------------------------------------
// Ocorrências
// ---------------------------------------------------------------------------

export async function listarRegistros(opcoes: { desde?: string; fornecedorCodigo?: string | null; fornecedorNome?: string | null } = {}): Promise<RegistroOcorrencia[]> {
  let q = tabOc().select('*').is('excluido_em', null);
  if (opcoes.desde) q = q.gte('data_registro', opcoes.desde);
  if (opcoes.fornecedorCodigo) q = q.eq('fornecedor_codigo', opcoes.fornecedorCodigo);
  else if (opcoes.fornecedorNome) q = q.ilike('fornecedor_nome', opcoes.fornecedorNome);
  const { data, error } = await q
    .order('data_registro', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data || []) as RegistroOcorrencia[];
}

function limparItens(itens: ItemOcorrencia[]): ItemOcorrencia[] {
  return itens.map(i => ({
    id: i.id,
    tipo: i.tipo,
    categoria: i.categoria,
    gravidade: i.gravidade,
    deteccao: i.deteccao,
    descricao: i.descricao.trim(),
    ref: i.ref || null,
  }));
}

export async function criarRegistro(input: NovoRegistroOcorrencia): Promise<RegistroOcorrencia> {
  const { data, error } = await tabOc()
    .insert({ ...input, id: crypto.randomUUID(), ocorrencias: limparItens(input.ocorrencias) })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as RegistroOcorrencia;
}

export async function atualizarRegistro(id: string, input: NovoRegistroOcorrencia): Promise<void> {
  const { error } = await tabOc().update({ ...input, ocorrencias: limparItens(input.ocorrencias) }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function excluirRegistro(id: string, por: string): Promise<void> {
  const { error } = await tabOc().update({ excluido_em: new Date().toISOString(), excluido_por: por }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Sugestões (pendências sem registro)
// ---------------------------------------------------------------------------

export async function listarSugestoes(dias = 120): Promise<SugestaoRegistro[]> {
  const { data, error } = await rpc('sup_aval_sugestoes', { p_dias: dias });
  if (error) throw new Error(error.message);
  return (data || []) as SugestaoRegistro[];
}

export async function dispensarSugestao(s: SugestaoRegistro, motivo: string, usuario: { id: string; name?: string | null }): Promise<void> {
  const linhas = s.refs.map(r => ({
    ref: r.ref,
    nro_pedido: s.nro_pedido,
    motivo: motivo.trim() || null,
    dispensado_por: usuario.id,
    dispensado_por_nome: usuario.name || null,
  }));
  const { error } = await tabDisp().upsert(linhas, { onConflict: 'ref', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// FRM.SUP-0005
// ---------------------------------------------------------------------------

export async function listarAvaliacoesFrm(): Promise<AvaliacaoFrm[]> {
  const { data, error } = await tabFrm()
    .select('*')
    .is('excluido_em', null)
    .order('data_avaliacao', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return ((data || []) as AvaliacaoFrm[]).map(a => ({ ...a, nota_final: Number(a.nota_final) }));
}

export async function criarAvaliacaoFrm(input: NovaAvaliacaoFrm): Promise<AvaliacaoFrm> {
  const { data, error } = await tabFrm().insert({ ...input, id: crypto.randomUUID() }).select().single();
  if (error) throw new Error(error.message);
  return { ...(data as AvaliacaoFrm), nota_final: Number((data as AvaliacaoFrm).nota_final) };
}

export async function atualizarAvaliacaoFrm(id: string, input: NovaAvaliacaoFrm): Promise<void> {
  const { error } = await tabFrm().update(input).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function excluirAvaliacaoFrm(id: string, por: string): Promise<void> {
  const { error } = await tabFrm().update({ excluido_em: new Date().toISOString(), excluido_por: por }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export async function carregarPainel(inicio: string, fim: string, fornecedorCodigo?: string | null): Promise<LinhaPainel[]> {
  const { data, error } = await rpc('sup_aval_painel', {
    p_inicio: inicio,
    p_fim: fim,
    p_fornecedor_codigo: fornecedorCodigo || null,
  });
  if (error) throw new Error(error.message);
  const n = (v: unknown) => Number(v) || 0;
  return ((data || []) as any[]).map(l => ({
    ...l,
    pedidos: n(l.pedidos),
    itens: n(l.itens),
    valor: n(l.valor),
    itens_entregues: n(l.itens_entregues),
    itens_no_prazo: n(l.itens_no_prazo),
    registros: n(l.registros),
    ocorrencias: n(l.ocorrencias),
    pedidos_com_ocorrencia: n(l.pedidos_com_ocorrencia),
    estrelas_media: l.estrelas_media == null ? null : Number(l.estrelas_media),
    frm_nota: l.frm_nota == null ? null : Number(l.frm_nota),
    por_categoria: l.por_categoria || {},
    por_tipo: l.por_tipo || {},
  })) as LinhaPainel[];
}
