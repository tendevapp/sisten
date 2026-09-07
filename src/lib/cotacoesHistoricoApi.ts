/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Consultas analíticas e históricas de cotações passadas:
 * Permite buscar itens cotados com join de propostas, calcular benchmarks de preços
 * (menor preço, preço médio, maior preço, fornecedor vencedor) e métricas consolidadas.
 */

import { supabase } from '../db/supabaseClient';

export interface ItemHistoricoCotacao {
  id: string;
  proposta_id: string;
  item_numero: number | null;
  codigo_produto: string | null;
  descricao_produto: string;
  marca_fabricante: string | null;
  unidade_medida: string | null;
  ncm: string | null;
  cst: string | null;
  cfop: string | null;
  quantidade: number | null;
  preco_unitario: number | null;
  preco_total_item: number | null;
  aliquota_icms_pct: number | null;
  aliquota_pis_pct: number | null;
  aliquota_cofins_pct: number | null;
  aliquota_ipi_pct: number | null;
  created_at: string;
  /** Preenchido quando o item já tem vínculo válido com o catálogo SAP. */
  material_code?: string | null;
  vinculo?: VinculoSapDoItem | null;
  proposta: {
    id: string;
    processo_id: string;
    arquivo_origem: string | null;
    numero_proposta: string | null;
    data_emissao: string | null;
    validade_data: string | null;
    validade_texto: string | null;
    fornecedor_razao_social: string | null;
    fornecedor_cnpj: string | null;
    fornecedor_cidade: string | null;
    fornecedor_uf: string | null;
    fornecedor_telefone: string | null;
    fornecedor_inscricao_estadual: string | null;
    vendedor_nome: string | null;
    vendedor_email: string | null;
    vendedor_telefone: string | null;
    cliente_razao_social: string | null;
    cliente_cnpj: string | null;
    cliente_inscricao_estadual: string | null;
    cliente_cidade: string | null;
    cliente_uf: string | null;
    condicao_pagamento: string | null;
    forma_pagamento: string | null;
    prazo_entrega_texto: string | null;
    frete_modalidade: string | null;
    transportadora_indicada: string | null;
    faturamento_minimo: number | null;
    dados_bancarios_pix: string | null;
    valor_total_orcamento: number | null;
    observacoes_gerais: string | null;
  } | null;
}

/**
 * Vínculo do item com o catálogo SAP, montado em
 * "Suprimentos > Vínculos & Auditoria de Cotações". Vem junto do item para o
 * histórico de preço poder ser lido por código, não só por descrição — o mesmo
 * produto chega descrito de um jeito diferente por cada fornecedor.
 */
export interface VinculoSapDoItem {
  material_code: string;
  material_descricao: string | null;
  status: 'auto' | 'sugerido' | 'confirmado' | 'rejeitado' | 'sem_candidato';
  origem: string;
  score: number | null;
  /**
   * Código que a empresa usa para vários produtos diferentes (notebook, pen
   * drive). Preço dentro dele não é comparável linha a linha: cada cotação
   * pode ser de um produto distinto.
   */
  generico: boolean;
  motivo_generico: string | null;
}

export interface FiltrosHistoricoCotacoes {
  termoBusca?: string;
  fornecedor?: string;
  frete?: 'CIF' | 'FOB' | 'TODOS';
  uf?: string;
  /** Recorte pelo vínculo SAP do item. */
  vinculo?: 'TODOS' | 'VINCULADOS' | 'NAO_VINCULADOS' | 'GENERICOS';
  /** Fixa um código SAP — é assim que se lê o histórico de preço de um material. */
  materialCode?: string;
  ordenacao?: 'preco_asc' | 'preco_desc' | 'recente' | 'antigo' | 'qtd_desc';
  limite?: number;
  offset?: number;
}

export interface MetricasHistoricoCotacoes {
  totalItens: number;
  totalPropostas: number;
  totalFornecedores: number;
  valorTotalCotado: number;
}

export interface BenchmarkProduto {
  termo: string;
  /** Preenchido quando o benchmark foi feito por código SAP, não por texto. */
  materialCode?: string | null;
  materialDescricao?: string | null;
  materialGenerico?: boolean;
  /** Descrições distintas sob o mesmo código: 1 é item específico, muitas denunciam código genérico. */
  itensDistintos?: number;
  totalCotacoes: number;
  menorPreco: number | null;
  fornecedorMenorPreco: string | null;
  dataMenorPreco: string | null;
  freteMenorPreco: string | null;
  precoMedio: number | null;
  maiorPreco: number | null;
  dispersaoPct: number | null;
  fornecedoresCotados: {
    fornecedor: string;
    precoUnitario: number;
    data: string | null;
    frete: string | null;
    prazo: string | null;
    /** Como o fornecedor descreveu o item — é o que separa os produtos dentro de um código genérico. */
    descricao: string | null;
  }[];
}

/**
 * Quebra o que foi digitado em palavras-chave, na mesma normalização de
 * `busca_norm` no banco (sem acento, sem pontuação, caixa alta).
 *
 * Todas as palavras precisam aparecer, em qualquer ordem: "cabo flexivel 2,5"
 * acha "CABO PP 2,5MM FLEXÍVEL 750V", que a busca por trecho contíguo perdia.
 * Trecho entre aspas vira uma palavra só, para quem quer a expressão exata.
 *
 * Como a normalização derruba tudo que não é letra ou número, os termos que
 * sobram não têm vírgula nem parênteses — os caracteres que quebrariam a
 * sintaxe de filtro do PostgREST.
 */
export function palavrasChaveBusca(termo: string): string[] {
  const bruto = (termo ?? '').trim();
  if (!bruto) return [];

  const normalizar = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();

  const termos: string[] = [];
  // Primeiro as expressões entre aspas, que continuam inteiras.
  const semAspas = bruto.replace(/"([^"]+)"/g, (_, frase: string) => {
    const norm = normalizar(frase);
    if (norm) termos.push(norm);
    return ' ';
  });

  for (const palavra of normalizar(semAspas).split(' ')) {
    if (palavra) termos.push(palavra);
  }
  return termos;
}

export interface MaterialGenerico {
  material_code: string;
  motivo: string | null;
  marcado_por_nome: string | null;
  created_at: string;
}

/**
 * Códigos SAP que a empresa usa para vários produtos diferentes. São poucos —
 * a lista inteira cabe numa consulta e é lida junto do histórico para marcar
 * as linhas em que o preço não é comparável item a item.
 */
export async function listarMateriaisGenericos(): Promise<MaterialGenerico[]> {
  const { data, error } = await supabase
    .from('sup_materiais_genericos')
    .select('material_code, motivo, marcado_por_nome, created_at')
    .order('material_code');
  if (error) throw new Error(`Falha ao carregar os códigos genéricos: ${error.message}`);
  return (data ?? []) as MaterialGenerico[];
}

export async function marcarMaterialGenerico(params: {
  materialCode: string;
  motivo?: string | null;
  usuarioId?: string | null;
  usuarioNome?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('sup_materiais_genericos').upsert({
    material_code: params.materialCode,
    motivo: params.motivo ?? null,
    marcado_por: params.usuarioId ?? null,
    marcado_por_nome: params.usuarioNome ?? null,
  });
  if (error) throw new Error(`Falha ao marcar o código como genérico: ${error.message}`);
}

export async function desmarcarMaterialGenerico(materialCode: string): Promise<void> {
  const { error } = await supabase
    .from('sup_materiais_genericos')
    .delete()
    .eq('material_code', materialCode);
  if (error) throw new Error(`Falha ao desmarcar o código genérico: ${error.message}`);
}

async function mapaMateriaisGenericos(): Promise<Map<string, string | null>> {
  try {
    return new Map((await listarMateriaisGenericos()).map(g => [g.material_code, g.motivo]));
  } catch {
    // A marcação é informativa: se a leitura falhar, o histórico ainda serve.
    return new Map();
  }
}

/**
 * Consulta de itens de cotação com histórico e paginação.
 */
export async function buscarHistoricoItensCotacao(
  filtros: FiltrosHistoricoCotacoes = {}
): Promise<{ itens: ItemHistoricoCotacao[]; total: number }> {
  const limite = filtros.limite ?? 100;
  const offset = filtros.offset ?? 0;
  const genericos = await mapaMateriaisGenericos();

  let query = supabase
    .from('sup_cotacao_proposta_itens')
    .select(
      `
      id,
      proposta_id,
      item_numero,
      codigo_produto,
      descricao_produto,
      marca_fabricante,
      unidade_medida,
      ncm,
      cst,
      cfop,
      quantidade,
      preco_unitario,
      preco_total_item,
      aliquota_icms_pct,
      aliquota_pis_pct,
      aliquota_cofins_pct,
      aliquota_ipi_pct,
      created_at,
      material_code,
      vinculo:sup_cotacao_item_vinculos (
        material_code,
        material_descricao,
        status,
        origem,
        score
      ),
      proposta:sup_cotacao_propostas (
        id,
        processo_id,
        arquivo_origem,
        numero_proposta,
        data_emissao,
        validade_data,
        validade_texto,
        fornecedor_razao_social,
        fornecedor_cnpj,
        fornecedor_cidade,
        fornecedor_uf,
        fornecedor_telefone,
        fornecedor_inscricao_estadual,
        vendedor_nome,
        vendedor_email,
        vendedor_telefone,
        cliente_razao_social,
        cliente_cnpj,
        cliente_inscricao_estadual,
        cliente_cidade,
        cliente_uf,
        condicao_pagamento,
        forma_pagamento,
        prazo_entrega_texto,
        frete_modalidade,
        transportadora_indicada,
        faturamento_minimo,
        dados_bancarios_pix,
        valor_total_orcamento,
        observacoes_gerais
      )
    `,
      { count: 'exact' }
    );

  // Busca por palavras-chave: cada palavra digitada precisa aparecer em
  // `busca_norm` (descrição + marca + código do fornecedor + material SAP +
  // NCM), em qualquer ordem. Filtros encadeados no PostgREST são AND.
  for (const palavra of palavrasChaveBusca(filtros.termoBusca ?? '')) {
    query = query.ilike('busca_norm', `%${palavra}%`);
  }

  // Recorte por material: é o filtro que transforma a base em histórico de
  // preço de um item só, juntando as descrições diferentes de cada fornecedor.
  if (filtros.materialCode?.trim()) {
    query = query.eq('material_code', filtros.materialCode.trim());
  }

  if (filtros.vinculo === 'VINCULADOS') query = query.not('material_code', 'is', null);
  if (filtros.vinculo === 'NAO_VINCULADOS') query = query.is('material_code', null);
  if (filtros.vinculo === 'GENERICOS') {
    // Filtra no servidor pela lista de códigos genéricos: filtrar depois da
    // paginação devolveria "3 de 100" e esconderia o resto.
    const codigos = Array.from(genericos.keys());
    if (codigos.length === 0) return { itens: [], total: 0 };
    query = query.in('material_code', codigos);
  }

  // Ordenação
  switch (filtros.ordenacao) {
    case 'preco_asc':
      query = query.order('preco_unitario', { ascending: true, nullsFirst: false });
      break;
    case 'preco_desc':
      query = query.order('preco_unitario', { ascending: false, nullsFirst: false });
      break;
    case 'qtd_desc':
      query = query.order('quantidade', { ascending: false, nullsFirst: false });
      break;
    case 'antigo':
      query = query.order('created_at', { ascending: true });
      break;
    case 'recente':
    default:
      query = query.order('created_at', { ascending: false });
      break;
  }

  query = query.range(offset, offset + limite - 1);

  const { data, count, error } = await query;
  if (error) {
    throw new Error(`Falha ao buscar histórico de cotações: ${error.message}`);
  }

  let itensFormatados = ((data ?? []) as any[]).map(item => {
    const vinculoBruto = Array.isArray(item.vinculo) ? item.vinculo[0] : item.vinculo;
    const codigo = vinculoBruto?.material_code ?? item.material_code ?? null;
    return {
      ...item,
      proposta: Array.isArray(item.proposta) ? item.proposta[0] : item.proposta,
      vinculo: codigo
        ? {
            ...vinculoBruto,
            material_code: codigo,
            generico: genericos.has(codigo),
            motivo_generico: genericos.get(codigo) ?? null,
          }
        : null,
    };
  }) as ItemHistoricoCotacao[];

  // Filtros em memória aplicados aos dados da proposta (fornecedor, frete, UF)
  if (filtros.fornecedor && filtros.fornecedor.trim()) {
    const fn = filtros.fornecedor.trim().toLowerCase();
    itensFormatados = itensFormatados.filter(i =>
      i.proposta?.fornecedor_razao_social?.toLowerCase().includes(fn)
    );
  }

  if (filtros.frete && filtros.frete !== 'TODOS') {
    itensFormatados = itensFormatados.filter(i =>
      i.proposta?.frete_modalidade?.toUpperCase() === filtros.frete
    );
  }

  if (filtros.uf && filtros.uf.trim()) {
    const ufNorm = filtros.uf.trim().toUpperCase();
    itensFormatados = itensFormatados.filter(i =>
      i.proposta?.fornecedor_uf?.toUpperCase() === ufNorm
    );
  }

  return {
    itens: itensFormatados,
    total: count ?? itensFormatados.length,
  };
}

/**
 * Consulta de métricas gerais da base de cotações.
 */
export async function buscarMetricasHistoricoCotacoes(): Promise<MetricasHistoricoCotacoes> {
  const [
    { count: totalItens },
    { count: totalPropostas },
    { data: propostasValor },
  ] = await Promise.all([
    supabase.from('sup_cotacao_proposta_itens').select('*', { count: 'exact', head: true }),
    supabase.from('sup_cotacao_propostas').select('*', { count: 'exact', head: true }),
    supabase.from('sup_cotacao_propostas').select('valor_total_orcamento, fornecedor_razao_social'),
  ]);

  let valorTotal = 0;
  const fornecedoresUnicos = new Set<string>();

  (propostasValor ?? []).forEach(p => {
    if (typeof p.valor_total_orcamento === 'number') {
      valorTotal += p.valor_total_orcamento;
    }
    if (p.fornecedor_razao_social) {
      fornecedoresUnicos.add(p.fornecedor_razao_social.trim().toUpperCase());
    }
  });

  return {
    totalItens: totalItens ?? 0,
    totalPropostas: totalPropostas ?? 0,
    totalFornecedores: fornecedoresUnicos.size,
    valorTotalCotado: valorTotal,
  };
}

/**
 * Lista os fornecedores mais frequentes para autocomplete e filtros.
 */
export async function buscarListaFornecedoresHistorico(): Promise<string[]> {
  const { data, error } = await supabase
    .from('sup_cotacao_propostas')
    .select('fornecedor_razao_social')
    .not('fornecedor_razao_social', 'is', null)
    .order('fornecedor_razao_social');

  if (error || !data) return [];

  const unicos = new Set<string>();
  data.forEach(d => {
    if (d.fornecedor_razao_social?.trim()) {
      unicos.add(d.fornecedor_razao_social.trim());
    }
  });

  return Array.from(unicos).sort((a, b) => a.localeCompare(b));
}

/**
 * Calcula benchmark de preços para um termo de produto.
 */
export async function buscarBenchmarkProduto(
  termo: string,
  opcoes: { materialCode?: string | null } = {}
): Promise<BenchmarkProduto | null> {
  const t = termo.trim();
  const materialCode = opcoes.materialCode?.trim() || null;
  if (!materialCode && t.length < 3) return null;

  let consulta = supabase
    .from('sup_cotacao_proposta_itens')
    .select(
      `
      preco_unitario,
      descricao_produto,
      material_code,
      proposta:sup_cotacao_propostas (
        fornecedor_razao_social,
        data_emissao,
        frete_modalidade,
        prazo_entrega_texto
      )
    `
    )
    .not('preco_unitario', 'is', null)
    .gt('preco_unitario', 0)
    .order('preco_unitario', { ascending: true });

  // Por código SAP o benchmark junta as descrições diferentes que cada
  // fornecedor deu ao mesmo produto — é a leitura que o vínculo destrava.
  // Sem código, vale a mesma busca por palavras-chave da tabela, senão o
  // benchmark sumiria justamente nas buscas de duas ou três palavras.
  if (materialCode) {
    consulta = consulta.eq('material_code', materialCode);
  } else {
    for (const palavra of palavrasChaveBusca(t)) {
      consulta = consulta.ilike('busca_norm', `%${palavra}%`);
    }
  }

  const { data, error } = await consulta;

  if (error || !data || data.length === 0) return null;

  const cotacoesValidas: BenchmarkProduto['fornecedoresCotados'] = [];

  let somaPrecos = 0;

  for (const item of data as any[]) {
    const prop = Array.isArray(item.proposta) ? item.proposta[0] : item.proposta;
    const pu = Number(item.preco_unitario);
    if (!isNaN(pu) && pu > 0) {
      somaPrecos += pu;
      cotacoesValidas.push({
        fornecedor: prop?.fornecedor_razao_social || 'Fornecedor não informado',
        precoUnitario: pu,
        data: prop?.data_emissao || null,
        frete: prop?.frete_modalidade || null,
        prazo: prop?.prazo_entrega_texto || null,
        descricao: item.descricao_produto ?? null,
      });
    }
  }

  if (cotacoesValidas.length === 0) return null;

  const menor = cotacoesValidas[0];
  const maior = cotacoesValidas[cotacoesValidas.length - 1];
  const media = somaPrecos / cotacoesValidas.length;
  const dispersao = menor.precoUnitario > 0 ? ((maior.precoUnitario - menor.precoUnitario) / menor.precoUnitario) * 100 : 0;

  const genericos = materialCode ? await mapaMateriaisGenericos() : null;
  const descricoesDistintas = new Set(
    cotacoesValidas.map(c => (c.descricao ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim())
  );

  return {
    termo: materialCode ?? t,
    materialCode,
    materialDescricao: materialCode
      ? ((data as any[])[0]?.descricao_produto ?? null)
      : null,
    materialGenerico: materialCode ? (genericos?.has(materialCode) ?? false) : undefined,
    itensDistintos: descricoesDistintas.size,
    totalCotacoes: cotacoesValidas.length,
    menorPreco: menor.precoUnitario,
    fornecedorMenorPreco: menor.fornecedor,
    dataMenorPreco: menor.data,
    freteMenorPreco: menor.frete,
    precoMedio: media,
    maiorPreco: maior.precoUnitario,
    dispersaoPct: Math.round(dispersao),
    fornecedoresCotados: cotacoesValidas,
  };
}

export interface PropostaHistoricaResumo {
  id: string;
  processo_id: string;
  arquivo_origem: string | null;
  numero_proposta: string | null;
  data_emissao: string | null;
  validade_data: string | null;
  validade_texto: string | null;
  fornecedor_razao_social: string | null;
  fornecedor_cnpj: string | null;
  fornecedor_cidade: string | null;
  fornecedor_uf: string | null;
  fornecedor_telefone: string | null;
  fornecedor_inscricao_estadual: string | null;
  vendedor_nome: string | null;
  vendedor_email: string | null;
  vendedor_telefone: string | null;
  cliente_razao_social: string | null;
  cliente_cnpj: string | null;
  cliente_inscricao_estadual: string | null;
  cliente_cidade: string | null;
  cliente_uf: string | null;
  condicao_pagamento: string | null;
  forma_pagamento: string | null;
  prazo_entrega_texto: string | null;
  frete_modalidade: string | null;
  transportadora_indicada: string | null;
  faturamento_minimo: number | null;
  dados_bancarios_pix: string | null;
  valor_total_orcamento: number | null;
  observacoes_gerais: string | null;
  created_at: string;
  total_itens_catalogados: number;
  soma_itens_valor: number;
}

/**
 * Busca a lista agregada de propostas comerciais de cotação com contagem de itens.
 */
export async function buscarHistoricoPropostasCotacao(
  filtros: FiltrosHistoricoCotacoes = {}
): Promise<{ propostas: PropostaHistoricaResumo[]; total: number }> {
  const limite = filtros.limite ?? 50;
  const offset = filtros.offset ?? 0;

  let query = supabase
    .from('sup_cotacao_propostas')
    .select(
      `
      id,
      processo_id,
      arquivo_origem,
      numero_proposta,
      data_emissao,
      validade_data,
      validade_texto,
      fornecedor_razao_social,
      fornecedor_cnpj,
      fornecedor_cidade,
      fornecedor_uf,
      fornecedor_telefone,
      fornecedor_inscricao_estadual,
      vendedor_nome,
      vendedor_email,
      vendedor_telefone,
      cliente_razao_social,
      cliente_cnpj,
      cliente_inscricao_estadual,
      cliente_cidade,
      cliente_uf,
      condicao_pagamento,
      forma_pagamento,
      prazo_entrega_texto,
      frete_modalidade,
      transportadora_indicada,
      faturamento_minimo,
      dados_bancarios_pix,
      valor_total_orcamento,
      observacoes_gerais,
      created_at,
      itens:sup_cotacao_proposta_itens (
        id,
        preco_total_item
      )
    `,
      { count: 'exact' }
    );

  if (filtros.fornecedor && filtros.fornecedor.trim()) {
    query = query.ilike('fornecedor_razao_social', `%${filtros.fornecedor.trim()}%`);
  }

  if (filtros.frete && filtros.frete !== 'TODOS') {
    query = query.eq('frete_modalidade', filtros.frete);
  }

  for (const palavra of palavrasChaveBusca(filtros.termoBusca ?? '')) {
    query = query.ilike('busca_norm', `%${palavra}%`);
  }

  switch (filtros.ordenacao) {
    case 'preco_asc':
      query = query.order('valor_total_orcamento', { ascending: true, nullsFirst: false });
      break;
    case 'preco_desc':
      query = query.order('valor_total_orcamento', { ascending: false, nullsFirst: false });
      break;
    case 'antigo':
      query = query.order('data_emissao', { ascending: true, nullsFirst: false });
      break;
    case 'recente':
    default:
      query = query.order('data_emissao', { ascending: false, nullsFirst: false });
      break;
  }

  query = query.range(offset, offset + limite - 1);

  const { data, count, error } = await query;

  if (error || !data) {
    console.error('Erro ao buscar propostas historicas:', error);
    return { propostas: [], total: 0 };
  }

  const propostas: PropostaHistoricaResumo[] = (data as any[]).map(p => {
    const itensArray = Array.isArray(p.itens) ? p.itens : [];
    const soma = itensArray.reduce((acc: number, it: any) => acc + (Number(it.preco_total_item) || 0), 0);
    return {
      id: p.id,
      processo_id: p.processo_id,
      arquivo_origem: p.arquivo_origem,
      numero_proposta: p.numero_proposta,
      data_emissao: p.data_emissao,
      validade_data: p.validade_data,
      validade_texto: p.validade_texto,
      fornecedor_razao_social: p.fornecedor_razao_social,
      fornecedor_cnpj: p.fornecedor_cnpj,
      fornecedor_cidade: p.fornecedor_cidade,
      fornecedor_uf: p.fornecedor_uf,
      fornecedor_telefone: p.fornecedor_telefone,
      fornecedor_inscricao_estadual: p.fornecedor_inscricao_estadual,
      vendedor_nome: p.vendedor_nome,
      vendedor_email: p.vendedor_email,
      vendedor_telefone: p.vendedor_telefone,
      cliente_razao_social: p.cliente_razao_social,
      cliente_cnpj: p.cliente_cnpj,
      cliente_inscricao_estadual: p.cliente_inscricao_estadual,
      cliente_cidade: p.cliente_cidade,
      cliente_uf: p.cliente_uf,
      condicao_pagamento: p.condicao_pagamento,
      forma_pagamento: p.forma_pagamento,
      prazo_entrega_texto: p.prazo_entrega_texto,
      frete_modalidade: p.frete_modalidade,
      transportadora_indicada: p.transportadora_indicada,
      faturamento_minimo: p.faturamento_minimo,
      dados_bancarios_pix: p.dados_bancarios_pix,
      valor_total_orcamento: p.valor_total_orcamento,
      observacoes_gerais: p.observacoes_gerais,
      created_at: p.created_at,
      total_itens_catalogados: itensArray.length,
      soma_itens_valor: soma,
    };
  });

  return {
    propostas,
    total: count || 0,
  };
}
