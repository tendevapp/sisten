/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Logica pura de renegociacao de cotacoes:
 * - casamento de itens entre rodadas do mesmo fornecedor;
 * - mesclagem de renegociacao parcial (preservando itens nao citados com o
 *   preco da rodada anterior e transferindo selecoes do mapa comparativo);
 * - calculo de saving de negociacao (diferenca unitaria, total e percentual);
 * - reconstrucao do historico encadeado de rodadas (R1 -> R2 -> R3...).
 *
 * Sem imports de `db/` ou DOM: 100% testavel via Vitest.
 */

import { temValor } from './cotacoes';
import { similaridadeDescricao, LIMIAR_SIMILARIDADE_PADRAO } from './mapaCotacao';
import type { PedidoFornecedor } from './pedidoCompra';
import type { CotacaoPropostaDraft, CotacaoPropostaItemDraft } from '../types';

export type OrigemItemRenegociacao = 'renegociado' | 'mantido' | 'novo';

export interface ComparativoItemRenegociacao {
  itemKey: string;
  itemAnteriorKey: string | null;
  origem: OrigemItemRenegociacao;
  descricao: string;
  ri: string | null;
  unidade: string | null;
  quantidadeAnterior: number | null;
  quantidadeNova: number | null;
  precoUnitarioAnterior: number | null;
  precoUnitarioNovo: number | null;
  /** novo - anterior (negativo = reducao de preco). */
  diffUnitario: number | null;
  /** anterior - novo (positivo = saving unitario). */
  savingUnitario: number | null;
  /** ((novo - anterior) / anterior) * 100 (negativo = % de desconto obtido). */
  diffUnitarioPct: number | null;
  precoTotalAnterior: number | null;
  precoTotalNovo: number | null;
  /** totalNovo - totalAnterior (negativo = economia). */
  diffTotal: number | null;
  /** totalAnterior - totalNovo (positivo = saving total no item). */
  savingTotal: number | null;
  /** ((totalNovo - totalAnterior) / totalAnterior) * 100. */
  diffTotalPct: number | null;
  mapaSelecionadoTransferido: boolean;
}

export interface MudancaComercialRenegociacao {
  campo: string;
  anterior: string;
  novo: string;
}

export interface ResumoSavingRenegociacao {
  rodadaAnterior: number;
  rodadaNova: number;
  subtotalAnterior: number;
  subtotalNovo: number;
  descontoAnterior: number;
  descontoNovo: number;
  freteAnterior: number | null;
  freteNovo: number | null;
  /** Total efetivo da rodada anterior (subtotal itens ativos - desconto). */
  totalAnterior: number;
  /** Total efetivo da nova rodada (subtotal itens ativos - desconto). */
  totalNovo: number;
  /** totalNovo - totalAnterior (negativo = reducao). */
  diffTotal: number;
  /** totalAnterior - totalNovo (positivo = saving de negociacao). */
  savingTotal: number;
  /** ((totalNovo - totalAnterior) / totalAnterior) * 100 (negativo = economia %). */
  diffPct: number | null;
  /** ((totalAnterior - totalNovo) / totalAnterior) * 100 (positivo = saving %). */
  savingPct: number | null;
  qtdRenegociados: number;
  qtdMantidos: number;
  qtdNovos: number;
  qtdReduzidos: number;
  qtdAumentados: number;
  qtdIguais: number;
  qtdSelecionadosTransferidos: number;
  itens: ComparativoItemRenegociacao[];
  porItemKey: Map<string, ComparativoItemRenegociacao>;
  mudancasComerciais: MudancaComercialRenegociacao[];
}

export interface HistoricoRodadasProposta {
  rodadaAtual: number;
  /** Cadeia completa ordenada da Rodada 1 ate a rodada vigente. */
  rodadas: CotacaoPropostaDraft[];
  /** Rodada imediatamente anterior a vigente. */
  propostaAnterior: CotacaoPropostaDraft | null;
  /** Primeira rodada (R1) da cadeia, quando houver renegociacao. */
  propostaInicial: CotacaoPropostaDraft | null;
  /** Comparativo da rodada vigente contra a rodada imediatamente anterior. */
  comparativoAnterior: ResumoSavingRenegociacao | null;
  /** Comparativo acumulado contra a R1 (presente a partir da Rodada 3). */
  comparativoInicial: ResumoSavingRenegociacao | null;
}

export interface SavingPedidoFornecedor {
  totalAnterior: number;
  totalNovo: number;
  savingTotal: number;
  diffPct: number | null;
  itensComparados: number;
}

const EPSILON = 0.0001;

export function precoTotalEfetivoItem(item: CotacaoPropostaItemDraft): number | null {
  if (item.preco_total_item != null && Number.isFinite(item.preco_total_item)) return item.preco_total_item;
  if (item.preco_unitario != null && item.quantidade != null) {
    const v = item.preco_unitario * item.quantidade;
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

export function precoUnitarioEfetivoItem(item: CotacaoPropostaItemDraft): number | null {
  if (item.preco_unitario != null && Number.isFinite(item.preco_unitario)) return item.preco_unitario;
  if (item.preco_total_item != null && item.quantidade != null && item.quantidade > 0) {
    const v = item.preco_total_item / item.quantidade;
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

/** Soma dos itens ativos (nao desconsiderados) menos desconto declarado. */
export function subtotalItensAtivos(proposta: CotacaoPropostaDraft): { subtotal: number; temPreco: boolean } {
  let subtotal = 0;
  let temPreco = false;
  for (const it of proposta.itens) {
    if (it.desconsiderado) continue;
    const tot = precoTotalEfetivoItem(it);
    if (tot != null) {
      subtotal += tot;
      temPreco = true;
    }
  }
  return { subtotal, temPreco };
}

export function valorTotalEfetivoProposta(proposta: CotacaoPropostaDraft): number {
  const { subtotal, temPreco } = subtotalItensAtivos(proposta);
  if (!temPreco && proposta.valor_total_orcamento != null && Number.isFinite(proposta.valor_total_orcamento)) {
    return proposta.valor_total_orcamento;
  }
  return subtotal - (proposta.valor_desconto ?? 0);
}

/**
 * Casa um item da nova rodada com o correspondente da rodada anterior do mesmo
 * fornecedor, na ordem de maior confianca:
 *  1. mesmo `processo_item_id`;
 *  2. mesmo `ri`;
 *  3. mesmo `codigo_produto`;
 *  4. maior similaridade de descricao (>= LIMIAR_SIMILARIDADE_PADRAO).
 */
export function casarItemComAnterior(
  itemNovo: CotacaoPropostaItemDraft,
  itensAnteriores: CotacaoPropostaItemDraft[],
  usados: Set<string>,
): CotacaoPropostaItemDraft | null {
  const disponiveis = itensAnteriores.filter(a => !a.desconsiderado && !usados.has(a._key));
  if (disponiveis.length === 0) return null;

  if (itemNovo.processo_item_id) {
    const porProcesso = disponiveis.find(a => a.processo_item_id === itemNovo.processo_item_id);
    if (porProcesso) return porProcesso;
  }

  const riNovo = (itemNovo.ri ?? '').trim();
  if (riNovo) {
    const porRi = disponiveis.find(a => (a.ri ?? '').trim() === riNovo);
    if (porRi) return porRi;
  }

  const codNovo = (itemNovo.codigo_produto ?? '').trim().toUpperCase();
  if (codNovo) {
    const porCodigo = disponiveis.find(a => (a.codigo_produto ?? '').trim().toUpperCase() === codNovo);
    if (porCodigo) return porCodigo;
  }

  let melhor: CotacaoPropostaItemDraft | null = null;
  let melhorScore = 0;
  for (const cand of disponiveis) {
    const score = similaridadeDescricao(itemNovo.descricao_produto, cand.descricao_produto);
    if (score >= LIMIAR_SIMILARIDADE_PADRAO && score > melhorScore) {
      melhorScore = score;
      melhor = cand;
    }
  }
  return melhor;
}

function escolherTexto(novo: string | null | undefined, anterior: string | null | undefined): string | null {
  return temValor(novo) ? (novo as string) : (anterior ?? null);
}

let contadorItemMantido = 0;
function chaveItemMantido(anteriorKey: string): string {
  contadorItemMantido += 1;
  return `reneg_mantido_${Date.now()}_${contadorItemMantido}_${anteriorKey.slice(0, 8)}`;
}

/**
 * Mescla uma proposta recem-extraida pela IA com a proposta salva da rodada
 * anterior do mesmo fornecedor:
 * - preserva identidade do fornecedor (CNPJ, match, cod_vendor, cidade/UF) e
 *   campos comerciais que vieram em branco no novo documento;
 * - casa cada item novo com o anterior herdando vinculo RM, peso e selecao do mapa;
 * - preserva itens nao citados na renegociacao com o preco da rodada anterior
 *   (marcados como `_reneg_origem: 'mantido'`).
 */
export function mesclarPropostaRenegociacao(
  propostaAnterior: CotacaoPropostaDraft,
  propostaExtraida: CotacaoPropostaDraft,
): CotacaoPropostaDraft {
  const itensAnterioresAtivos = propostaAnterior.itens.filter(i => !i.desconsiderado);
  const usados = new Set<string>();

  const itensMesclados: CotacaoPropostaItemDraft[] = propostaExtraida.itens.map(novo => {
    const ant = casarItemComAnterior(novo, itensAnterioresAtivos, usados);
    if (!ant) {
      return {
        ...novo,
        mapa_selecionado: false,
        mapa_observacao: null,
        _reneg_origem: 'novo',
        _reneg_item_anterior_key: null,
      };
    }

    usados.add(ant._key);
    const quantidade = novo.quantidade ?? ant.quantidade;
    const precoUnitario = novo.preco_unitario ?? (
      novo.preco_total_item != null && quantidade != null && quantidade > 0
        ? Number((novo.preco_total_item / quantidade).toFixed(6))
        : ant.preco_unitario
    );
    const precoTotal = novo.preco_total_item ?? (
      precoUnitario != null && quantidade != null
        ? Number((precoUnitario * quantidade).toFixed(2))
        : ant.preco_total_item
    );

    const processoItemId = novo.processo_item_id ?? ant.processo_item_id;
    const temVinculoRm = Boolean(processoItemId);

    return {
      ...novo,
      processo_item_id: processoItemId,
      ri: novo.processo_item_id ? novo.ri : (ant.ri ?? novo.ri),
      material_code: novo.processo_item_id ? novo.material_code : (ant.material_code ?? novo.material_code),
      fora_escopo: temVinculoRm ? false : (novo.fora_escopo || ant.fora_escopo),
      vinculo_origem: novo.processo_item_id ? novo.vinculo_origem : ant.vinculo_origem,
      vinculo_score: novo.processo_item_id ? novo.vinculo_score : ant.vinculo_score,
      codigo_produto: escolherTexto(novo.codigo_produto, ant.codigo_produto),
      marca_fabricante: escolherTexto(novo.marca_fabricante, ant.marca_fabricante),
      unidade_medida: escolherTexto(novo.unidade_medida, ant.unidade_medida),
      ncm: escolherTexto(novo.ncm, ant.ncm),
      cst: escolherTexto(novo.cst, ant.cst),
      cfop: escolherTexto(novo.cfop, ant.cfop),
      quantidade,
      preco_unitario: precoUnitario,
      preco_total_item: precoTotal,
      aliquota_icms_pct: novo.aliquota_icms_pct ?? ant.aliquota_icms_pct,
      aliquota_pis_pct: novo.aliquota_pis_pct ?? ant.aliquota_pis_pct,
      aliquota_cofins_pct: novo.aliquota_cofins_pct ?? ant.aliquota_cofins_pct,
      aliquota_ipi_pct: novo.aliquota_ipi_pct ?? ant.aliquota_ipi_pct,
      peso_unitario_kg: novo.peso_unitario_kg ?? ant.peso_unitario_kg,
      peso_origem: novo.peso_unitario_kg != null ? novo.peso_origem : ant.peso_origem,
      codigo_fiscal: ant.codigo_fiscal ?? novo.codigo_fiscal,
      mapa_selecionado: Boolean(ant.mapa_selecionado),
      mapa_observacao: ant.mapa_selecionado ? (ant.mapa_observacao ?? null) : null,
      _reneg_origem: 'renegociado',
      _reneg_item_anterior_key: ant._key,
    };
  });

  // Renegociacao parcial: preserva os itens nao citados no novo documento com o preco anterior.
  const itensMantidos: CotacaoPropostaItemDraft[] = [];
  for (const ant of itensAnterioresAtivos) {
    if (usados.has(ant._key)) continue;
    itensMantidos.push({
      ...ant,
      _key: chaveItemMantido(ant._key),
      mapa_selecionado: Boolean(ant.mapa_selecionado),
      mapa_observacao: ant.mapa_selecionado ? (ant.mapa_observacao ?? null) : null,
      _reneg_origem: 'mantido',
      _reneg_item_anterior_key: ant._key,
    });
  }

  const todosItens = [...itensMesclados, ...itensMantidos];
  const freteModalidade = propostaExtraida.frete_modalidade ?? propostaAnterior.frete_modalidade;
  const valorFrete = propostaExtraida.valor_frete != null
    ? propostaExtraida.valor_frete
    : freteModalidade === 'CIF'
      ? null
      : (propostaExtraida.frete_modalidade == null || propostaExtraida.frete_modalidade === propostaAnterior.frete_modalidade)
        ? propostaAnterior.valor_frete
        : null;

  const valorDesconto = propostaExtraida.valor_desconto ?? null;
  const somaItens = todosItens.reduce((acc, it) => acc + (precoTotalEfetivoItem(it) ?? 0), 0);
  const valorTotalOrcamento = itensMantidos.length > 0
    ? Number((somaItens - (valorDesconto ?? 0)).toFixed(2))
    : (propostaExtraida.valor_total_orcamento ?? (somaItens > 0 ? Number((somaItens - (valorDesconto ?? 0)).toFixed(2)) : null));

  return {
    ...propostaExtraida,
    _salvo: false,
    rodada: (propostaAnterior.rodada ?? 1) + 1,
    ativa: true,
    proposta_origem_id: propostaAnterior._key,
    substituida_por_id: null,
    renegociada_em: null,
    renegociada_por: null,

    numero_proposta: escolherTexto(propostaExtraida.numero_proposta, propostaAnterior.numero_proposta),
    data_emissao: propostaExtraida.data_emissao ?? propostaAnterior.data_emissao,
    validade_data: propostaExtraida.validade_data ?? (propostaExtraida.validade_texto ? null : propostaAnterior.validade_data),
    validade_texto: escolherTexto(propostaExtraida.validade_texto, propostaExtraida.validade_data ? null : propostaAnterior.validade_texto),

    fornecedor_razao_social: escolherTexto(propostaExtraida.fornecedor_razao_social, propostaAnterior.fornecedor_razao_social),
    fornecedor_cnpj: propostaExtraida.fornecedor_cnpj ?? propostaAnterior.fornecedor_cnpj,
    fornecedor_inscricao_estadual: escolherTexto(propostaExtraida.fornecedor_inscricao_estadual, propostaAnterior.fornecedor_inscricao_estadual),
    fornecedor_cidade: escolherTexto(propostaExtraida.fornecedor_cidade, propostaAnterior.fornecedor_cidade),
    fornecedor_uf: escolherTexto(propostaExtraida.fornecedor_uf, propostaAnterior.fornecedor_uf),
    fornecedor_telefone: escolherTexto(propostaExtraida.fornecedor_telefone, propostaAnterior.fornecedor_telefone),

    cod_vendor: propostaAnterior.cod_vendor,
    contato_id: propostaAnterior.contato_id,
    fornecedor_match: propostaAnterior.fornecedor_match,

    vendedor_nome: escolherTexto(propostaExtraida.vendedor_nome, propostaAnterior.vendedor_nome),
    vendedor_email: escolherTexto(propostaExtraida.vendedor_email, propostaAnterior.vendedor_email),
    vendedor_telefone: escolherTexto(propostaExtraida.vendedor_telefone, propostaAnterior.vendedor_telefone),

    cliente_razao_social: escolherTexto(propostaExtraida.cliente_razao_social, propostaAnterior.cliente_razao_social),
    cliente_cnpj: propostaExtraida.cliente_cnpj ?? propostaAnterior.cliente_cnpj,
    cliente_inscricao_estadual: escolherTexto(propostaExtraida.cliente_inscricao_estadual, propostaAnterior.cliente_inscricao_estadual),
    cliente_cidade: escolherTexto(propostaExtraida.cliente_cidade, propostaAnterior.cliente_cidade),
    cliente_uf: escolherTexto(propostaExtraida.cliente_uf, propostaAnterior.cliente_uf),

    condicao_pagamento: escolherTexto(propostaExtraida.condicao_pagamento, propostaAnterior.condicao_pagamento),
    forma_pagamento: escolherTexto(propostaExtraida.forma_pagamento, propostaAnterior.forma_pagamento),
    prazo_entrega_texto: escolherTexto(propostaExtraida.prazo_entrega_texto, propostaAnterior.prazo_entrega_texto),
    prazo_entrega_dias: propostaExtraida.prazo_entrega_dias ?? propostaAnterior.prazo_entrega_dias,
    frete_modalidade: freteModalidade,
    transportadora_indicada: escolherTexto(propostaExtraida.transportadora_indicada, propostaAnterior.transportadora_indicada),
    faturamento_minimo: propostaExtraida.faturamento_minimo ?? propostaAnterior.faturamento_minimo,
    dados_bancarios_pix: escolherTexto(propostaExtraida.dados_bancarios_pix, propostaAnterior.dados_bancarios_pix),
    valor_frete: valorFrete,
    valor_desconto: valorDesconto,
    valor_total_orcamento: valorTotalOrcamento,
    observacoes_gerais: escolherTexto(propostaExtraida.observacoes_gerais, propostaAnterior.observacoes_gerais),

    itens: todosItens,
  };
}

function detectarMudancasComerciais(
  anterior: CotacaoPropostaDraft,
  nova: CotacaoPropostaDraft,
): MudancaComercialRenegociacao[] {
  const mudancas: MudancaComercialRenegociacao[] = [];
  const comparar = (campo: string, a: string | null | undefined, b: string | null | undefined) => {
    const va = (a ?? '').trim();
    const vb = (b ?? '').trim();
    if (va !== vb && (va || vb)) {
      mudancas.push({ campo, anterior: va || '—', novo: vb || '—' });
    }
  };
  comparar('Condição de pagamento', anterior.condicao_pagamento, nova.condicao_pagamento);
  comparar('Prazo de entrega', anterior.prazo_entrega_texto, nova.prazo_entrega_texto);
  comparar('Modalidade de frete', anterior.frete_modalidade, nova.frete_modalidade);
  if ((anterior.valor_frete ?? 0) !== (nova.valor_frete ?? 0)) {
    mudancas.push({
      campo: 'Frete destacado',
      anterior: anterior.valor_frete != null ? `R$ ${anterior.valor_frete.toFixed(2)}` : '—',
      novo: nova.valor_frete != null ? `R$ ${nova.valor_frete.toFixed(2)}` : '—',
    });
  }
  if ((anterior.valor_desconto ?? 0) !== (nova.valor_desconto ?? 0)) {
    mudancas.push({
      campo: 'Desconto declarado',
      anterior: anterior.valor_desconto != null ? `R$ ${anterior.valor_desconto.toFixed(2)}` : '—',
      novo: nova.valor_desconto != null ? `R$ ${nova.valor_desconto.toFixed(2)}` : '—',
    });
  }
  comparar('Validade', anterior.validade_data ?? anterior.validade_texto, nova.validade_data ?? nova.validade_texto);
  return mudancas;
}

/**
 * Compara a nova proposta com a proposta anterior do mesmo fornecedor e calcula
 * o saving de negociacao item a item (unitario, total e %) e consolidado.
 */
export function calcularComparativoRenegociacao(
  propostaAnterior: CotacaoPropostaDraft,
  propostaNova: CotacaoPropostaDraft,
): ResumoSavingRenegociacao {
  const itensAnterioresAtivos = propostaAnterior.itens.filter(i => !i.desconsiderado);
  const anteriorPorKey = new Map(itensAnterioresAtivos.map(i => [i._key, i]));
  const usados = new Set<string>();

  const itensComparados: ComparativoItemRenegociacao[] = [];
  const porItemKey = new Map<string, ComparativoItemRenegociacao>();

  let qtdRenegociados = 0;
  let qtdMantidos = 0;
  let qtdNovos = 0;
  let qtdReduzidos = 0;
  let qtdAumentados = 0;
  let qtdIguais = 0;
  let qtdSelecionadosTransferidos = 0;

  for (const itemNovo of propostaNova.itens) {
    if (itemNovo.desconsiderado) continue;

    let ant: CotacaoPropostaItemDraft | null = null;
    if (itemNovo._reneg_item_anterior_key && !usados.has(itemNovo._reneg_item_anterior_key)) {
      ant = anteriorPorKey.get(itemNovo._reneg_item_anterior_key) ?? null;
    }
    if (!ant) {
      ant = casarItemComAnterior(itemNovo, itensAnterioresAtivos, usados);
    }
    if (ant) usados.add(ant._key);

    const puAnt = ant ? precoUnitarioEfetivoItem(ant) : null;
    const puNovo = precoUnitarioEfetivoItem(itemNovo);
    const totAnt = ant ? precoTotalEfetivoItem(ant) : null;
    const totNovo = precoTotalEfetivoItem(itemNovo);

    const diffUnitario = puAnt != null && puNovo != null ? puNovo - puAnt : null;
    const savingUnitario = diffUnitario != null ? -diffUnitario : null;
    const diffUnitarioPct = puAnt != null && puAnt > 0 && diffUnitario != null
      ? (diffUnitario / puAnt) * 100
      : null;

    const diffTotal = totAnt != null && totNovo != null ? totNovo - totAnt : null;
    const savingTotal = diffTotal != null ? -diffTotal : null;
    const diffTotalPct = totAnt != null && totAnt > 0 && diffTotal != null
      ? (diffTotal / totAnt) * 100
      : null;

    let origem: OrigemItemRenegociacao;
    if (itemNovo._reneg_origem) {
      origem = itemNovo._reneg_origem;
    } else if (!ant) {
      origem = 'novo';
    } else if (
      (diffUnitario == null || Math.abs(diffUnitario) < EPSILON)
      && (diffTotal == null || Math.abs(diffTotal) < EPSILON)
    ) {
      origem = 'mantido';
    } else {
      origem = 'renegociado';
    }

    if (origem === 'renegociado') qtdRenegociados += 1;
    else if (origem === 'mantido') qtdMantidos += 1;
    else qtdNovos += 1;

    if (diffUnitario != null) {
      if (diffUnitario < -EPSILON) qtdReduzidos += 1;
      else if (diffUnitario > EPSILON) qtdAumentados += 1;
      else qtdIguais += 1;
    }

    const selecionadoTransferido = Boolean(itemNovo.mapa_selecionado);
    if (selecionadoTransferido) qtdSelecionadosTransferidos += 1;

    const comp: ComparativoItemRenegociacao = {
      itemKey: itemNovo._key,
      itemAnteriorKey: ant?._key ?? null,
      origem,
      descricao: itemNovo.descricao_produto || ant?.descricao_produto || 'Item sem descrição',
      ri: itemNovo.ri ?? ant?.ri ?? null,
      unidade: itemNovo.unidade_medida ?? ant?.unidade_medida ?? null,
      quantidadeAnterior: ant?.quantidade ?? null,
      quantidadeNova: itemNovo.quantidade ?? null,
      precoUnitarioAnterior: puAnt,
      precoUnitarioNovo: puNovo,
      diffUnitario,
      savingUnitario,
      diffUnitarioPct,
      precoTotalAnterior: totAnt,
      precoTotalNovo: totNovo,
      diffTotal,
      savingTotal,
      diffTotalPct,
      mapaSelecionadoTransferido: selecionadoTransferido,
    };

    itensComparados.push(comp);
    porItemKey.set(itemNovo._key, comp);
  }

  const subAnt = subtotalItensAtivos(propostaAnterior).subtotal;
  const subNovo = subtotalItensAtivos(propostaNova).subtotal;
  const descAnt = propostaAnterior.valor_desconto ?? 0;
  const descNovo = propostaNova.valor_desconto ?? 0;

  const totalAnterior = valorTotalEfetivoProposta(propostaAnterior);
  const totalNovo = valorTotalEfetivoProposta(propostaNova);
  const diffTotal = totalNovo - totalAnterior;
  const savingTotal = totalAnterior - totalNovo;
  const diffPct = totalAnterior > 0 ? (diffTotal / totalAnterior) * 100 : null;
  const savingPct = totalAnterior > 0 ? (savingTotal / totalAnterior) * 100 : null;

  return {
    rodadaAnterior: propostaAnterior.rodada ?? 1,
    rodadaNova: propostaNova.rodada ?? ((propostaAnterior.rodada ?? 1) + 1),
    subtotalAnterior: subAnt,
    subtotalNovo: subNovo,
    descontoAnterior: descAnt,
    descontoNovo: descNovo,
    freteAnterior: propostaAnterior.valor_frete ?? null,
    freteNovo: propostaNova.valor_frete ?? null,
    totalAnterior,
    totalNovo,
    diffTotal,
    savingTotal,
    diffPct,
    savingPct,
    qtdRenegociados,
    qtdMantidos,
    qtdNovos,
    qtdReduzidos,
    qtdAumentados,
    qtdIguais,
    qtdSelecionadosTransferidos,
    itens: itensComparados,
    porItemKey,
    mudancasComerciais: detectarMudancasComerciais(propostaAnterior, propostaNova),
  };
}

/**
 * Separa propostas ativas das rodadas historicas e monta o historico/saving
 * de cada proposta ativa percorrendo a cadeia `proposta_origem_id`.
 */
export function construirHistoricoRodadas(propostas: CotacaoPropostaDraft[]): {
  ativas: CotacaoPropostaDraft[];
  inativas: CotacaoPropostaDraft[];
  porPropostaKey: Map<string, HistoricoRodadasProposta>;
} {
  const porKey = new Map(propostas.map(p => [p._key, p]));
  const ativas = propostas.filter(p => p.ativa !== false);
  const inativas = propostas.filter(p => p.ativa === false);
  const porPropostaKey = new Map<string, HistoricoRodadasProposta>();

  for (const ativa of ativas) {
    const cadeia: CotacaoPropostaDraft[] = [ativa];
    const visitados = new Set<string>([ativa._key]);
    let cursor: CotacaoPropostaDraft = ativa;

    while (cursor.proposta_origem_id && !visitados.has(cursor.proposta_origem_id)) {
      const origem = porKey.get(cursor.proposta_origem_id);
      if (!origem) break;
      visitados.add(origem._key);
      cadeia.push(origem);
      cursor = origem;
    }

    // Ordena da Rodada 1 ate a vigente.
    cadeia.reverse();
    const rodadaAtual = ativa.rodada ?? cadeia.length;
    const propostaAnterior = cadeia.length >= 2 ? cadeia[cadeia.length - 2] : null;
    const propostaInicial = cadeia.length >= 2 ? cadeia[0] : null;

    const comparativoAnterior = propostaAnterior
      ? calcularComparativoRenegociacao(propostaAnterior, ativa)
      : null;
    const comparativoInicial = propostaInicial && propostaAnterior && propostaInicial._key !== propostaAnterior._key
      ? calcularComparativoRenegociacao(propostaInicial, ativa)
      : null;

    porPropostaKey.set(ativa._key, {
      rodadaAtual,
      rodadas: cadeia,
      propostaAnterior,
      propostaInicial,
      comparativoAnterior,
      comparativoInicial,
    });
  }

  return { ativas, inativas, porPropostaKey };
}

/**
 * Calcula o saving efetivo dos itens escolhidos no pedido de um fornecedor
 * (subconjunto de itens com `mapa_selecionado = true`).
 */
export function calcularSavingPedido(
  pedido: PedidoFornecedor,
  comparativo: ResumoSavingRenegociacao | null | undefined,
): SavingPedidoFornecedor | null {
  if (!comparativo) return null;
  let totalAnterior = 0;
  let totalNovo = 0;
  let itensComparados = 0;

  for (const it of pedido.itens) {
    const comp = comparativo.porItemKey.get(it.itemKey);
    if (!comp || comp.precoTotalAnterior == null || comp.precoTotalNovo == null) continue;
    totalAnterior += comp.precoTotalAnterior;
    totalNovo += comp.precoTotalNovo;
    itensComparados += 1;
  }

  if (itensComparados === 0 || totalAnterior <= 0) return null;
  const savingTotal = totalAnterior - totalNovo;
  const diffPct = ((totalNovo - totalAnterior) / totalAnterior) * 100;
  return { totalAnterior, totalNovo, savingTotal, diffPct, itensComparados };
}
