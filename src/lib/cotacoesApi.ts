/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chamadas de rede do módulo de Análise de Cotações: Supabase direto
 * (seguindo o padrão de src/views/Fornecedores.tsx e Materials.tsx — sem
 * localDb, porque este é um dado write-heavy, por processo, lido por poucos
 * usuários, e o localDb existe para cache de leitura de dado de referência
 * compartilhado) e a Edge Function `extrair-cotacao`.
 */

import { supabase } from '../db/supabaseClient';
import { normalizarCnpj, formatarCnpj, normalizarDescricao } from './cotacoes';
import type {
  CotacaoProcesso, CotacaoProcessoItem, CotacaoProcessoItemDraft, CotacaoProcessoStatus,
  CotacaoProposta, CotacaoPropostaDraft, ExtracaoResposta, SugestaoVinculo,
} from '../types';

// =====================================================================
// Edge Function
// =====================================================================

export interface ExtrairCotacaoErro {
  codigo: string;
  mensagem: string;
}

/** Lança um erro cujo `.message` já é o texto pronto para exibir ao usuário. */
export async function extrairCotacao(params: {
  markdown: string;
  arquivoOrigem?: string;
  processoId?: string;
}): Promise<ExtracaoResposta> {
  const { data, error } = await supabase.functions.invoke('extrair-cotacao', {
    body: {
      markdown: params.markdown,
      arquivo_origem: params.arquivoOrigem ?? null,
      processo_id: params.processoId ?? null,
    },
  });

  if (error) {
    // supabase-js não expõe o corpo JSON de erro de forma direta em todo
    // client; tenta extrair o `erro.mensagem` do payload quando disponível.
    const contexto = (error as any)?.context;
    const corpo = typeof contexto?.json === 'function' ? await contexto.json().catch(() => null) : null;
    throw new Error(corpo?.erro?.mensagem ?? error.message ?? 'Falha ao chamar a extração por IA.');
  }
  if ((data as any)?.erro) {
    throw new Error((data as any).erro.mensagem ?? 'Falha ao extrair a cotação.');
  }
  return data as ExtracaoResposta;
}

// =====================================================================
// Processos
// =====================================================================

function gerarNumeroProcesso(): string {
  const ano = new Date().getFullYear();
  const sufixo = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `COT-${ano}-${sufixo}`;
}

export async function criarProcessoCotacao(params: {
  titulo: string | null;
  observacoes: string | null;
  itens: CotacaoProcessoItemDraft[];
  usuarioId: string;
  usuarioNome: string;
}): Promise<CotacaoProcesso> {
  const { data: processo, error: erroProcesso } = await supabase
    .from('sup_cotacao_processos')
    .insert({
      numero: gerarNumeroProcesso(),
      titulo: params.titulo,
      observacoes: params.observacoes,
      criado_por: params.usuarioId,
      criado_por_nome: params.usuarioNome,
    })
    .select('*')
    .single();
  if (erroProcesso) throw new Error(`Falha ao criar processo de cotação: ${erroProcesso.message}`);

  // Cotação avulsa (criada sem passar pela Central de Compras) não tem item
  // nenhum — insert com array vazio é só custo de round-trip à toa.
  if (params.itens.length > 0) {
    const itensPayload = params.itens.map(i => ({ ...i, processo_id: processo.id }));
    const { error: erroItens } = await supabase.from('sup_cotacao_processo_itens').insert(itensPayload);
    if (erroItens) throw new Error(`Processo criado, mas falhou ao gravar os itens do escopo: ${erroItens.message}`);
  }

  return processo as CotacaoProcesso;
}

export async function listarProcessosCotacao(): Promise<CotacaoProcesso[]> {
  const { data, error } = await supabase
    .from('sup_cotacao_processos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(`Falha ao listar processos: ${error.message}`);
  return (data ?? []) as CotacaoProcesso[];
}

export async function buscarProcessoCotacao(processoId: string): Promise<{
  processo: CotacaoProcesso;
  itens: CotacaoProcessoItem[];
  propostas: CotacaoProposta[];
}> {
  const [{ data: processo, error: e1 }, { data: itens, error: e2 }, { data: propostas, error: e3 }] = await Promise.all([
    supabase.from('sup_cotacao_processos').select('*').eq('id', processoId).single(),
    supabase.from('sup_cotacao_processo_itens').select('*').eq('processo_id', processoId).order('ri'),
    supabase.from('sup_cotacao_propostas').select('*, itens:sup_cotacao_proposta_itens(*)').eq('processo_id', processoId).order('created_at'),
  ]);
  if (e1) throw new Error(`Falha ao carregar processo: ${e1.message}`);
  if (e2) throw new Error(`Falha ao carregar escopo do processo: ${e2.message}`);
  if (e3) throw new Error(`Falha ao carregar propostas: ${e3.message}`);

  return {
    processo: processo as CotacaoProcesso,
    itens: (itens ?? []) as CotacaoProcessoItem[],
    propostas: (propostas ?? []) as CotacaoProposta[],
  };
}

export async function atualizarStatusProcesso(processoId: string, status: CotacaoProcessoStatus): Promise<void> {
  const { error } = await supabase.from('sup_cotacao_processos').update({ status, updated_at: new Date().toISOString() }).eq('id', processoId);
  if (error) throw new Error(`Falha ao atualizar status do processo: ${error.message}`);
}

export interface PropostaJaExtraida {
  id: string;
  arquivo_origem: string | null;
  fornecedor_razao_social: string | null;
  created_at: string;
}

/**
 * Verifica se algum dos arquivos já tem proposta salva neste processo —
 * mesma ideia do que `buscarUltimaConversaoPorArquivo` faz para a etapa de
 * conversão, aplicada à extração: evita gastar IA e criar linha duplicada em
 * `cotacao_propostas` para um arquivo que alguém (ou a própria sessão, antes
 * de recarregar a página) já extraiu e salvou neste mesmo processo.
 */
export async function buscarPropostasPorArquivo(processoId: string, arquivosOrigem: string[]): Promise<PropostaJaExtraida[]> {
  const nomes = Array.from(new Set(arquivosOrigem.map(n => n.trim()).filter(Boolean)));
  if (nomes.length === 0) return [];
  const { data, error } = await supabase
    .from('sup_cotacao_propostas')
    .select('id, arquivo_origem, fornecedor_razao_social, created_at')
    .eq('processo_id', processoId)
    .in('arquivo_origem', nomes);
  if (error) throw new Error(`Falha ao verificar propostas já extraídas: ${error.message}`);
  return (data ?? []) as PropostaJaExtraida[];
}

/** Exclui uma proposta salva (e seus itens, via ON DELETE CASCADE em `cotacao_proposta_itens`). */
export async function excluirPropostaCotacao(propostaId: string): Promise<void> {
  const { error } = await supabase.from('sup_cotacao_propostas').delete().eq('id', propostaId);
  if (error) throw new Error(`Falha ao excluir a proposta: ${error.message}`);
}

// =====================================================================
// Vínculo com itens de RM
// =====================================================================

export async function sugerirVinculos(params: {
  processoId: string;
  fornecedorCnpj: string | null;
  descricoes: { idx: number; descricao: string; codigoProduto: string | null }[];
}): Promise<Map<number, SugestaoVinculo[]>> {
  const { data, error } = await supabase.rpc('sugerir_vinculos_cotacao', {
    p_processo_id: params.processoId,
    p_fornecedor_cnpj: params.fornecedorCnpj,
    p_descricoes: params.descricoes.map(d => ({ idx: d.idx, descricao: d.descricao, codigo_produto: d.codigoProduto })),
  });
  if (error) throw new Error(`Falha ao buscar sugestões de vínculo: ${error.message}`);

  const porIdx = new Map<number, SugestaoVinculo[]>();
  for (const row of (data ?? []) as any[]) {
    const lista = porIdx.get(row.idx) ?? [];
    lista.push({
      idx: row.idx,
      processo_item_id: row.processo_item_id,
      ri: row.ri,
      texto_breve: row.texto_breve,
      material_code: row.material_code,
      score: Number(row.score),
      origem: row.origem,
    });
    porIdx.set(row.idx, lista);
  }
  return porIdx;
}

// =====================================================================
// Fornecedor por CNPJ
// =====================================================================

export interface FornecedorEncontrado {
  id: string;
  cod_vendor: string | null;
  fornecedor: string | null;
  nome_fantasia: string | null;
  cnpj: string | null;
  email: string | null;
}

/**
 * contatos.cnpj está só-dígitos em ~94% das linhas, mas as escritas não
 * normalizam (Fornecedores.tsx grava `cnpj.trim()`), então consulta as duas
 * grafias possíveis por igualdade — mais barato que um scan com ilike.
 */
export async function acharFornecedorPorCnpj(cnpjBruto: string | null): Promise<FornecedorEncontrado | null> {
  const digitos = normalizarCnpj(cnpjBruto);
  if (!digitos) return null;

  const { data, error } = await supabase
    .from('sup_fornecedores_contatos')
    .select('id, cod_vendor, fornecedor, nome_fantasia, cnpj, email')
    .in('cnpj', [digitos, formatarCnpj(digitos)])
    .limit(1);
  if (error) throw new Error(`Falha ao buscar fornecedor por CNPJ: ${error.message}`);
  return (data?.[0] as FornecedorEncontrado) ?? null;
}

export async function buscarFornecedoresPorNome(termo: string): Promise<FornecedorEncontrado[]> {
  const t = termo.trim();
  if (t.length < 2) return [];
  const { data, error } = await supabase
    .from('sup_fornecedores_contatos')
    .select('id, cod_vendor, fornecedor, nome_fantasia, cnpj, email')
    .or(`fornecedor.ilike.%${t}%,nome_fantasia.ilike.%${t}%`)
    .limit(10);
  if (error) throw new Error(`Falha ao buscar fornecedores: ${error.message}`);
  return (data ?? []) as FornecedorEncontrado[];
}

// =====================================================================
// Salvamento
// =====================================================================

export interface ResultadoSalvamento {
  propostas: number;
  itens: number;
  aprendidos: number;
}

/** Serializa um rascunho de proposta para o payload jsonb esperado por `salvar_processo_cotacao`. */
function propostaParaPayload(processoId: string, p: CotacaoPropostaDraft) {
  return {
    processo_id: processoId,
    arquivo_origem: p.arquivo_origem,
    numero_proposta: p.numero_proposta,
    data_emissao: p.data_emissao,
    validade_data: p.validade_data,
    validade_texto: p.validade_texto,
    fornecedor_razao_social: p.fornecedor_razao_social,
    fornecedor_cnpj: p.fornecedor_cnpj,
    fornecedor_inscricao_estadual: p.fornecedor_inscricao_estadual,
    fornecedor_cidade: p.fornecedor_cidade,
    fornecedor_uf: p.fornecedor_uf,
    fornecedor_telefone: p.fornecedor_telefone,
    cod_vendor: p.cod_vendor,
    contato_id: p.contato_id,
    fornecedor_match: p.fornecedor_match,
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
    prazo_entrega_dias: p.prazo_entrega_dias,
    frete_modalidade: p.frete_modalidade,
    transportadora_indicada: p.transportadora_indicada,
    faturamento_minimo: p.faturamento_minimo,
    dados_bancarios_pix: p.dados_bancarios_pix,
    valor_total_orcamento: p.valor_total_orcamento,
    observacoes_gerais: p.observacoes_gerais,
    campos_faltantes: p.campos_faltantes,
    revisado: true,
    extracao_id: p.extracao_id,
    extraido_raw: p.extraido_raw,
    itens: p.itens.map(item => ({
      processo_item_id: item.processo_item_id,
      fora_escopo: item.fora_escopo,
      vinculo_origem: item.vinculo_origem,
      vinculo_score: item.vinculo_score,
      ri: item.ri,
      material_code: item.material_code,
      item_numero: item.item_numero,
      codigo_produto: item.codigo_produto,
      descricao_produto: item.descricao_produto,
      // Alimenta cotacao_descricao_map só quando dá para casar: fornecedor
      // conhecido (CNPJ) e descrição normalizável.
      descricao_norm: item.descricao_produto ? normalizarDescricao(item.descricao_produto) : null,
      marca_fabricante: item.marca_fabricante,
      unidade_medida: item.unidade_medida,
      ncm: item.ncm,
      cst: item.cst,
      cfop: item.cfop,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
      preco_total_item: item.preco_total_item,
      aliquota_icms_pct: item.aliquota_icms_pct,
      aliquota_pis_pct: item.aliquota_pis_pct,
      aliquota_cofins_pct: item.aliquota_cofins_pct,
      aliquota_ipi_pct: item.aliquota_ipi_pct,
      extraido_raw: item.extraido_raw,
    })),
  };
}

export async function salvarProcessoCotacao(params: {
  processoId: string;
  propostas: CotacaoPropostaDraft[];
  usuarioId: string;
  usuarioNome: string;
}): Promise<ResultadoSalvamento> {
  const payload = {
    usuario_id: params.usuarioId,
    usuario_nome: params.usuarioNome,
    propostas: params.propostas.map(p => propostaParaPayload(params.processoId, p)),
  };

  const { data, error } = await supabase.rpc('salvar_processo_cotacao', { p_payload: payload });
  if (error) throw new Error(`Falha ao salvar a proposta: ${error.message}`);
  return data as ResultadoSalvamento;
}
