/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Uso de API/IA consolidado, para a tela de Gestão de APIs (/admin/apis).
 * Cada Edge Function que chama um modelo de IA loga num lugar diferente —
 * histórico próprio do projeto, não um design escolhido aqui:
 *  - `extrair-cotacao`         → tabela `cotacao_extracoes`
 *  - `converter-markdown-ia`   → tabela `conversoes_markdown` (só via 'ia';
 *                                 conversão local de planilha/JSON/XML não é
 *                                 chamada de API, fica de fora desta análise)
 *  - `gemini-generate`         → tabela `api_uso_logs` (única sem tabela
 *                                 própria antes desta função existir)
 *
 * Este módulo une as três fontes numa lista só, ordenada por data, para a
 * tela agregar por modelo/API sem se importar com o esquema de cada tabela.
 */

import { supabase } from '../db/supabaseClient';

export interface ApiUsoRegistro {
  apiId: string;
  modelo: string | null;
  tokens: number | null;
  custoUsd: number | null;
  duracaoMs: number | null;
  sucesso: boolean;
  userName: string | null;
  createdAt: string;
}

/** Janelas de período pré-definidas para o filtro da tela. `null` = sem filtro (todo o histórico). */
export type PeriodoUso = '24h' | '7d' | '30d' | 'tudo';

function cortePara(periodo: PeriodoUso): string | null {
  if (periodo === 'tudo') return null;
  const horas = periodo === '24h' ? 24 : periodo === '7d' ? 24 * 7 : 24 * 30;
  return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
}

export async function listarUsoApis(periodo: PeriodoUso = '7d'): Promise<ApiUsoRegistro[]> {
  const corte = cortePara(periodo);

  const consultaExtracoes = (() => {
    let q = supabase
      .from('sup_cotacao_extracoes')
      .select('modelo, total_tokens, custo_usd, duracao_ms, sucesso, user_name, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (corte) q = q.gte('created_at', corte);
    return q;
  })();

  const consultaConversoes = (() => {
    let q = supabase
      .from('ops_conversoes_markdown')
      .select('modelo, tokens, custo_usd, duracao_ms, sucesso, user_name, created_at, via')
      .eq('via', 'ia')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (corte) q = q.gte('created_at', corte);
    return q;
  })();

  const consultaGemini = (() => {
    let q = supabase
      .from('ops_api_uso')
      .select('api_id, modelo, total_tokens, custo_usd, duracao_ms, sucesso, user_name, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (corte) q = q.gte('created_at', corte);
    return q;
  })();

  const [extracoes, conversoes, geminiLogs] = await Promise.all([consultaExtracoes, consultaConversoes, consultaGemini]);

  if (extracoes.error) throw new Error(`Falha ao carregar uso de extrair-cotacao: ${extracoes.error.message}`);
  if (conversoes.error) throw new Error(`Falha ao carregar uso de converter-markdown-ia: ${conversoes.error.message}`);
  if (geminiLogs.error) throw new Error(`Falha ao carregar uso de gemini-generate: ${geminiLogs.error.message}`);

  const registros: ApiUsoRegistro[] = [
    ...(extracoes.data ?? []).map(r => ({
      apiId: 'extrair-cotacao',
      modelo: r.modelo, tokens: r.total_tokens, custoUsd: r.custo_usd, duracaoMs: r.duracao_ms,
      sucesso: r.sucesso, userName: r.user_name, createdAt: r.created_at,
    })),
    ...(conversoes.data ?? []).map(r => ({
      apiId: 'converter-markdown-ia',
      modelo: r.modelo, tokens: r.tokens, custoUsd: r.custo_usd, duracaoMs: r.duracao_ms,
      sucesso: r.sucesso, userName: r.user_name, createdAt: r.created_at,
    })),
    ...(geminiLogs.data ?? []).map(r => ({
      apiId: r.api_id, modelo: r.modelo, tokens: r.total_tokens, custoUsd: r.custo_usd, duracaoMs: r.duracao_ms,
      sucesso: r.sucesso, userName: r.user_name, createdAt: r.created_at,
    })),
  ];

  return registros.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
