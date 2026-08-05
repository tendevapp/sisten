/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Edge Function "estruturar-cotacao" — recebe markdown já colado pelo
 * comprador (normalmente já segmentado por fornecedor pelo cliente, via
 * src/lib/cotacao/segmentar.ts — uma chamada em paralelo por bloco; mas
 * ainda aceita mais de uma cotação no mesmo texto, segmentando sozinha) e
 * devolve JSON estruturado: um bloco por fornecedor, cada um com seus itens,
 * já com sugestão de vínculo a um item canônico do lote
 * (`item_canonico_id_sugerido`). A conversão de PDF/planilha para texto não
 * é responsabilidade desta função — isso é feito pelo comprador antes de
 * colar. Gemini é o provedor primário; OpenRouter é o fallback quando o
 * Gemini não está configurado ou falha.
 *
 * v10 — schema fiscal ampliado (CST/CFOP/%ST/%Red/NCM/PIS/COFINS), captura
 * de metadados de proposta (validade, faturamento mínimo, frete) e sinal de
 * divergência de produto. Regras de normalização derivadas de 4 documentos
 * reais de fornecedores (Manglog, GurgelMix/Loja do Mecânico, Anhanguera,
 * Ferimport) — ver comentários no prompt abaixo para o porquê de cada regra.
 *
 * Erros nunca derrubam a requisição com 500 — sempre voltam 200 com
 * `{ ok: false, error, ... }`, porque a tela de revisão precisa de um
 * caminho de preenchimento manual mesmo quando a estruturação falha (o
 * módulo tem que funcionar com zero IA).
 *
 * IMPORTANTE: a IA nunca escolhe o código de imposto (`impostos.incoterms`)
 * nem o código de condição de pagamento (`ddp.ddp`) diretamente — isso é
 * casamento determinístico feito no cliente por src/lib/cotacao/matching.ts,
 * a partir da semântica que esta função devolve (`tributos_presentes`,
 * `prazo_dias`, `a_combinar`). Injetar as ~250 linhas dos catálogos em todo
 * prompt gastaria token à toa e abriria espaço para código alucinado.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
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

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.0-flash';
const OPENROUTER_MODEL = Deno.env.get('OPENROUTER_MODEL') || 'deepseek/deepseek-v4-flash';
const CONFIANCA_MINIMA_AVISO = 0.5;
const MARKDOWN_MAX_CHARS = 200_000;
/** Cada tentativa de provedor tem um teto próprio — sem isso uma chamada travada
 * só volta quando a plataforma mata a função (504 depois de ~150s), e com 2
 * chaves Gemini + 1 OpenRouter em série isso podia somar minutos. Gemini
 * costuma responder rápido mesmo quando falha (ex.: 429 de quota volta em
 * segundos), então sobra orçamento de tempo para dar ao fallback — modelos
 * baratos/gratuitos na OpenRouter (ex.: deepseek free tier) podem legitimamente
 * levar mais tempo sob alta demanda. */
const TIMEOUT_GEMINI_MS = 15_000;
/** Medido diretamente contra a OpenRouter: uma tabela de 40 linhas simples já
 * levou 13-19s para gerar em modo JSON estrito — o schema real pede ~16
 * campos por item, então cotações grandes (muitos itens, vários fornecedores
 * colados juntos) podem legitimamente passar de 1 minuto de geração. */
const TIMEOUT_OPENROUTER_MS = 100_000;

interface ItemCanonicoRef {
  id: string;
  descricao_canonica: string;
  unidade_padrao?: string | null;
  material_code?: string | null;
}

interface EstruturacaoRequestBody {
  lote_id: string;
  markdown: string;
  itens_canonicos: ItemCanonicoRef[];
}

class EstruturacaoErro extends Error {
  constructor(public tipo: 'extraction_failed' | 'unreadable_file' | 'provider_error', public detail: string) {
    super(detail);
  }
}

function montarPromptSistema(itensCanonicos: ItemCanonicoRef[]): string {
  const listaItens = itensCanonicos.length > 0
    ? itensCanonicos.map(i => `- ${i.id}: ${i.descricao_canonica}${i.unidade_padrao ? ` (${i.unidade_padrao})` : ''}${i.material_code ? ` [SAP ${i.material_code}]` : ''}`).join('\n')
    : '(nenhum item canônico definido para este lote — não sugira vínculo, deixe null)';

  return `Você é um assistente especializado em ler cotações de fornecedores de materiais industriais no Brasil, coladas em markdown (convertidas de PDF, então o texto pode vir com números colados ou partidos por quebra de linha), e extrair os dados em JSON estruturado.

O texto pode conter MAIS DE UMA cotação de fornecedores diferentes, colados em sequência. Segmente cada cotação pelo fornecedor a que pertence (pelo CNPJ/razão social no cabeçalho) — não misture itens de fornecedores diferentes no mesmo bloco.

Itens canônicos deste lote (o que o comprador já definiu que precisa comparar — vincule cada linha extraída ao id mais provável, ou deixe null se não houver correspondência clara):
${listaItens}

REGRAS DE NORMALIZAÇÃO (derivadas de erros reais de conversão de PDF):
- Alíquotas em texto — "ISENTO", "-", "N/A", célula vazia — viram 0 (número), NUNCA null. null significa "documento não menciona esse tributo"; 0 significa "documento diz que a alíquota é zero".
- Números podem vir COLADOS a um índice de item vizinho (ex.: "2.983,341" é o preço "2.983,34" seguido do número do item "1" sem espaço) ou PARTIDOS por uma quebra de linha (ex.: "R$ 10.966,1" numa linha e "7" na seguinte formam "10.966,17"). Use a relação quantidade × preço unitário = subtotal para desambiguar: se um número "parece" errado, teste se removendo o último dígito (ou juntando com o próximo) a conta fecha.
- NUNCA renumere itens. "numero_item_original" é o rótulo literal impresso no documento (ex.: "1", "27"). Documentos legitimamente pulam números (ex.: itens 1 a 24 seguidos de 27, 28, 29, sem que 25/26 existam) — preserve a lacuna, não renumere para sequência contínua. Se o documento declarar quantos itens tem no total, use isso para conferir se algum foi perdido, não para forçar renumeração.
- Preço cheio + desconto + subtotal: preencha os três campos como aparecem no documento. NÃO calcule o preço unitário efetivo (isso é feito depois, fora da extração) — só extraia os valores brutos.
- PIS/COFINS às vezes aparecem como uma alíquota fixa no rodapé do documento (ex.: "1,65 / 7,60") valendo para todos os itens da proposta — replique esse valor em cada item se for esse o caso.
- Valores entre parênteses ao lado do preço/subtotal de um item (ex.: "(VLR. ST: R$ 31,95 (4%) | VLR. FCP: R$ 0,00 | VLR. IPI: R$ 5,18)") são tributos DESSE item, não desconto adicional — mapeie para st_valor/st_percentual/fcp_valor/ipi_valor.
- Campos fiscais adicionais quando presentes na tabela: %IPI, %ICMS, %Red (redução de base de cálculo do ICMS), CST, CFOP, %ST, NCM — extraia cada um para seu campo próprio.
- Metadados que aparecem soltos no documento (não numa tabela) — validade da proposta ("3 dias", "25/07/2026"), faturamento mínimo ("Faturamento Mínimo: R$300,00"), frete (valor, ou modalidade FOB/CIF), condição de pagamento em texto livre — capture no nível da proposta, não do item.
- Notas do tipo "CONFIRMAR SE ATENDE", "produtos sob encomenda", "não aceita devolução" viram observação do item (quando referem-se a um item específico) ou nota geral da proposta (quando genéricas) — nunca descarte, mas também nunca invente uma nota que não está no texto.
- DIVERGÊNCIA DE PRODUTO: quando a descrição/referência de uma linha indicar um produto DIFERENTE do item canônico mais parecido (modelo, medida, potência ou marca diferentes — ex.: cotaram "GSB 16 RE 850W" quando o pedido era "GSB 20-2 RE 800W"), ainda assim vincule ao "item_canonico_id_sugerido" mais provável, mas preencha "divergencia" descrevendo exatamente o que mudou. Não deixe de vincular só porque não é idêntico — o comprador decide se aceita.
- CONDIÇÃO DE PAGAMENTO: extraia o texto literal em "condicao_pagamento_texto" E também a semântica em "pagamento_semantica" — "prazo_dias" (número de dias, se for um prazo único simples), "parcelas" (lista de {percentual, dias} se for parcelado), "a_combinar" (true se o texto for algo como "a combinar", "conforme negociação", sem prazo definido).
- TRIBUTOS DA PROPOSTA: em "tributos_presentes", liste (minúsculo) quais desses aparecem em qualquer item da proposta com valor/alíquota maior que zero: "icms", "ipi", "st", "difal", "pis_cofins".

Responda SOMENTE com o JSON, sem texto antes ou depois, seguindo exatamente este formato:
{
  "cotacoes": [{
    "fornecedor": { "nome_extraido": string, "cnpj_extraido": string|null, "uf_extraido": string|null },
    "numero_proposta": string|null,
    "data_cotacao": string|null,
    "validade_texto": string|null,
    "faturamento_minimo": number|null,
    "condicao_pagamento_texto": string|null,
    "pagamento_semantica": { "prazo_dias": number|null, "parcelas": [{ "percentual": number, "dias": number }]|null, "a_combinar": boolean },
    "prazo_entrega_texto": string|null,
    "frete_texto": string|null,
    "frete_valor": number|null,
    "frete_modalidade": string|null,
    "total_declarado": number|null,
    "itens_declarados": number|null,
    "tributos_presentes": string[],
    "notas_gerais": string[],
    "itens": [{
      "numero_item_original": string|null, "linha_ordem": number, "codigo_fornecedor": string|null,
      "descricao_bruta": string, "referencia": string|null, "marca": string|null,
      "unidade": string|null, "quantidade": number|null,
      "preco_unitario_bruto": number|null, "desconto_valor": number|null, "desconto_percentual": number|null, "subtotal": number|null,
      "ipi_percentual": number, "ipi_valor": number|null,
      "icms_percentual": number, "icms_reducao_percentual": number,
      "st_percentual": number, "st_valor": number|null, "fcp_valor": number|null,
      "pis_percentual": number|null, "cofins_percentual": number|null,
      "ncm": string|null, "cst": string|null, "cfop": string|null,
      "disponibilidade_texto": string|null, "prazo_entrega_texto": string|null, "observacoes": string|null,
      "possivel_kit": boolean, "kit_grupo_sugerido": string|null, "confianca_extracao": number,
      "item_canonico_id_sugerido": string|null, "match_confianca": number|null,
      "divergencia": { "atributo": string, "detalhe": string }|null
    }]
  }],
  "avisos": string[]
}
Marque "possivel_kit": true quando várias linhas parecerem partes de um mesmo kit/conjunto (descrições parecidas, quantidade 1, ou menção a "kit"/"conjunto"). "confianca_extracao" é sua auto-avaliação de 0 a 1 para cada item. "item_canonico_id_sugerido" só deve ser preenchido com um id da lista acima — nunca invente um id; se não tiver certeza, deixe null.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ ok: false, error: 'extraction_failed', detail: 'Requisição não autenticada.' });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !userData?.user) {
    return jsonResponse({ ok: false, error: 'extraction_failed', detail: 'Sessão inválida ou expirada.' });
  }

  let body: EstruturacaoRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'extraction_failed', detail: 'Corpo da requisição inválido.' });
  }

  const { lote_id, markdown, itens_canonicos } = body;
  if (!lote_id || !markdown?.trim()) {
    return jsonResponse({ ok: false, error: 'extraction_failed', detail: 'lote_id e markdown são obrigatórios.' });
  }
  if (markdown.length > MARKDOWN_MAX_CHARS) {
    return jsonResponse({ ok: false, error: 'extraction_failed', detail: `Texto colado excede o limite de ${MARKDOWN_MAX_CHARS} caracteres.` });
  }

  try {
    const promptSistema = montarPromptSistema(itens_canonicos || []);
    const { resposta, modeloUsado } = await chamarProvedorIA(markdown, promptSistema);

    for (const cotacao of resposta.cotacoes) {
      const mediaConfianca = cotacao.itens.length > 0
        ? cotacao.itens.reduce((soma, i) => soma + (i.confianca_extracao ?? 0), 0) / cotacao.itens.length
        : 1;
      if (mediaConfianca < CONFIANCA_MINIMA_AVISO) {
        resposta.avisos = [...(resposta.avisos || []), `Confiança média baixa na cotação de "${cotacao.fornecedor?.nome_extraido || 'fornecedor não identificado'}" — revisão cuidadosa recomendada.`];
      }
    }

    return jsonResponse({ ok: true, modelo: modeloUsado, ...resposta });
  } catch (err) {
    const erro = err instanceof EstruturacaoErro ? err : new EstruturacaoErro('provider_error', String((err as Error)?.message ?? err));
    return jsonResponse({ ok: false, error: erro.tipo, detail: erro.detail });
  }
});

interface ItemExtraidoResposta {
  numero_item_original?: string | null;
  linha_ordem: number;
  codigo_fornecedor?: string | null;
  descricao_bruta: string;
  referencia?: string | null;
  marca?: string | null;
  unidade?: string | null;
  quantidade?: number | null;
  preco_unitario_bruto?: number | null;
  desconto_valor?: number | null;
  desconto_percentual?: number | null;
  subtotal?: number | null;
  ipi_percentual?: number | null;
  ipi_valor?: number | null;
  icms_percentual?: number | null;
  icms_reducao_percentual?: number | null;
  st_percentual?: number | null;
  st_valor?: number | null;
  fcp_valor?: number | null;
  pis_percentual?: number | null;
  cofins_percentual?: number | null;
  ncm?: string | null;
  cst?: string | null;
  cfop?: string | null;
  disponibilidade_texto?: string | null;
  prazo_entrega_texto?: string | null;
  observacoes?: string | null;
  possivel_kit: boolean;
  kit_grupo_sugerido?: string | null;
  confianca_extracao: number;
  item_canonico_id_sugerido?: string | null;
  match_confianca?: number | null;
  divergencia?: { atributo: string; detalhe: string } | null;
}

interface PagamentoSemanticaResposta {
  prazo_dias?: number | null;
  parcelas?: { percentual: number; dias: number }[] | null;
  a_combinar?: boolean;
}

interface CotacaoExtraidaResposta {
  fornecedor?: { nome_extraido?: string; cnpj_extraido?: string | null; uf_extraido?: string | null };
  numero_proposta?: string | null;
  data_cotacao?: string | null;
  validade_texto?: string | null;
  faturamento_minimo?: number | null;
  condicao_pagamento_texto?: string | null;
  pagamento_semantica?: PagamentoSemanticaResposta | null;
  prazo_entrega_texto?: string | null;
  frete_texto?: string | null;
  frete_valor?: number | null;
  frete_modalidade?: string | null;
  total_declarado?: number | null;
  itens_declarados?: number | null;
  tributos_presentes?: string[];
  notas_gerais?: string[];
  itens: ItemExtraidoResposta[];
}

interface RespostaEstruturacao {
  cotacoes: CotacaoExtraidaResposta[];
  avisos?: string[];
}

/**
 * Despacha para o provedor de IA configurado: Gemini (Key 1 e Key 2) são primários,
 * OpenRouter é o fallback (usando deepseek/deepseek-v4-flash).
 */
async function chamarProvedorIA(markdown: string, promptSistema: string): Promise<{ resposta: RespostaEstruturacao; modeloUsado: string }> {
  const geminiKey1 = Deno.env.get('GEMINI_API_KEY');
  const geminiKey2 = Deno.env.get('GEMINI_API_KEY_2');
  const errosGemini: string[] = [];

  if (geminiKey1) {
    try {
      const resposta = await comTimeout(chamarGemini(markdown, promptSistema, geminiKey1), TIMEOUT_GEMINI_MS, 'Gemini Key 1');
      return { resposta, modeloUsado: `gemini:${GEMINI_MODEL}` };
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      errosGemini.push(`Gemini Key 1: ${msg}`);
      console.error('Gemini Key 1 falhou, tentando Gemini Key 2:', msg);
    }
  }

  if (geminiKey2) {
    try {
      const resposta = await comTimeout(chamarGemini(markdown, promptSistema, geminiKey2), TIMEOUT_GEMINI_MS, 'Gemini Key 2');
      return { resposta, modeloUsado: `gemini-key2:${GEMINI_MODEL}` };
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      errosGemini.push(`Gemini Key 2: ${msg}`);
      console.error('Gemini Key 2 falhou, tentando fallback via OpenRouter:', msg);
    }
  }

  try {
    const resposta = await comTimeout(chamarOpenRouter(markdown, promptSistema), TIMEOUT_OPENROUTER_MS, 'OpenRouter');
    return { resposta, modeloUsado: `openrouter:${OPENROUTER_MODEL}` };
  } catch (err) {
    const erroOpenRouter = (err as Error)?.message ?? String(err);
    const partes = [...errosGemini, `OpenRouter: ${erroOpenRouter}`].filter(Boolean);
    throw new EstruturacaoErro('provider_error', partes.join(' | '));
  }
}

/** Corre uma chamada de provedor contra um teto de tempo — sem isso, um provedor
 * travado consome o orçamento inteiro da função (~150s) antes de sequer tentar
 * o próximo da fila. Não cancela a requisição HTTP em si (o SDK não expõe
 * abort), só para de esperar por ela e segue para o fallback. */
function comTimeout<T>(promise: Promise<T>, ms: number, rotulo: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new EstruturacaoErro('provider_error', `Tempo limite de ${ms / 1000}s excedido (${rotulo}).`)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Google Gemini via SDK oficial (`@google/generative-ai`) — provedor primário. */
async function chamarGemini(markdown: string, promptSistema: string, apiKey: string): Promise<RespostaEstruturacao> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction: promptSistema });

  let resultado;
  try {
    resultado = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Cotações coladas pelo comprador:\n\n${markdown}` }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
  } catch (err) {
    throw new EstruturacaoErro('provider_error', `Falha ao chamar o Gemini: ${(err as Error)?.message ?? err}`);
  }

  return parsearRespostaJson(resultado.response.text());
}

/**
 * OpenRouter via REST direta (não o `@openrouter/sdk`) — fallback quando o
 * Gemini não está configurado ou falha. O SDK oficial ficava pendurado
 * indefinidamente dentro do runtime Deno das Edge Functions (npm packages
 * às vezes não se comportam bem lá), consumindo o timeout inteiro sem
 * nunca resolver nem rejeitar. `fetch` + `AbortSignal.timeout` cancela a
 * requisição de verdade, em vez de só desistir de esperar por ela.
 */
async function chamarOpenRouter(markdown: string, promptSistema: string): Promise<RespostaEstruturacao> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) throw new EstruturacaoErro('provider_error', 'Nenhum provedor de IA disponível: GEMINI_API_KEY e OPENROUTER_API_KEY não configurados nos secrets da função.');

  let resposta: Response;
  try {
    resposta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: promptSistema },
          { role: 'user', content: `Cotações coladas pelo comprador:\n\n${markdown}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
      signal: AbortSignal.timeout(TIMEOUT_OPENROUTER_MS),
    });
  } catch (err) {
    throw new EstruturacaoErro('provider_error', `Falha ao chamar a OpenRouter: ${(err as Error)?.message ?? err}`);
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    throw new EstruturacaoErro('provider_error', `OpenRouter respondeu ${resposta.status}: ${detalhe.slice(0, 500)}`);
  }

  const dados = await resposta.json();
  return parsearRespostaJson(dados?.choices?.[0]?.message?.content);
}

function parsearRespostaJson(conteudo: string | undefined | null): RespostaEstruturacao {
  if (!conteudo) throw new EstruturacaoErro('extraction_failed', 'Resposta da IA veio sem conteúdo.');
  try {
    const parsed = JSON.parse(conteudo) as RespostaEstruturacao;
    if (!Array.isArray(parsed.cotacoes)) throw new Error('campo "cotacoes" ausente ou inválido');
    for (const c of parsed.cotacoes) {
      if (!Array.isArray(c.itens)) throw new Error('campo "itens" ausente ou inválido em uma das cotações');
    }
    return parsed;
  } catch (err) {
    throw new EstruturacaoErro('extraction_failed', `Não foi possível interpretar o JSON da IA: ${(err as Error).message}. Conteúdo bruto: ${String(conteudo).slice(0, 500)}`);
  }
}
