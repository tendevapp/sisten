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
import { localDb } from '../db/localDb';
import {
  normalizarCnpj,
  formatarCnpj,
  normalizarDescricao,
  gerarCodigoCotacao,
  proximoIndiceCotacao,
} from './cotacoes';
import { comprimirImagemUpload } from './imageCompression';
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
  /** Itens de RM do processo — a IA usa para já sugerir o RI de cada item cotado e apontar o que difere. */
  escopo?: CotacaoProcessoItem[];
}): Promise<ExtracaoResposta> {
  const { data, error } = await supabase.functions.invoke('extrair-cotacao', {
    body: {
      markdown: params.markdown,
      arquivo_origem: params.arquivoOrigem ?? null,
      processo_id: params.processoId ?? null,
      escopo: (params.escopo ?? []).map(e => ({
        ri: e.ri,
        texto_breve: e.texto_breve,
        material_code: e.material_code,
        quantidade: e.qtd_solicitada,
        unidade: e.unidade_medida,
      })),
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

/**
 * Pede à IA, sob demanda, o vínculo RI de itens que a extração e o trigrama
 * não resolveram — usado pelo botão "Pedir à IA" no card da proposta,
 * quando `itensSemVinculo.length > 0`. Chamada enxuta: não reenvia o
 * Markdown do documento, só a descrição/código dos itens soltos.
 */
export async function sugerirVinculoRiIa(params: {
  processoId?: string;
  itens: { _key: string; descricao: string; codigoProduto: string | null; marca: string | null; unidade: string | null; quantidade: number | null }[];
  escopo: CotacaoProcessoItem[];
}): Promise<Map<string, { ri: string | null; divergencias: string[] | null }>> {
  const { itens, escopo } = params;
  const { data, error } = await supabase.functions.invoke('sugerir-vinculo-ri-ia', {
    body: {
      processo_id: params.processoId ?? null,
      itens: itens.map((it, idx) => ({
        idx,
        descricao: it.descricao,
        codigo_produto: it.codigoProduto,
        marca: it.marca,
        unidade: it.unidade,
        quantidade: it.quantidade,
      })),
      escopo: escopo.map(e => ({
        ri: e.ri,
        texto_breve: e.texto_breve,
        material_code: e.material_code,
        quantidade: e.qtd_solicitada,
        unidade: e.unidade_medida,
      })),
    },
  });

  if (error) {
    const contexto = (error as any)?.context;
    const corpo = typeof contexto?.json === 'function' ? await contexto.json().catch(() => null) : null;
    throw new Error(corpo?.erro?.mensagem ?? error.message ?? 'Falha ao pedir vínculo à IA.');
  }
  if ((data as any)?.erro) {
    throw new Error((data as any).erro.mensagem ?? 'Falha ao pedir vínculo à IA.');
  }

  const vinculos = Array.isArray((data as any)?.vinculos) ? (data as any).vinculos : [];
  const porKey = new Map<string, { ri: string | null; divergencias: string[] | null }>();
  for (const v of vinculos) {
    const original = itens[v.idx];
    if (!original) continue;
    porKey.set(original._key, { ri: v.ri ?? null, divergencias: v.divergencias ?? null });
  }
  return porKey;
}

// =====================================================================
// Processos
// =====================================================================

/**
 * Consulta os numeros de processo de cotacao existentes e calcula o proximo
 * codigo no padrao do SISTEN: `COT-DDMMYY-INDICE` (ex.: `COT-040926-01`),
 * com indice sequencial acumulado no mes.
 */
export async function obterProximoNumeroCotacao(dataISO?: string | null): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('sup_cotacao_processos')
      .select('numero');

    if (error || !data) {
      if (error) console.warn('Erro ao consultar processos de cotacao para numero:', error);
      return gerarCodigoCotacao(dataISO, 1);
    }

    const codigosExistentes = data.map(d => d.numero).filter(Boolean);
    const proximoIndice = proximoIndiceCotacao(codigosExistentes, dataISO);
    return gerarCodigoCotacao(dataISO, proximoIndice);
  } catch (err) {
    console.warn('Falha ao obter proximo numero de cotacao:', err);
    return gerarCodigoCotacao(dataISO, 1);
  }
}

export async function criarProcessoCotacao(params: {
  titulo: string | null;
  observacoes: string | null;
  itens: CotacaoProcessoItemDraft[];
  usuarioId: string;
  usuarioNome: string;
}): Promise<CotacaoProcesso> {
  let numero = await obterProximoNumeroCotacao();
  let processo: CotacaoProcesso | null = null;
  let erroProcesso: any = null;

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const res = await supabase
      .from('sup_cotacao_processos')
      .insert({
        numero,
        titulo: params.titulo,
        observacoes: params.observacoes,
        criado_por: params.usuarioId,
        criado_por_nome: params.usuarioNome,
      })
      .select('*')
      .single();

    if (!res.error && res.data) {
      processo = res.data as CotacaoProcesso;
      erroProcesso = null;
      break;
    }

    erroProcesso = res.error;
    if (res.error?.code === '23505' || String(res.error?.message).toLowerCase().includes('numero')) {
      numero = await obterProximoNumeroCotacao();
      continue;
    }
    break;
  }

  if (erroProcesso || !processo) {
    throw new Error(`Falha ao criar processo de cotacao: ${erroProcesso?.message || 'Erro desconhecido'}`);
  }

  // Cotação avulsa (criada sem passar pela Central de Compras) não tem item
  // nenhum — insert com array vazio é só custo de round-trip à toa.
  if (params.itens.length > 0) {
    const itensPayload = params.itens.map(i => ({ ...i, processo_id: processo.id }));
    const { error: erroItens } = await supabase.from('sup_cotacao_processo_itens').insert(itensPayload);
    if (erroItens) throw new Error(`Processo criado, mas falhou ao gravar os itens do escopo: ${erroItens.message}`);

    // Atualiza automaticamente o status dos itens da Central de Compras para "Análise de Cotações"
    const ris = Array.from(new Set(params.itens.map(i => i.ri).filter((ri): ri is string => Boolean(ri))));
    if (ris.length > 0) {
      try {
        await localDb.atualizarStatusItensCotacao(ris, params.usuarioNome);
      } catch (errStatus) {
        console.warn('Falha ao atualizar status para Análise de Cotações:', errStatus);
      }
    }
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

/**
 * Busca todas as propostas de cotação já extraídas e salvas no banco pelo nome
 * do arquivo de origem, trazendo também seus itens já normalizados.
 * Permite recarregar uma cotação anterior evitando nova chamada de IA.
 */
export async function buscarPropostasPorNomeArquivo(nomeArquivo: string): Promise<CotacaoProposta[]> {
  const nome = nomeArquivo.trim();
  if (!nome) return [];

  try {
    const { data, error } = await supabase
      .from('sup_cotacao_propostas')
      .select('*, itens:sup_cotacao_proposta_itens(*)')
      .ilike('arquivo_origem', nome)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data as CotacaoProposta[];
  } catch (err) {
    console.warn('Falha ao consultar propostas existentes por arquivo:', err);
    return [];
  }
}

/** Exclui uma proposta salva (e seus itens, via ON DELETE CASCADE em `cotacao_proposta_itens`). */
export async function excluirPropostaCotacao(propostaId: string): Promise<void> {
  const { error } = await supabase.from('sup_cotacao_propostas').delete().eq('id', propostaId);
  if (error) throw new Error(`Falha ao excluir a proposta: ${error.message}`);
}

/**
 * Exclui um processo de cotação inteiro. Os itens do escopo, as propostas, os
 * itens das propostas e os vínculos com SAP saem juntos por ON DELETE CASCADE.
 * A RLS já restringe a operação a quem pode gerir cotações (admin, comprador,
 * coordenador de suprimentos); a UI só oferece o botão para admin em processos
 * ainda abertos.
 */
export async function excluirProcessoCotacao(processoId: string): Promise<void> {
  const { error } = await supabase.from('sup_cotacao_processos').delete().eq('id', processoId);
  if (error) throw new Error(`Falha ao excluir o processo de cotação: ${error.message}`);
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
    // Antes só era preenchido depois de salva, pelo mapa comparativo
    // (`salvarFreteProposta`); agora a extração por IA pode já trazer o
    // frete destacado no texto, então entra no insert desde o começo.
    valor_frete: p.valor_frete,
    valor_desconto: p.valor_desconto,
    observacoes_gerais: p.observacoes_gerais,
    campos_faltantes: p.campos_faltantes,
    revisado: true,
    extracao_id: p.extracao_id,
    extraido_raw: p.extraido_raw,
    arquivo_storage_path: p.arquivo_storage_path,
    arquivo_mime_type: p.arquivo_mime_type,
    arquivo_tamanho_bytes: p.arquivo_tamanho_bytes,
    arquivo_markdown: p.arquivo_markdown,
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
      desconsiderado: item.desconsiderado,
      vinculo_divergencias: item.vinculo_divergencias,
      peso_unitario_kg: item.peso_unitario_kg,
      peso_origem: item.peso_origem,
      frete_teorico: item.frete_teorico,
      codigo_fiscal: item.codigo_fiscal,
      preco_liquido_unitario: item.preco_liquido_unitario,
      preco_liquido_total: item.preco_liquido_total,
      custo_total_item: item.custo_total_item,
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
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!params.processoId || !UUID_REGEX.test(params.processoId)) {
    throw new Error('Identificador do processo de cotação inválido.');
  }

  // Verifica se o processo ainda existe no banco antes de tentar gravar as propostas
  const { data: processoExiste, error: errProcesso } = await supabase
    .from('sup_cotacao_processos')
    .select('id, numero')
    .eq('id', params.processoId)
    .maybeSingle();

  if (errProcesso || !processoExiste) {
    throw new Error(
      'O processo de cotação não existe mais no banco de dados (pode ter sido excluído ou recriado). Atualize a página ou retorne à lista de processos.'
    );
  }

  const payload = {
    usuario_id: params.usuarioId,
    usuario_nome: params.usuarioNome,
    propostas: params.propostas.map(p => propostaParaPayload(params.processoId, p)),
  };

  const { data, error } = await supabase.rpc('salvar_processo_cotacao', { p_payload: payload });
  if (error) {
    if (error.message?.includes('cotacao_propostas_processo_id_fkey') || error.code === '23503') {
      throw new Error(
        'O processo de cotação não existe mais no banco de dados. Atualize a página para recarregar a lista.'
      );
    }
    throw new Error(`Falha ao salvar a proposta: ${error.message}`);
  }
  return data as ResultadoSalvamento;
}

// =====================================================================
// Mapa comparativo
// =====================================================================

/**
 * Grava o valor do frete de uma proposta. Fica fora do payload de
 * `salvar_processo_cotacao` de propósito: aquela RPC insere (nunca atualiza),
 * e o frete é preenchido depois, no mapa, sobre uma proposta já salva.
 */
export async function salvarFreteProposta(propostaId: string, valorFrete: number | null): Promise<void> {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(propostaId)) {
    console.warn('salvarFreteProposta: propostaId não é um UUID válido, ignorando:', propostaId);
    return;
  }
  const { error } = await supabase
    .from('sup_cotacao_propostas')
    .update({ valor_frete: valorFrete, updated_at: new Date().toISOString() })
    .eq('id', propostaId);
  if (error) throw new Error(`Falha ao salvar o frete da proposta: ${error.message}`);
}

const UUID_REGEX_ITEM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Campos de item que mudam depois de a proposta já estar salva — `salvar_processo_cotacao` só insere. */
export interface PatchItemCotacao {
  id: string;
  desconsiderado?: boolean;
  peso_unitario_kg?: number | null;
  peso_origem?: 'ia' | 'manual' | null;
  frete_teorico?: number | null;
  codigo_fiscal?: string | null;
  preco_liquido_unitario?: number | null;
  preco_liquido_total?: number | null;
  custo_total_item?: number | null;
}

/**
 * Atualiza item a item o que o comprador mexe depois do salvamento: o peso
 * estimado (e o frete que ele recalcula), o item desconsiderado e a
 * composição de custo congelada ao fechar o pedido.
 *
 * Um UPDATE por item, e não um upsert em lote, porque cada linha muda um
 * subconjunto diferente de colunas — um upsert precisaria mandar a linha
 * inteira e apagaria o que a tela não carregou.
 */
export async function atualizarItensCotacao(patches: PatchItemCotacao[]): Promise<void> {
  const validos = patches.filter(p => UUID_REGEX_ITEM.test(p.id));
  const ignorados = patches.length - validos.length;
  if (ignorados > 0) {
    // Item de rascunho ainda não tem linha no banco — o salvamento da
    // proposta já leva esses campos no payload.
    console.warn(`atualizarItensCotacao: ${ignorados} item(ns) ainda não salvos, ignorados.`);
  }
  if (validos.length === 0) return;

  const resultados = await Promise.all(
    validos.map(({ id, ...campos }) =>
      supabase.from('sup_cotacao_proposta_itens').update(campos).eq('id', id)
    ),
  );

  const erro = resultados.find(r => r.error)?.error;
  if (erro) throw new Error(`Falha ao atualizar os itens da cotação: ${erro.message}`);
}

// =====================================================================
// Arquivo original (Storage) e Markdown extraído
// =====================================================================

const BUCKET_COTACOES_ARQUIVOS = 'cotacoes-arquivos';

/**
 * Sobe o PDF/imagem original de uma proposta para o Storage.
 * Comprime imagens antes do upload seguindo a regra global do SISTEN.
 * Preserva o nome original sanitizado no caminho.
 */
export async function uploadArquivoCotacao(
  processoId: string,
  file: File,
): Promise<{ path: string; mimeType: string; tamanhoBytes: number }> {
  const nomeLimpo = file.name.replace(/[^\w.-]/g, '_').slice(0, 80);
  const path = `${processoId}/${Date.now()}-${nomeLimpo}`;

  let corpoUpload: Blob = file;
  let mimeType = file.type || 'application/pdf';

  if (file.type.startsWith('image/')) {
    try {
      corpoUpload = await comprimirImagemUpload(file);
      mimeType = 'image/jpeg';
    } catch {
      corpoUpload = file;
    }
  }

  const { error } = await supabase.storage
    .from(BUCKET_COTACOES_ARQUIVOS)
    .upload(path, corpoUpload, { contentType: mimeType, upsert: false });
  if (error) throw new Error(`Falha ao enviar o arquivo original para o Storage: ${error.message}`);

  return { path, mimeType, tamanhoBytes: corpoUpload.size };
}

/** URL assinada de 24h para pré-visualizar o arquivo original — o bucket é privado. */
export async function assinarArquivoCotacao(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET_COTACOES_ARQUIVOS)
    .createSignedUrl(path, 60 * 60 * 24);
  if (error) {
    console.warn('Falha ao assinar URL do arquivo original da cotação:', error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

/**
 * Busca o arquivo original no Storage por nome de arquivo de origem.
 * Primeiro consulta se alguma proposta já gravada no Supabase aponta para esse arquivo.
 * Se encontrar, devolve o caminho do Storage e metadados para visualização imediata.
 */
export async function buscarArquivoOriginalPorNome(nomeArquivo: string): Promise<{
  storagePath: string;
  mimeType: string;
  tamanhoBytes: number | null;
} | null> {
  const nome = nomeArquivo.trim();
  if (!nome) return null;

  try {
    const { data, error } = await supabase
      .from('sup_cotacao_propostas')
      .select('arquivo_storage_path, arquivo_mime_type, arquivo_tamanho_bytes')
      .ilike('arquivo_origem', nome)
      .not('arquivo_storage_path', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.arquivo_storage_path) {
      return {
        storagePath: data.arquivo_storage_path,
        mimeType: data.arquivo_mime_type || 'application/pdf',
        tamanhoBytes: data.arquivo_tamanho_bytes ?? null,
      };
    }
  } catch (err) {
    console.warn('buscarArquivoOriginalPorNome: falha na consulta:', err);
  }
  return null;
}

/**
 * Vincula (ou corrige) o arquivo original em uma proposta salva.
 */
export async function vincularArquivoOriginalProposta(
  propostaId: string,
  storagePath: string,
  mimeType = 'application/pdf',
  tamanhoBytes: number | null = null,
): Promise<void> {
  if (!UUID_REGEX_ITEM.test(propostaId)) return;
  try {
    const { error } = await supabase
      .from('sup_cotacao_propostas')
      .update({
        arquivo_storage_path: storagePath,
        arquivo_mime_type: mimeType,
        arquivo_tamanho_bytes: tamanhoBytes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', propostaId);

    if (error) {
      console.warn('Falha ao vincular arquivo original à proposta:', error.message);
    }
  } catch (err) {
    console.warn('vincularArquivoOriginalProposta: falha:', err);
  }
}

/**
 * Corrige o Markdown extraído de uma proposta já salva — para quando o
 * comprador identifica um erro de conversão (tabela quebrada, número
 * trocado pelo OCR) e quer deixar o texto certo para quem consultar depois.
 * O Markdown "como veio de fato" continua intocado em `ops_conversoes_markdown`;
 * isto aqui só muda a cópia de trabalho anexada à proposta.
 */
export async function atualizarMarkdownProposta(
  propostaId: string,
  markdown: string,
  usuarioNome: string,
): Promise<void> {
  if (!UUID_REGEX_ITEM.test(propostaId)) {
    throw new Error('Só é possível editar o Markdown de uma proposta já salva.');
  }
  const { error } = await supabase
    .from('sup_cotacao_propostas')
    .update({
      arquivo_markdown: markdown,
      arquivo_markdown_editado_em: new Date().toISOString(),
      arquivo_markdown_editado_por: usuarioNome,
      updated_at: new Date().toISOString(),
    })
    .eq('id', propostaId);
  if (error) throw new Error(`Falha ao salvar a correção do Markdown: ${error.message}`);
}

/**
 * Persiste a decisão do comprador no mapa: quais itens cotados foram
 * escolhidos. Recebe a seleção inteira do processo e grava a diferença nos
 * dois sentidos — desmarcar é uma decisão tão real quanto marcar.
 */
export async function salvarSelecaoMapa(params: {
  itensSelecionados: string[];
  itensDesmarcados: string[];
  usuarioNome: string;
  /** Justificativa por item marcado que não era a melhor oferta da linha (vai para `mapa_observacao`). Item ausente grava `null`. */
  observacoes?: Map<string, string>;
}): Promise<void> {
  const agora = new Date().toISOString();
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const marcar = params.itensSelecionados.filter(id => UUID_REGEX.test(id));
  const desmarcar = params.itensDesmarcados.filter(id => UUID_REGEX.test(id));

  const invalidos = [...params.itensSelecionados, ...params.itensDesmarcados].filter(id => !UUID_REGEX.test(id));
  if (invalidos.length > 0) {
    console.warn('salvarSelecaoMapa: ignorando IDs não-UUID recebidos:', invalidos);
  }

  // Um update por texto de observação (em geral um só, compartilhado pela
  // decisão) em vez de um por item.
  const porObservacao = new Map<string | null, string[]>();
  for (const id of marcar) {
    const obs = params.observacoes?.get(id)?.trim() || null;
    porObservacao.set(obs, [...(porObservacao.get(obs) ?? []), id]);
  }
  for (const [obs, ids] of porObservacao) {
    const { error } = await supabase
      .from('sup_cotacao_proposta_itens')
      .update({ mapa_selecionado: true, mapa_selecionado_em: agora, mapa_selecionado_por: params.usuarioNome, mapa_observacao: obs })
      .in('id', ids);
    if (error) throw new Error(`Falha ao salvar a seleção do mapa: ${error.message}`);
  }

  if (desmarcar.length > 0) {
    const { error } = await supabase
      .from('sup_cotacao_proposta_itens')
      .update({ mapa_selecionado: false, mapa_selecionado_em: null, mapa_selecionado_por: null, mapa_observacao: null })
      .in('id', desmarcar);
    if (error) throw new Error(`Falha ao limpar a seleção do mapa: ${error.message}`);
  }
}

// =====================================================================
// Tabelas de referência do export SAP
// =====================================================================

/** Códigos de condição de pagamento (DDP) do SAP — `sup_ddp`, cadastrada fora deste módulo. Usado no modal de "Exportar SAP". */
export async function listarDdp(): Promise<{ ddp: string; descricao: string }[]> {
  const { data, error } = await supabase.from('sup_ddp').select('ddp, descricao').order('ddp');
  if (error) throw new Error(`Falha ao carregar a tabela de DDP: ${error.message}`);
  return data ?? [];
}

/** Códigos de imposto do SAP (série A/B/C/H) — `sup_impostos`. Usado no modal de "Exportar SAP" para sugerir/escolher o código fiscal de cada item. */
export async function listarImpostosSap(): Promise<{ incoterms: string; descricao: string }[]> {
  const { data, error } = await supabase.from('sup_impostos').select('incoterms, descricao').order('incoterms');
  if (error) throw new Error(`Falha ao carregar a tabela de impostos: ${error.message}`);
  return data ?? [];
}

/** Cadastra um novo código de DDP em `sup_ddp` — atalho no modal de "Exportar SAP" para quando o código que o comprador precisa ainda não está na tabela. */
export async function criarDdp(params: { ddp: string; descricao: string }): Promise<void> {
  const { error } = await supabase.from('sup_ddp').insert({ ddp: params.ddp, descricao: params.descricao });
  if (error) throw new Error(`Falha ao cadastrar o DDP: ${error.message}`);
}

// =====================================================================
// Vínculos de itens da Central de Compras com Processos de Cotação
// =====================================================================

export interface CotacaoItemVinculo {
  processoId: string;
  numero: string;
  titulo: string | null;
  status: string;
  createdAt: string;
}

/**
 * Consulta todos os processos e itens de cotacao ativos para mapear
 * quais itens de compras possuem cotacao aberta/concluida.
 * Indexado tanto por `ri` quanto por `rm-item_reqc`.
 */
export async function buscarCotacoesItensMap(): Promise<Map<string, CotacaoItemVinculo[]>> {
  try {
    const [{ data: processos, error: e1 }, { data: itens, error: e2 }] = await Promise.all([
      supabase.from('sup_cotacao_processos').select('id, numero, status, titulo, created_at'),
      supabase.from('sup_cotacao_processo_itens').select('ri, rm, item_reqc, processo_id'),
    ]);

    if (e1 || e2 || !processos || !itens) {
      console.warn('Erro ao carregar vínculos de cotação:', e1 || e2);
      return new Map();
    }

    const procMap = new Map<string, { id: string; numero: string; status: string; titulo: string | null; created_at: string }>();
    for (const p of processos) {
      if (p.id) procMap.set(p.id, p);
    }

    const map = new Map<string, CotacaoItemVinculo[]>();
    for (const it of itens) {
      const p = procMap.get(it.processo_id);
      if (!p) continue;
      const vinculo: CotacaoItemVinculo = {
        processoId: p.id,
        numero: p.numero,
        titulo: p.titulo,
        status: p.status,
        createdAt: p.created_at,
      };

      if (it.ri) {
        const arr = map.get(it.ri) ?? [];
        if (!arr.some(x => x.processoId === p.id)) {
          arr.push(vinculo);
          map.set(it.ri, arr);
        }
      }

      if (it.rm && it.item_reqc) {
        const chaveRm = `${it.rm}-${it.item_reqc}`;
        const arr = map.get(chaveRm) ?? [];
        if (!arr.some(x => x.processoId === p.id)) {
          arr.push(vinculo);
          map.set(chaveRm, arr);
        }
      }
    }

    // Ordena cada lista da mais recente para a mais antiga
    for (const [, arr] of map.entries()) {
      arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return map;
  } catch (err) {
    console.warn('Falha ao carregar mapa de cotações por item:', err);
    return new Map();
  }
}

