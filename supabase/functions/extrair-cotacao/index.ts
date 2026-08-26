/**
 * Extrai os 40 campos de uma cotação de fornecedor (cabeçalho + itens) a
 * partir de markdown colado pelo usuário. Move a chamada de IA para o
 * servidor: a versão anterior (src/views/TesteExtracaoIA.tsx) chamava a
 * OpenRouter direto do browser com VITE_OPENROUTER_API_KEY, o que embute uma
 * chave paga em todo bundle publicado.
 *
 * Ordem de provedores: Gemini (GEMINI_API_KEY, com GEMINI_API_KEY_2 como
 * segunda tentativa) é o primário — mesmas chaves já usadas por
 * estruturar-cotacao/converter-markdown-ia neste projeto. Falhando as duas
 * chaves do Gemini, cai para OpenRouter (OPENROUTER_API_KEY /
 * OPENROUTER_MODEL) e, por último, para OpenAI (OPENAI_API_KEY /
 * OPENAI_MODEL).
 *
 * Auth: verifica o JWT do chamador e reusa public.pode_gerir_cotacoes() — a
 * MESMA função usada nas policies de RLS das tabelas de cotação — para que
 * a autorização da Edge Function e a autorização do banco nunca divirjam.
 *
 * O cliente service_role só é usado para gravar o log de custo/telemetria em
 * cotacao_extracoes; nunca toca nas tabelas de cotação.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_CHARS = 200_000;
const TIMEOUT_MS = 150_000;
const TIMEOUT_GEMINI_MS = 45_000;
const MAX_TOKENS_RESPOSTA = 32_000;

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash';
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-5.6-luna';
const OPENROUTER_MODEL = Deno.env.get('OPENROUTER_MODEL') || 'deepseek/deepseek-v4-flash';

/** Preço por 1M de tokens (USD) — estimativa para telemetria, não é fonte oficial de cobrança. Mesmo padrão usado em converter-markdown-ia. */
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
  | 'NAO_AUTENTICADO' | 'SEM_PERMISSAO' | 'ENTRADA_VAZIA' | 'ENTRADA_GRANDE'
  | 'CONFIG_AUSENTE' | 'PROVEDOR_LIMITE' | 'PROVEDOR_INDISPONIVEL'
  | 'PROVEDOR_TIMEOUT' | 'RESPOSTA_VAZIA' | 'RESPOSTA_TRUNCADA'
  | 'JSON_INVALIDO' | 'ERRO_INTERNO';

class ErroExtracao extends Error {
  constructor(public codigo: ErroCodigo, message: string, public status: number) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const erroResponse = (e: ErroExtracao) =>
  json({ erro: { codigo: e.codigo, mensagem: e.message } }, e.status);

const SYSTEM_PROMPT = `Você extrai dados de propostas comerciais / orçamentos de fornecedores a partir de texto em Markdown (saída de conversão de PDF).

O texto pode conter UM ou VÁRIOS documentos, de fornecedores diferentes. Sempre devolva um ARRAY "propostas" — com um único elemento se houver um só documento.

REGRAS GERAIS
- Nunca invente. Campo que não aparece no documento => null.
- Nunca use "", "N/A", "-", "não informado", "nao consta". Use null.
- Todos os valores são STRING ou null. Não use números nem booleanos.
- Dinheiro: só o número, ponto como separador decimal, sem separador de milhar e sem "R$". Ex.: "1234.56".
- Percentual: só o número em PONTOS PERCENTUAIS, sem "%". 18% => "18".
- Data: "AAAA-MM-DD". Se o documento disser um prazo em vez de uma data (ex.: "30 dias"), devolva o texto original.
- Quantidade: só o número, ponto como separador decimal.
- CNPJ e Inscrição Estadual: só os dígitos.
- Frete_Modalidade: "CIF", "FOB" ou "OUTRO".
- Um item por linha da tabela de produtos. Não agrupe, não resuma, não pule linhas, não crie linhas de subtotal.
- Cliente_* é o comprador (destinatário da proposta); Fornecedor_* é quem está vendendo.

FORMATO (responda APENAS com este JSON, sem markdown, sem comentários):
{"propostas":[{
  "Arquivo_Origem":null,"Numero_Proposta":null,"Data_Emissao":null,
  "Validade_Proposta":null,"Fornecedor_Razao_Social":null,
  "Fornecedor_CNPJ":null,"Fornecedor_Inscricao_Estadual":null,
  "Fornecedor_Cidade_UF":null,"Fornecedor_Telefone":null,
  "Vendedor_Nome":null,"Vendedor_Email":null,"Vendedor_Telefone":null,
  "Cliente_Razao_Social":null,"Cliente_CNPJ":null,
  "Cliente_Inscricao_Estadual":null,"Cliente_Cidade_UF":null,
  "Condicao_Pagamento":null,"Forma_Pagamento":null,"Prazo_Entrega":null,
  "Frete_Modalidade":null,"Transportadora_Indicada":null,
  "Faturamento_Minimo":null,"Dados_Bancarios_PIX":null,
  "Valor_Total_Orcamento":null,"Observacoes_Gerais":null,
  "itens":[{
    "Item_Numero":null,"Codigo_Produto":null,"Descricao_Produto":null,
    "Marca_Fabricante":null,"Unidade_Medida":null,"NCM":null,"CST":null,
    "CFOP":null,"Quantidade":null,"Preco_Unitario":null,
    "Preco_Total_Item":null,"Aliquota_ICMS_Pct":null,"Aliquota_PIS_Pct":null,
    "Aliquota_COFINS_Pct":null,"Aliquota_IPI_pct":null
  }]
}]}`;

/**
 * Fecha um JSON cortado por `max_tokens` no fim do último objeto completo.
 * Duplicado de src/lib/cotacoes.ts (testado lá): o Deno não resolve os
 * imports transitivos de src/lib (./format, ../db/supabaseClient), então
 * importar o arquivo do app de dentro da Edge Function não funciona.
 */
function repararJsonTruncado(bruto: string): unknown {
  const ultimoFechado = bruto.lastIndexOf('}');
  if (ultimoFechado === -1) throw new ErroExtracao('RESPOSTA_TRUNCADA', 'Resposta da IA veio cortada antes do primeiro objeto completo.', 502);
  const prefixo = bruto.slice(0, ultimoFechado + 1);

  const pilha: string[] = [];
  let emString = false;
  let escapado = false;
  for (const c of prefixo) {
    if (escapado) { escapado = false; continue; }
    if (c === '\\') { escapado = true; continue; }
    if (c === '"') { emString = !emString; continue; }
    if (emString) continue;
    if (c === '{' || c === '[') pilha.push(c);
    else if (c === '}' || c === ']') pilha.pop();
  }

  const fecho = pilha.reverse().map((c) => (c === '{' ? '}' : ']')).join('');
  try {
    return JSON.parse(prefixo + fecho);
  } catch {
    throw new ErroExtracao('RESPOSTA_TRUNCADA', 'A resposta da IA estourou o limite de tokens e veio incompleta demais para recuperar.', 502);
  }
}

/** Alguns modelos retornam `content` como array de partes em vez de string. */
function extrairConteudo(message: any): string {
  const content = message?.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const texto = content.map((p: any) => (typeof p === 'string' ? p : p?.text ?? '')).join('');
    if (texto.trim()) return texto;
  }
  return '';
}

function normalizarEnvelope(parsed: any): any[] {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.propostas)) return parsed.propostas;
  throw new ErroExtracao('JSON_INVALIDO', 'JSON retornado não contém a lista "propostas".', 502);
}

function extrairJson(texto: string, truncado: boolean): any[] {
  const limpo = texto.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const inicioObj = limpo.indexOf('{');
  const inicioArr = limpo.indexOf('[');
  const inicio = inicioObj === -1 ? inicioArr : inicioArr === -1 ? inicioObj : Math.min(inicioObj, inicioArr);
  if (inicio === -1) throw new ErroExtracao('JSON_INVALIDO', 'A IA não retornou um JSON reconhecível.', 502);

  const fim = Math.max(limpo.lastIndexOf('}'), limpo.lastIndexOf(']'));
  const bruto = fim === -1 ? limpo.slice(inicio) : limpo.slice(inicio, fim + 1);

  try {
    return normalizarEnvelope(JSON.parse(bruto));
  } catch (err) {
    if (err instanceof ErroExtracao) throw err;
    try {
      return normalizarEnvelope(repararJsonTruncado(bruto));
    } catch (repErr) {
      if (repErr instanceof ErroExtracao) throw repErr;
      throw new ErroExtracao(
        truncado ? 'RESPOSTA_TRUNCADA' : 'JSON_INVALIDO',
        truncado
          ? 'A resposta da IA estourou o limite de tokens e veio incompleta demais para recuperar.'
          : `Não foi possível interpretar o JSON da IA: ${(repErr as Error).message}`,
        502,
      );
    }
  }
}

interface ResultadoProvedor {
  content: string;
  truncado: boolean;
  uso: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  custoUsd: number | null;
  modelo: string;
}

function comTimeout<T>(promise: Promise<T>, ms: number, rotulo: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ErroExtracao('PROVEDOR_TIMEOUT', `${rotulo} demorou mais que ${ms / 1000}s para responder.`, 504)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Provedor primário. Mesmas chaves/SDK já usados por
 * estruturar-cotacao/converter-markdown-ia neste projeto — `responseMimeType:
 * 'application/json'` faz o Gemini devolver JSON puro, sem cercas de código.
 */
async function chamarGemini(markdown: string, apiKey: string, rotulo: string): Promise<ResultadoProvedor> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction: SYSTEM_PROMPT });

  let resultado;
  try {
    resultado = await comTimeout(
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: markdown }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: MAX_TOKENS_RESPOSTA },
      }),
      TIMEOUT_GEMINI_MS,
      rotulo,
    );
  } catch (err) {
    if (err instanceof ErroExtracao) throw err;
    throw new ErroExtracao('PROVEDOR_INDISPONIVEL', `Falha ao chamar o Gemini (${rotulo}): ${(err as Error)?.message ?? err}`, 502);
  }

  const truncado = resultado.response.candidates?.[0]?.finishReason === 'MAX_TOKENS';
  const content = resultado.response.text();
  if (!content?.trim()) {
    throw new ErroExtracao(
      'RESPOSTA_VAZIA',
      truncado
        ? `O Gemini (${rotulo}) gastou todo o limite de tokens antes de escrever a resposta. Tente colar um trecho menor.`
        : `O Gemini (${rotulo}) não retornou conteúdo utilizável.`,
      502,
    );
  }

  const uso = resultado.response.usageMetadata;
  const promptTokens = uso?.promptTokenCount ?? 0;
  const completionTokens = uso?.candidatesTokenCount ?? 0;
  return {
    content,
    truncado,
    uso: uso ? { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: uso.totalTokenCount ?? 0 } : null,
    custoUsd: uso ? estimarCustoGeminiUsd(promptTokens, completionTokens) : null,
    modelo: `gemini:${GEMINI_MODEL}`,
  };
}

async function chamarChatCompletions(params: {
  url: string;
  apiKey: string;
  nomeProvedor: string;
  body: Record<string, unknown>;
  headersExtra?: Record<string, string>;
}): Promise<{ data: any; truncado: boolean; content: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let resposta: Response;
  try {
    resposta = await fetch(params.url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
        ...params.headersExtra,
      },
      body: JSON.stringify(params.body),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new ErroExtracao('PROVEDOR_TIMEOUT', `A ${params.nomeProvedor} demorou demais para responder. Tente colar um trecho menor.`, 504);
    throw new ErroExtracao('PROVEDOR_INDISPONIVEL', `Falha de rede ao chamar a ${params.nomeProvedor}: ${(e as Error).message}`, 502);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!resposta.ok) {
    const errData = await resposta.json().catch(() => ({}));
    const mensagem = errData?.error?.message || `${params.nomeProvedor} retornou HTTP ${resposta.status}.`;
    if (resposta.status === 429) throw new ErroExtracao('PROVEDOR_LIMITE', `${params.nomeProvedor} sobrecarregada, tente novamente em 1 minuto.`, 429);
    if (resposta.status >= 500) throw new ErroExtracao('PROVEDOR_INDISPONIVEL', mensagem, 502);
    throw new ErroExtracao('ERRO_INTERNO', mensagem, 500);
  }

  const data = await resposta.json();
  const choice = data.choices?.[0];
  const truncado = choice?.finish_reason === 'length';
  const content = extrairConteudo(choice?.message);

  if (!content) {
    throw new ErroExtracao(
      'RESPOSTA_VAZIA',
      truncado
        ? `A ${params.nomeProvedor} gastou todo o limite de tokens antes de escrever a resposta e não sobrou conteúdo. Tente colar um trecho menor.`
        : `A ${params.nomeProvedor} não retornou conteúdo utilizável.`,
      502,
    );
  }

  return { data, truncado, content };
}

/**
 * Segundo fallback (depois do Gemini). Modelo configurável via
 * OPENAI_MODEL (default "gpt-5.6-luna") — nome definido pelo usuário; não
 * validamos a existência do modelo aqui, um HTTP de erro da OpenAI já
 * dispara o próximo fallback. Usa `max_completion_tokens` (não
 * `max_tokens`) e omite `temperature`, como esperado pelos modelos mais
 * recentes da OpenAI.
 */
async function chamarOpenAI(markdown: string, apiKey: string): Promise<ResultadoProvedor> {
  const { data, truncado, content } = await chamarChatCompletions({
    url: 'https://api.openai.com/v1/chat/completions',
    apiKey,
    nomeProvedor: 'OpenAI',
    body: {
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: markdown },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: MAX_TOKENS_RESPOSTA,
    },
  });

  return {
    content,
    truncado,
    uso: data.usage
      ? {
          prompt_tokens: data.usage.prompt_tokens ?? 0,
          completion_tokens: data.usage.completion_tokens ?? 0,
          total_tokens: data.usage.total_tokens ?? 0,
        }
      : null,
    custoUsd: null,
    modelo: `openai:${OPENAI_MODEL}`,
  };
}

/** Primeiro fallback, entre o Gemini e a OpenAI. */
async function chamarOpenRouter(markdown: string, apiKey: string): Promise<ResultadoProvedor> {
  const { data, truncado, content } = await chamarChatCompletions({
    url: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey,
    nomeProvedor: 'OpenRouter',
    headersExtra: {
      'HTTP-Referer': Deno.env.get('SUPABASE_URL') ?? '',
      'X-Title': 'SISTEN Extração de Cotação',
    },
    body: {
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: markdown },
      ],
      temperature: 0,
      max_tokens: MAX_TOKENS_RESPOSTA,
      response_format: { type: 'json_object' },
      // Modelos de raciocínio gastam parte do max_tokens "pensando" antes
      // de escrever a resposta final — em entradas grandes isso já
      // consumia o limite inteiro e a resposta chegava sem `content`.
      reasoning: { enabled: false },
      usage: { include: true },
    },
  });

  return {
    content,
    truncado,
    uso: data.usage
      ? {
          prompt_tokens: data.usage.prompt_tokens ?? 0,
          completion_tokens: data.usage.completion_tokens ?? 0,
          total_tokens: data.usage.total_tokens ?? 0,
        }
      : null,
    custoUsd: typeof data.usage?.cost === 'number' ? data.usage.cost : null,
    modelo: `openrouter:${OPENROUTER_MODEL}`,
  };
}

/** Gemini é o provedor primário (duas chaves); falhando as duas, cai para OpenRouter e, por último, para OpenAI. */
async function extrairComFallback(
  markdown: string,
  geminiKey1: string | undefined,
  geminiKey2: string | undefined,
  openrouterKey: string | undefined,
  openaiKey: string | undefined,
): Promise<ResultadoProvedor> {
  const erros: string[] = [];

  if (geminiKey1) {
    try {
      return await chamarGemini(markdown, geminiKey1, 'Gemini Key 1');
    } catch (e) {
      const erro = e instanceof ErroExtracao ? e : new ErroExtracao('ERRO_INTERNO', e instanceof Error ? e.message : String(e), 500);
      erros.push(`Gemini Key 1 (${erro.codigo}): ${erro.message}`);
      console.error('Gemini Key 1 falhou, tentando Gemini Key 2:', erro.message);
    }
  }

  if (geminiKey2) {
    try {
      return await chamarGemini(markdown, geminiKey2, 'Gemini Key 2');
    } catch (e) {
      const erro = e instanceof ErroExtracao ? e : new ErroExtracao('ERRO_INTERNO', e instanceof Error ? e.message : String(e), 500);
      erros.push(`Gemini Key 2 (${erro.codigo}): ${erro.message}`);
      console.error('Gemini Key 2 falhou, tentando OpenRouter:', erro.message);
    }
  }

  if (openrouterKey) {
    try {
      return await chamarOpenRouter(markdown, openrouterKey);
    } catch (e) {
      const erro = e instanceof ErroExtracao ? e : new ErroExtracao('ERRO_INTERNO', e instanceof Error ? e.message : String(e), 500);
      erros.push(`OpenRouter (${erro.codigo}): ${erro.message}`);
      console.error('OpenRouter falhou, tentando OpenAI:', erro.message);
    }
  }

  if (openaiKey) {
    try {
      return await chamarOpenAI(markdown, openaiKey);
    } catch (e) {
      const erro = e instanceof ErroExtracao ? e : new ErroExtracao('ERRO_INTERNO', e instanceof Error ? e.message : String(e), 500);
      erros.push(`OpenAI (${erro.codigo}): ${erro.message}`);
    }
  }

  throw new ErroExtracao(
    'PROVEDOR_INDISPONIVEL',
    erros.length ? erros.join(' | ') : 'Nenhum provedor de IA configurado.',
    502,
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const inicio = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiKey1 = Deno.env.get('GEMINI_API_KEY') || undefined;
  const geminiKey2 = Deno.env.get('GEMINI_API_KEY_2') || undefined;
  const openaiKey = Deno.env.get('OPENAI_API_KEY') || undefined;
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY') || undefined;

  // Cliente "como o usuário": herda o JWT do request, então toda leitura
  // (inclusive o rpc de autorização abaixo) respeita a RLS normalmente.
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  // Cliente à parte, só para o log de custo — nunca toca nas tabelas de cotação.
  const supabaseService = createClient(supabaseUrl, serviceKey);

  let userId: string | null = null;
  let userName: string | null = null;
  let processoId: string | null = null;
  let charsEntrada = 0;

  const registrarExtracao = async (dados: Record<string, unknown>) => {
    try {
      await supabaseService.from('cotacao_extracoes').insert({
        processo_id: processoId,
        user_id: userId,
        user_name: userName,
        chars_entrada: charsEntrada,
        duracao_ms: Date.now() - inicio,
        ...dados,
      });
    } catch (e) {
      console.error('Falha ao gravar cotacao_extracoes:', e);
    }
  };

  try {
    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) throw new ErroExtracao('NAO_AUTENTICADO', 'Sessão inválida ou expirada.', 401);
    userId = userData.user.id;
    userName = (userData.user.user_metadata?.name as string) ?? userData.user.email ?? null;

    const { data: pode, error: erroPode } = await supabaseUser.rpc('pode_gerir_cotacoes');
    if (erroPode || pode !== true) throw new ErroExtracao('SEM_PERMISSAO', 'Seu perfil não pode extrair cotações.', 403);

    if (!geminiKey1 && !geminiKey2 && !openrouterKey && !openaiKey) throw new ErroExtracao('CONFIG_AUSENTE', 'IA não configurada neste ambiente.', 500);

    const body = await req.json().catch(() => ({}));
    const markdown = typeof body?.markdown === 'string' ? body.markdown : '';
    processoId = typeof body?.processo_id === 'string' ? body.processo_id : null;
    const arquivoOrigem = typeof body?.arquivo_origem === 'string' ? body.arquivo_origem : null;
    charsEntrada = markdown.length;

    if (markdown.trim().length < 50) throw new ErroExtracao('ENTRADA_VAZIA', 'Cole o markdown da cotação antes de processar.', 400);
    if (markdown.length > MAX_CHARS) {
      throw new ErroExtracao('ENTRADA_GRANDE', `Cole um documento por vez (máximo de ${(MAX_CHARS / 1000).toFixed(0)} mil caracteres).`, 413);
    }

    const resultado = await extrairComFallback(markdown, geminiKey1, geminiKey2, openrouterKey, openaiKey);

    const propostas = extrairJson(resultado.content, resultado.truncado).map((p: any) => ({ ...p, Arquivo_Origem: p?.Arquivo_Origem ?? arquivoOrigem }));
    const totalItens = propostas.reduce((acc: number, p: any) => acc + (Array.isArray(p.itens) ? p.itens.length : 0), 0);

    let extracaoId: string | null = null;
    try {
      const { data: inserido } = await supabaseService
        .from('cotacao_extracoes')
        .insert({
          processo_id: processoId,
          user_id: userId,
          user_name: userName,
          modelo: resultado.modelo,
          chars_entrada: charsEntrada,
          prompt_tokens: resultado.uso?.prompt_tokens ?? null,
          completion_tokens: resultado.uso?.completion_tokens ?? null,
          total_tokens: resultado.uso?.total_tokens ?? null,
          custo_usd: resultado.custoUsd,
          duracao_ms: Date.now() - inicio,
          truncado: resultado.truncado,
          sucesso: true,
          propostas_extraidas: propostas.length,
          itens_extraidos: totalItens,
        })
        .select('id')
        .single();
      extracaoId = inserido?.id ?? null;
    } catch (e) {
      console.error('Falha ao gravar cotacao_extracoes:', e);
    }

    return json({
      propostas,
      uso: resultado.uso,
      modelo: resultado.modelo,
      truncado: resultado.truncado,
      extracao_id: extracaoId,
      duracao_ms: Date.now() - inicio,
    });
  } catch (e) {
    const erro = e instanceof ErroExtracao ? e : new ErroExtracao('ERRO_INTERNO', e instanceof Error ? e.message : String(e), 500);
    // Erros de auth/entrada (antes de saber se vale a pena logar) não geram
    // linha de custo; falhas do provedor em diante, sim — é o que dá visão
    // de quanto o modelo está falhando, não só quanto está custando.
    if (!['NAO_AUTENTICADO', 'SEM_PERMISSAO', 'ENTRADA_VAZIA', 'ENTRADA_GRANDE', 'CONFIG_AUSENTE'].includes(erro.codigo)) {
      await registrarExtracao({ sucesso: false, erro_codigo: erro.codigo, erro_mensagem: erro.message });
    }
    return erroResponse(erro);
  }
});
