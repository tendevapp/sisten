/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Camada de acesso a dados do módulo de Análise de Cotações — CRUD direto no
 * Supabase (dado transacional do módulo, não cache global; mesmo padrão de
 * ContasPagar.tsx e Materials.tsx, sem passar pelo localDb) mais a
 * orquestração da extração: segmenta o markdown colado, dispara uma chamada
 * de IA por fornecedor em paralelo, valida o checksum, reprocessa uma vez
 * quando não fecha, vincula pela cascata de vinculo.ts e sugere imposto/DDP
 * antes de gravar.
 */

import { supabase } from '../../db/supabaseClient';
import { localDb } from '../../db/localDb';
import { gerarUUID } from '../ids';
import type {
  CotacaoLote, CotacaoItem, CotacaoProposta, CotacaoPropostaItem, CotacaoDecisao,
} from '../../types';
import { segmentarDocumentoUnificado, dividirBlocoParaExtracao } from './segmentar';
import { validarProposta, montarContextoReprocessamento, type ResultadoValidacaoProposta } from './validacao';
import { vincularItem, type ReferenciaConhecida } from './vinculo';
import { precoUnitarioEfetivo, custoTotalUnitario } from './calculo';
import { sugerirDDP, sugerirImposto, perfilFiscalDoItem, type CodigoDDP, type CodigoImposto } from './matching';
import type { ItemCanonico, ItemExtraido, PropostaExtraida } from './tipos';

function exigirSupabase() {
  if (!supabase) throw new Error('Sem conexão com o servidor.');
  return supabase;
}

// ============================================================================
// Lote
// ============================================================================

export interface NovoItemLote {
  ri?: string | null;
  rm?: string | null;
  item_reqc?: string | null;
  material_code?: string | null;
  descricao_canonica: string;
  texto_tecnico?: string | null;
  referencia?: string | null;
  unidade?: string | null;
  quantidade?: number | null;
}

export async function criarLote(titulo: string, itens: NovoItemLote[]): Promise<CotacaoLote> {
  const db = exigirSupabase();
  const user = localDb.getCurrentUser();

  const { data: numeroGerado, error: erroNumero } = await db.rpc('proximo_numero_cotacao');
  if (erroNumero) throw new Error(`Falha ao gerar número da cotação: ${erroNumero.message}`);

  const loteId = gerarUUID();
  const { error: erroLote } = await db.from('cotacao_lote').insert({
    id: loteId,
    numero: numeroGerado as string,
    titulo,
    status: 'rascunho',
    criado_por: user?.id ?? null,
    criado_por_nome: user?.name ?? null,
  });
  if (erroLote) throw new Error(`Falha ao criar cotação: ${erroLote.message}`);

  if (itens.length > 0) {
    const linhas = itens.map((item, i) => ({ id: gerarUUID(), lote_id: loteId, ordem: i, ...item }));
    const { error: erroItens } = await db.from('cotacao_item').insert(linhas);
    if (erroItens) throw new Error(`Falha ao gravar itens do lote: ${erroItens.message}`);
  }

  const lote = await buscarLote(loteId);
  if (!lote) throw new Error('Cotação criada, mas não foi possível recarregá-la.');
  return lote;
}

export async function buscarLote(loteId: string): Promise<CotacaoLote | null> {
  const db = exigirSupabase();
  const { data, error } = await db.from('cotacao_lote').select('*').eq('id', loteId).maybeSingle();
  if (error) throw new Error(`Falha ao carregar cotação: ${error.message}`);
  return data as CotacaoLote | null;
}

export async function listarLotes(): Promise<CotacaoLote[]> {
  const db = exigirSupabase();
  const { data, error } = await db.from('cotacao_lote').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(`Falha ao listar cotações: ${error.message}`);
  return (data ?? []) as CotacaoLote[];
}

export async function listarItensLote(loteId: string): Promise<CotacaoItem[]> {
  const db = exigirSupabase();
  const { data, error } = await db.from('cotacao_item').select('*').eq('lote_id', loteId).order('ordem');
  if (error) throw new Error(`Falha ao carregar itens do lote: ${error.message}`);
  return (data ?? []) as CotacaoItem[];
}

export async function listarPropostas(loteId: string): Promise<CotacaoProposta[]> {
  const db = exigirSupabase();
  const { data, error } = await db.from('cotacao_proposta').select('*').eq('lote_id', loteId).order('created_at');
  if (error) throw new Error(`Falha ao carregar propostas: ${error.message}`);
  return (data ?? []) as CotacaoProposta[];
}

export async function listarItensProposta(propostaId: string): Promise<CotacaoPropostaItem[]> {
  const db = exigirSupabase();
  const { data, error } = await db.from('cotacao_proposta_item').select('*').eq('proposta_id', propostaId).order('linha_ordem');
  if (error) throw new Error(`Falha ao carregar itens da proposta: ${error.message}`);
  return (data ?? []) as CotacaoPropostaItem[];
}

export async function listarTodosItensPropostaDoLote(loteId: string): Promise<CotacaoPropostaItem[]> {
  const db = exigirSupabase();
  const propostas = await listarPropostas(loteId);
  if (propostas.length === 0) return [];
  const { data, error } = await db
    .from('cotacao_proposta_item')
    .select('*')
    .in('proposta_id', propostas.map(p => p.id))
    .order('linha_ordem');
  if (error) throw new Error(`Falha ao carregar itens das propostas: ${error.message}`);
  return (data ?? []) as CotacaoPropostaItem[];
}

// ============================================================================
// Catálogos de domínio (impostos / ddp) — carregados uma vez por sessão de análise
// ============================================================================

let catalogoDdpCache: CodigoDDP[] | null = null;
let catalogoImpostosCache: CodigoImposto[] | null = null;

export async function buscarCatalogoDDP(): Promise<CodigoDDP[]> {
  if (catalogoDdpCache) return catalogoDdpCache;
  const db = exigirSupabase();
  const { data, error } = await db.from('ddp').select('ddp, descricao').order('ddp');
  if (error) throw new Error(`Falha ao carregar catálogo de condições de pagamento: ${error.message}`);
  catalogoDdpCache = (data ?? []) as CodigoDDP[];
  return catalogoDdpCache;
}

export async function buscarCatalogoImpostos(): Promise<CodigoImposto[]> {
  if (catalogoImpostosCache) return catalogoImpostosCache;
  const db = exigirSupabase();
  const { data, error } = await db.from('impostos').select('incoterms, descricao').order('incoterms');
  if (error) throw new Error(`Falha ao carregar catálogo de impostos: ${error.message}`);
  catalogoImpostosCache = (data ?? []) as CodigoImposto[];
  return catalogoImpostosCache;
}

// ============================================================================
// Extração — colar markdown, segmentar, extrair em paralelo, validar, vincular
// ============================================================================

export interface ProgressoExtracao {
  fornecedorDetectado: string;
  status: 'extraindo' | 'reprocessando' | 'concluido' | 'erro';
  propostaId?: string;
  erro?: string;
}

interface RespostaEdgeFunction {
  ok: boolean;
  error?: string;
  detail?: string;
  modelo?: string;
  cotacoes?: Array<Record<string, unknown> & { itens: ItemExtraido[] }>;
  avisos?: string[];
}

async function invocarEstruturarCotacao(
  loteId: string,
  markdown: string,
  itensCanonicosRef: Array<{ id: string; descricao_canonica: string; unidade_padrao?: string | null; material_code?: string | null }>,
): Promise<RespostaEdgeFunction> {
  const db = exigirSupabase();
  const { data, error } = await db.functions.invoke('estruturar-cotacao', {
    body: { lote_id: loteId, markdown, itens_canonicos: itensCanonicosRef },
  });
  if (error) throw new Error(`Falha ao chamar a extração por IA: ${error.message}`);
  return data as RespostaEdgeFunction;
}

/**
 * Cola o documento (uma ou várias propostas juntas), segmenta
 * deterministicamente por fornecedor e dispara uma extração por bloco em
 * paralelo — tempo total = a mais lenta, não a soma. Falha isolada de um
 * bloco não derruba os outros.
 */
export async function processarDocumentoColado(
  loteId: string,
  markdownColado: string,
  onProgresso?: (p: ProgressoExtracao) => void,
): Promise<CotacaoProposta[]> {
  const itensCanonicos = await listarItensLote(loteId);
  const itensCanonicosRef = itensCanonicos.map(i => ({
    id: i.id,
    descricao_canonica: i.descricao_canonica,
    unidade_padrao: i.unidade,
    material_code: i.material_code,
  }));

  const blocos = segmentarDocumentoUnificado(markdownColado);
  if (blocos.length === 0) throw new Error('Nenhum conteúdo reconhecível foi colado.');

  const itemCanonicoParaVinculo: ItemCanonico[] = itensCanonicos.map(i => ({
    id: i.id,
    descricao_canonica: i.descricao_canonica,
    referencia: i.referencia,
    material_code: i.material_code,
    unidade: i.unidade,
  }));

  const [catalogoDdp, catalogoImpostos] = await Promise.all([buscarCatalogoDDP(), buscarCatalogoImpostos()]);

  const resultados = await Promise.allSettled(
    blocos.map(bloco =>
      processarBloco(loteId, bloco.conteudo, itensCanonicosRef, itemCanonicoParaVinculo, catalogoDdp, catalogoImpostos, onProgresso),
    ),
  );

  const propostas: CotacaoProposta[] = [];
  for (const r of resultados) {
    if (r.status === 'fulfilled') propostas.push(r.value);
    else console.error('Falha ao processar bloco de proposta de cotação:', r.reason);
  }
  return propostas;
}

function paraPropostaExtraida(cotacao: Record<string, unknown> & { itens?: ItemExtraido[] }): PropostaExtraida {
  return {
    fornecedor: cotacao.fornecedor as PropostaExtraida['fornecedor'],
    numero_proposta: cotacao.numero_proposta as string | null,
    data_cotacao: cotacao.data_cotacao as string | null,
    validade_texto: cotacao.validade_texto as string | null,
    condicao_pagamento_texto: cotacao.condicao_pagamento_texto as string | null,
    prazo_entrega_texto: cotacao.prazo_entrega_texto as string | null,
    frete_texto: cotacao.frete_texto as string | null,
    frete_valor: cotacao.frete_valor as number | null,
    frete_modalidade: cotacao.frete_modalidade as string | null,
    faturamento_minimo: cotacao.faturamento_minimo as number | null,
    total_declarado: cotacao.total_declarado as number | null,
    itens_declarados: cotacao.itens_declarados as number | null,
    notas_gerais: (cotacao.notas_gerais as string[]) ?? [],
    itens: cotacao.itens ?? [],
  };
}

function textoParaSugestaoDDP(cotacao: Record<string, unknown>): string | null {
  const semantica = cotacao.pagamento_semantica as { prazo_dias?: number | null; a_combinar?: boolean } | undefined;
  if (semantica?.a_combinar) return 'a combinar';
  if (semantica?.prazo_dias) return `${semantica.prazo_dias} dias`;
  return (cotacao.condicao_pagamento_texto as string | null) ?? null;
}

/**
 * Campos de nível de proposta preenchidos por quem os declarar primeiro
 * (fornecedor/condições costumam aparecer só na 1ª página) — exceto o total
 * declarado e a contagem de itens, que nos documentos reais aparecem no
 * RODAPÉ (última página), então preferem o último valor não nulo.
 */
const CAMPOS_PROPOSTA_PRIMEIRO_NAO_NULO = [
  'fornecedor', 'numero_proposta', 'data_cotacao', 'validade_texto',
  'condicao_pagamento_texto', 'pagamento_semantica', 'prazo_entrega_texto',
  'frete_texto', 'frete_valor', 'frete_modalidade', 'faturamento_minimo',
] as const;
const CAMPOS_PROPOSTA_ULTIMO_NAO_NULO = ['total_declarado', 'itens_declarados'] as const;

/**
 * Mescla os resultados de N chamadas de IA (uma por sub-lote/página da mesma
 * proposta — ver dividirBlocoParaExtracao) numa única "cotação extraída".
 * linha_ordem é renumerada sequencialmente: cada chamada reinicia sua própria
 * contagem a partir de 1, então usar o valor bruto colidiria entre sub-lotes.
 * numero_item_original (o rótulo do documento) não é tocado.
 */
function mesclarCotacoesExtraidas(
  cotacoes: Array<Record<string, unknown> & { itens?: ItemExtraido[] }>,
): Record<string, unknown> & { itens: ItemExtraido[] } {
  if (cotacoes.length === 1) return cotacoes[0] as Record<string, unknown> & { itens: ItemExtraido[] };

  const base: Record<string, unknown> = {};
  for (const campo of CAMPOS_PROPOSTA_PRIMEIRO_NAO_NULO) {
    const encontrado = cotacoes.find(c => c[campo] != null);
    if (encontrado) base[campo] = encontrado[campo];
  }
  for (const campo of CAMPOS_PROPOSTA_ULTIMO_NAO_NULO) {
    for (let i = cotacoes.length - 1; i >= 0; i--) {
      if (cotacoes[i][campo] != null) { base[campo] = cotacoes[i][campo]; break; }
    }
  }
  base.notas_gerais = Array.from(new Set(cotacoes.flatMap(c => (c.notas_gerais as string[] | undefined) ?? [])));

  let contador = 0;
  base.itens = cotacoes.flatMap(c => (c.itens ?? []).map(item => ({ ...item, linha_ordem: contador++ })));

  return base as Record<string, unknown> & { itens: ItemExtraido[] };
}

async function processarBloco(
  loteId: string,
  markdown: string,
  itensCanonicosRef: Array<{ id: string; descricao_canonica: string; unidade_padrao?: string | null; material_code?: string | null }>,
  itensCanonicos: ItemCanonico[],
  catalogoDdp: CodigoDDP[],
  catalogoImpostos: CodigoImposto[],
  onProgresso?: (p: ProgressoExtracao) => void,
): Promise<CotacaoProposta> {
  const db = exigirSupabase();
  onProgresso?.({ fornecedorDetectado: 'Identificando fornecedor…', status: 'extraindo' });

  // Documentos grandes (muitos itens × schema fiscal completo) medem-se
  // excedendo o teto rígido de 150s das Edge Functions numa chamada só —
  // ver comentário em dividirBlocoParaExtracao. Sub-lotes pequenos rodam em
  // paralelo, então o tempo total fica próximo do sub-lote mais lento, não
  // da soma.
  const subLotes = dividirBlocoParaExtracao(markdown);
  const respostasSubLote = await Promise.allSettled(
    subLotes.map(subLote => invocarEstruturarCotacao(loteId, subLote, itensCanonicosRef)),
  );

  const respostasOk = respostasSubLote
    .map(r => (r.status === 'fulfilled' ? r.value : null))
    .filter((r): r is RespostaEdgeFunction => r !== null);
  for (const r of respostasSubLote) {
    if (r.status === 'rejected') console.error('Falha ao extrair um sub-lote da proposta:', r.reason);
  }

  const cotacoesExtraidas = respostasOk.flatMap(r => (r.ok && r.cotacoes ? r.cotacoes : []));
  let resposta: RespostaEdgeFunction = respostasOk.length > 0
    ? { ok: cotacoesExtraidas.length > 0, cotacoes: cotacoesExtraidas, modelo: respostasOk.find(r => r.modelo)?.modelo, avisos: respostasOk.flatMap(r => r.avisos ?? []) }
    : { ok: false, error: 'provider_error', detail: 'Todas as chamadas de extração falharam.' };
  let cotacaoExtraida = cotacoesExtraidas.length > 0 ? mesclarCotacoesExtraidas(cotacoesExtraidas) : null;
  let propostaExtraida: PropostaExtraida | null = cotacaoExtraida ? paraPropostaExtraida(cotacaoExtraida) : null;
  let validacao: ResultadoValidacaoProposta | null = propostaExtraida ? validarProposta(propostaExtraida) : null;
  let tentativas = 1;

  // Reprocessamento automático só para o caminho de sub-lote único: quando a
  // proposta já foi dividida, cada pedaço é pequeno o bastante para não
  // valer o custo de reprocessar tudo de novo — a revisão manual do passo 3
  // cobre o que sobrar divergente.
  if (subLotes.length === 1 && propostaExtraida && validacao && validacao.status === 'divergente') {
    const nomeParcial = (cotacaoExtraida?.fornecedor as { nome_extraido?: string } | undefined)?.nome_extraido || 'fornecedor';
    onProgresso?.({ fornecedorDetectado: nomeParcial, status: 'reprocessando' });
    const contexto = montarContextoReprocessamento(validacao);
    try {
      const respostaRetry = await invocarEstruturarCotacao(loteId, `${markdown}\n\n[REVISÃO NECESSÁRIA — ${contexto}]`, itensCanonicosRef);
      if (respostaRetry.ok && respostaRetry.cotacoes?.[0]) {
        const retryExtraida = respostaRetry.cotacoes[0];
        const retryProposta = paraPropostaExtraida(retryExtraida);
        const retryValidacao = validarProposta(retryProposta);
        resposta = respostaRetry;
        cotacaoExtraida = retryExtraida;
        propostaExtraida = retryProposta;
        validacao = retryValidacao;
      }
    } catch (e) {
      console.error('Reprocessamento falhou — mantendo a extração original marcada como divergente.', e);
    }
    tentativas = 2;
  }

  const fornecedorNome = (cotacaoExtraida?.fornecedor as { nome_extraido?: string } | undefined)?.nome_extraido || 'Fornecedor não identificado';
  const propostaId = gerarUUID();

  const sugestaoDdp = sugerirDDP(cotacaoExtraida ? textoParaSugestaoDDP(cotacaoExtraida) : null, catalogoDdp);

  const propostaRow = {
    id: propostaId,
    lote_id: loteId,
    cnpj: (cotacaoExtraida?.fornecedor as { cnpj_extraido?: string | null } | undefined)?.cnpj_extraido ?? null,
    fornecedor_nome: fornecedorNome,
    uf: (cotacaoExtraida?.fornecedor as { uf_extraido?: string | null } | undefined)?.uf_extraido ?? null,
    numero_proposta: propostaExtraida?.numero_proposta ?? null,
    data_cotacao: propostaExtraida?.data_cotacao ?? null,
    validade_texto: propostaExtraida?.validade_texto ?? null,
    condicao_pagamento_texto: propostaExtraida?.condicao_pagamento_texto ?? null,
    ddp_codigo: sugestaoDdp.codigo,
    ddp_confirmado: false,
    ddp_pendente: sugestaoDdp.pendente,
    frete_texto: propostaExtraida?.frete_texto ?? null,
    frete_valor: propostaExtraida?.frete_valor ?? null,
    frete_modalidade: propostaExtraida?.frete_modalidade ?? null,
    faturamento_minimo: propostaExtraida?.faturamento_minimo ?? null,
    prazo_entrega_texto: propostaExtraida?.prazo_entrega_texto ?? null,
    notas_gerais: propostaExtraida?.notas_gerais ?? [],
    total_declarado: propostaExtraida?.total_declarado ?? null,
    total_calculado: validacao?.totalCalculado ?? null,
    itens_declarados: propostaExtraida?.itens_declarados ?? null,
    validacao_status: validacao?.status ?? 'nao_declarado',
    validacao_detalhe: validacao?.detalhe ?? (resposta.ok ? null : `Extração falhou: ${resposta.detail ?? resposta.error ?? 'erro desconhecido'}`),
    markdown_bruto: markdown,
    extracao_json: resposta as unknown,
    extracao_modelo: resposta.modelo ?? null,
    extracao_status: resposta.ok ? 'extraido' : 'erro',
    extracao_tentativas: tentativas,
  };

  const { error: erroProposta } = await db.from('cotacao_proposta').insert(propostaRow);
  if (erroProposta) throw new Error(`Falha ao gravar proposta de "${fornecedorNome}": ${erroProposta.message}`);

  if (propostaExtraida && propostaExtraida.itens.length > 0) {
    await gravarItensProposta(loteId, propostaId, propostaExtraida, itensCanonicos, catalogoImpostos, validacao);
  }

  onProgresso?.({
    fornecedorDetectado: fornecedorNome,
    status: resposta.ok ? 'concluido' : 'erro',
    propostaId,
    erro: resposta.ok ? undefined : (resposta.detail ?? resposta.error),
  });

  const propostaSalva = await db.from('cotacao_proposta').select('*').eq('id', propostaId).single();
  return propostaSalva.data as CotacaoProposta;
}

async function buscarReferenciasConhecidas(loteId: string): Promise<ReferenciaConhecida[]> {
  const db = exigirSupabase();
  // Referências já vinculadas de OUTRAS propostas do mesmo lote — o primeiro
  // fornecedor com referência limpa "ensina" os seguintes (ver vinculo.ts).
  // Limitação aceita: blocos processados em paralelo não se ensinam entre si
  // na mesma rodada (cada um lê este catálogo antes que os irmãos terminem);
  // a revisão manual do passo 3 cobre o que passar batido.
  const { data, error } = await db
    .from('cotacao_proposta_item')
    .select('cotacao_item_id, referencia, cotacao_proposta!inner(lote_id)')
    .eq('cotacao_proposta.lote_id', loteId)
    .not('cotacao_item_id', 'is', null)
    .not('referencia', 'is', null);
  if (error || !data) return [];
  return data
    .filter((row: any) => row.referencia && row.cotacao_item_id)
    .map((row: any) => ({ cotacaoItemId: row.cotacao_item_id as string, referencia: row.referencia as string }));
}

async function gravarItensProposta(
  loteId: string,
  propostaId: string,
  proposta: PropostaExtraida,
  itensCanonicos: ItemCanonico[],
  catalogoImpostos: CodigoImposto[],
  validacaoProposta: ResultadoValidacaoProposta | null,
): Promise<void> {
  const db = exigirSupabase();
  const referenciasConhecidas = await buscarReferenciasConhecidas(loteId);
  const itensComProblema = new Set(validacaoProposta?.itensComProblema ?? []);

  const linhas = proposta.itens.map(item => {
    const vinculo = vincularItem(item, itensCanonicos, referenciasConhecidas);
    const precoEfetivo = precoUnitarioEfetivo(item);
    const custoTotal = custoTotalUnitario(item);
    const sugestaoImposto = sugerirImposto(perfilFiscalDoItem(item), catalogoImpostos);

    return {
      id: gerarUUID(),
      proposta_id: propostaId,
      cotacao_item_id: vinculo.cotacaoItemId,
      numero_item_original: item.numero_item_original ?? null,
      linha_ordem: item.linha_ordem,
      codigo_fornecedor: item.codigo_fornecedor ?? null,
      descricao_bruta: item.descricao_bruta,
      referencia: item.referencia ?? null,
      referencia_normalizada: item.referencia ? item.referencia.toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
      marca: item.marca ?? null,
      unidade: item.unidade ?? null,
      quantidade: item.quantidade,
      preco_unitario_bruto: item.preco_unitario_bruto,
      desconto_valor: item.desconto_valor ?? null,
      desconto_percentual: item.desconto_percentual ?? null,
      subtotal: item.subtotal ?? null,
      preco_unitario_efetivo: precoEfetivo,
      custo_total_unitario: custoTotal,
      ipi_percentual: item.ipi_percentual ?? 0,
      ipi_valor: item.ipi_valor ?? null,
      icms_percentual: item.icms_percentual ?? 0,
      icms_reducao_percentual: item.icms_reducao_percentual ?? 0,
      st_percentual: item.st_percentual ?? 0,
      st_valor: item.st_valor ?? null,
      fcp_valor: item.fcp_valor ?? null,
      pis_percentual: item.pis_percentual ?? null,
      cofins_percentual: item.cofins_percentual ?? null,
      ncm: item.ncm ?? null,
      cst: item.cst ?? null,
      cfop: item.cfop ?? null,
      imposto_codigo: sugestaoImposto.codigo,
      imposto_confirmado: false,
      disponibilidade_texto: item.disponibilidade_texto ?? null,
      prazo_entrega_texto: item.prazo_entrega_texto ?? null,
      observacoes: item.observacoes ?? null,
      confianca_extracao: item.confianca_extracao ?? null,
      match_confianca: vinculo.confianca,
      vinculo_origem: vinculo.origem,
      divergente: vinculo.divergente,
      divergencia_atributo: vinculo.divergenciaAtributo ?? null,
      divergencia_detalhe: vinculo.divergenciaDetalhe ?? null,
      validacao_item_ok: !itensComProblema.has(item.linha_ordem),
    };
  });

  const { error } = await db.from('cotacao_proposta_item').insert(linhas);
  if (error) throw new Error(`Falha ao gravar itens da proposta: ${error.message}`);
}

// ============================================================================
// Vínculo manual (passo 3 — comprador confirma ou troca)
// ============================================================================

export async function atualizarVinculoManual(propostaItemId: string, cotacaoItemId: string | null): Promise<void> {
  const db = exigirSupabase();
  const { error } = await db
    .from('cotacao_proposta_item')
    .update({ cotacao_item_id: cotacaoItemId, vinculo_origem: 'usuario' })
    .eq('id', propostaItemId);
  if (error) throw new Error(`Falha ao atualizar vínculo: ${error.message}`);
}

export async function atualizarImpostoItem(propostaItemId: string, impostoCodigo: string | null): Promise<void> {
  const db = exigirSupabase();
  const { error } = await db
    .from('cotacao_proposta_item')
    .update({ imposto_codigo: impostoCodigo, imposto_confirmado: true })
    .eq('id', propostaItemId);
  if (error) throw new Error(`Falha ao atualizar código de imposto: ${error.message}`);
}

export async function atualizarDdpProposta(propostaId: string, ddpCodigo: string | null): Promise<void> {
  const db = exigirSupabase();
  const { error } = await db
    .from('cotacao_proposta')
    .update({ ddp_codigo: ddpCodigo, ddp_confirmado: true, ddp_pendente: !ddpCodigo })
    .eq('id', propostaId);
  if (error) throw new Error(`Falha ao atualizar condição de pagamento: ${error.message}`);
}

// ============================================================================
// Decisão (passo 4 — fechar o mapa)
// ============================================================================

export interface DecisaoItem {
  cotacaoItemId: string;
  propostaItemId: string;
  quantidadeAdjudicada?: number | null;
  ehMenorPreco: boolean;
  aceitaDivergencia: boolean;
  justificativa?: string | null;
}

/**
 * Grava a adjudicação de cada item, move o lote para "decidido" (dispara o
 * trigger que popula cotacao_preco_historico) e atualiza o item_status das
 * RMs adjudicadas para "Aguardando Aprovação PO", fechando o ciclo aberto
 * pela Central de Compras.
 */
export async function fecharCotacao(loteId: string, decisoes: DecisaoItem[]): Promise<void> {
  const db = exigirSupabase();
  const user = localDb.getCurrentUser();

  const linhas = decisoes.map(d => ({
    id: gerarUUID(),
    lote_id: loteId,
    cotacao_item_id: d.cotacaoItemId,
    proposta_item_id: d.propostaItemId,
    quantidade_adjudicada: d.quantidadeAdjudicada ?? null,
    eh_menor_preco: d.ehMenorPreco,
    aceita_divergencia: d.aceitaDivergencia,
    justificativa: d.justificativa ?? null,
    decidido_por: user?.id ?? null,
    decidido_por_nome: user?.name ?? null,
  }));

  if (linhas.length > 0) {
    const { error: erroDecisao } = await db.from('cotacao_decisao').insert(linhas);
    if (erroDecisao) throw new Error(`Falha ao gravar decisão: ${erroDecisao.message}`);
  }

  const { error: erroLote } = await db
    .from('cotacao_lote')
    .update({ status: 'decidido', updated_at: new Date().toISOString() })
    .eq('id', loteId);
  if (erroLote) throw new Error(`Falha ao fechar a cotação: ${erroLote.message}`);

  await atualizarStatusItensAdjudicados(loteId, decisoes);
}

async function atualizarStatusItensAdjudicados(loteId: string, decisoes: DecisaoItem[]): Promise<void> {
  if (decisoes.length === 0) return;
  const itens = await listarItensLote(loteId);
  const itensPorId = new Map(itens.map(i => [i.id, i]));
  const enriquecidos = localDb.getEnrichedSAPRequisicoes();
  const porRi = new Map(enriquecidos.map(r => [r.ri, r]));

  for (const decisao of decisoes) {
    const item = itensPorId.get(decisao.cotacaoItemId);
    if (!item?.ri) continue; // item avulso, sem RM associada — nada a atualizar no SAP
    const registro = porRi.get(item.ri);
    if (!registro) continue;
    if (!localDb.isValidStatusTransition(registro.item_status, 'Aguardando Aprovação PO')) continue;
    try {
      localDb.updateBuyerFields(item.ri, registro.obs_comprador || '', registro.data_entrega_prevista || '', 'Aguardando Aprovação PO');
    } catch (e) {
      console.error(`Falha ao atualizar status do item ${item.ri} após adjudicação:`, e);
    }
  }
}

// ============================================================================
// Atualização de status do lote (rascunho → aguardando_propostas → em_analise)
// ============================================================================

export async function atualizarStatusLote(loteId: string, status: CotacaoLote['status']): Promise<void> {
  const db = exigirSupabase();
  const { error } = await db.from('cotacao_lote').update({ status, updated_at: new Date().toISOString() }).eq('id', loteId);
  if (error) throw new Error(`Falha ao atualizar status da cotação: ${error.message}`);
}

export async function listarHistoricoPrecos(materialCode: string): Promise<import('../../types').CotacaoPrecoHistorico[]> {
  const db = exigirSupabase();
  const { data, error } = await db
    .from('cotacao_preco_historico')
    .select('*')
    .eq('material_code', materialCode)
    .order('data_cotacao', { ascending: false });
  if (error) throw new Error(`Falha ao carregar histórico de preços: ${error.message}`);
  return (data ?? []) as import('../../types').CotacaoPrecoHistorico[];
}
