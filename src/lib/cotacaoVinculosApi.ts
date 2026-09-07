/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Vínculo entre item cotado e material SAP — leitura, curadoria e as duas
 * formas de alimentar a base:
 *
 *  1. `casarCotacaoPedidos`  — casamento determinístico contra os pedidos
 *     colocados (`sap_zl0132_po`). É o processo repetível: rodar de novo a
 *     cada carga nova só mexe no que ainda não tem decisão humana.
 *  2. `analisarVinculosComIa` — Edge Function `vincular-cotacao-ia`, para os
 *     itens que nenhum pedido explica.
 *
 * Confirmar um vínculo alimenta `sup_cotacao_descricao_map`, a memória que faz
 * a próxima cotação do mesmo fornecedor já chegar com a sugestão pronta.
 */

import { supabase } from '../db/supabaseClient';

export type VinculoStatus = 'auto' | 'sugerido' | 'confirmado' | 'rejeitado' | 'sem_candidato';
export type VinculoOrigem = 'pedido' | 'requisicao' | 'aprendido' | 'ia' | 'manual';

export interface VinculoCandidato {
  material_code: string;
  descricao: string | null;
  score: number | null;
  preco_unit?: number | null;
  doc_compra?: string | null;
  data_doc?: string | null;
  texto_tecnico?: string | null;
  unidade?: string | null;
  grupo?: string | null;
}

export interface VinculoItem {
  id: string;
  proposta_item_id: string;
  material_code: string | null;
  material_descricao: string | null;
  status: VinculoStatus;
  origem: VinculoOrigem;
  score: number | null;
  sinais: Record<string, unknown>;
  candidatos: VinculoCandidato[];
  po_doc_compra: string | null;
  po_item: string | null;
  po_data_doc: string | null;
  po_txt_breve: string | null;
  po_preco_unit: number | null;
  po_qtd: number | null;
  /** Evidência do lado da requisição (ME5A), quando o vínculo veio de RM. */
  rm_ri: string | null;
  rm_requisicao: string | null;
  rm_item: string | null;
  rm_texto_breve: string | null;
  rm_qtd: number | null;
  rm_data: string | null;
  rm_requisitante: string | null;
  confirmado_por_nome: string | null;
  confirmado_em: string | null;
  updated_at: string;
  /** Dados do item cotado, trazidos no mesmo select para a tela não fazer N+1. */
  item: {
    descricao_produto: string;
    codigo_produto: string | null;
    marca_fabricante: string | null;
    unidade_medida: string | null;
    quantidade: number | null;
    preco_unitario: number | null;
    proposta: {
      numero_proposta: string | null;
      data_emissao: string | null;
      fornecedor_razao_social: string | null;
      fornecedor_cnpj: string | null;
    } | null;
  } | null;
}

export interface ResumoVinculos {
  auto: number;
  sugerido: number;
  confirmado: number;
  rejeitado: number;
  sem_candidato: number;
  total: number;
}

export interface RodadaVinculo {
  id: string;
  tipo: 'deterministico' | 'requisicao' | 'ia';
  parametros: Record<string, unknown>;
  itens_analisados: number;
  vinculos_auto: number;
  sugestoes: number;
  sem_candidato: number;
  executado_por_nome: string | null;
  created_at: string;
}

export interface LinhaAuditoria {
  po_id: string;
  doc_compra: string | null;
  item: string | null;
  data_doc: string | null;
  material: string | null;
  txt_breve: string | null;
  ri: string | null;
  fornecedor_pedido: string | null;
  preco_pedido: number | null;
  qtd_pedido: number | null;
  fornecedores_cotados: number | null;
  menor_preco_cotado: number | null;
  fornecedor_menor_preco: string | null;
  descricao_cotada: string | null;
  preco_cotado_fornecedor: number | null;
  qtd_cotada: number | null;
  data_proposta: string | null;
  delta_preco_unit: number | null;
  custo_versus_menor: number | null;
  div_preco: boolean;
  div_fornecedor: boolean;
  div_quantidade: boolean;
  /** Código que cobre vários produtos (notebook, pen drive): preço não comparável linha a linha. */
  material_generico: boolean;
  motivo_generico: string | null;
}

const SELECT_VINCULO = `
  id, proposta_item_id, material_code, material_descricao, status, origem, score, sinais,
  candidatos, po_doc_compra, po_item, po_data_doc, po_txt_breve, po_preco_unit, po_qtd,
  rm_ri, rm_requisicao, rm_item, rm_texto_breve, rm_qtd, rm_data, rm_requisitante,
  confirmado_por_nome, confirmado_em, updated_at,
  item:sup_cotacao_proposta_itens!inner (
    descricao_produto, codigo_produto, marca_fabricante, unidade_medida, quantidade, preco_unitario,
    proposta:sup_cotacao_propostas!inner (
      numero_proposta, data_emissao, fornecedor_razao_social, fornecedor_cnpj
    )
  )
`;

export async function listarVinculos(params: {
  status?: VinculoStatus[];
  busca?: string;
  limite?: number;
}): Promise<VinculoItem[]> {
  let q = supabase
    .from('sup_cotacao_item_vinculos')
    .select(SELECT_VINCULO)
    // Score desc deixa no topo o que tem mais chance de ser confirmado sem
    // pensar muito — a curadoria rende mais começando pelo fácil.
    .order('score', { ascending: false, nullsFirst: false })
    .limit(params.limite ?? 300);

  if (params.status?.length) q = q.in('status', params.status);

  const { data, error } = await q;
  if (error) throw new Error(`Falha ao carregar vínculos: ${error.message}`);

  const lista = (data ?? []) as unknown as VinculoItem[];
  const busca = params.busca?.trim().toLowerCase();
  if (!busca) return lista;

  return lista.filter(v =>
    [
      v.item?.descricao_produto,
      v.item?.proposta?.fornecedor_razao_social,
      v.material_code,
      v.material_descricao,
      v.po_doc_compra,
    ].some(campo => campo?.toLowerCase().includes(busca)),
  );
}

export async function resumoVinculos(): Promise<ResumoVinculos> {
  const { data, error } = await supabase.from('sup_cotacao_item_vinculos').select('status');
  if (error) throw new Error(`Falha ao resumir vínculos: ${error.message}`);

  const base: ResumoVinculos = { auto: 0, sugerido: 0, confirmado: 0, rejeitado: 0, sem_candidato: 0, total: 0 };
  for (const linha of data ?? []) {
    const st = (linha as { status: VinculoStatus }).status;
    base[st] = (base[st] ?? 0) + 1;
    base.total += 1;
  }
  return base;
}

export async function listarRodadas(limite = 10): Promise<RodadaVinculo[]> {
  const { data, error } = await supabase
    .from('sup_cotacao_vinculo_rodadas')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Falha ao carregar as rodadas: ${error.message}`);
  return (data ?? []) as RodadaVinculo[];
}

/** Casamento determinístico. `simular` devolve os números sem gravar nada. */
export async function casarCotacaoPedidos(params: {
  desde?: string;
  janelaDias?: number;
  scoreAuto?: number;
  usuarioId?: string | null;
  usuarioNome?: string | null;
  simular?: boolean;
}): Promise<{ rodada_id?: string; itens_analisados: number; vinculos_auto: number; sugestoes: number; sem_candidato: number }> {
  const { data, error } = await supabase.rpc('casar_cotacao_pedidos', {
    p_desde: params.desde ?? '2026-01-01',
    p_janela_dias: params.janelaDias ?? 180,
    p_score_auto: params.scoreAuto ?? 0.8,
    p_executado_por: params.usuarioId ?? null,
    p_executado_por_nome: params.usuarioNome ?? null,
    p_simular: params.simular ?? false,
  });
  if (error) throw new Error(`Falha ao casar cotações com pedidos: ${error.message}`);
  return data as any;
}

/**
 * Casamento com as requisições (ME5A). Roda depois do casamento com pedidos:
 * a RM diz qual material o requisitante pediu, mas não tem preço nem
 * fornecedor, então só substitui uma sugestão de pedido quando pontua mais.
 */
export async function casarCotacaoRequisicoes(params: {
  desde?: string;
  janelaAntes?: number;
  janelaDepois?: number;
  scoreAuto?: number;
  usuarioId?: string | null;
  usuarioNome?: string | null;
  simular?: boolean;
}): Promise<{ rodada_id?: string; itens_analisados: number; vinculos_auto: number; sugestoes: number }> {
  const { data, error } = await supabase.rpc('casar_cotacao_requisicoes', {
    p_desde: params.desde ?? '2026-01-01',
    p_janela_antes: params.janelaAntes ?? 240,
    p_janela_depois: params.janelaDepois ?? 60,
    p_score_auto: params.scoreAuto ?? 0.78,
    p_executado_por: params.usuarioId ?? null,
    p_executado_por_nome: params.usuarioNome ?? null,
    p_simular: params.simular ?? false,
  });
  if (error) throw new Error(`Falha ao casar cotações com requisições: ${error.message}`);
  return data as any;
}

export async function confirmarVinculo(params: {
  vinculoId: string;
  aceitar: boolean;
  materialCode?: string | null;
  usuarioId?: string | null;
  usuarioNome?: string | null;
  observacao?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('confirmar_vinculo_cotacao', {
    p_vinculo_id: params.vinculoId,
    p_aceitar: params.aceitar,
    p_material_code: params.materialCode ?? null,
    p_usuario_id: params.usuarioId ?? null,
    p_usuario_nome: params.usuarioNome ?? null,
    p_observacao: params.observacao ?? null,
  });
  if (error) throw new Error(`Falha ao registrar a decisão: ${error.message}`);
}

/** Análise por IA dos itens que nenhum pedido explicou. */
export async function analisarVinculosComIa(params: {
  limite?: number;
  vinculoIds?: string[];
}): Promise<{ analisados: number; sugestoes: number; sem_candidato: number; modelo: string; custo_usd: number | null }> {
  const { data, error } = await supabase.functions.invoke('vincular-cotacao-ia', {
    body: { limite: params.limite ?? 25, vinculo_ids: params.vinculoIds ?? null },
  });

  if (error) {
    const contexto = (error as any)?.context;
    const corpo = typeof contexto?.json === 'function' ? await contexto.json().catch(() => null) : null;
    throw new Error(corpo?.erro?.mensagem ?? error.message ?? 'Falha ao chamar a análise por IA.');
  }
  if ((data as any)?.erro) throw new Error((data as any).erro.mensagem);
  return data as any;
}

export async function listarAuditoria(params: {
  apenasDivergentes?: boolean;
  /** Códigos genéricos ficam de fora por padrão: dentro deles, "preço acima do cotado" costuma ser produto diferente, não compra ruim. */
  incluirGenericos?: boolean;
  limite?: number;
}): Promise<LinhaAuditoria[]> {
  let q = supabase
    .from('vw_cotacao_pedido_auditoria')
    .select('*')
    .order('data_doc', { ascending: false })
    .limit(params.limite ?? 500);

  const { data, error } = await q;
  if (error) throw new Error(`Falha ao carregar a auditoria: ${error.message}`);

  let linhas = (data ?? []) as LinhaAuditoria[];
  if (!params.incluirGenericos) linhas = linhas.filter(l => !l.material_generico);
  if (!params.apenasDivergentes) return linhas;
  return linhas.filter(l => l.div_preco || l.div_fornecedor || l.div_quantidade);
}

/** Busca no catálogo SAP para a curadoria trocar o material sugerido. */
export async function buscarMateriais(termo: string, limite = 20) {
  const busca = termo.trim();
  if (busca.length < 3) return [];
  const { data, error } = await supabase
    .from('materials')
    .select('material_code, description, unit, grupo_mercadoria_desc')
    .or(`material_code.ilike.%${busca}%,busca_desc.ilike.%${busca.toUpperCase()}%`)
    .limit(limite);
  if (error) throw new Error(`Falha ao buscar materiais: ${error.message}`);
  return data ?? [];
}
