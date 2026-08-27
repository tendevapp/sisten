/**
 * Edge Function "gemini-generate" — Proxy seguro para a API do Google Gemini.
 *
 * Permite que aplicações chamem a API generativelanguage.googleapis.com sem expor
 * a GEMINI_API_KEY no client-side.
 *
 * Exemplo de payload aceito:
 * 1) Modo Simplificado:
 *    { "prompt": "Explain how AI works in a few words" }
 *
 * 2) Modo Nativo da API Gemini (cURL original):
 *    {
 *      "contents": [
 *        { "parts": [{ "text": "Explain how AI works in a few words" }] }
 *      ],
 *      "model": "gemini-flash-latest"
 *    }
 *
 * Cada chamada (sucesso ou falha) é registrada em `api_uso_logs` — é a única
 * function do projeto sem tabela de telemetria própria; a tela de Gestão de
 * APIs (/admin/apis) lê daqui para saber qual modelo atendeu cada chamada,
 * quantos tokens e a que custo estimado.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-goog-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** Preço por 1M de tokens (USD) — estimativa para a tela de análise, não é fonte oficial de cobrança. Ver o mesmo padrão em converter-markdown-ia. */
const PRECO_POR_1M_TOKENS: Record<string, { entrada: number; saida: number }> = {
  'gemini-2.0-flash': { entrada: 0.10, saida: 0.40 },
  'gemini-flash-latest': { entrada: 0.10, saida: 0.40 },
  'gemini-1.5-flash': { entrada: 0.075, saida: 0.30 },
  'gemini-1.5-pro': { entrada: 1.25, saida: 5.00 },
};

function estimarCustoUsd(modelo: string, promptTokens: number, completionTokens: number): number | null {
  const preco = PRECO_POR_1M_TOKENS[modelo]
    ?? (modelo.includes('pro') ? PRECO_POR_1M_TOKENS['gemini-1.5-pro'] : modelo.includes('flash') ? PRECO_POR_1M_TOKENS['gemini-2.0-flash'] : undefined);
  if (!preco) return null;
  return (promptTokens / 1_000_000) * preco.entrada + (completionTokens / 1_000_000) * preco.saida;
}

/** Melhor esforço: extrai o usuário do JWT do chamador, se houver. `verify_jwt` é false nesta function (proxy chamado também sem sessão), então a ausência de header/JWT válido não é erro — só fica sem atribuição de usuário no log. */
async function extrairUsuario(req: Request): Promise<{ id: string | null; nome: string | null }> {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return { id: null, nome: null };
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey) return { id: null, nome: null };
    const supabaseUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data } = await supabaseUser.auth.getUser();
    if (!data?.user) return { id: null, nome: null };
    return { id: data.user.id, nome: (data.user.user_metadata?.name as string) ?? data.user.email ?? null };
  } catch {
    return { id: null, nome: null };
  }
}

async function registrarUso(params: {
  modelo: string;
  userId: string | null;
  userName: string | null;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  duracaoMs: number;
  sucesso: boolean;
  erroMensagem?: string;
}) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return;
    const supabaseService = createClient(supabaseUrl, serviceKey);

    const promptTokens = params.usageMetadata?.promptTokenCount ?? null;
    const completionTokens = params.usageMetadata?.candidatesTokenCount ?? null;
    const totalTokens = params.usageMetadata?.totalTokenCount ?? null;

    await supabaseService.from('ops_api_uso').insert({
      api_id: 'gemini-generate',
      modelo: params.modelo,
      user_id: params.userId,
      user_name: params.userName,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      custo_usd: promptTokens != null && completionTokens != null ? estimarCustoUsd(params.modelo, promptTokens, completionTokens) : null,
      duracao_ms: params.duracaoMs,
      sucesso: params.sucesso,
      erro_mensagem: params.erroMensagem ?? null,
    });
  } catch (e) {
    console.error('Falha ao gravar api_uso_logs (gemini-generate):', e);
  }
}

serve(async (req: Request) => {
  // Trata requisição preflight de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return json({ erro: { mensagem: 'Método não permitido. Utilize POST.' } }, 405);
  }

  const inicio = Date.now();
  const { id: userId, nome: userName } = await extrairUsuario(req);
  let model = 'desconhecido';

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GEMINI_API_KEY_2');

    if (!apiKey) {
      return json(
        {
          erro: {
            codigo: 'CONFIG_AUSENTE',
            mensagem: 'Chave GEMINI_API_KEY não configurada no ambiente do Supabase Edge Functions.',
          },
        },
        500
      );
    }

    const body = await req.json().catch(() => ({}));

    // Determina o modelo (padrão: gemini-flash-latest conforme cURL fornecido)
    model = body.model || Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest';

    // Monta o payload de contents
    let contents = body.contents;
    if (!contents) {
      if (body.prompt && typeof body.prompt === 'string') {
        contents = [
          {
            parts: [{ text: body.prompt }],
          },
        ];
      } else {
        return json(
          {
            erro: {
              codigo: 'ENTRADA_INVALIDA',
              mensagem: 'O corpo da requisição deve conter "prompt" (string) ou "contents" (array no formato Gemini).',
            },
          },
          400
        );
      }
    }

    // Prepara chamada HTTP para a API do Google Gemini
    const googleApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await fetch(googleApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents,
        generationConfig: body.generationConfig,
        safetySettings: body.safetySettings,
      }),
    });

    const data = await response.json();
    const duracaoMs = Date.now() - inicio;

    if (!response.ok) {
      const mensagemErro = data?.error?.message ?? `A API do Gemini respondeu HTTP ${response.status}.`;
      await registrarUso({ modelo: model, userId, userName, duracaoMs, sucesso: false, erroMensagem: mensagemErro });
      return json(
        {
          erro: {
            codigo: 'ERRO_API_GEMINI',
            status: response.status,
            detalhes: data,
          },
        },
        response.status
      );
    }

    await registrarUso({ modelo: model, userId, userName, usageMetadata: data.usageMetadata, duracaoMs, sucesso: true });
    return json(data, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno desconhecido';
    await registrarUso({ modelo: model, userId, userName, duracaoMs: Date.now() - inicio, sucesso: false, erroMensagem: message });
    return json({ erro: { codigo: 'ERRO_INTERNO', mensagem: message } }, 500);
  }
});
