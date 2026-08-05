/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Edge Function "extrair-cotacao" — recebe o storage_path de um documento de
 * cotação (PDF ou planilha), converte para texto/Markdown em TypeScript
 * (mesma lógica do MarkItDown, sem depender de um serviço Python separado:
 * planilhas via SheetJS, PDFs via extração de texto nativo com fallback
 * multimodal para PDFs escaneados) e manda esse texto pedindo um JSON
 * estruturado com os itens da proposta. Gemini é o provedor primário;
 * OpenRouter é usado como fallback quando o Gemini não está configurado ou
 * falha (ver `chamarProvedorIA`).
 *
 * Erros nunca derrubam a requisição com 500 — sempre voltam 200 com
 * `{ ok: false, error, ... }`, porque a tela de revisão precisa de um
 * caminho de preenchimento manual mesmo quando a extração falha (o módulo
 * tem que funcionar com zero IA).
 *
 * NOTA (versionamento retroativo — ver docs/superpowers/specs do módulo de
 * análise de cotações): este arquivo foi recuperado do deploy (v17) via MCP
 * `get_edge_function`, pois o código não estava versionado no repositório.
 * `extrair-cotacao` era o fluxo antigo (upload de PDF, extraído no server).
 * O fluxo atual do módulo usa `estruturar-cotacao` (markdown já colado pelo
 * comprador) — este arquivo fica preservado por compatibilidade, mas não é
 * mais o caminho principal.
 *
 * ⚠️ SEGURANÇA: este arquivo, como recuperado do deploy, contém chaves de
 * API reais embutidas como fallback (`DEFAULT_GEMINI_KEY`,
 * `DEFAULT_GEMINI_KEY_2`, `DEFAULT_OPENROUTER_KEY`). Isso é uma falha de
 * segurança — as chaves devem vir só de `Deno.env.get(...)` (secrets do
 * projeto), nunca de um literal no código-fonte. Recomendado: rotacionar as
 * três chaves e remover os defaults, lançando erro explícito quando o
 * secret não estiver configurado (é o que `estruturar-cotacao` já faz
 * corretamente). Não removido aqui para manter o registro fiel do que está
 * em produção; ver nota de segurança no plano do módulo.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import * as XLSX from 'npm:xlsx@0.18.5';
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1';
import { OpenRouter } from 'npm:@openrouter/sdk';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

const ATTACHMENTS_BUCKET = 'request-attachments';
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.0-flash';
const OPENROUTER_MODEL = Deno.env.get('OPENROUTER_MODEL') || 'deepseek/deepseek-v4-flash';
const CONFIANCA_MINIMA_AVISO = 0.5;

const DEFAULT_GEMINI_KEY = '';
const DEFAULT_GEMINI_KEY_2 = '';
const DEFAULT_OPENROUTER_KEY = '';

interface ExtracaoRequestBody {
  documento_id: string;
  storage_path: string;
  mime_type: string;
  fornecedor_hint?: string;
}

const PROMPT_SISTEMA = `Você é um assistente especializado em ler cotações de fornecedores de materiais industriais no Brasil e extrair os dados em JSON estruturado. Responda SOMENTE com o JSON, sem texto antes ou depois, seguindo exatamente este formato:
{
  "fornecedor": { "nome_extraido": string, "cnpj_extraido": string|null, "uf_extraido": string|null },
  "data_cotacao": string|null,
  "condicao_pagamento_texto": string|null,
  "prazo_entrega_texto": string|null,
  "frete_texto": string|null,
  "itens": [{
    "linha_ordem": number, "descricao_bruta": string, "unidade": string|null, "quantidade": number|null,
    "preco_unitario_bruto": number|null, "desconto": number|null, "ipi_percentual": number|null, "ipi_valor": number|null,
    "icms_percentual": number|null, "st_declarado": boolean, "st_valor": number|null,
    "marca": string|null, "observacoes": string|null,
    "possivel_kit": boolean, "kit_grupo_sugerido": string|null, "confianca_extracao": number
  }],
  "avisos": string[]
}
Marque "possivel_kit": true quando várias linhas parecerem partes de um mesmo kit/conjunto (descrições parecidas, quantidade 1, ou menção a "kit"/"conjunto"). "confianca_extracao" é sua auto-avaliação de 0 a 1 para cada item.`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  let body: ExtracaoRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'extraction_failed', detail: 'Corpo da requisição inválido.' });
  }

  const { documento_id, storage_path, mime_type, fornecedor_hint } = body;
  if (!documento_id || !storage_path) {
    return jsonResponse({ ok: false, error: 'extraction_failed', detail: 'documento_id e storage_path são obrigatórios.' });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  await supabase.from('cotacao_documento').update({ extraction_status: 'processando' }).eq('id', documento_id);

  try {
    const { data: arquivo, error: downloadErr } = await supabase.storage.from(ATTACHMENTS_BUCKET).download(storage_path);
    if (downloadErr || !arquivo) {
      throw new ExtracaoErro('unreadable_file', `Não foi possível baixar o arquivo do Storage: ${downloadErr?.message ?? 'desconhecido'}`);
    }
    const bytes = new Uint8Array(await arquivo.arrayBuffer());

    const { texto, metodo, precisaFallbackMultimodal } = await converterParaTexto(bytes, mime_type, storage_path);

    await supabase.from('cotacao_documento').update({
      texto_convertido: texto || null,
      conversao_metodo: metodo,
    }).eq('id', documento_id);

    const { resposta: resultado, modeloUsado } = await chamarProvedorIA({ texto, bytes, mimeType: mime_type, precisaFallbackMultimodal, fornecedorHint: fornecedor_hint });

    const mediaConfianca = resultado.itens.length > 0
      ? resultado.itens.reduce((soma, i) => soma + (i.confianca_extracao ?? 0), 0) / resultado.itens.length
      : 1;
    if (mediaConfianca < CONFIANCA_MINIMA_AVISO) {
      resultado.avisos = [...(resultado.avisos || []), 'Confiança média da extração baixa — revisão cuidadosa recomendada.'];
    }

    await supabase.from('cotacao_documento').update({
      extraction_status: 'extraido',
      extraction_raw_json: resultado,
      extraction_model: modeloUsado,
      extraction_error: null,
      data_cotacao: resultado.data_cotacao || null,
    }).eq('id', documento_id);

    return jsonResponse({ ok: true, ...resultado });
  } catch (err) {
    const erro = err instanceof ExtracaoErro ? err : new ExtracaoErro('provider_error', String((err as Error)?.message ?? err));
    await supabase.from('cotacao_documento').update({
      extraction_status: 'erro',
      extraction_error: erro.detail,
    }).eq('id', documento_id);
    return jsonResponse({ ok: false, error: erro.tipo, detail: erro.detail });
  }
});

class ExtracaoErro extends Error {
  constructor(public tipo: 'extraction_failed' | 'unreadable_file' | 'provider_error', public detail: string) {
    super(detail);
  }
}

/**
 * Lógica de conversão estilo MarkItDown, em TypeScript/Deno — planilhas viram
 * tabela Markdown determinística (sem a IA "adivinhar" colunas); PDFs tentam
 * extração de texto nativo primeiro (a maioria dos PDFs de fornecedor não é
 * escaneada) e só caem para o fallback multimodal quando não há texto.
 */
async function converterParaTexto(
  bytes: Uint8Array,
  mimeType: string,
  storagePath: string,
): Promise<{ texto: string; metodo: 'pdf_texto' | 'pdf_multimodal_fallback' | 'xlsx_tabela'; precisaFallbackMultimodal: boolean }> {
  const ehPlanilha = mimeType.includes('spreadsheet') || mimeType.includes('csv') || /\.(xlsx|xls|csv)$/i.test(storagePath);

  if (ehPlanilha) {
    const workbook = XLSX.read(bytes, { type: 'array' });
    const partes = workbook.SheetNames.map(nome => {
      const planilha = workbook.Sheets[nome];
      return `## ${nome}\n\n${XLSX.utils.sheet_to_csv(planilha)}`;
    });
    return { texto: partes.join('\n\n'), metodo: 'xlsx_tabela', precisaFallbackMultimodal: false };
  }

  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const textoLimpo = (text || '').trim();
    if (textoLimpo.length >= 50) {
      return { texto: textoLimpo, metodo: 'pdf_texto', precisaFallbackMultimodal: false };
    }
    return { texto: textoLimpo, metodo: 'pdf_multimodal_fallback', precisaFallbackMultimodal: true };
  } catch {
    return { texto: '', metodo: 'pdf_multimodal_fallback', precisaFallbackMultimodal: true };
  }
}

interface ItemExtraidoResposta {
  linha_ordem: number;
  descricao_bruta: string;
  unidade?: string | null;
  quantidade?: number | null;
  preco_unitario_bruto?: number | null;
  desconto?: number | null;
  ipi_percentual?: number | null;
  ipi_valor?: number | null;
  icms_percentual?: number | null;
  st_declarado?: boolean;
  st_valor?: number | null;
  marca?: string | null;
  observacoes?: string | null;
  possivel_kit: boolean;
  kit_grupo_sugerido?: string | null;
  confianca_extracao: number;
}

interface RespostaExtracao {
  fornecedor?: { nome_extraido?: string; cnpj_extraido?: string | null; uf_extraido?: string | null };
  data_cotacao?: string | null;
  condicao_pagamento_texto?: string | null;
  prazo_entrega_texto?: string | null;
  frete_texto?: string | null;
  itens: ItemExtraidoResposta[];
  avisos?: string[];
}

interface ChamadaIAParams {
  texto: string;
  bytes: Uint8Array;
  mimeType: string;
  precisaFallbackMultimodal: boolean;
  fornecedorHint?: string;
}

/**
 * Despacha para o provedor de IA configurado: Gemini (Key 1 e Key 2) são primários,
 * OpenRouter é o fallback (usando deepseek/deepseek-v4-flash).
 */
async function chamarProvedorIA(params: ChamadaIAParams): Promise<{ resposta: RespostaExtracao; modeloUsado: string }> {
  const geminiKey1 = Deno.env.get('GEMINI_API_KEY') || DEFAULT_GEMINI_KEY;
  const geminiKey2 = Deno.env.get('GEMINI_API_KEY_2') || DEFAULT_GEMINI_KEY_2;
  const errosGemini: string[] = [];

  if (geminiKey1) {
    try {
      const resposta = await chamarGemini(params, geminiKey1);
      return { resposta, modeloUsado: `gemini:${GEMINI_MODEL}` };
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      errosGemini.push(`Gemini Key 1: ${msg}`);
      console.error('Gemini Key 1 falhou, tentando Gemini Key 2:', msg);
    }
  }

  if (geminiKey2) {
    try {
      const resposta = await chamarGemini(params, geminiKey2);
      return { resposta, modeloUsado: `gemini-key2:${GEMINI_MODEL}` };
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      errosGemini.push(`Gemini Key 2: ${msg}`);
      console.error('Gemini Key 2 falhou, tentando fallback via OpenRouter:', msg);
    }
  }

  try {
    const resposta = await chamarOpenRouter(params);
    return { resposta, modeloUsado: `openrouter:${OPENROUTER_MODEL}` };
  } catch (err) {
    const erroOpenRouter = (err as Error)?.message ?? String(err);
    const partes = [...errosGemini, `OpenRouter: ${erroOpenRouter}`].filter(Boolean);
    throw new ExtracaoErro('provider_error', partes.join(' | '));
  }
}

function montarPartesUsuario(params: ChamadaIAParams, contextoTexto: string) {
  if (params.precisaFallbackMultimodal) {
    return {
      texto: `${contextoTexto}Leia o documento anexo (cotação de fornecedor) e extraia os itens.`,
      base64: base64Encode(params.bytes),
    };
  }
  return { texto: `${contextoTexto}Texto extraído da cotação do fornecedor:\n\n${params.texto}`, base64: null };
}

/** Google Gemini via SDK oficial (`@google/generative-ai`) — provedor primário. */
async function chamarGemini(params: ChamadaIAParams, apiKey: string): Promise<RespostaExtracao> {
  const contextoTexto = params.fornecedorHint ? `Fornecedor informado pelo comprador: ${params.fornecedorHint}\n\n` : '';
  const { texto, base64 } = montarPartesUsuario(params, contextoTexto);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction: PROMPT_SISTEMA });

  const parts: unknown[] = [{ text: texto }];
  if (base64) parts.push({ inlineData: { mimeType: params.mimeType, data: base64 } });

  let resultado;
  try {
    resultado = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
  } catch (err) {
    throw new ExtracaoErro('provider_error', `Falha ao chamar o Gemini: ${(err as Error)?.message ?? err}`);
  }

  const conteudo = resultado.response.text();
  return parsearRespostaJson(conteudo);
}

/** OpenRouter via SDK oficial (`@openrouter/sdk`) — fallback quando o Gemini não está configurado ou falha. */
async function chamarOpenRouter(params: ChamadaIAParams): Promise<RespostaExtracao> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY') || DEFAULT_OPENROUTER_KEY;
  if (!apiKey) throw new ExtracaoErro('provider_error', 'Nenhum provedor de IA disponível: GEMINI_API_KEY e OPENROUTER_API_KEY não configurados nos secrets da função.');

  const contextoTexto = params.fornecedorHint ? `Fornecedor informado pelo comprador: ${params.fornecedorHint}\n\n` : '';
  const { texto, base64 } = montarPartesUsuario(params, contextoTexto);

  const userContent: unknown[] = [{ type: 'text', text: texto }];
  if (base64) userContent.push({ type: 'image_url', image_url: { url: `data:${params.mimeType};base64,${base64}` } });

  const openrouter = new OpenRouter({ apiKey });

  let resposta;
  try {
    resposta = await openrouter.chat.send({
      chatRequest: {
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: PROMPT_SISTEMA },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      },
    });
  } catch (err) {
    throw new ExtracaoErro('provider_error', `Falha ao chamar a OpenRouter: ${(err as Error)?.message ?? err}`);
  }

  const conteudo = resposta?.choices?.[0]?.message?.content;
  return parsearRespostaJson(conteudo);
}

function parsearRespostaJson(conteudo: string | undefined | null): RespostaExtracao {
  if (!conteudo) throw new ExtracaoErro('extraction_failed', 'Resposta da IA veio sem conteúdo.');
  try {
    const parsed = JSON.parse(conteudo) as RespostaExtracao;
    if (!Array.isArray(parsed.itens)) throw new Error('campo "itens" ausente ou inválido');
    return parsed;
  } catch (err) {
    throw new ExtracaoErro('extraction_failed', `Não foi possível interpretar o JSON da IA: ${(err as Error).message}. Conteúdo bruto: ${String(conteudo).slice(0, 500)}`);
  }
}

function base64Encode(bytes: Uint8Array): string {
  let binario = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binario += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binario);
}
