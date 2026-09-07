/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * API e servico de dados para Gestao e Cadastro de Grupo Comprador x Grupos de Mercadoria (SAP).
 * Tabela mestre: `sup_grupo_comprador_mercadorias`.
 * Tabelas relacionadas: `sup_compradores`, `cadastro_grupo_mercadoria`, `pedidos`, `requisicoes`.
 */

import { supabase } from '../db/supabaseClient';
import type { GrupoCompradorMercadoria, CompradorCadastro } from '../types';

export interface GrupoMercadoriaSapItem {
  codigo: string;
  denominacao: string;
  denominacao2?: string | null;
  classificacao_nivel1?: string | null;
  classificacao_nivel2?: string | null;
}

export interface CompradorResumoStats {
  grupo_compras: string;
  nome_comprador: string;
  usuario_sistema: string;
  email: string;
  total_grupos: number;
  total_pedidos: number;
  total_valor: number;
  total_requisicoes: number;
}

export const COMPRADORES_PADRAO: CompradorCadastro[] = [
  { grupo_compras: '314', nome_comprador: 'Itana', usuario_sistema: 'IVALOIS', email: 'itana.valois@ten.ind.br', ativo: true },
  { grupo_compras: '358', nome_comprador: 'Isadora', usuario_sistema: 'ISANTOS', email: 'isadora.santos@ten.ind.br', ativo: true },
  { grupo_compras: '575', nome_comprador: 'André', usuario_sistema: 'AMURITIBA', email: 'andre.araujo@ten.ind.br', ativo: true },
  { grupo_compras: '602', nome_comprador: 'Jamille', usuario_sistema: 'JSBATISTA', email: 'jamille.batista@ten.ind.br', ativo: false },
  { grupo_compras: '610', nome_comprador: 'Giulia', usuario_sistema: 'GAQUINO', email: 'giulia.aquino@ten.ind.br', ativo: true },
];

/**
 * Retorna a lista de compradores cadastrados no sistema.
 * @param somenteAtivos se true, filtra apenas compradores com ativo !== false
 */
export async function listarCompradores(somenteAtivos = false): Promise<CompradorCadastro[]> {
  try {
    let query = (supabase as any)
      .from('sup_compradores')
      .select('grupo_compras, nome_comprador, usuario_sistema, email, ativo')
      .order('grupo_compras');

    if (somenteAtivos) {
      query = query.eq('ativo', true);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      return somenteAtivos
        ? COMPRADORES_PADRAO.filter(c => c.ativo !== false)
        : COMPRADORES_PADRAO;
    }

    const lista: CompradorCadastro[] = (data as any[]).map(c => ({
      grupo_compras: String(c.grupo_compras || '').trim(),
      nome_comprador: String(c.nome_comprador || '').trim(),
      usuario_sistema: String(c.usuario_sistema || '').trim(),
      email: String(c.email || '').trim(),
      ativo: c.ativo !== false,
    }));

    return somenteAtivos ? lista.filter(c => c.ativo) : lista;
  } catch (err) {
    console.warn('[grupoCompradorApi] Falha ao carregar sup_compradores, usando padrao:', err);
    return somenteAtivos
      ? COMPRADORES_PADRAO.filter(c => c.ativo !== false)
      : COMPRADORES_PADRAO;
  }
}

/**
 * Inativa um comprador no banco de dados e seus vínculos em sup_grupo_comprador_mercadorias.
 */
export async function inativarComprador(grupoCompras: string): Promise<void> {
  const cod = grupoCompras.trim();
  const { error: err1 } = await (supabase as any)
    .from('sup_compradores')
    .update({ ativo: false })
    .eq('grupo_compras', cod);

  if (err1) throw new Error(`Erro ao inativar comprador: ${err1.message}`);

  await (supabase as any)
    .from('sup_grupo_comprador_mercadorias')
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq('grupo_compras', cod);
}

/**
 * Ativa um comprador no banco de dados.
 */
export async function ativarComprador(grupoCompras: string): Promise<void> {
  const cod = grupoCompras.trim();
  const { error } = await (supabase as any)
    .from('sup_compradores')
    .update({ ativo: true })
    .eq('grupo_compras', cod);

  if (error) throw new Error(`Erro ao ativar comprador: ${error.message}`);
}

/**
 * Retorna os vinculos de grupos de mercadorias com compradores,
 * enriquecidos com volume historico de pedidos (05/2026+).
 */
export async function listarGruposCompradoresMercadorias(): Promise<GrupoCompradorMercadoria[]> {
  const { data, error } = await (supabase as any)
    .from('sup_grupo_comprador_mercadorias')
    .select('*')
    .order('grupo_compras')
    .order('grupo_mercadoria_nome');

  if (error) {
    throw new Error(`Erro ao consultar grupos de compradores: ${error.message}`);
  }

  const itens = (data || []) as GrupoCompradorMercadoria[];

  // Opcional: carregar estatisticas historicas de pedidos e requisicoes
  try {
    const estatisticas = await carregarEstatisticasHistoricas052026();
    return itens.map(item => {
      const stats = estatisticas[item.grupo_mercadoria_codigo];
      return {
        ...item,
        total_pedidos: stats?.total_pedidos || 0,
        total_valor: stats?.total_valor || 0,
        total_requisicoes: stats?.total_requisicoes || 0,
      };
    });
  } catch (err) {
    console.warn('[grupoCompradorApi] Nao foi possivel compilar estatisticas historicas:', err);
    return itens;
  }
}

/**
 * Consulta a lista mestre de grupos de mercadorias do SAP (cadastro_grupo_mercadoria).
 */
export async function buscarGruposMercadoriaSap(termoBusca?: string): Promise<GrupoMercadoriaSapItem[]> {
  try {
    let query = (supabase as any)
      .from('cadastro_grupo_mercadoria')
      .select('codigo, denominacao, denominacao2, classificacao_nivel1, classificacao_nivel2')
      .order('codigo');

    if (termoBusca && termoBusca.trim()) {
      const t = termoBusca.trim();
      query = query.or(`codigo.ilike.%${t}%,denominacao.ilike.%${t}%,denominacao2.ilike.%${t}%`);
    }

    const { data, error } = await query.limit(200);
    if (error) {
      console.warn('[grupoCompradorApi] Erro ao consultar cadastro_grupo_mercadoria:', error);
      return [];
    }

    return (data || []) as GrupoMercadoriaSapItem[];
  } catch (err) {
    console.warn('[grupoCompradorApi] Excecao ao consultar cadastro_grupo_mercadoria:', err);
    return [];
  }
}

/**
 * Regras e mapeamento padrão para sugestão de compradores por níveis de mercadorias.
 */
export const REGRAS_SUGESTAO_COMPRADOR_NIVEL2: Record<string, string> = {
  // EPIs e Segurança -> 358 (Isadora)
  'EPI - Segurança': '358',

  // Medicamentos, Saúde, Escritório, Ferramentas, TI -> 575 (André)
  'Hospitalar': '575',
  'Medicamentos': '575',
  'Materiais de Escritório': '575',
  'Ferramentas': '575',
  'TI e Informática': '575',

  // Copa, Limpeza, MRO, Locação e Transporte -> 314 (Itana)
  'Copa e Limpeza': '314',
  'Limpeza e Conservação': '314',
  'MRO - Manutenção': '314',
  'Veículos e Transporte': '314',
  'Locação de Equipamentos': '314',
  'Embalagens': '314',
  'Manutenção de Frotas e Veículos': '314',
  'Conservação Predial e Facilities': '314',
  'Subempreiteiros - Apoio e Mão de Obra': '314',

  // Estruturais, Máquinas, Químicos, Obras e Engenharia -> 358 (Isadora)
  'Estruturas Metálicas': '358',
  'Equipamentos de Processo': '358',
  'Elétrica e Instrumentação': '358',
  'Tubulação e Conexões': '358',
  'Máquinas e Equipamentos': '358',
  'Químicos e Gases': '358',
  'Frete e Logística': '358',
  'Manutenção e Assistência Técnica': '358',
  'Manutenção Terceirizada': '358',
  'Subempreiteiros - Obras Civis': '358',
  'Subempreiteiros - Montagem e Instalações': '358',
  'Subempreiteiros - Acabamentos e Edificações': '358',
  'Ensaios e Controle Tecnológico': '358',
  'Serviços Ambientais': '358',
  'Materiais de Construção': '358',
  'Móveis e Instalações': '358',
  'Consultoria e Outros': '358',
  'Segurança Patrimonial': '358',
  'Utilidades e Telecomunicações': '358',
};

export const REGRAS_SUGESTAO_COMPRADOR_NIVEL1: Record<string, string> = {
  'CONSUMÍVEL': '358',
  'ESTRUTURAL': '358',
  'IMOBILIZADO': '358',
  'FRETE': '358',
  'SERVIÇO': '314',
};

/**
 * Sugere o código do comprador responsável a partir do Nível 2 (prioritário) ou Nível 1.
 * Leva em conta o histórico existente no sistema e as regras de negócio dos compradores.
 */
export function sugerirCompradorPorNiveis(
  nivel1?: string | null,
  nivel2?: string | null,
  historicoVinculos?: GrupoCompradorMercadoria[]
): { grupo_compras: string; motivo: string } {
  const n2 = (nivel2 || '').trim();
  const n1 = (nivel1 || '').trim().toUpperCase();

  // 1. Se houver histórico de vínculos para o mesmo Nível 2, calcula o comprador mais frequente ativo (ignorando inativo 602)
  if (n2 && historicoVinculos && historicoVinculos.length > 0) {
    const contagemCompradores: Record<string, number> = {};
    for (const v of historicoVinculos) {
      if (v.ativo && v.classificacao_nivel2?.trim() === n2 && v.grupo_compras !== '602') {
        contagemCompradores[v.grupo_compras] = (contagemCompradores[v.grupo_compras] || 0) + 1;
      }
    }
    const maisFrequente = Object.entries(contagemCompradores).sort((a, b) => b[1] - a[1])[0];
    if (maisFrequente) {
      return {
        grupo_compras: maisFrequente[0],
        motivo: `Sugerido por histórico de Nível 2: "${n2}"`,
      };
    }
  }

  // 2. Consulta tabela de regras por Nível 2
  if (n2 && REGRAS_SUGESTAO_COMPRADOR_NIVEL2[n2]) {
    const cod = REGRAS_SUGESTAO_COMPRADOR_NIVEL2[n2];
    return {
      grupo_compras: cod,
      motivo: `Sugerido por Nível 2: "${n2}"`,
    };
  }

  // 3. Se não encontrar por Nível 2, consulta histórico por Nível 1
  if (n1 && historicoVinculos && historicoVinculos.length > 0) {
    const contagemN1: Record<string, number> = {};
    for (const v of historicoVinculos) {
      if (v.ativo && v.classificacao_nivel1?.trim().toUpperCase() === n1 && v.grupo_compras !== '602') {
        contagemN1[v.grupo_compras] = (contagemN1[v.grupo_compras] || 0) + 1;
      }
    }
    const maisFrequenteN1 = Object.entries(contagemN1).sort((a, b) => b[1] - a[1])[0];
    if (maisFrequenteN1) {
      return {
        grupo_compras: maisFrequenteN1[0],
        motivo: `Sugerido por histórico de Nível 1: "${n1}"`,
      };
    }
  }

  if (n1 && REGRAS_SUGESTAO_COMPRADOR_NIVEL1[n1]) {
    return {
      grupo_compras: REGRAS_SUGESTAO_COMPRADOR_NIVEL1[n1],
      motivo: `Sugerido por Nível 1: "${n1}"`,
    };
  }

  // Fallback padrão: 358 (Isadora)
  return {
    grupo_compras: '358',
    motivo: 'Padrão Suprimentos (Isadora - 358)',
  };
}

/**
 * Salva ou atualiza um vinculo de grupo de mercadoria com comprador.
 */
export async function salvarVinculoGrupoComprador(dados: {
  id?: string;
  grupo_compras: string;
  nome_comprador?: string;
  grupo_mercadoria_codigo: string;
  grupo_mercadoria_nome: string;
  classificacao_nivel1?: string | null;
  classificacao_nivel2?: string | null;
  observacao?: string | null;
  ativo?: boolean;
}): Promise<GrupoCompradorMercadoria> {
  const codigoLimpo = dados.grupo_mercadoria_codigo.trim();
  const nomeLimpo = dados.grupo_mercadoria_nome.trim();
  const grupoComprasLimpo = dados.grupo_compras.trim();

  if (!codigoLimpo) throw new Error('O código do grupo de mercadorias é obrigatório.');
  if (!nomeLimpo) throw new Error('O nome do grupo de mercadorias é obrigatório.');
  if (!grupoComprasLimpo) throw new Error('O código do comprador é obrigatório.');

  // Resolver nome do comprador se nao fornecido
  let nomeComp = dados.nome_comprador?.trim();
  if (!nomeComp) {
    const compradores = await listarCompradores();
    const c = compradores.find(comp => comp.grupo_compras === grupoComprasLimpo);
    nomeComp = c?.nome_comprador || `Comprador ${grupoComprasLimpo}`;
  }

  const payload: any = {
    grupo_compras: grupoComprasLimpo,
    nome_comprador: nomeComp,
    grupo_mercadoria_codigo: codigoLimpo,
    grupo_mercadoria_nome: nomeLimpo,
    classificacao_nivel1: dados.classificacao_nivel1 || null,
    classificacao_nivel2: dados.classificacao_nivel2 || null,
    observacao: dados.observacao || null,
    ativo: dados.ativo !== undefined ? dados.ativo : true,
    updated_at: new Date().toISOString(),
  };

  if (dados.id) {
    payload.id = dados.id;
  }

  const { data, error } = await (supabase as any)
    .from('sup_grupo_comprador_mercadorias')
    .upsert(payload, { onConflict: 'grupo_mercadoria_codigo' })
    .select()
    .single();

  if (error) {
    throw new Error(`Erro ao salvar vínculo: ${error.message}`);
  }

  return data as GrupoCompradorMercadoria;
}

/**
 * Exclui um vinculo existente pelo ID.
 */
export async function excluirVinculoGrupoComprador(id: string): Promise<void> {
  if (!id) throw new Error('ID do vínculo não informado.');
  const { error } = await (supabase as any)
    .from('sup_grupo_comprador_mercadorias')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Erro ao excluir vínculo: ${error.message}`);
  }
}

/**
 * Reatribui rapidamente o comprador responsavel por um grupo.
 */
export async function reatribuirGrupoComprador(
  id: string,
  novoGrupoCompras: string,
  novoNomeComprador: string
): Promise<void> {
  if (!id) throw new Error('ID do vínculo não informado.');
  const { error } = await (supabase as any)
    .from('sup_grupo_comprador_mercadorias')
    .update({
      grupo_compras: novoGrupoCompras,
      nome_comprador: novoNomeComprador,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    throw new Error(`Erro ao reatribuir comprador: ${error.message}`);
  }
}

/**
 * Atualiza o comprador responsável por múltiplos vínculos selecionados em lote.
 */
export async function atualizarCompradorEmLote(
  ids: string[],
  novoGrupoCompras: string,
  novoNomeComprador: string
): Promise<void> {
  if (!ids || ids.length === 0) return;
  const { error } = await (supabase as any)
    .from('sup_grupo_comprador_mercadorias')
    .update({
      grupo_compras: novoGrupoCompras,
      nome_comprador: novoNomeComprador,
      updated_at: new Date().toISOString(),
    })
    .in('id', ids);

  if (error) {
    throw new Error(`Erro ao atualizar compradores em lote: ${error.message}`);
  }
}

/**
 * Atualiza múltiplos vínculos com compradores individuais (ex.: sugestões automáticas personalizadas).
 */
export async function atualizarCompradoresIndividuaisEmLote(
  atualizacoes: { id: string; grupo_compras: string; nome_comprador: string }[]
): Promise<void> {
  if (!atualizacoes || atualizacoes.length === 0) return;
  await Promise.all(
    atualizacoes.map((a) =>
      (supabase as any)
        .from('sup_grupo_comprador_mercadorias')
        .update({
          grupo_compras: a.grupo_compras,
          nome_comprador: a.nome_comprador,
          updated_at: new Date().toISOString(),
        })
        .eq('id', a.id)
    )
  );
}

/**
 * Carrega contagem de pedidos e requisicoes no periodo (05/2026 ate hoje)
 * mapeadas por codigo de grupo de mercadorias.
 */
export async function carregarEstatisticasHistoricas052026(): Promise<
  Record<string, { total_pedidos: number; total_valor: number; total_requisicoes: number }>
> {
  const mapa: Record<string, { total_pedidos: number; total_valor: number; total_requisicoes: number }> = {};

  try {
    // Pedidos 05/2026+
    const { data: pedidosData } = await (supabase as any)
      .from('pedidos')
      .select('grp_mercads, valor_liquido')
      .gte('data_doc', '2026-05-01')
      .not('grp_mercads', 'is', null);

    if (pedidosData && Array.isArray(pedidosData)) {
      for (const p of pedidosData) {
        const cod = String(p.grp_mercads || '').trim();
        if (!cod) continue;
        if (!mapa[cod]) {
          mapa[cod] = { total_pedidos: 0, total_valor: 0, total_requisicoes: 0 };
        }
        mapa[cod].total_pedidos += 1;
        mapa[cod].total_valor += Number(p.valor_liquido || 0);
      }
    }

    // Requisicoes 05/2026+
    const { data: reqsData } = await (supabase as any)
      .from('requisicoes')
      .select('grupo_de_mercadorias')
      .gte('data_da_solicitacao', '2026-05-01')
      .not('grupo_de_mercadorias', 'is', null);

    if (reqsData && Array.isArray(reqsData)) {
      for (const r of reqsData) {
        const cod = String(r.grupo_de_mercadorias || '').trim();
        if (!cod) continue;
        if (!mapa[cod]) {
          mapa[cod] = { total_pedidos: 0, total_valor: 0, total_requisicoes: 0 };
        }
        mapa[cod].total_requisicoes += 1;
      }
    }
  } catch (err) {
    console.warn('[grupoCompradorApi] Falha na consulta de pedidos/requisicoes agregadas:', err);
  }

  return mapa;
}

/**
 * `grupo_mercadoria_codigo` -> `grupo_compras`, só dos vínculos ativos.
 *
 * Recorte enxuto de `listarGruposCompradoresMercadorias`, que junta o volume
 * histórico de pedidos e requisições para o painel de gestão. Quem só precisa
 * saber de quem é o grupo de mercadorias — a planilha de abertura de RM, por
 * exemplo — não deve pagar aquelas agregações.
 */
export async function mapaGrupoComprasPorMercadoria(): Promise<Map<string, string>> {
  const { data, error } = await (supabase as any)
    .from('sup_grupo_comprador_mercadorias')
    .select('grupo_mercadoria_codigo, grupo_compras, ativo')
    .eq('ativo', true);

  if (error) {
    throw new Error(`Erro ao consultar os compradores por grupo de mercadorias: ${error.message}`);
  }

  const mapa = new Map<string, string>();
  for (const linha of (data || []) as { grupo_mercadoria_codigo: string; grupo_compras: string }[]) {
    const codigo = (linha.grupo_mercadoria_codigo || '').trim();
    const grupo = (linha.grupo_compras || '').trim();
    if (codigo && grupo) mapa.set(codigo, grupo);
  }
  return mapa;
}
