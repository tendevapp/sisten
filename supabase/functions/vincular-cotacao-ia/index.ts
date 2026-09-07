/**
 * Sugere, por IA, o material SAP de itens cotados que o casamento com pedidos
 * não conseguiu resolver (`status = 'sem_candidato'`).
 *
 * O trabalho pesado fica no banco: `candidatos_ia_vinculo` peneira os 452 mil
 * materiais do catálogo por trigrama e devolve, para cada item, só os
 * melhores candidatos. A IA apenas ESCOLHE entre eles — e
 * `registrar_vinculos_ia` descarta qualquer código que não exista no
 * catálogo, então alucinação não vira vínculo.
 *
 * O prompt não está aqui: vem de `ops_ia_prompts` (chave
 * `vincular-cotacao-sap`), editável em Gestão de APIs. O texto embutido é só
 * a rede de segurança para quando a tabela estiver vazia ou fora do ar.
 *
 * Auth: JWT do chamador + `pode_gerir_cotacoes()` — a mesma função das
 * policies das tabelas de cotação, para autorização de função e de banco
 * nunca divergirem. O service_role só grava o log de custo em `ops_api_uso`.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_ID = 'vincular-cotacao-ia';
const PROMPT_CHAVE = 'vincular-cotacao-sap';

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash';
const OPENROUTER_MODEL = Deno.env.get('OPENROUTER_MODEL') || 'deepseek/deepseek-v4-flash';

const TIMEOUT_GEMINI_MS = 90_000;
const TIMEOUT_MS = 150_000;
const MAX_TOKENS_RESPOSTA = 16_000;
const LIMITE_MAXIMO_LOTE = 60;

/** Preço por 1M de tokens (USD) — estimativa de telemetria, igual a `extrair-cotacao`. */
const PRECO_GEMINI_POR_1M_TOKENS: Record<string, { entrada: number; saida: number }> = {
  'gemini-2.0-flash': { entrada: 0.10, saida: 0.40 },
  'gemini-flash-latest': { entrada: 0.10, saida: 0.40 },
  'gemini-1.5-flash': { entrada: 0.075, saida: 0.30 },
};

function estimarCustoGeminiUsd(promptTokens: number, completionTokens: number): number | null {
  const preco = PRECO_GEMINI_POR_1M_TOKENS[GEMINI_MODEL]
    ?? (GEMINI_MODEL.includes('flash') ? PRECO_GEMINI_POR_1M_TOKENS['gemini-2.0-flash'] : undefined);
  if (!preco) return null;
  return (promptTokens / 1_000_000) * preco.entrada + (completionTokens / 1_000_000) * preco.saida;
}

/** Usado só se `ops_ia_prompts` não responder: o mesmo texto que a migration semeia. */
const PROMPT_FALLBACK = `Você faz a ponte entre a descrição comercial de um fornecedor e o catálogo de materiais SAP de uma indústria.

Para cada ITEM recebido você escolhe, ENTRE OS CANDIDATOS LISTADOS, o material que descreve o mesmo produto físico. Nunca invente código: só pode responder com um material_code presente na lista daquele item. Se nenhum candidato for o mesmo produto, responda material_code: null — errar o vínculo é pior do que não vincular.

Responda EXCLUSIVAMENTE com um JSON no formato:
{"resultados":[{"vinculo_id":"<id recebido>","material_code":"<código ou null>","confianca":<número de 0 a 1>,"justificativa":"<frase curta>"}]}`;

type ErroCodigo =
  | 'NAO_AUTENTICADO' | 'SEM_PERMISSAO' | 'CONFIG_AUSENTE' | 'SEM_PENDENCIAS'
  | 'PROVEDOR_INDISPONIVEL' | 'PROVEDOR_TIMEOUT' | 'RESPOSTA_VAZIA' | 'JSON_INVALIDO'
  | 'ERRO_INTERNO';

class ErroVinculo extends Error {
  constructor(public codigo: ErroCodigo, mensagem: string, public status = 500) {
    super(mensagem);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function comTimeout<T>(promise: Promise<T>, ms: number, rotulo: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ErroVinculo('PROVEDOR_TIMEOUT', `${rotulo} demorou mais que ${ms / 1000}s para responder.`, 504)),
      ms,
    );
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

interface ResultadoProvedor {
  content: string;
  uso: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  custoUsd: number | null;
  modelo: string;
}

async function chamarGemini(prompt: string, entrada: string, apiKey: string, rotulo: string): Promise<ResultadoProvedor> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction: prompt });

  const resultado = await comTimeout(
    model.generateContent({
      contents: [{ role: 'user', parts: [{ text: entrada }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: MAX_TOKENS_RESPOSTA },
    }),
    TIMEOUT_GEMINI_MS,
    rotulo,
  ).catch(err => {
    if (err instanceof ErroVinculo) throw err;
    throw new ErroVinculo('PROVEDOR_INDISPONIVEL', `Falha ao chamar o Gemini (${rotulo}): ${(err as Error)?.message ?? err}`, 502);
  });

  const content = resultado.response.text();
  if (!content?.trim()) throw new ErroVinculo('RESPOSTA_VAZIA', `O Gemini (${rotulo}) não retornou conteúdo.`, 502);

  const uso = resultado.response.usageMetadata;
  const promptTokens = uso?.promptTokenCount ?? 0;
  const completionTokens = uso?.candidatesTokenCount ?? 0;
  return {
    content,
    uso: uso ? { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: uso.totalTokenCount ?? 0 } : null,
    custoUsd: uso ? estimarCustoGeminiUsd(promptTokens, completionTokens) : null,
    modelo: `gemini:${GEMINI_MODEL}`,
  };
}

async function chamarOpenRouter(prompt: string, entrada: string, apiKey: string): Promise<ResultadoProvedor> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        max_tokens: MAX_TOKENS_RESPOSTA,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: entrada },
        ],
      }),
    });

    if (!resposta.ok) {
      throw new ErroVinculo('PROVEDOR_INDISPONIVEL', `OpenRouter respondeu ${resposta.status}: ${await resposta.text()}`, 502);
    }
    const data = await resposta.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) throw new ErroVinculo('RESPOSTA_VAZIA', 'OpenRouter não retornou conteúdo.', 502);

    return {
      content,
      uso: data.usage
        ? {
            prompt_tokens: data.usage.prompt_tokens ?? 0,
            completion_tokens: data.usage.completion_tokens ?? 0,
            total_tokens: data.usage.total_tokens ?? 0,
          }
        : null,
      // OpenRouter não devolve custo neste endpoint; fica nulo em vez de
      // inventar um preço que não é o cobrado.
      custoUsd: null,
      modelo: `openrouter:${OPENROUTER_MODEL}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function extrairResultados(content: string): any[] {
  let texto = content.trim();
  if (texto.startsWith('```')) texto = texto.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(texto);
  } catch {
    throw new ErroVinculo('JSON_INVALIDO', 'A IA respondeu num formato que não é JSON válido.', 502);
  }
  const lista = Array.isArray(parsed) ? parsed : parsed?.resultados;
  if (!Array.isArray(lista)) throw new ErroVinculo('JSON_INVALIDO', 'A resposta da IA não trouxe a lista `resultados`.', 502);
  return lista;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const inicio = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiKey1 = Deno.env.get('GEMINI_API_KEY') || undefined;
  const geminiKey2 = Deno.env.get('GEMINI_API_KEY_2') || undefined;
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY') || undefined;

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const supabaseService = createClient(supabaseUrl, serviceKey);

  let userId: string | null = null;
  let userName: string | null = null;

  const registrarUso = async (dados: Record<string, unknown>) => {
    try {
      await supabaseService.from('ops_api_uso').insert({
        api_id: API_ID,
        user_id: userId,
        user_name: userName,
        duracao_ms: Date.now() - inicio,
        ...dados,
      });
    } catch (e) {
      console.error('Falha ao gravar ops_api_uso:', e);
    }
  };

  try {
    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) throw new ErroVinculo('NAO_AUTENTICADO', 'Sessão inválida ou expirada.', 401);
    userId = userData.user.id;
    userName = (userData.user.user_metadata?.name as string) ?? userData.user.email ?? null;

    const { data: pode, error: erroPode } = await supabaseUser.rpc('pode_gerir_cotacoes');
    if (erroPode || pode !== true) throw new ErroVinculo('SEM_PERMISSAO', 'Seu perfil não pode vincular itens de cotação.', 403);

    if (!geminiKey1 && !geminiKey2 && !openrouterKey) {
      throw new ErroVinculo('CONFIG_AUSENTE', 'IA não configurada neste ambiente.', 500);
    }

    const body = await req.json().catch(() => ({}));
    const vinculoIds: string[] | null = Array.isArray(body?.vinculo_ids) && body.vinculo_ids.length
      ? body.vinculo_ids.map(String)
      : null;

    // Prompt vivo: o que o admin editou em Gestão de APIs vale a partir da
    // próxima chamada, sem redeploy.
    const { data: promptRow } = await supabaseUser
      .from('ops_ia_prompts')
      .select('prompt, parametros, versao, modelo')
      .eq('chave', PROMPT_CHAVE)
      .eq('ativo', true)
      .maybeSingle();

    const prompt = promptRow?.prompt?.trim() || PROMPT_FALLBACK;
    const parametros = (promptRow?.parametros ?? {}) as Record<string, unknown>;
    const limitePadrao = Number(parametros.itens_por_lote ?? 25);
    const topPadrao = Number(parametros.candidatos_por_item ?? 12);
    const limite = Math.min(Number(body?.limite ?? limitePadrao) || limitePadrao, LIMITE_MAXIMO_LOTE);
    const top = Number(body?.candidatos_por_item ?? topPadrao) || topPadrao;

    const { data: itens, error: erroItens } = await supabaseUser.rpc('candidatos_ia_vinculo', {
      p_limite: limite,
      p_top: top,
      p_vinculo_ids: vinculoIds,
    });
    if (erroItens) throw new ErroVinculo('ERRO_INTERNO', `Falha ao montar o lote: ${erroItens.message}`, 500);

    const lote = (itens ?? []) as any[];
    if (!lote.length) throw new ErroVinculo('SEM_PENDENCIAS', 'Nenhum item aguardando análise por IA.', 400);

    const entrada = JSON.stringify({ itens: lote }, null, 0);

    let resultado: ResultadoProvedor | null = null;
    const erros: string[] = [];
    for (const [chave, rotulo] of [[geminiKey1, 'Gemini Key 1'], [geminiKey2, 'Gemini Key 2']] as const) {
      if (!chave) continue;
      try {
        resultado = await chamarGemini(prompt, entrada, chave, rotulo);
        break;
      } catch (e) {
        const erro = e instanceof ErroVinculo ? e : new ErroVinculo('ERRO_INTERNO', String(e), 500);
        erros.push(`${rotulo} (${erro.codigo}): ${erro.message}`);
      }
    }
    if (!resultado && openrouterKey) {
      try {
        resultado = await chamarOpenRouter(prompt, entrada, openrouterKey);
      } catch (e) {
        const erro = e instanceof ErroVinculo ? e : new ErroVinculo('ERRO_INTERNO', String(e), 500);
        erros.push(`OpenRouter (${erro.codigo}): ${erro.message}`);
      }
    }
    if (!resultado) {
      throw new ErroVinculo('PROVEDOR_INDISPONIVEL', erros.join(' | ') || 'Nenhum provedor de IA respondeu.', 502);
    }

    const escolhas = extrairResultados(resultado.content);
    const porId = new Map(lote.map(i => [String(i.vinculo_id), i]));

    // Devolve ao banco também os candidatos que a peneira montou: é o que a
    // tela de curadoria usa para oferecer as alternativas em um clique.
    const paraGravar = escolhas
      .filter(e => porId.has(String(e?.vinculo_id)))
      .map(e => ({
        vinculo_id: String(e.vinculo_id),
        material_code: e?.material_code ? String(e.material_code) : null,
        confianca: typeof e?.confianca === 'number' ? e.confianca : null,
        justificativa: e?.justificativa ? String(e.justificativa) : null,
        candidatos: porId.get(String(e.vinculo_id))?.candidatos ?? [],
      }));

    const { data: gravacao, error: erroGravacao } = await supabaseUser.rpc('registrar_vinculos_ia', {
      p_resultados: paraGravar,
      p_modelo: resultado.modelo,
      p_executado_por: userId,
      p_executado_por_nome: userName,
    });
    if (erroGravacao) throw new ErroVinculo('ERRO_INTERNO', `Falha ao gravar as sugestões: ${erroGravacao.message}`, 500);

    await registrarUso({
      modelo: resultado.modelo,
      prompt_tokens: resultado.uso?.prompt_tokens ?? null,
      completion_tokens: resultado.uso?.completion_tokens ?? null,
      total_tokens: resultado.uso?.total_tokens ?? null,
      custo_usd: resultado.custoUsd,
      sucesso: true,
    });

    return json({
      analisados: lote.length,
      ...(gravacao ?? {}),
      modelo: resultado.modelo,
      prompt_versao: promptRow?.versao ?? null,
      uso: resultado.uso,
      custo_usd: resultado.custoUsd,
      duracao_ms: Date.now() - inicio,
    });
  } catch (e) {
    const erro = e instanceof ErroVinculo ? e : new ErroVinculo('ERRO_INTERNO', e instanceof Error ? e.message : String(e), 500);
    // Erro de sessão, permissão, configuração ou fila vazia não é consumo de
    // IA: não vira linha de custo.
    if (!['NAO_AUTENTICADO', 'SEM_PERMISSAO', 'CONFIG_AUSENTE', 'SEM_PENDENCIAS'].includes(erro.codigo)) {
      await registrarUso({ sucesso: false, erro_mensagem: `${erro.codigo}: ${erro.message}` });
    }
    return json({ erro: { codigo: erro.codigo, mensagem: erro.message } }, erro.status);
  }
});
