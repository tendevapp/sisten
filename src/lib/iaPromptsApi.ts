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

export interface PromptIa {
  chave: string;
  titulo: string;
  descricao: string | null;
  modelo: string | null;
  prompt: string;
  parametros: Record<string, unknown>;
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
    parametros: { temperatura: 0, max_tokens: 32000 },
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
  
  const lista = (data ?? []) as unknown as PromptIa[];
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
        parametros: padrao.parametros ?? {},
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
  if (meta?.parametros) payload.parametros = meta.parametros;

  const { data, error } = await supabase
    .from('ops_ia_prompts')
    .upsert(payload, { onConflict: 'chave' })
    .select('*')
    .single();

  if (error) throw new Error(`Falha ao salvar o prompt: ${error.message}`);
  return data as unknown as PromptIa;
}
