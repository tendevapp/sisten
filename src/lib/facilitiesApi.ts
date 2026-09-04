/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Facilities — API Supabase dos cadastros próprios do módulo.
 *
 * Hoje cobre a Lista de Serviços (`fac_servicos`), que abastece a categoria
 * do chamado com destino Facilities em Nova Solicitação. Os demais cadastros
 * do módulo (rotas, materiais da vigilância) vivem em `rhApi`/`portariaApi`
 * porque a tabela de origem pertence àqueles formulários.
 */

import { supabase } from '../db/supabaseClient';
import type { FacServico } from '../types';
import { apenasVigentes, marcarExcluido, marcarRestaurado } from './softDelete';

/** `fac_servicos` ainda não está em `database.types.ts` — mesmo atalho usado
 *  pelas demais tabelas novas (ver `ssmaApi.ts`). */
const dbServicos = () => (supabase.from as any)('fac_servicos');

/** Lista fixa usada antes do cadastro existir — vale como plano B quando a
 *  consulta falha (offline, tabela ainda não migrada) para o formulário nunca
 *  ficar sem categorias. */
export const SERVICOS_FACILITIES_PADRAO = [
  'Elétrica', 'Hidráulica', 'Climatização', 'Mobiliário', 'Limpeza', 'Chaves/Acesso', 'Outro',
];

export async function listarServicosFacilities(
  somenteAtivos = false,
  incluirExcluidos = false,
): Promise<FacServico[]> {
  let query = dbServicos()
    .select('*')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true });

  if (somenteAtivos) query = query.eq('ativo', true);
  query = apenasVigentes(query, incluirExcluidos);

  const { data, error } = await query;
  if (error) {
    console.error('Erro ao listar serviços de facilities:', error);
    throw new Error(error.message);
  }
  return (data || []) as FacServico[];
}

/**
 * Nomes dos serviços ativos, na ordem de exibição. Nunca lança: se a consulta
 * falhar, devolve a lista padrão — o formulário de chamado depende disso para
 * continuar utilizável.
 */
export async function listarNomesServicosFacilities(): Promise<string[]> {
  try {
    const lista = await listarServicosFacilities(true);
    return lista.length > 0 ? lista.map(s => s.nome) : [...SERVICOS_FACILITIES_PADRAO];
  } catch {
    return [...SERVICOS_FACILITIES_PADRAO];
  }
}

export async function criarServicoFacilities(
  dados: Pick<FacServico, 'nome'> & Partial<Pick<FacServico, 'descricao' | 'ordem' | 'ativo'>>,
): Promise<FacServico> {
  const { data, error } = await dbServicos()
    .insert({
      nome: dados.nome.trim(),
      descricao: dados.descricao ? dados.descricao.trim() : null,
      ordem: Number(dados.ordem) || 0,
      ativo: dados.ativo ?? true,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Erro ao criar serviço de facilities:', error);
    throw new Error(error.message);
  }
  return data as FacServico;
}

export async function atualizarServicoFacilities(
  id: string,
  dados: Partial<FacServico>,
): Promise<FacServico> {
  const { data, error } = await dbServicos()
    .update({
      ...(dados.nome ? { nome: dados.nome.trim() } : {}),
      ...(dados.descricao !== undefined ? { descricao: dados.descricao ? dados.descricao.trim() : null } : {}),
      ...(dados.ordem !== undefined ? { ordem: Number(dados.ordem) } : {}),
      ...(dados.ativo !== undefined ? { ativo: dados.ativo } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('Erro ao atualizar serviço de facilities:', error);
    throw new Error(error.message);
  }
  return data as FacServico;
}

export async function alternarStatusServicoFacilities(id: string, ativo: boolean): Promise<void> {
  const { error } = await dbServicos()
    .update({ ativo, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Erro ao alternar status do serviço de facilities:', error);
    throw new Error(error.message);
  }
}

export async function excluirServicoFacilities(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await dbServicos()
    .update(marcarExcluido(excluidoPor))
    .eq('id', id);

  if (error) {
    console.error('Erro ao excluir serviço de facilities:', error);
    throw new Error(error.message);
  }
}

export async function restaurarServicoFacilities(id: string): Promise<void> {
  const { error } = await dbServicos()
    .update(marcarRestaurado())
    .eq('id', id);

  if (error) {
    console.error('Erro ao restaurar serviço de facilities:', error);
    throw new Error(error.message);
  }
}

/**
 * Calcula a nova ordenacao dos servicos ao mover um item para cima (-1) ou para baixo (+1).
 * Garante que a lista fique sem duplicidades de ordem e preserva o 99 para o item 'Outro'
 * apenas quando este for o ultimo elemento da lista.
 */
export function calcularNovaOrdenacao(
  servicos: FacServico[],
  itemParaMover: FacServico,
  direcao: -1 | 1,
): {
  novosServicos: FacServico[];
  itensAlterados: { id: string; ordem: number }[];
} {
  const ordenados = [...servicos].sort(
    (a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome),
  );
  const idx = ordenados.findIndex(s => s.id === itemParaMover.id);
  if (idx === -1) {
    return { novosServicos: ordenados, itensAlterados: [] };
  }

  const targetIdx = idx + direcao;
  if (targetIdx < 0 || targetIdx >= ordenados.length) {
    return { novosServicos: ordenados, itensAlterados: [] };
  }

  const reordenados = [...ordenados];
  const [removido] = reordenados.splice(idx, 1);
  reordenados.splice(targetIdx, 0, removido);

  const novosServicos: FacServico[] = reordenados.map((item, index) => {
    const isUltimoOutro =
      index === reordenados.length - 1 && item.nome.trim().toLowerCase() === 'outro';
    const novaOrdem = isUltimoOutro ? 99 : index + 1;
    return {
      ...item,
      ordem: novaOrdem,
    };
  });

  const itensAlterados = novosServicos
    .filter(item => {
      const original = servicos.find(s => s.id === item.id);
      return !original || original.ordem !== item.ordem;
    })
    .map(item => ({ id: item.id, ordem: item.ordem }));

  return { novosServicos, itensAlterados };
}

/**
 * Salva em lote no Supabase as novas ordens dos servicos modificados.
 */
export async function salvarOrdenacaoServicosFacilities(
  itens: { id: string; ordem: number }[],
): Promise<void> {
  if (itens.length === 0) return;

  const updates = itens.map(item =>
    dbServicos()
      .update({
        ordem: Number(item.ordem),
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
  );

  const resultados = await Promise.all(updates);
  for (const res of resultados) {
    if (res.error) {
      console.error('Erro ao salvar ordenacao de servicos:', res.error);
      throw new Error(res.error.message);
    }
  }
}

