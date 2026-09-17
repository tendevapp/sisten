/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * API e serviço de dados para o Relatório de Realizado por Rubrica (Financeiro).
 * Tabelas: `fin_rubricas` (catálogo hierárquico) e `fin_rubrica_mapeamentos`
 * (de-para fornecedor/grupo de mercadoria -> rubrica).
 * Views agregadas: `vw_fin_pedidos_por_rubrica`, `vw_fin_pagamentos_por_rubrica`.
 *
 * 1ª etapa: só realizado (pedidos colocados + pagamentos). Sem orçado, sem
 * separação DIRETO/INDIRETO — ver docs/agents ou o histórico do plano para o
 * porquê.
 */

import { supabase } from '../db/supabaseClient';
import type { FinRubrica, FinRubricaMapeamento, FinRealizadoRubricaLinha } from '../types';

export async function listarRubricas(): Promise<FinRubrica[]> {
  const { data, error } = await (supabase as any)
    .from('fin_rubricas')
    .select('*')
    .order('ordem');

  if (error) {
    console.warn('[rubricasFinanceiroApi] Erro ao consultar fin_rubricas:', error);
    throw error;
  }

  return (data || []) as FinRubrica[];
}

export async function listarMapeamentos(): Promise<FinRubricaMapeamento[]> {
  const { data, error } = await (supabase as any)
    .from('fin_rubrica_mapeamentos')
    .select('*')
    .order('tipo_chave')
    .order('chave_valor');

  if (error) {
    console.warn('[rubricasFinanceiroApi] Erro ao consultar fin_rubrica_mapeamentos:', error);
    throw error;
  }

  return (data || []) as FinRubricaMapeamento[];
}

export async function salvarMapeamento(dados: {
  rubrica_id: string;
  tipo_chave: 'fornecedor' | 'grupo_mercadoria';
  chave_valor: string;
  chave_descricao?: string | null;
  ativo?: boolean;
}): Promise<FinRubricaMapeamento> {
  const chaveValor = dados.chave_valor.trim();
  if (!chaveValor) throw new Error('A chave (fornecedor ou grupo de mercadoria) é obrigatória.');
  if (!dados.rubrica_id) throw new Error('A rubrica é obrigatória.');

  const payload = {
    rubrica_id: dados.rubrica_id,
    tipo_chave: dados.tipo_chave,
    chave_valor: chaveValor,
    chave_descricao: dados.chave_descricao?.trim() || null,
    ativo: dados.ativo !== false,
  };

  const { data, error } = await (supabase as any)
    .from('fin_rubrica_mapeamentos')
    .upsert(payload, { onConflict: 'tipo_chave,chave_valor' })
    .select()
    .single();

  if (error) {
    throw new Error(`Erro ao salvar mapeamento de rubrica: ${error.message}`);
  }

  return data as FinRubricaMapeamento;
}

export async function removerMapeamento(id: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('fin_rubrica_mapeamentos')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Erro ao remover mapeamento de rubrica: ${error.message}`);
  }
}

interface RealizadoBruto {
  rubrica_id: string | null;
  valorPedidos: number;
  qtdPedidos: number;
  valorPagamentos: number;
  qtdPagamentos: number;
}

export interface RelatorioRealizadoPorRubrica {
  linhas: FinRealizadoRubricaLinha[];
  semRubrica: RealizadoBruto;
  totalGeralPedidos: number;
  totalGeralPagamentos: number;
}

/**
 * Junta o catálogo de rubricas com o realizado agregado (pedidos + pagamentos)
 * e monta a árvore com rollup: o valor de uma rubrica-pai soma o próprio
 * realizado (normalmente zero, já que só rubricas-folha recebem mapeamento)
 * com o de todos os filhos, recursivamente.
 */
export async function obterRelatorioRealizadoPorRubrica(): Promise<RelatorioRealizadoPorRubrica> {
  const [rubricas, pedidosRes, pagamentosRes] = await Promise.all([
    listarRubricas(),
    (supabase as any).from('vw_fin_pedidos_por_rubrica').select('*'),
    (supabase as any).from('vw_fin_pagamentos_por_rubrica').select('*'),
  ]);

  if (pedidosRes.error) {
    console.warn('[rubricasFinanceiroApi] Erro ao consultar vw_fin_pedidos_por_rubrica:', pedidosRes.error);
    throw pedidosRes.error;
  }
  if (pagamentosRes.error) {
    console.warn('[rubricasFinanceiroApi] Erro ao consultar vw_fin_pagamentos_por_rubrica:', pagamentosRes.error);
    throw pagamentosRes.error;
  }

  const brutoPorRubrica = new Map<string, RealizadoBruto>();
  const semRubrica: RealizadoBruto = {
    rubrica_id: null,
    valorPedidos: 0,
    qtdPedidos: 0,
    valorPagamentos: 0,
    qtdPagamentos: 0,
  };

  const obterBruto = (rubricaId: string): RealizadoBruto => {
    let bruto = brutoPorRubrica.get(rubricaId);
    if (!bruto) {
      bruto = { rubrica_id: rubricaId, valorPedidos: 0, qtdPedidos: 0, valorPagamentos: 0, qtdPagamentos: 0 };
      brutoPorRubrica.set(rubricaId, bruto);
    }
    return bruto;
  };

  for (const linha of (pedidosRes.data || []) as any[]) {
    const alvo = linha.rubrica_id ? obterBruto(linha.rubrica_id) : semRubrica;
    alvo.valorPedidos += Number(linha.valor_pedidos || 0);
    alvo.qtdPedidos += Number(linha.qtd_pedidos || 0);
  }

  for (const linha of (pagamentosRes.data || []) as any[]) {
    const alvo = linha.rubrica_id ? obterBruto(linha.rubrica_id) : semRubrica;
    alvo.valorPagamentos += Number(linha.valor_pagamentos || 0);
    alvo.qtdPagamentos += Number(linha.qtd_lancamentos || 0);
  }

  const filhosPorPai = new Map<string, FinRubrica[]>();
  for (const r of rubricas) {
    if (!r.rubrica_pai_id) continue;
    if (!filhosPorPai.has(r.rubrica_pai_id)) filhosPorPai.set(r.rubrica_pai_id, []);
    filhosPorPai.get(r.rubrica_pai_id)!.push(r);
  }

  const montarLinha = (rubrica: FinRubrica, nivel: number): FinRealizadoRubricaLinha => {
    const filhosRubrica = (filhosPorPai.get(rubrica.id) || []).sort((a, b) => a.ordem - b.ordem);
    const filhos = filhosRubrica.map(f => montarLinha(f, nivel + 1));
    const proprio = brutoPorRubrica.get(rubrica.id);

    const valorPedidos = (proprio?.valorPedidos || 0) + filhos.reduce((s, f) => s + f.valorPedidos, 0);
    const qtdPedidos = (proprio?.qtdPedidos || 0) + filhos.reduce((s, f) => s + f.qtdPedidos, 0);
    const valorPagamentos = (proprio?.valorPagamentos || 0) + filhos.reduce((s, f) => s + f.valorPagamentos, 0);
    const qtdPagamentos = (proprio?.qtdPagamentos || 0) + filhos.reduce((s, f) => s + f.qtdPagamentos, 0);

    return { rubrica, nivel, valorPedidos, qtdPedidos, valorPagamentos, qtdPagamentos, filhos };
  };

  const raizes = rubricas
    .filter(r => !r.rubrica_pai_id)
    .sort((a, b) => a.ordem - b.ordem)
    .map(r => montarLinha(r, 0));

  // Sem rubrica: pedidos/pagamentos sem nenhum mapeamento cadastrado (fornecedor
  // ou grupo de mercadoria) — sinaliza o que falta mapear na tela de manutenção.
  if (semRubrica.valorPedidos !== 0 || semRubrica.valorPagamentos !== 0 || semRubrica.qtdPedidos > 0 || semRubrica.qtdPagamentos > 0) {
    raizes.push({
      rubrica: null,
      nivel: 0,
      valorPedidos: semRubrica.valorPedidos,
      qtdPedidos: semRubrica.qtdPedidos,
      valorPagamentos: semRubrica.valorPagamentos,
      qtdPagamentos: semRubrica.qtdPagamentos,
      filhos: [],
    });
  }

  const totalGeralPedidos = raizes.reduce((s, r) => s + r.valorPedidos, 0);
  const totalGeralPagamentos = raizes.reduce((s, r) => s + r.valorPagamentos, 0);

  return { linhas: raizes, semRubrica, totalGeralPedidos, totalGeralPagamentos };
}

/** Coleta o id da própria rubrica e de todos os descendentes — usado para trazer, num clique numa
 *  rubrica-pai (ex.: "Despesas Manutenção"), a composição de todos os filhos somados nela. */
export function coletarIdsComDescendentes(linha: FinRealizadoRubricaLinha): string[] {
  const ids: string[] = [];
  const visitar = (l: FinRealizadoRubricaLinha) => {
    if (l.rubrica) ids.push(l.rubrica.id);
    l.filhos.forEach(visitar);
  };
  visitar(linha);
  return ids;
}

export interface DetalhePedidoLinha {
  id: string;
  doc_compra: string | null;
  item: string | null;
  data_doc: string | null;
  fornecedor_codigo: string | null;
  fornecedor_nome: string | null;
  cnpj_fornecedor: string | null;
  grupo_mercadoria_codigo: string | null;
  grupo_mercadoria_nome: string | null;
  classificacao_nivel1: string | null;
  classificacao_nivel2: string | null;
  material_codigo: string | null;
  material_descricao: string | null;
  qtd_pedido: number | null;
  unidade_medida_pedido: string | null;
  preco_liquido_unit: number | null;
  contrato: string | null;
  item_contrato: string | null;
  tipo_doc_compra: string | null;
  requisitante: string | null;
  criado_por_pedido: string | null;
  centro: string | null;
  deposito: string | null;
  regiao_uf: string | null;
  moeda: string | null;
  data_rc: string | null;
  requisicao_compra: string | null;
  valor: number;
  rubrica_nome: string | null;
  origem_mapeamento: 'fornecedor' | 'grupo_mercadoria' | null;
}

export interface DetalhePagamentoLinha {
  id: number;
  numero_documento: string | null;
  documento_compras: string | null;
  empresa: string | null;
  data_pagamento: string | null;
  data_lancamento: string | null;
  data_documento: string | null;
  vencimento_original: string | null;
  vencimento_liquido: string | null;
  doc_compensacao: string | null;
  data_compensacao: string | null;
  fornecedor_codigo: string | null;
  fornecedor_nome: string | null;
  grupo_mercadoria_codigo: string | null;
  grupo_mercadoria_nome: string | null;
  classificacao_nivel1: string | null;
  classificacao_nivel2: string | null;
  tipo_documento: string | null;
  centro: string | null;
  centro_lucro: string | null;
  elemento_pep: string | null;
  conta: string | null;
  condicoes_pagamento: string | null;
  moeda_documento: string | null;
  nf_referencia: string | null;
  texto: string | null;
  valor: number;
  rubrica_nome: string | null;
  origem_mapeamento: 'fornecedor' | 'grupo_mercadoria' | null;
}

/** `rubricaIds: null` busca a composição do balde "Sem rubrica" (pedidos/pagamentos sem mapeamento). */
export async function obterDetalhePedidosPorRubrica(rubricaIds: string[] | null): Promise<DetalhePedidoLinha[]> {
  let query = (supabase as any).from('vw_fin_pedidos_detalhe_rubrica').select('*').order('valor', { ascending: false });
  query = rubricaIds === null ? query.is('rubrica_id', null) : query.in('rubrica_id', rubricaIds);

  const { data, error } = await query;
  if (error) {
    console.warn('[rubricasFinanceiroApi] Erro ao consultar vw_fin_pedidos_detalhe_rubrica:', error);
    throw error;
  }
  return (data || []) as DetalhePedidoLinha[];
}

export interface ItemConsolidado {
  chave: string;
  material: string;
  grupoMercadoria: string;
  qtdPedidos: number;
  valor: number;
}

/** Soma o valor por item (material) — mesma descrição do SAP em pedidos diferentes vira uma
 *  linha só, para responder "quais itens compõem esse valor" sem repetir uma linha por pedido.
 *  Usado nos modais de composição/drill-down (por rubrica e por período do gráfico). */
export function consolidarPorMaterial(linhas: DetalhePedidoLinha[]): ItemConsolidado[] {
  const mapa = new Map<string, ItemConsolidado>();
  for (const l of linhas) {
    const material = l.material_descricao || 'Sem descrição';
    const grupoMercadoria = l.grupo_mercadoria_nome || l.grupo_mercadoria_codigo || 'Sem grupo';
    const chave = `${material}__${grupoMercadoria}`;
    if (!mapa.has(chave)) mapa.set(chave, { chave, material, grupoMercadoria, qtdPedidos: 0, valor: 0 });
    const item = mapa.get(chave)!;
    item.qtdPedidos += 1;
    item.valor += l.valor || 0;
  }
  return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor);
}

/** Todos os pedidos do recorte (2026), sem filtro de rubrica — usado pelo gráfico de série temporal. */
export async function obterTodosPedidosDetalhe(): Promise<DetalhePedidoLinha[]> {
  const { data, error } = await (supabase as any)
    .from('vw_fin_pedidos_detalhe_rubrica')
    .select('*');

  if (error) {
    console.warn('[rubricasFinanceiroApi] Erro ao consultar vw_fin_pedidos_detalhe_rubrica (todos):', error);
    throw error;
  }
  return (data || []) as DetalhePedidoLinha[];
}

/** `rubricaIds: null` busca a composição do balde "Sem rubrica" (pedidos/pagamentos sem mapeamento). */
export async function obterDetalhePagamentosPorRubrica(rubricaIds: string[] | null): Promise<DetalhePagamentoLinha[]> {
  let query = (supabase as any).from('vw_fin_pagamentos_detalhe_rubrica').select('*').order('valor', { ascending: false });
  query = rubricaIds === null ? query.is('rubrica_id', null) : query.in('rubrica_id', rubricaIds);

  const { data, error } = await query;
  if (error) {
    console.warn('[rubricasFinanceiroApi] Erro ao consultar vw_fin_pagamentos_detalhe_rubrica:', error);
    throw error;
  }
  return (data || []) as DetalhePagamentoLinha[];
}
