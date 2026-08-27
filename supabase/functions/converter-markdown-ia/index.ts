/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Edge Function "converter-markdown-ia" — OCR/transcrição fiel de PDF e
 * imagem para Markdown (GFM). Complementa a conversão client-side de
 * planilha/JSON/XML (sem IA, sem custo) feita em src/lib/markdownConvert.ts
 * — esta função só entra quando o formato exige entender visualmente um
 * arquivo (PDF, inclusive escaneado, ou imagem).
 *
 * Provedor primário: Gemini (GEMINI_API_KEY, com GEMINI_API_KEY_2 como
 * segunda tentativa) — suporta PDF nativo via `inlineData`, sem precisar
 * renderizar página por página no cliente. Mesmas chaves e SDK já usados
 * por `estruturar-cotacao` neste projeto. Fallback: OpenRouter, quando o
 * Gemini falha ou não está configurado.
 *
 * Auth: mesmo padrão de `extrair-cotacao` — JWT do chamador + RPC
 * `pode_gerir_cotacoes()`, a mesma usada nas policies de cotação (esta
 * conversão alimenta o mesmo fluxo).
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash';
// Modelo específico para o fallback de visão: o OPENROUTER_MODEL usado por
// extrair-cotacao/estruturar-cotacao (deepseek) é só-texto, não serve aqui.
const OPENROUTER_VISION_MODEL = Deno.env.get('OPENROUTER_VISION_MODEL') || 'google/gemini-2.5-flash';

const TIMEOUT_GEMINI_MS = 45_000;
const TIMEOUT_OPENROUTER_MS = 100_000;
/** Teto do arquivo bruto (antes de base64). Acima disso o payload da Edge
 * Function e o limite de mídia inline do Gemini ficam arriscados. */
const MAX_BYTES_ARQUIVO = 10 * 1024 * 1024;

const MIME_AUTORIZADOS = ['application/pdf'];
const ehImagemAutorizada = (m: string) => m.startsWith('image/');

/**
 * Preço por 1M de tokens (USD) — só para dar uma estimativa de custo na
 * tela, não é fonte oficial de cobrança. Cobre os modelos Flash usados por
 * padrão aqui; modelo fora da tabela devolve `null` (a tela mostra "—" em
 * vez de arriscar um número errado). Conferir a tabela oficial do provedor
 * se o valor mostrado parecer estranho.
 */
const PRECO_POR_1M_TOKENS: Record<string, { entrada: number; saida: number }> = {
  'gemini-2.0-flash': { entrada: 0.10, saida: 0.40 },
  'gemini-flash-latest': { entrada: 0.10, saida: 0.40 },
  'gemini-1.5-flash': { entrada: 0.075, saida: 0.30 },
};

function estimarCustoUsd(modeloBase: string, promptTokens: number, completionTokens: number): number | null {
  // Cai para a tarifa "flash" genérica em modelos fora da tabela (ex.: uma
  // geração mais nova do Gemini Flash ainda não catalogada aqui) — preço de
  // tier Flash costuma se manter na mesma ordem de grandeza entre gerações.
  const preco = PRECO_POR_1M_TOKENS[modeloBase] ?? (modeloBase.includes('flash') ? PRECO_POR_1M_TOKENS['gemini-2.0-flash'] : undefined);
  if (!preco) return null;
  return (promptTokens / 1_000_000) * preco.entrada + (completionTokens / 1_000_000) * preco.saida;
}

type ErroCodigo =
  | 'NAO_AUTENTICADO' | 'SEM_PERMISSAO' | 'ENTRADA_INVALIDA' | 'ARQUIVO_GRANDE'
  | 'CONFIG_AUSENTE' | 'PROVEDOR_LIMITE' | 'PROVEDOR_INDISPONIVEL'
  | 'PROVEDOR_TIMEOUT' | 'RESPOSTA_VAZIA' | 'ERRO_INTERNO';

class ErroConversao extends Error {
  constructor(public codigo: ErroCodigo, message: string, public status: number) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const erroResponse = (e: ErroConversao) => json({ erro: { codigo: e.codigo, mensagem: e.message } }, e.status);

const PROMPT_SISTEMA = `Você converte o conteúdo de um arquivo (PDF ou imagem) para Markdown GFM fiel e completo — a Etapa 1 de um pipeline de cotações industriais que alimenta uma extração de dados automatizada depois. A fidelidade do texto importa mais que qualquer formatação bonita.

REGRAS RÍGIDAS
- Proibido resumir, cortar, sintetizar ou omitir qualquer seção, linha, célula ou palavra do documento. Transcreva tudo.
- Tabelas: sintaxe GFM rigorosa ("| Col1 | Col2 |" com linha separadora "| --- | --- |"), uma linha de markdown por linha da tabela original — nunca agrupe, nunca resuma, nunca invente linha de subtotal que não exista no original.
- Preserve a hierarquia do documento com headings ("#", "##", "###"...) na mesma ordem e nível do original.
- PDF com mais de uma página: separe o conteúdo de cada página com "## Página N" (N = número da página, 1-indexado) — a menos que uma tabela atravesse páginas, caso em que ela pode continuar sem quebra.
- Imagem (foto, print, scan avulso): depois da transcrição contínua de todo texto visível, adicione ao final uma seção "## Descrição Visual" com uma descrição objetiva do que a imagem mostra (layout, diagramas, fotos, carimbos, assinaturas, logotipos). Omita essa seção só se a imagem for puramente texto/tabela, sem nenhum elemento visual relevante.
- Números, datas, códigos: transcreva exatamente como aparecem no documento, sem reformatar, sem converter unidade.
- Trecho ilegível: marque como "[ilegível]" em vez de inventar ou pular.

Responda SOMENTE com o Markdown resultante — sem comentário antes ou depois, sem envolver a resposta inteira num bloco de código.`;

/** Remove um bloco de código que envolva a resposta inteira — hábito comum de LLM apesar da instrução em contrário. Nunca mexe em blocos legítimos no meio do conteúdo. */
function limparEnvelope(texto: string): string {
  const t = texto.trim();
  const linhas = t.split('\n');
  if (linhas.length > 1 && /^```(markdown)?$/i.test(linhas[0].trim()) && linhas[linhas.length - 1].trim() === '```') {
    return linhas.slice(1, -1).join('\n').trim();
  }
  return t;
}

function comTimeout<T>(promise: Promise<T>, ms: number, rotulo: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ErroConversao('PROVEDOR_TIMEOUT', `${rotulo} demorou mais que ${ms / 1000}s para responder.`, 504)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

interface ResultadoProvedor {
  markdown: string;
  uso: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  custoUsd: number | null;
  modelo: string;
}

async function chamarGemini(mimeType: string, base64: string, nomeArquivo: string, apiKey: string, rotulo: string): Promise<ResultadoProvedor> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction: PROMPT_SISTEMA });

  let resultado;
  try {
    resultado = await comTimeout(
      model.generateContent({
        contents: [{
          role: 'user',
          parts: [
            { text: `Arquivo: ${nomeArquivo}` },
            { inlineData: { mimeType, data: base64 } },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
      TIMEOUT_GEMINI_MS,
      rotulo,
    );
  } catch (err) {
    if (err instanceof ErroConversao) throw err;
    throw new ErroConversao('PROVEDOR_INDISPONIVEL', `Falha ao chamar o Gemini (${rotulo}): ${(err as Error)?.message ?? err}`, 502);
  }

  const texto = resultado.response.text();
  if (!texto?.trim()) throw new ErroConversao('RESPOSTA_VAZIA', `O Gemini (${rotulo}) não retornou conteúdo utilizável.`, 502);

  const uso = resultado.response.usageMetadata;
  const promptTokens = uso?.promptTokenCount ?? 0;
  const completionTokens = uso?.candidatesTokenCount ?? 0;
  return {
    markdown: limparEnvelope(texto),
    uso: uso ? { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: uso.totalTokenCount ?? 0 } : null,
    custoUsd: uso ? estimarCustoUsd(GEMINI_MODEL, promptTokens, completionTokens) : null,
    modelo: `gemini:${GEMINI_MODEL}`,
  };
}

/**
 * Fallback quando o Gemini não está configurado ou falha nas duas chaves.
 * Modelo/via de visão de terceiros — risco maior de o parâmetro de arquivo
 * mudar entre versões da API da OpenRouter do que o caminho primário
 * (Gemini, já provado em produção por `estruturar-cotacao`).
 */
async function chamarOpenRouter(mimeType: string, base64: string, nomeArquivo: string): Promise<ResultadoProvedor> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) throw new ErroConversao('CONFIG_AUSENTE', 'Nenhum provedor de IA disponível.', 500);

  const parteArquivo = mimeType === 'application/pdf'
    ? { type: 'file', file: { filename: nomeArquivo, file_data: `data:${mimeType};base64,${base64}` } }
    : { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } };

  let resposta: Response;
  try {
    resposta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('SUPABASE_URL') ?? '',
        'X-Title': 'SISTEN Conversor Markdown',
      },
      body: JSON.stringify({
        model: OPENROUTER_VISION_MODEL,
        messages: [
          { role: 'system', content: PROMPT_SISTEMA },
          { role: 'user', content: [{ type: 'text', text: `Arquivo: ${nomeArquivo}` }, parteArquivo] },
        ],
        temperature: 0,
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(TIMEOUT_OPENROUTER_MS),
    });
  } catch (err) {
    throw new ErroConversao('PROVEDOR_INDISPONIVEL', `Falha de rede ao chamar a OpenRouter: ${(err as Error)?.message ?? err}`, 502);
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    if (resposta.status === 429) throw new ErroConversao('PROVEDOR_LIMITE', 'OpenRouter sobrecarregada, tente novamente em 1 minuto.', 429);
    throw new ErroConversao('PROVEDOR_INDISPONIVEL', `OpenRouter respondeu ${resposta.status}: ${detalhe.slice(0, 300)}`, 502);
  }

  const dados = await resposta.json();
  const texto = dados?.choices?.[0]?.message?.content;
  const conteudo = typeof texto === 'string' ? texto : Array.isArray(texto) ? texto.map((p: any) => p?.text ?? '').join('') : '';
  if (!conteudo?.trim()) throw new ErroConversao('RESPOSTA_VAZIA', 'A OpenRouter não retornou conteúdo utilizável.', 502);

  return {
    markdown: limparEnvelope(conteudo),
    uso: dados.usage
      ? { prompt_tokens: dados.usage.prompt_tokens ?? 0, completion_tokens: dados.usage.completion_tokens ?? 0, total_tokens: dados.usage.total_tokens ?? 0 }
      : null,
    // Custo real cobrado pela OpenRouter (não uma estimativa) quando `usage.include: true` devolve `cost`.
    custoUsd: typeof dados.usage?.cost === 'number' ? dados.usage.cost : null,
    modelo: `openrouter:${OPENROUTER_VISION_MODEL}`,
  };
}

async function converterComFallback(mimeType: string, base64: string, nomeArquivo: string): Promise<ResultadoProvedor> {
  const geminiKey1 = Deno.env.get('GEMINI_API_KEY');
  const geminiKey2 = Deno.env.get('GEMINI_API_KEY_2');
  const erros: string[] = [];

  if (geminiKey1) {
    try {
      return await chamarGemini(mimeType, base64, nomeArquivo, geminiKey1, 'Gemini Key 1');
    } catch (err) {
      const e = err instanceof ErroConversao ? err : new ErroConversao('ERRO_INTERNO', String((err as Error)?.message ?? err), 500);
      erros.push(`Gemini Key 1 (${e.codigo}): ${e.message}`);
    }
  }
  if (geminiKey2) {
    try {
      return await chamarGemini(mimeType, base64, nomeArquivo, geminiKey2, 'Gemini Key 2');
    } catch (err) {
      const e = err instanceof ErroConversao ? err : new ErroConversao('ERRO_INTERNO', String((err as Error)?.message ?? err), 500);
      erros.push(`Gemini Key 2 (${e.codigo}): ${e.message}`);
    }
  }
  try {
    return await chamarOpenRouter(mimeType, base64, nomeArquivo);
  } catch (err) {
    const e = err instanceof ErroConversao ? err : new ErroConversao('ERRO_INTERNO', String((err as Error)?.message ?? err), 500);
    erros.push(`OpenRouter (${e.codigo}): ${e.message}`);
  }

  throw new ErroConversao('PROVEDOR_INDISPONIVEL', erros.length ? erros.join(' | ') : 'Nenhum provedor de IA configurado.', 502);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const inicio = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const supabaseService = createClient(supabaseUrl, serviceKey);

  let userId: string | null = null;
  let userName: string | null = null;
  let nomeArquivo = 'arquivo';
  let mimeType = '';

  try {
    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) throw new ErroConversao('NAO_AUTENTICADO', 'Sessão inválida ou expirada.', 401);
    userId = userData.user.id;
    userName = (userData.user.user_metadata?.name as string) ?? userData.user.email ?? null;

    const { data: pode, error: erroPode } = await supabaseUser.rpc('pode_gerir_cotacoes');
    if (erroPode || pode !== true) throw new ErroConversao('SEM_PERMISSAO', 'Seu perfil não pode converter arquivos com IA.', 403);

    const body = await req.json().catch(() => ({}));
    nomeArquivo = typeof body?.nome_arquivo === 'string' ? body.nome_arquivo : 'arquivo';
    mimeType = typeof body?.mime_type === 'string' ? body.mime_type : '';
    const base64 = typeof body?.conteudo_base64 === 'string' ? body.conteudo_base64 : '';

    if (!base64 || !(MIME_AUTORIZADOS.includes(mimeType) || ehImagemAutorizada(mimeType))) {
      throw new ErroConversao('ENTRADA_INVALIDA', 'Envie um PDF ou imagem em base64.', 400);
    }
    // base64 tem ~4/3 do tamanho do arquivo original.
    if (base64.length > (MAX_BYTES_ARQUIVO * 4) / 3) {
      throw new ErroConversao('ARQUIVO_GRANDE', `Arquivo acima de ${(MAX_BYTES_ARQUIVO / (1024 * 1024)).toFixed(0)} MB — reduza o tamanho antes de enviar.`, 413);
    }

    const resultado = await converterComFallback(mimeType, base64, nomeArquivo);
    const formato = mimeType === 'application/pdf' ? 'pdf' : 'imagem';

    try {
      await supabaseService.from('ops_conversoes_markdown').insert({
        user_id: userId,
        user_name: userName,
        nome_arquivo: nomeArquivo,
        formato,
        tamanho_bytes: Math.round((base64.length * 3) / 4),
        via: 'ia',
        modelo: resultado.modelo,
        caracteres: resultado.markdown.length,
        tokens: resultado.uso?.total_tokens ?? null,
        tokens_reais: resultado.uso != null,
        custo_usd: resultado.custoUsd,
        duracao_ms: Date.now() - inicio,
        sucesso: true,
        markdown: resultado.markdown,
      });
    } catch (e) {
      console.error('Falha ao gravar conversoes_markdown (converter-markdown-ia):', e);
    }

    return json({
      markdown: resultado.markdown,
      uso: resultado.uso,
      custo_usd: resultado.custoUsd,
      modelo: resultado.modelo,
      duracao_ms: Date.now() - inicio,
    });
  } catch (e) {
    const erro = e instanceof ErroConversao ? e : new ErroConversao('ERRO_INTERNO', e instanceof Error ? e.message : String(e), 500);
    // Erros de auth/entrada (antes de saber se vale a pena logar) não geram
    // linha de histórico — não houve tentativa real de converter nada.
    if (!['NAO_AUTENTICADO', 'SEM_PERMISSAO', 'ENTRADA_INVALIDA'].includes(erro.codigo)) {
      try {
        await supabaseService.from('ops_conversoes_markdown').insert({
          user_id: userId,
          user_name: userName,
          nome_arquivo: nomeArquivo,
          formato: mimeType === 'application/pdf' ? 'pdf' : 'imagem',
          via: 'ia',
          duracao_ms: Date.now() - inicio,
          sucesso: false,
          erro_mensagem: `${erro.codigo}: ${erro.message}`,
        });
      } catch (logErr) {
        console.error('Falha ao gravar conversoes_markdown (erro):', logErr);
      }
    }
    return erroResponse(erro);
  }
});
