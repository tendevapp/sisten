/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Revisão do pedido de compra — a etapa depois do mapa comparativo. O
 * comprador já marcou, célula a célula, quem vai fornecer cada item
 * (`mapa_selecionado`, gravado pelo mapa); esta camada só agrupa essa
 * decisão por fornecedor, porque **o pedido é colocado por fornecedor** —
 * um processo com 3 fornecedores escolhidos vira 3 pedidos, cada um com seus
 * próprios itens, condições e total.
 *
 * Nada aqui importa de `db/` — é a camada com cobertura de teste
 * (`pedidoCompra.test.ts`).
 */

import { diasAteValidade } from './mapaCotacao';
import { calcularCustoCompraItem, somarCustoCompra } from './custoCompra';
import type { CustoCompraItem, CustoCompraTotais } from './custoCompra';
import type { CotacaoPropostaDraft, CotacaoPropostaItemDraft } from '../types';

export interface ItemPedido {
  itemKey: string;
  ri: string | null;
  materialCode: string | null;
  descricaoProduto: string;
  codigoProduto: string | null;
  marcaFabricante: string | null;
  unidadeMedida: string | null;
  quantidade: number | null;
  precoUnitario: number | null;
  /** `preco_total_item` quando o fornecedor informou, senão preço × quantidade. */
  precoTotal: number | null;
  aliquotaIcmsPct: number | null;
  aliquotaIpiPct: number | null;
  /** Item cotado sem vínculo com a RM do processo (cotação avulsa ou excedente de escopo). */
  foraDoEscopo: boolean;
  /** Peso estimado por unidade (kg) — base do frete teórico. */
  pesoUnitarioKg: number | null;
  /** Parcela do frete simulado pela tabela Bahia Sul atribuída a este item (só em proposta FOB). */
  freteTeorico: number | null;
  /** Composição do custo, apurada pela Calc Impostos ao salvar o pedido. */
  custo: CustoCompraItem | null;
}

export interface PedidoFornecedor {
  /** Chave da proposta de origem — para propostas salvas, é o mesmo `id` do banco. */
  propostaKey: string;
  fornecedorRazaoSocial: string;
  fornecedorCnpj: string | null;
  fornecedorInscricaoEstadual: string | null;
  fornecedorCidade: string | null;
  fornecedorUf: string | null;
  fornecedorTelefone: string | null;
  vendedorNome: string | null;
  vendedorEmail: string | null;
  vendedorTelefone: string | null;
  numeroProposta: string | null;
  dataEmissao: string | null;
  validadeData: string | null;
  /** Dias até a proposta vencer; negativo = vencida; `null` = sem data de validade. */
  validadeDias: number | null;
  condicaoPagamento: string | null;
  formaPagamento: string | null;
  prazoEntregaTexto: string | null;
  prazoEntregaDias: number | null;
  freteModalidade: 'CIF' | 'FOB' | 'OUTRO' | null;
  transportadoraIndicada: string | null;
  dadosBancariosPix: string | null;
  faturamentoMinimo: number | null;
  valorFrete: number | null;
  observacoesGerais: string | null;
  itens: ItemPedido[];
  /** Soma de `precoTotal` dos itens, sem frete. */
  subtotal: number;
  /** `subtotal` + `valorFrete`. */
  total: number;
  /** Soma do frete teórico dos itens — o que a tabela da Bahia Sul prevê para trazer esta carga (FOB). */
  freteTeorico: number;
  /** Preço + impostos + frete de todos os itens, pelos critérios da Calc Impostos. */
  custo: CustoCompraTotais;
  /** `null` quando o fornecedor não impõe mínimo. */
  atingeFaturamentoMinimo: boolean | null;
}

function precoTotalDoItem(item: CotacaoPropostaItemDraft): number | null {
  if (item.preco_total_item != null) return item.preco_total_item;
  if (item.preco_unitario != null && item.quantidade != null) return item.preco_unitario * item.quantidade;
  return null;
}

function itemParaPedido(item: CotacaoPropostaItemDraft, custo: CustoCompraItem | null): ItemPedido {
  return {
    itemKey: item._key,
    ri: item.ri,
    materialCode: item.material_code,
    descricaoProduto: item.descricao_produto,
    codigoProduto: item.codigo_produto,
    marcaFabricante: item.marca_fabricante,
    unidadeMedida: item.unidade_medida,
    quantidade: item.quantidade,
    precoUnitario: item.preco_unitario,
    precoTotal: precoTotalDoItem(item),
    aliquotaIcmsPct: item.aliquota_icms_pct,
    aliquotaIpiPct: item.aliquota_ipi_pct,
    foraDoEscopo: !item.processo_item_id,
    pesoUnitarioKg: item.peso_unitario_kg,
    freteTeorico: item.frete_teorico,
    custo,
  };
}

/**
 * Monta um pedido por fornecedor a partir das propostas do processo — só
 * entram propostas já salvas (`_salvo`) com pelo menos um item marcado no
 * mapa (`mapa_selecionado`). Ordenado por razão social: é a mesma ordem que
 * o comprador vê ao emitir os pedidos um a um.
 */
export function montarPedidosCompra(propostas: CotacaoPropostaDraft[], hojeISO?: string): PedidoFornecedor[] {
  const pedidos: PedidoFornecedor[] = [];

  for (const p of propostas) {
    if (!p._salvo) continue;
    // Desconsiderado nunca deveria estar marcado no mapa (ele nem aparece
    // lá), mas o filtro fica: a decisão pode ter sido gravada antes de o
    // comprador desconsiderar o item.
    const selecionados = p.itens.filter(it => it.mapa_selecionado && !it.desconsiderado);
    if (selecionados.length === 0) continue;

    const custos = selecionados.map(it => calcularCustoCompraItem(it, p));
    const itens = selecionados.map((it, i) => itemParaPedido(it, custos[i]));
    const subtotal = itens.reduce((soma, it) => soma + (it.precoTotal ?? 0), 0);
    const valorFrete = p.valor_frete ?? null;
    const minimo = p.faturamento_minimo;

    pedidos.push({
      propostaKey: p._key,
      fornecedorRazaoSocial: p.fornecedor_razao_social || 'Fornecedor não identificado',
      fornecedorCnpj: p.fornecedor_cnpj,
      fornecedorInscricaoEstadual: p.fornecedor_inscricao_estadual,
      fornecedorCidade: p.fornecedor_cidade,
      fornecedorUf: p.fornecedor_uf,
      fornecedorTelefone: p.fornecedor_telefone,
      vendedorNome: p.vendedor_nome,
      vendedorEmail: p.vendedor_email,
      vendedorTelefone: p.vendedor_telefone,
      numeroProposta: p.numero_proposta,
      dataEmissao: p.data_emissao,
      validadeData: p.validade_data,
      validadeDias: diasAteValidade(p.validade_data, hojeISO),
      condicaoPagamento: p.condicao_pagamento,
      formaPagamento: p.forma_pagamento,
      prazoEntregaTexto: p.prazo_entrega_texto,
      prazoEntregaDias: p.prazo_entrega_dias,
      freteModalidade: p.frete_modalidade,
      transportadoraIndicada: p.transportadora_indicada,
      dadosBancariosPix: p.dados_bancarios_pix,
      faturamentoMinimo: minimo,
      valorFrete,
      observacoesGerais: p.observacoes_gerais,
      itens,
      subtotal,
      total: subtotal + (valorFrete ?? 0),
      freteTeorico: itens.reduce((soma, it) => soma + (it.freteTeorico ?? 0), 0),
      custo: somarCustoCompra(custos),
      atingeFaturamentoMinimo: minimo == null || minimo === 0 ? null : subtotal >= minimo,
    });
  }

  return pedidos.sort((a, b) => a.fornecedorRazaoSocial.localeCompare(b.fornecedorRazaoSocial, 'pt-BR'));
}

/**
 * RIs do escopo do processo que não aparecem em nenhum pedido montado — o
 * comprador decidiu não comprar (ou esqueceu de marcar) esse item em
 * nenhuma proposta. Aviso, não bloqueio: às vezes o item foi cancelado ou
 * vai para uma cotação futura.
 */
export function risSemPedido(escopoRis: string[], pedidos: PedidoFornecedor[]): string[] {
  const cobertos = new Set(pedidos.flatMap(p => p.itens.map(i => i.ri).filter((ri): ri is string => !!ri)));
  return escopoRis.filter(ri => !cobertos.has(ri));
}
