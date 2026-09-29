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

export type ProvedorIaId = 'gemini' | 'openrouter' | 'openai';

export interface ParametrosPromptIa {
  ordem_provedores?: ProvedorIaId[];
  provedores_ativos?: ProvedorIaId[];
  modelo_gemini?: string;
  modelo_openrouter?: string;
  modelo_openai?: string;
  temperatura?: number;
  max_tokens?: number;
  itens_por_lote?: number;
  candidatos_por_item?: number;
  [key: string]: unknown;
}

export interface ProvedorIaInfo {
  id: ProvedorIaId;
  nome: string;
  subtitulo: string;
  badgeCor: string;
  modelosSugeridos: string[];
  modeloPadrao: string;
}

export const PROVEDORES_IA_INFO: Record<ProvedorIaId, ProvedorIaInfo> = {
  gemini: {
    id: 'gemini',
    nome: 'Google Gemini',
    subtitulo: 'Chaves GEMINI_API_KEY e GEMINI_API_KEY_2 (Google AI Studio)',
    badgeCor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    modelosSugeridos: ['gemini-3.6-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-1.5-pro'],
    modeloPadrao: 'gemini-3.6-flash',
  },
  openrouter: {
    id: 'openrouter',
    nome: 'OpenRouter (DeepSeek / Llama)',
    subtitulo: 'Chave OPENROUTER_API_KEY (DeepSeek, Claude, Llama)',
    badgeCor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    modelosSugeridos: [
      'deepseek/deepseek-v4-flash',
      'deepseek/deepseek-chat',
      'deepseek/deepseek-r1',
      'meta-llama/llama-3.3-70b-instruct',
      'anthropic/claude-3.5-haiku',
    ],
    modeloPadrao: 'deepseek/deepseek-v4-flash',
  },
  openai: {
    id: 'openai',
    nome: 'OpenAI (ChatGPT)',
    subtitulo: 'Chave OPENAI_API_KEY (GPT-5, GPT-4o)',
    badgeCor: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
    modelosSugeridos: ['gpt-5.6-luna', 'gpt-4o-mini', 'gpt-4o', 'o3-mini'],
    modeloPadrao: 'gpt-5.6-luna',
  },
};

export const ORDEM_PROVEDORES_PADRAO: ProvedorIaId[] = ['gemini', 'openrouter', 'openai'];

export function normalizarParametrosPrompt(raw?: Record<string, unknown> | null): ParametrosPromptIa {
  const params: Record<string, unknown> = { ...(raw ?? {}) };
  const ordemOriginal = Array.isArray(params.ordem_provedores)
    ? (params.ordem_provedores as ProvedorIaId[]).filter(id => id in PROVEDORES_IA_INFO)
    : [];

  const ordemFinal: ProvedorIaId[] = [...ordemOriginal];
  for (const id of ORDEM_PROVEDORES_PADRAO) {
    if (!ordemFinal.includes(id)) {
      ordemFinal.push(id);
    }
  }

  const ativosOriginais = Array.isArray(params.provedores_ativos)
    ? (params.provedores_ativos as ProvedorIaId[]).filter(id => id in PROVEDORES_IA_INFO)
    : ordemFinal;

  return {
    ...params,
    ordem_provedores: ordemFinal,
    provedores_ativos: ativosOriginais.length > 0 ? ativosOriginais : [ordemFinal[0]],
    modelo_gemini: typeof params.modelo_gemini === 'string' && params.modelo_gemini.trim() ? params.modelo_gemini.trim() : PROVEDORES_IA_INFO.gemini.modeloPadrao,
    modelo_openrouter: typeof params.modelo_openrouter === 'string' && params.modelo_openrouter.trim() ? params.modelo_openrouter.trim() : PROVEDORES_IA_INFO.openrouter.modeloPadrao,
    modelo_openai: typeof params.modelo_openai === 'string' && params.modelo_openai.trim() ? params.modelo_openai.trim() : PROVEDORES_IA_INFO.openai.modeloPadrao,
  };
}

export interface PromptIa {
  chave: string;
  titulo: string;
  descricao: string | null;
  modelo: string | null;
  prompt: string;
  parametros: ParametrosPromptIa;
  ativo: boolean;
  versao: number;
  atualizado_por_nome: string | null;
  updated_at: string;
}

export const PROMPTS_PADRAO: Record<string, Partial<PromptIa>> = {
  'extrair-cotacao': {
    chave: 'extrair-cotacao',
    titulo: 'Extração Estruturada de Cotações',
    descricao: 'Extrai os 40 campos estruturados de propostas comerciais de fornecedores (cabeçalho, fornecedor, cliente, condições comerciais e itens) a partir de Markdown.',
    modelo: 'gemini-3.6-flash',
    prompt: `Você extrai dados de propostas comerciais / orçamentos de fornecedores a partir de texto em Markdown (saída de conversão de PDF).

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
}]}`,
    parametros: normalizarParametrosPrompt({
      temperatura: 0,
      max_tokens: 32000,
      ordem_provedores: ['gemini', 'openrouter', 'openai'],
      provedores_ativos: ['gemini', 'openrouter', 'openai'],
      modelo_gemini: 'gemini-3.6-flash',
      modelo_openrouter: 'deepseek/deepseek-v4-flash',
      modelo_openai: 'gpt-5.6-luna',
    }),
    ativo: true,
    versao: 1,
  },
  'vincular-cotacao-sap': {
    chave: 'vincular-cotacao-sap',
    titulo: 'Vínculo de item cotado ao material SAP',
    descricao: 'Escolhe, entre os candidatos do catálogo pré-filtrados por similaridade, qual material SAP corresponde à descrição do item cotado pelo fornecedor.',
    modelo: 'gemini-3.6-flash',
    prompt: `Você faz a ponte entre a descrição comercial de um fornecedor e o catálogo de materiais SAP de uma indústria.

Para cada ITEM recebido você escolhe, ENTRE OS CANDIDATOS LISTADOS, o material que descreve o mesmo produto físico. Regras:

1. Só pode responder com um \`material_code\` que apareça na lista de candidatos daquele item. Nunca invente código.
2. Se nenhum candidato for o mesmo produto, responda \`material_code: null\`. Errar o vínculo é pior do que não vincular: o vínculo errado contamina o histórico de preço e a auditoria de pedidos.
3. Compare o que identifica o produto: tipo do item, dimensões, capacidade, tensão, bitola, norma, material construtivo e fabricante. Marca diferente do mesmo produto é aceitável; especificação diferente não é.
4. Descrição de fornecedor costuma ser mais longa e comercial; a do SAP é abreviada e sem acento ("VALVULA ESF INOX 1.1/2" = "Válvula esfera em aço inox de 1 1/2 polegada"). Trate abreviação como equivalente.
5. \`confianca\` é de 0 a 1: use acima de 0,8 só quando todas as especificações conferem; entre 0,5 e 0,8 quando o produto é o mesmo mas falta confirmar detalhe; abaixo de 0,5 prefira responder null.
6. \`justificativa\` em uma frase curta, em português, dizendo o que fez você aceitar ou recusar.

Responda EXCLUSIVAMENTE com um JSON no formato:
{"resultados":[{"vinculo_id":"<id recebido>","material_code":"<código ou null>","confianca":<número>,"justificativa":"<frase>"}]}

Um objeto por item recebido, na mesma ordem.`,
    parametros: normalizarParametrosPrompt({
      temperatura: 0,
      max_tokens: 8000,
      itens_por_lote: 25,
      candidatos_por_item: 12,
      ordem_provedores: ['gemini', 'openrouter', 'openai'],
      provedores_ativos: ['gemini', 'openrouter'],
      modelo_gemini: 'gemini-3.6-flash',
      modelo_openrouter: 'deepseek/deepseek-v4-flash',
      modelo_openai: 'gpt-5.6-luna',
    }),
    ativo: true,
    versao: 1,
  },
};

export async function listarPromptsIa(): Promise<PromptIa[]> {
  const { data, error } = await supabase
    .from('ops_ia_prompts')
    .select('*')
    .order('titulo');
  if (error) console.warn(`Falha ao carregar os prompts: ${error.message}`);
  
  const listaBruta = (data ?? []) as unknown as Array<PromptIa & { parametros?: Record<string, unknown> }>;
  const lista: PromptIa[] = listaBruta.map(p => ({
    ...p,
    parametros: normalizarParametrosPrompt(p.parametros),
  }));

  const chavesExistentes = new Set(lista.map(p => p.chave));
  const faltantes: PromptIa[] = [];

  for (const [chave, padrao] of Object.entries(PROMPTS_PADRAO)) {
    if (!chavesExistentes.has(chave)) {
      faltantes.push({
        chave,
        titulo: padrao.titulo ?? chave,
        descricao: padrao.descricao ?? null,
        modelo: padrao.modelo ?? 'gemini-3.6-flash',
        prompt: padrao.prompt ?? '',
        parametros: normalizarParametrosPrompt(padrao.parametros),
        ativo: padrao.ativo ?? true,
        versao: padrao.versao ?? 1,
        atualizado_por_nome: 'Padrão do Sistema',
        updated_at: new Date().toISOString(),
      });
    }
  }

  return [...lista, ...faltantes];
}

export async function salvarPromptIa(params: {
  chave: string;
  prompt: string;
  modelo?: string | null;
  ativo?: boolean;
  usuarioId?: string | null;
  usuarioNome?: string | null;
  versaoAtual: number;
  parametros?: Record<string, unknown>;
}): Promise<PromptIa> {
  const meta = PROMPTS_PADRAO[params.chave];
  const payload: Record<string, unknown> = {
    chave: params.chave,
    prompt: params.prompt,
    modelo: params.modelo ?? null,
    ativo: params.ativo ?? true,
    versao: params.versaoAtual + 1,
    atualizado_por: params.usuarioId ?? null,
    atualizado_por_nome: params.usuarioNome ?? null,
    updated_at: new Date().toISOString(),
  };
  if (meta?.titulo) payload.titulo = meta.titulo;
  if (meta?.descricao) payload.descricao = meta.descricao;
  if (params.parametros) {
    payload.parametros = params.parametros;
  } else if (meta?.parametros) {
    payload.parametros = meta.parametros;
  }

  const { data, error } = await supabase
    .from('ops_ia_prompts')
    .upsert(payload, { onConflict: 'chave' })
    .select('*')
    .single();

  if (error) throw new Error(`Falha ao salvar o prompt: ${error.message}`);
  const salvo = data as unknown as PromptIa;
  return {
    ...salvo,
    parametros: normalizarParametrosPrompt(salvo.parametros),
  };
}
