/**
 * Sugere, por IA, o vínculo entre itens cotados e os itens de RM (RI) de um
 * processo de cotação — sob demanda, quando o comprador pede.
 *
 * Diferente de `vincular-cotacao-ia` (que casa item cotado com material SAP
 * usando `candidatos_ia_vinculo`, um domínio inteiramente diferente), esta
 * function resolve o MESMO vínculo que a extração já tenta preencher sozinha
 * (`extrair-cotacao`, campo `Vinculo_RI`) e que o trigrama (`sugerir_vinculos_cotacao`)
 * tenta preencher por semelhança de texto. Existe para o caso em que os dois
 * erraram: descrição curta demais, código de produto sem relação com o
 * material, sigla que o trigrama não reconhece — aí vale a pena gastar uma
 * chamada de IA squasada só nos itens que sobraram sem vínculo, em vez de
 * re-extrair o documento inteiro de novo.
 *
 * Entrada enxuta de propósito: não recebe o Markdown do documento, só os
 * campos já extraídos dos itens sem vínculo + o escopo da RM. Isso faz a
 * chamada ser rápida e barata mesmo em processos grandes.
 *
 * Auth: mesmo padrão do resto do módulo — JWT do chamador + `pode_gerir_cotacoes()`.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash';
const OPENROUTER_MODEL = Deno.env.get('OPENROUTER_MODEL') || 'deepseek/deepseek-v4-flash';

const MAX_TOKENS_RESPOSTA = 8_000;
const TIMEOUT_GEMINI_MS = 40_000;
const TIMEOUT_MS = 40_000;
/** Mesma lógica de orçamento repartido de `extrair-cotacao`: nunca deixa a soma dos fallbacks estourar o limite da plataforma. */
const ORCAMENTO_TOTAL_MS = 70_000;
const TEMPO_MINIMO_TENTATIVA_MS = 10_000;

const LIMITE_ITENS = 100;
const LIMITE_ESCOPO = 200;

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

type ErroCodigo =
  | 'NAO_AUTENTICADO' | 'SEM_PERMISSAO' | 'ENTRADA_VAZIA' | 'CONFIG_AUSENTE'
  | 'PROVEDOR_LIMITE' | 'PROVEDOR_INDISPONIVEL' | 'PROVEDOR_TIMEOUT'
  | 'RESPOSTA_VAZIA' | 'JSON_INVALIDO' | 'ERRO_INTERNO';

class ErroVinculo extends Error {
  constructor(public codigo: ErroCodigo, message: string, public status: number) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const erroResponse = (e: ErroVinculo) => json({ erro: { codigo: e.codigo, mensagem: e.message } }, e.status);

interface ItemSemVinculo {
  idx: number;
  descricao: string;
  codigo_produto: string | null;
  marca: string | null;
  unidade: string | null;
  quantidade: number | null;
}

interface ItemEscopo {
  ri: string;
  texto_breve: string | null;
  material_code: string | null;
  quantidade: number | null;
  unidade: string | null;
}

const SYSTEM_PROMPT = `Você vincula itens de uma cotação de fornecedor aos itens de uma requisição de material (RM) do mesmo processo de compra.

Para cada ITEM COTADO, diga qual item da REQUISIÇÃO é o mesmo material físico, ou que nenhum corresponde.

REGRAS
- Vincule pelo MATERIAL, não pelo texto: "ELETRODO 7018 3,25MM" e "ELETRODO REVESTIDO E7018 Ø3,25" são o mesmo item; "PARAFUSO M8" e "PARAFUSO M10" não são.
- Não force vínculo: RI errado custa mais caro que RI vazio. Na dúvida, responda null.
- "ri": exatamente o valor da coluna "ri" da requisição, ou null.
- "divergencias": array de frases curtas com o que ficou diferente entre o item cotado e o item vinculado (quantidade, unidade, bitola/medida, marca) — [] quando bate em tudo, null quando não houve vínculo.

Responda SOMENTE com este JSON, sem comentário:
{"vinculos":[{"idx":0,"ri":null,"divergencias":null}]}`;

function formatarTabela(cabecalho: string[], linhas: (string | number | null)[][]): string {
  const norm = (v: string | number | null) => String(v ?? '—').replace(/\|/g, '/').replace(/\n/g, ' ');
  return [cabecalho.join('|'), ...linhas.map(l => l.map(norm).join('|'))].join('\n');
}

function montarPrompt(itens: ItemSemVinculo[], escopo: ItemEscopo[]): string {
  return [
    'ITENS COTADOS (sem vínculo ainda):',
    '```',
    formatarTabela(
      ['idx', 'descricao', 'codigo_produto', 'marca', 'unidade', 'quantidade'],
      itens.map(i => [i.idx, i.descricao, i.codigo_produto, i.marca, i.unidade, i.quantidade]),
    ),
    '```',
    '',
    'ITENS DA REQUISIÇÃO (escopo do processo):',
    '```',
    formatarTabela(
      ['ri', 'descricao', 'material_code', 'quantidade', 'unidade'],
      escopo.map(e => [e.ri, e.texto_breve, e.material_code, e.quantidade, e.unidade]),
    ),
    '```',
  ].join('\n');
}

interface ResultadoProvedor {
  content: string;
  uso: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  custoUsd: number | null;
  modelo: string;
}

function comTimeout<T>(promise: Promise<T>, ms: number, rotulo: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ErroVinculo('PROVEDOR_TIMEOUT', `${rotulo} demorou mais que ${ms / 1000}s para responder.`, 504)), ms);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}

async function chamarGemini(prompt: string, apiKey: string, rotulo: string, timeoutMs: number): Promise<ResultadoProvedor> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction: SYSTEM_PROMPT });

  let resultado;
  try {
    resultado = await comTimeout(
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: MAX_TOKENS_RESPOSTA },
      }),
      timeoutMs,
      rotulo,
    );
  } catch (err) {
    if (err instanceof ErroVinculo) throw err;
    throw new ErroVinculo('PROVEDOR_INDISPONIVEL', `Falha ao chamar o Gemini (${rotulo}): ${(err as Error)?.message ?? err}`, 502);
  }

  const content = resultado.response.text();
  if (!content?.trim()) throw new ErroVinculo('RESPOSTA_VAZIA', `O Gemini (${rotulo}) não retornou conteúdo utilizável.`, 502);

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

async function chamarOpenRouter(prompt: string, apiKey: string, timeoutMs: number): Promise<ResultadoProvedor> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let resposta: Response;
  try {
    resposta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('SUPABASE_URL') ?? '',
        'X-Title': 'SISTEN Vínculo RI por IA',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        max_tokens: MAX_TOKENS_RESPOSTA,
        response_format: { type: 'json_object' },
        reasoning: { enabled: false },
        usage: { include: true },
      }),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new ErroVinculo('PROVEDOR_TIMEOUT', 'A OpenRouter demorou demais para responder.', 504);
    throw new ErroVinculo('PROVEDOR_INDISPONIVEL', `Falha de rede ao chamar a OpenRouter: ${(e as Error).message}`, 502);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    if (resposta.status === 429) throw new ErroVinculo('PROVEDOR_LIMITE', 'OpenRouter sobrecarregada, tente novamente em 1 minuto.', 429);
    throw new ErroVinculo('PROVEDOR_INDISPONIVEL', `OpenRouter respondeu ${resposta.status}: ${detalhe.slice(0, 300)}`, 502);
  }

  const dados = await resposta.json();
  const content = dados?.choices?.[0]?.message?.content;
  const texto = typeof content === 'string' ? content : Array.isArray(content) ? content.map((p: any) => p?.text ?? '').join('') : '';
  if (!texto?.trim()) throw new ErroVinculo('RESPOSTA_VAZIA', 'A OpenRouter não retornou conteúdo utilizável.', 502);

  return {
    content: texto,
    uso: dados.usage
      ? { prompt_tokens: dados.usage.prompt_tokens ?? 0, completion_tokens: dados.usage.completion_tokens ?? 0, total_tokens: dados.usage.total_tokens ?? 0 }
      : null,
    custoUsd: typeof dados.usage?.cost === 'number' ? dados.usage.cost : null,
    modelo: `openrouter:${OPENROUTER_MODEL}`,
  };
}

async function chamarComFallback(prompt: string, geminiKey1?: string, geminiKey2?: string, openrouterKey?: string): Promise<ResultadoProvedor> {
  const erros: string[] = [];
  const inicio = Date.now();
  const tempoRestante = () => ORCAMENTO_TOTAL_MS - (Date.now() - inicio);

  if (geminiKey1 && tempoRestante() > TEMPO_MINIMO_TENTATIVA_MS) {
    try {
      return await chamarGemini(prompt, geminiKey1, 'Gemini Key 1', Math.min(TIMEOUT_GEMINI_MS, tempoRestante()));
    } catch (e) {
      const erro = e instanceof ErroVinculo ? e : new ErroVinculo('ERRO_INTERNO', String((e as Error)?.message ?? e), 500);
      erros.push(`Gemini Key 1 (${erro.codigo}): ${erro.message}`);
    }
  }
  if (geminiKey2 && tempoRestante() > TEMPO_MINIMO_TENTATIVA_MS) {
    try {
      return await chamarGemini(prompt, geminiKey2, 'Gemini Key 2', Math.min(TIMEOUT_GEMINI_MS, tempoRestante()));
    } catch (e) {
      const erro = e instanceof ErroVinculo ? e : new ErroVinculo('ERRO_INTERNO', String((e as Error)?.message ?? e), 500);
      erros.push(`Gemini Key 2 (${erro.codigo}): ${erro.message}`);
    }
  }
  if (openrouterKey && tempoRestante() > TEMPO_MINIMO_TENTATIVA_MS) {
    try {
      return await chamarOpenRouter(prompt, openrouterKey, Math.min(TIMEOUT_MS, tempoRestante()));
    } catch (e) {
      const erro = e instanceof ErroVinculo ? e : new ErroVinculo('ERRO_INTERNO', String((e as Error)?.message ?? e), 500);
      erros.push(`OpenRouter (${erro.codigo}): ${erro.message}`);
    }
  }

  throw new ErroVinculo('PROVEDOR_INDISPONIVEL', erros.length ? erros.join(' | ') : 'Nenhum provedor de IA configurado.', 502);
}

interface VinculoSugerido {
  idx: number;
  ri: string | null;
  divergencias: string[] | null;
}

function extrairVinculos(texto: string): VinculoSugerido[] {
  const limpo = texto.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(limpo);
  } catch (err) {
    throw new ErroVinculo('JSON_INVALIDO', `Não foi possível interpretar o JSON da IA: ${(err as Error).message}`, 502);
  }
  const lista = Array.isArray(parsed?.vinculos) ? parsed.vinculos : Array.isArray(parsed) ? parsed : null;
  if (!lista) throw new ErroVinculo('JSON_INVALIDO', 'JSON retornado não contém a lista "vinculos".', 502);
  return lista
    .filter((v: any) => v && typeof v.idx === 'number')
    .map((v: any) => ({
      idx: v.idx,
      ri: typeof v.ri === 'string' && v.ri.trim() ? v.ri.trim() : null,
      divergencias: Array.isArray(v.divergencias) ? v.divergencias.filter((d: unknown) => typeof d === 'string') : null,
    }));
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
  let processoId: string | null = null;

  try {
    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) throw new ErroVinculo('NAO_AUTENTICADO', 'Sessão inválida ou expirada.', 401);
    userId = userData.user.id;
    userName = (userData.user.user_metadata?.name as string) ?? userData.user.email ?? null;

    const { data: pode, error: erroPode } = await supabaseUser.rpc('pode_gerir_cotacoes');
    if (erroPode || pode !== true) throw new ErroVinculo('SEM_PERMISSAO', 'Seu perfil não pode vincular itens de cotação.', 403);

    if (!geminiKey1 && !geminiKey2 && !openrouterKey) throw new ErroVinculo('CONFIG_AUSENTE', 'IA não configurada neste ambiente.', 500);

    const body = await req.json().catch(() => ({}));
    processoId = typeof body?.processo_id === 'string' ? body.processo_id : null;
    const itens: ItemSemVinculo[] = Array.isArray(body?.itens)
      ? body.itens
          .filter((i: any) => i && typeof i.idx === 'number' && typeof i.descricao === 'string')
          .slice(0, LIMITE_ITENS)
          .map((i: any) => ({
            idx: i.idx,
            descricao: i.descricao,
            codigo_produto: i.codigo_produto ?? null,
            marca: i.marca ?? null,
            unidade: i.unidade ?? null,
            quantidade: i.quantidade ?? null,
          }))
      : [];
    const escopo: ItemEscopo[] = Array.isArray(body?.escopo)
      ? body.escopo
          .filter((e: any) => e && typeof e.ri === 'string')
          .slice(0, LIMITE_ESCOPO)
          .map((e: any) => ({
            ri: e.ri,
            texto_breve: e.texto_breve ?? null,
            material_code: e.material_code ?? null,
            quantidade: e.quantidade ?? null,
            unidade: e.unidade ?? null,
          }))
      : [];

    if (itens.length === 0) throw new ErroVinculo('ENTRADA_VAZIA', 'Nenhum item sem vínculo para analisar.', 400);
    if (escopo.length === 0) throw new ErroVinculo('ENTRADA_VAZIA', 'O processo não tem itens de requisição no escopo.', 400);

    const prompt = montarPrompt(itens, escopo);
    const resultado = await chamarComFallback(prompt, geminiKey1, geminiKey2, openrouterKey);
    const vinculos = extrairVinculos(resultado.content);

    try {
      await supabaseService.from('sup_cotacao_extracoes').insert({
        processo_id: processoId,
        user_id: userId,
        user_name: userName,
        modelo: resultado.modelo,
        chars_entrada: prompt.length,
        prompt_tokens: resultado.uso?.prompt_tokens ?? null,
        completion_tokens: resultado.uso?.completion_tokens ?? null,
        total_tokens: resultado.uso?.total_tokens ?? null,
        custo_usd: resultado.custoUsd,
        duracao_ms: Date.now() - inicio,
        sucesso: true,
        propostas_extraidas: 0,
        itens_extraidos: itens.length,
      });
    } catch (e) {
      console.error('Falha ao gravar cotacao_extracoes (sugerir-vinculo-ri-ia):', e);
    }

    return json({ vinculos, uso: resultado.uso, modelo: resultado.modelo, duracao_ms: Date.now() - inicio });
  } catch (e) {
    const erro = e instanceof ErroVinculo ? e : new ErroVinculo('ERRO_INTERNO', e instanceof Error ? e.message : String(e), 500);
    if (!['NAO_AUTENTICADO', 'SEM_PERMISSAO', 'ENTRADA_VAZIA', 'CONFIG_AUSENTE'].includes(erro.codigo)) {
      try {
        await supabaseService.from('sup_cotacao_extracoes').insert({
          processo_id: processoId,
          user_id: userId,
          user_name: userName,
          modelo: 'sugerir-vinculo-ri-ia',
          chars_entrada: 0,
          duracao_ms: Date.now() - inicio,
          sucesso: false,
          erro_codigo: erro.codigo,
          erro_mensagem: erro.message,
        });
      } catch (logErr) {
        console.error('Falha ao gravar cotacao_extracoes (erro):', logErr);
      }
    }
    return erroResponse(erro);
  }
});
