-- Semeia o prompt de extração estruturada de cotações em ops_ia_prompts
-- Permite que o administrador visualize e edite o prompt em Gestão de APIs & IA sem redeploy da Edge Function.

insert into public.ops_ia_prompts (
  chave,
  titulo,
  descricao,
  modelo,
  prompt,
  parametros,
  ativo,
  versao
)
values (
  'extrair-cotacao',
  'Extração Estruturada de Cotações',
  'Extrai os 40 campos estruturados de propostas comerciais de fornecedores (cabeçalho, fornecedor, cliente, condições comerciais e itens) a partir de Markdown.',
  'gemini-3.6-flash',
  'Você extrai dados de propostas comerciais / orçamentos de fornecedores a partir de texto em Markdown (saída de conversão de PDF).

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
}]}',
  jsonb_build_object('temperatura', 0, 'max_tokens', 32000),
  true,
  1
)
on conflict (chave) do update set
  titulo = excluded.titulo,
  descricao = excluded.descricao,
  prompt = excluded.prompt;
