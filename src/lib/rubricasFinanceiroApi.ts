/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * API e serviço de dados para o Relatório de Realizado por Rubrica (Financeiro).
 * Tabelas: `fin_rubricas` (catálogo hierárquico) e `fin_rubrica_mapeamentos`
 * (de-para fornecedor / código de serviço / grupo de mercadoria -> rubrica).
 *
 * O realizado é medido pela nota fiscal: `vw_fin_nf_realizado_rubrica`, uma
 * linha por item de NF de fornecedor (ZL0136), já com natureza fiscal (CFOP),
 * rubrica e origem da classificação. A agregação fica em `realizadoRubricaNf.ts`.
 */

import { supabase } from '../db/supabaseClient';
import type { FinRubrica, FinRubricaMapeamento, FinRubricaTipoChave } from '../types';
import type { LinhaNfRealizado } from './realizadoRubricaNf';

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
  tipo_chave: FinRubricaTipoChave;
  chave_valor: string;
  chave_descricao?: string | null;
  ativo?: boolean;
}): Promise<FinRubricaMapeamento> {
  const chaveValor = dados.chave_valor.trim();
  if (!chaveValor) throw new Error('A chave (fornecedor, código de serviço ou grupo de mercadoria) é obrigatória.');
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

const PAGINA = 1000;

/**
 * Todas as linhas de NF do recorte (2026). O PostgREST devolve no máximo 1000
 * linhas por requisição, então conta primeiro e busca as páginas em paralelo —
 * cada página roda a view inteira (~1 s), e em série seriam ~5 s.
 */
export async function carregarLinhasRealizadoNf(): Promise<LinhaNfRealizado[]> {
  const { count, error: erroContagem } = await (supabase as any)
    .from('vw_fin_nf_realizado_rubrica')
    .select('id', { count: 'exact', head: true });
  if (erroContagem) {
    console.warn('[rubricasFinanceiroApi] Erro ao contar vw_fin_nf_realizado_rubrica:', erroContagem);
    throw erroContagem;
  }

  const paginas = Math.max(1, Math.ceil((count || 0) / PAGINA));
  const respostas = await Promise.all(
    Array.from({ length: paginas }, (_, i) =>
      (supabase as any)
        .from('vw_fin_nf_realizado_rubrica')
        .select('*')
        .order('id')
        .range(i * PAGINA, (i + 1) * PAGINA - 1),
    ),
  );

  const linhas: LinhaNfRealizado[] = [];
  for (const r of respostas as any[]) {
    if (r.error) {
      console.warn('[rubricasFinanceiroApi] Erro ao consultar vw_fin_nf_realizado_rubrica:', r.error);
      throw r.error;
    }
    for (const l of r.data || []) {
      linhas.push({
        ...l,
        valor: Number(l.valor) || 0,
        valor_pago_rateado: l.valor_pago_rateado == null ? null : Number(l.valor_pago_rateado),
        quantidade: l.quantidade == null ? null : Number(l.quantidade),
      });
    }
  }
  return linhas;
}
