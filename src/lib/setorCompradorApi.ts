/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * API e serviço de dados para Gestão de Compradores Responsáveis por Setor Solicitante.
 * Tabela mestre: `sup_setor_compradores`.
 */

import { supabase } from '../db/supabaseClient';
import type { SetorComprador } from '../types';
import { COMPRADORES_PADRAO } from './grupoCompradorApi';

/**
 * Matriz inicial padrão de classificação de compradores por setor dono da solicitação.
 * 19 setores oficiais do SISTEN mapeados aos seus respectivos compradores responsáveis.
 */
export const SETOR_COMPRADOR_PADRAO: SetorComprador[] = [
  { id: '1', setor_id: '1', setor_nome: 'RH', grupo_compras: '575', nome_comprador: 'André', ativo: true },
  { id: '2', setor_id: '2', setor_nome: 'Almoxarifado', grupo_compras: '610', nome_comprador: 'Giulia', ativo: true },
  { id: '3', setor_id: '3', setor_nome: 'Facilities', grupo_compras: '575', nome_comprador: 'André', ativo: true },
  { id: '4', setor_id: '4', setor_nome: 'Comunicação', grupo_compras: '575', nome_comprador: 'André', ativo: true },
  { id: '5', setor_id: '5', setor_nome: 'Suprimentos', grupo_compras: '575', nome_comprador: 'André', ativo: true },
  { id: '6', setor_id: '6', setor_nome: 'Financeiro', grupo_compras: '575', nome_comprador: 'André', ativo: true },
  { id: '7', setor_id: '7', setor_nome: 'Contabilidade', grupo_compras: '575', nome_comprador: 'André', ativo: true },
  { id: '8', setor_id: '8', setor_nome: 'Planejamento', grupo_compras: '314', nome_comprador: 'Itana', ativo: true },
  { id: '9', setor_id: '9', setor_nome: 'TI', grupo_compras: '575', nome_comprador: 'André', ativo: true },
  { id: '10', setor_id: '10', setor_nome: 'Engenharia', grupo_compras: '314', nome_comprador: 'Itana', ativo: true },
  { id: '11', setor_id: '11', setor_nome: 'Qualidade', grupo_compras: '314', nome_comprador: 'Itana', ativo: true },
  { id: '12', setor_id: '12', setor_nome: 'Saúde', grupo_compras: '575', nome_comprador: 'André', ativo: true },
  { id: '13', setor_id: '13', setor_nome: 'Segurança', grupo_compras: '358', nome_comprador: 'Isadora', ativo: true },
  { id: '14', setor_id: '14', setor_nome: 'Produção', grupo_compras: '314', nome_comprador: 'Itana', ativo: true },
  { id: '15', setor_id: '15', setor_nome: 'Manutenção', grupo_compras: '314', nome_comprador: 'Itana', ativo: true },
  { id: '16', setor_id: '16', setor_nome: 'Diretoria', grupo_compras: '575', nome_comprador: 'André', ativo: true },
  { id: '17', setor_id: '17', setor_nome: 'Jurídico', grupo_compras: '575', nome_comprador: 'André', ativo: true },
  { id: '18', setor_id: '18', setor_nome: 'Controladoria', grupo_compras: '575', nome_comprador: 'André', ativo: true },
  { id: '19', setor_id: '19', setor_nome: 'Portaria', grupo_compras: '575', nome_comprador: 'André', ativo: true },
];

/**
 * Retorna os vínculos entre setores e compradores cadastrados no banco Supabase.
 * Caso o banco retorne vazio ou falhe, devolve o padrão oficial.
 */
export async function listarSetoresCompradores(somenteAtivos = false): Promise<SetorComprador[]> {
  try {
    let query = (supabase as any)
      .from('sup_setor_compradores')
      .select('*')
      .order('setor_nome');

    if (somenteAtivos) {
      query = query.eq('ativo', true);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      return somenteAtivos
        ? SETOR_COMPRADOR_PADRAO.filter(s => s.ativo)
        : SETOR_COMPRADOR_PADRAO;
    }

    const lista: SetorComprador[] = (data as any[]).map(s => ({
      id: String(s.id || s.setor_id),
      setor_id: String(s.setor_id || '').trim(),
      setor_nome: String(s.setor_nome || '').trim(),
      grupo_compras: String(s.grupo_compras || '').trim(),
      nome_comprador: String(s.nome_comprador || '').trim(),
      ativo: s.ativo !== false,
      created_at: s.created_at,
      updated_at: s.updated_at,
    }));

    // Se algum setor da lista padrão não existir no retorno do banco, mescla
    const setoresRegistrados = new Set(lista.map(s => s.setor_id));
    const faltantes = SETOR_COMPRADOR_PADRAO.filter(p => !setoresRegistrados.has(p.setor_id));
    const consolidado = [...lista, ...faltantes];

    return somenteAtivos ? consolidado.filter(s => s.ativo) : consolidado;
  } catch (err) {
    console.warn('[setorCompradorApi] Falha ao consultar sup_setor_compradores, usando padrão:', err);
    return somenteAtivos
      ? SETOR_COMPRADOR_PADRAO.filter(s => s.ativo)
      : SETOR_COMPRADOR_PADRAO;
  }
}

/**
 * Salva ou atualiza a atribuição de comprador para um setor.
 */
export async function salvarSetorComprador(dados: {
  id?: string;
  setor_id: string;
  setor_nome: string;
  grupo_compras: string;
  nome_comprador?: string;
  ativo?: boolean;
}): Promise<SetorComprador> {
  const setorIdLimpo = dados.setor_id.trim();
  const setorNomeLimpo = dados.setor_nome.trim();
  const grupoComprasLimpo = dados.grupo_compras.trim();

  if (!setorIdLimpo) throw new Error('O ID do setor é obrigatório.');
  if (!setorNomeLimpo) throw new Error('O nome do setor é obrigatório.');
  if (!grupoComprasLimpo) throw new Error('O código do comprador é obrigatório.');

  let nomeComp = dados.nome_comprador?.trim();
  if (!nomeComp) {
    const comp = COMPRADORES_PADRAO.find(c => c.grupo_compras === grupoComprasLimpo);
    nomeComp = comp?.nome_comprador || `Comprador ${grupoComprasLimpo}`;
  }

  const payload = {
    id: dados.id || setorIdLimpo,
    setor_id: setorIdLimpo,
    setor_nome: setorNomeLimpo,
    grupo_compras: grupoComprasLimpo,
    nome_comprador: nomeComp,
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await (supabase as any)
    .from('sup_setor_compradores')
    .upsert(payload, { onConflict: 'setor_id' })
    .select()
    .single();

  if (error) {
    throw new Error(`Erro ao salvar setor comprador: ${error.message}`);
  }

  return {
    id: String(data.id || data.setor_id),
    setor_id: String(data.setor_id),
    setor_nome: String(data.setor_nome),
    grupo_compras: String(data.grupo_compras),
    nome_comprador: String(data.nome_comprador),
    ativo: data.ativo !== false,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/**
 * Reatribui rapidamente o comprador de um setor pelo ID do setor.
 */
export async function reatribuirSetorComprador(
  setorId: string,
  novoGrupoCompras: string,
  novoNomeComprador?: string
): Promise<void> {
  const setorIdLimpo = setorId.trim();
  const grupoComprasLimpo = novoGrupoCompras.trim();
  if (!setorIdLimpo) throw new Error('ID do setor não informado.');
  if (!grupoComprasLimpo) throw new Error('Código do comprador não informado.');

  let nomeComp = novoNomeComprador?.trim();
  if (!nomeComp) {
    const comp = COMPRADORES_PADRAO.find(c => c.grupo_compras === grupoComprasLimpo);
    nomeComp = comp?.nome_comprador || `Comprador ${grupoComprasLimpo}`;
  }

  const { error } = await (supabase as any)
    .from('sup_setor_compradores')
    .update({
      grupo_compras: grupoComprasLimpo,
      nome_comprador: nomeComp,
      updated_at: new Date().toISOString(),
    })
    .eq('setor_id', setorIdLimpo);

  if (error) {
    throw new Error(`Erro ao reatribuir comprador do setor: ${error.message}`);
  }
}

/**
 * Mapa em memória para consulta O(1) do comprador responsável por setor:
 * Indexa tanto por `setor_id` quanto por `setor_nome` (minúsculo e sem espaços).
 * Usado na geração da planilha de abertura de RM (Almoxarifado).
 */
export async function mapaGrupoComprasPorSetor(): Promise<Map<string, string>> {
  const lista = await listarSetoresCompradores(true);
  const mapa = new Map<string, string>();

  for (const item of lista) {
    const grupo = (item.grupo_compras || '').trim();
    if (!grupo) continue;

    if (item.setor_id) {
      mapa.set(item.setor_id.trim(), grupo);
    }
    if (item.setor_nome) {
      mapa.set(item.setor_nome.trim().toLowerCase(), grupo);
    }
  }

  return mapa;
}
