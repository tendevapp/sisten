/**
 * Helper para chamada da Edge Function `gemini-generate`.
 * 
 * Permite chamar a API do Gemini via Supabase Edge Function sem expor a API key no client-side.
 */

import { supabase } from '../db/supabaseClient';

export interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

/**
 * Gera conteúdo utilizando o modelo Google Gemini através da Edge Function do Supabase.
 * 
 * @param prompt Texto do prompt a ser enviado para o modelo
 * @param model (Opcional) Nome do modelo Gemini (padrão: 'gemini-flash-latest')
 */
export async function gerarConteudoGemini(
  prompt: string,
  model = 'gemini-flash-latest'
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('gemini-generate', {
    body: {
      prompt,
      model,
    },
  });

  if (error) {
    const contexto = (error as any)?.context;
    const corpo = typeof contexto?.json === 'function' ? await contexto.json().catch(() => null) : null;
    throw new Error(corpo?.erro?.mensagem ?? error.message ?? 'Falha ao gerar conteúdo com Gemini.');
  }

  const resposta = data as GeminiResponse;
  const texto = resposta.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!texto) {
    throw new Error('Nenhum texto retornado pelo modelo Gemini.');
  }

  return texto;
}
