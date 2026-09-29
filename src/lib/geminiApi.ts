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
 * @param model (Opcional) Nome do modelo Gemini (padrao: 'gemini-3.6-flash')
 */
export async function gerarConteudoGemini(
  prompt: string,
  model = 'gemini-3.6-flash'
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('gemini-generate', {
    body: {
      prompt,
      model,
    },
  });

  if (error) {
    let mensagemDetalhada = '';
    try {
      const contexto = (error as any)?.context;
      if (contexto) {
        const corpo = typeof contexto.json === 'function' ? await contexto.json().catch(() => null) : null;
        mensagemDetalhada =
          corpo?.erro?.mensagem ||
          corpo?.erro?.detalhes?.error?.message ||
          corpo?.error?.message ||
          corpo?.message ||
          '';
      }
    } catch {
      // Ignora falha de parse
    }

    if (mensagemDetalhada) {
      if (mensagemDetalhada.includes('high demand') || mensagemDetalhada.includes('UNAVAILABLE')) {
        throw new Error(
          `O modelo Gemini (${model}) esta temporariamente com alta demanda no Google AI Studio (HTTP 503). Tente usar o modelo 'gemini-3.6-flash' ou aguarde alguns instantes.`
        );
      }
      throw new Error(`Erro Gemini (${model}): ${mensagemDetalhada}`);
    }

    throw new Error(error.message ?? 'Falha ao gerar conteudo com Gemini.');
  }

  const resposta = data as GeminiResponse;
  const texto = resposta.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!texto) {
    throw new Error('Nenhum texto retornado pelo modelo Gemini.');
  }

  return texto;
}
