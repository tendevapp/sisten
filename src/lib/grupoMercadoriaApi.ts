/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * API e serviço de dados para Gestão e Agrupamento em Níveis do Grupo de Mercadorias (SAP).
 * Tabela mestre: `public.cadastro_grupo_mercadoria`.
 * Colunas principais: `codigo`, `denominacao`, `denominacao2`, `classificacao_nivel1`, `classificacao_nivel2`, `codigo_pai`.
 */

import { supabase } from '../db/supabaseClient';
import type { CadastroGrupoMercadoria } from '../types';

export const TAXONOMIA_NIVEIS_PADRAO: Record<string, string[]> = {
  CONSUMÍVEL: [
    'Copa e Limpeza',
    'EPI - Segurança',
    'Embalagens',
    'Ferramentas',
    'Hospitalar',
    'Medicamentos',
    'MRO - Manutenção',
    'Materiais de Construção',
    'Materiais de Escritório',
    'Químicos e Gases',
  ],
  ESTRUTURAL: [
    'Elétrica e Instrumentação',
    'Equipamentos de Processo',
    'Estruturas Metálicas',
    'Materiais de Construção',
    'Tubulação e Conexões',
  ],
  FRETE: [
    'Frete e Logística',
  ],
  IMOBILIZADO: [
    'Máquinas e Equipamentos',
    'Móveis e Instalações',
    'TI e Informática',
    'Veículos e Transporte',
  ],
  SERVIÇO: [
    'Conservação Predial e Facilities',
    'Consultoria e Outros',
    'Ensaios e Controle Tecnológico',
    'Limpeza e Conservação',
    'Locação de Equipamentos',
    'Manutenção e Assistência Técnica',
    'Manutenção de Frotas e Veículos',
    'Segurança Patrimonial',
    'Serviços Ambientais',
    'Subempreiteiros - Acabamentos e Edificações',
    'Subempreiteiros - Apoio e Mão de Obra',
    'Subempreiteiros - Montagem e Instalações',
    'Subempreiteiros - Obras Civis',
    'Utilidades e Telecomunicações',
  ],
};

/**
 * Consulta todas as subcategorias existentes no banco de dados e mescla com a taxonomia padrão.
 * Garante que qualquer subcategoria customizada digitada passe a constar nas listas suspensas.
 */
export async function obterSubcategoriasAgrupadas(): Promise<Record<string, string[]>> {
  const mapa: Record<string, Set<string>> = {};

  // Inicializar com padrões
  for (const n1 of Object.keys(TAXONOMIA_NIVEIS_PADRAO)) {
    mapa[n1] = new Set(TAXONOMIA_NIVEIS_PADRAO[n1]);
  }

  try {
    const { data, error } = await (supabase as any)
      .from('cadastro_grupo_mercadoria')
      .select('classificacao_nivel1, classificacao_nivel2')
      .not('classificacao_nivel2', 'is', null);

    if (!error && data) {
      for (const item of data) {
        const n1 = item.classificacao_nivel1;
        const n2 = item.classificacao_nivel2?.trim();
        if (n1 && n2) {
          if (!mapa[n1]) mapa[n1] = new Set();
          mapa[n1].add(n2);
        }
      }
    }
  } catch (err) {
    console.warn('[grupoMercadoriaApi] Erro ao consultar subcategorias dinâmicas:', err);
  }

  const resultado: Record<string, string[]> = {};
  for (const n1 of Object.keys(mapa)) {
    resultado[n1] = Array.from(mapa[n1]).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  return resultado;
}

export interface FiltrosListagemGrupos {
  termoBusca?: string;
  nivel1?: string;
  nivel2?: string;
  pagina?: number;
  itensPorPagina?: number;
}

export interface KpiNiveisMercadorias {
  total: number;
  totalNivel1: Record<string, number>;
  totalNivel2: Record<string, number>;
  totalSemClassificacao: number;
}

/**
 * Consulta a lista paginada e filtrada de grupos de mercadorias.
 */
export async function listarGruposMercadorias(filtros: FiltrosListagemGrupos = {}): Promise<{
  itens: CadastroGrupoMercadoria[];
  total: number;
}> {
  const { termoBusca, nivel1, nivel2, pagina = 1, itensPorPagina = 50 } = filtros;
  const inicio = (pagina - 1) * itensPorPagina;
  const fim = inicio + itensPorPagina - 1;

  try {
    let query = (supabase as any)
      .from('cadastro_grupo_mercadoria')
      .select('codigo, denominacao, denominacao2, classificacao_nivel1, classificacao_nivel2, codigo_pai', { count: 'exact' });

    if (termoBusca && termoBusca.trim()) {
      const t = termoBusca.trim();
      query = query.or(`codigo.ilike.%${t}%,denominacao.ilike.%${t}%,denominacao2.ilike.%${t}%`);
    }

    if (nivel1 && nivel1 !== 'TODOS') {
      if (nivel1 === '__SEM_NIVEL__') {
        query = query.is('classificacao_nivel1', null);
      } else {
        query = query.eq('classificacao_nivel1', nivel1);
      }
    }

    if (nivel2 && nivel2 !== 'TODOS') {
      if (nivel2 === '__SEM_NIVEL__') {
        query = query.is('classificacao_nivel2', null);
      } else {
        query = query.eq('classificacao_nivel2', nivel2);
      }
    }

    query = query
      .order('codigo', { ascending: true })
      .range(inicio, fim);

    const { data, count, error } = await query;

    if (error) {
      console.warn('[grupoMercadoriaApi] Erro ao consultar cadastro_grupo_mercadoria:', error);
      throw error;
    }

    return {
      itens: (data || []) as CadastroGrupoMercadoria[],
      total: count ?? (data?.length || 0),
    };
  } catch (err: any) {
    console.error('[grupoMercadoriaApi] Exceção em listarGruposMercadorias:', err);
    throw err;
  }
}

/**
 * Consulta estatísticas e totais consolidados para os cards de KPI.
 */
export async function obterKpisNiveis(): Promise<KpiNiveisMercadorias> {
  try {
    const { data, error } = await (supabase as any)
      .from('cadastro_grupo_mercadoria')
      .select('classificacao_nivel1, classificacao_nivel2');

    if (error) {
      console.warn('[grupoMercadoriaApi] Erro ao obter KPIs de grupos:', error);
      throw error;
    }

    const rows = data || [];
    const total = rows.length;
    const totalNivel1: Record<string, number> = {};
    const totalNivel2: Record<string, number> = {};
    let totalSemClassificacao = 0;

    for (const r of rows) {
      const n1 = r.classificacao_nivel1;
      const n2 = r.classificacao_nivel2;

      if (!n1 && !n2) {
        totalSemClassificacao++;
      }

      if (n1) {
        totalNivel1[n1] = (totalNivel1[n1] || 0) + 1;
      }
      if (n2) {
        totalNivel2[n2] = (totalNivel2[n2] || 0) + 1;
      }
    }

    return {
      total,
      totalNivel1,
      totalNivel2,
      totalSemClassificacao,
    };
  } catch (err) {
    console.error('[grupoMercadoriaApi] Exceção em obterKpisNiveis:', err);
    return {
      total: 0,
      totalNivel1: {},
      totalNivel2: {},
      totalSemClassificacao: 0,
    };
  }
}

/**
 * Atualiza um único grupo de mercadorias no banco (cadastro_grupo_mercadoria).
 * As alterações nesta tela devem alterar esse cadastro imediatamente.
 */
export async function atualizarGrupoMercadoria(
  codigo: string,
  dados: {
    denominacao?: string;
    denominacao2?: string | null;
    classificacao_nivel1?: string | null;
    classificacao_nivel2?: string | null;
  }
): Promise<CadastroGrupoMercadoria> {
  try {
    const payload: any = {};
    if (dados.denominacao !== undefined) payload.denominacao = dados.denominacao;
    if (dados.denominacao2 !== undefined) payload.denominacao2 = dados.denominacao2;
    if (dados.classificacao_nivel1 !== undefined) payload.classificacao_nivel1 = dados.classificacao_nivel1;
    if (dados.classificacao_nivel2 !== undefined) payload.classificacao_nivel2 = dados.classificacao_nivel2;

    const { data, error } = await (supabase as any)
      .from('cadastro_grupo_mercadoria')
      .update(payload)
      .eq('codigo', codigo)
      .select()
      .single();

    if (error) {
      console.warn('[grupoMercadoriaApi] Erro ao atualizar grupo:', error);
      throw error;
    }

    // Se classificacao_nivel1 ou denominacao foi alterada, sincronizar com sup_grupo_comprador_mercadorias
    if (dados.classificacao_nivel1 !== undefined || dados.denominacao !== undefined) {
      const updateRef: any = {};
      if (dados.classificacao_nivel1 !== undefined) updateRef.classificacao_nivel1 = dados.classificacao_nivel1;
      if (dados.denominacao) updateRef.grupo_mercadoria_nome = dados.denominacao;
      try {
        await (supabase as any)
          .from('sup_grupo_comprador_mercadorias')
          .update(updateRef)
          .eq('grupo_mercadoria_codigo', codigo);
      } catch {
        // Silencioso se não houver registros vinculados
      }
    }

    return data as CadastroGrupoMercadoria;
  } catch (err: any) {
    console.error('[grupoMercadoriaApi] Exceção em atualizarGrupoMercadoria:', err);
    throw err;
  }
}

/**
 * Reclassifica múltiplos grupos de mercadorias de uma vez em lote.
 */
export async function atualizarGruposEmLote(
  codigos: string[],
  niveis: {
    classificacao_nivel1: string;
    classificacao_nivel2: string;
  }
): Promise<number> {
  if (!codigos.length) return 0;
  try {
    const { error, count } = await (supabase as any)
      .from('cadastro_grupo_mercadoria')
      .update({
        classificacao_nivel1: niveis.classificacao_nivel1,
        classificacao_nivel2: niveis.classificacao_nivel2,
      })
      .in('codigo', codigos);

    if (error) {
      console.warn('[grupoMercadoriaApi] Erro ao atualizar grupos em lote:', error);
      throw error;
    }

    // Sincronizar com sup_grupo_comprador_mercadorias
    try {
      await (supabase as any)
        .from('sup_grupo_comprador_mercadorias')
        .update({
          classificacao_nivel1: niveis.classificacao_nivel1,
        })
        .in('grupo_mercadoria_codigo', codigos);
    } catch {
      // Silencioso
    }

    return count ?? codigos.length;
  } catch (err: any) {
    console.error('[grupoMercadoriaApi] Exceção em atualizarGruposEmLote:', err);
    throw err;
  }
}

/**
 * Cadastra um novo grupo de mercadoria manualmente caso necessário.
 */
export async function criarGrupoMercadoria(dados: {
  codigo: string;
  denominacao: string;
  denominacao2?: string | null;
  classificacao_nivel1: string;
  classificacao_nivel2: string;
}): Promise<CadastroGrupoMercadoria> {
  try {
    const { data, error } = await (supabase as any)
      .from('cadastro_grupo_mercadoria')
      .insert({
        codigo: dados.codigo.trim(),
        denominacao: dados.denominacao.trim(),
        denominacao2: dados.denominacao2?.trim() || null,
        classificacao_nivel1: dados.classificacao_nivel1,
        classificacao_nivel2: dados.classificacao_nivel2,
      })
      .select()
      .single();

    if (error) {
      console.warn('[grupoMercadoriaApi] Erro ao criar grupo de mercadoria:', error);
      throw error;
    }

    return data as CadastroGrupoMercadoria;
  } catch (err: any) {
    console.error('[grupoMercadoriaApi] Exceção em criarGrupoMercadoria:', err);
    throw err;
  }
}
