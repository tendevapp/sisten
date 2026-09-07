/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Prompts de IA editáveis (`ops_ia_prompts`).
 *
 * Os prompts das primeiras Edge Functions do SISTEN (`extrair-cotacao`,
 * `converter-markdown-ia`) são constantes no código: melhorar a instrução
 * exige redeploy, e quem percebe a IA errando é o comprador, não quem faz
 * deploy. Daqui para frente o prompt mora no banco e a função lê a versão
 * ativa a cada chamada — o texto embutido na função é só rede de segurança.
 *
 * `versao` sobe a cada gravação e é devolvida pela Edge Function junto do
 * resultado, então dá para amarrar "esta rodada usou a versão 3 do prompt" ao
 * consumo registrado em `ops_api_uso`.
 */

import { supabase } from '../db/supabaseClient';

export interface PromptIa {
  chave: string;
  titulo: string;
  descricao: string | null;
  modelo: string | null;
  prompt: string;
  parametros: Record<string, unknown>;
  ativo: boolean;
  versao: number;
  atualizado_por_nome: string | null;
  updated_at: string;
}

export async function listarPromptsIa(): Promise<PromptIa[]> {
  const { data, error } = await supabase
    .from('ops_ia_prompts')
    .select('*')
    .order('titulo');
  if (error) throw new Error(`Falha ao carregar os prompts: ${error.message}`);
  return (data ?? []) as unknown as PromptIa[];
}

export async function salvarPromptIa(params: {
  chave: string;
  prompt: string;
  modelo?: string | null;
  ativo?: boolean;
  usuarioId?: string | null;
  usuarioNome?: string | null;
  versaoAtual: number;
}): Promise<PromptIa> {
  const { data, error } = await supabase
    .from('ops_ia_prompts')
    .update({
      prompt: params.prompt,
      modelo: params.modelo ?? null,
      ativo: params.ativo ?? true,
      versao: params.versaoAtual + 1,
      atualizado_por: params.usuarioId ?? null,
      atualizado_por_nome: params.usuarioNome ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('chave', params.chave)
    .select('*')
    .single();

  if (error) throw new Error(`Falha ao salvar o prompt: ${error.message}`);
  return data as unknown as PromptIa;
}
