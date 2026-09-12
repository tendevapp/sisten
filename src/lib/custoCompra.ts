/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Composição do custo de compra de um item cotado: **preço + impostos +
 * frete**, na hora em que o comprador fecha o pedido.
 *
 * A apuração dos tributos não é reimplementada aqui — é `calcularImpostos`
 * (src/lib/calcImpostos.ts), o mesmo motor da tela Calc Impostos, com as
 * mesmas fórmulas de ICMS por dentro, redução de base e IPI por fora. O que
 * mora aqui é a ponte entre o item cotado e aquele motor: de onde saem as
 * alíquotas quando a proposta não destaca nenhuma, e o que fazer com o frete
 * teórico depois que o preço líquido está apurado.
 *
 * Por que o preço líquido e não o cotado: dois fornecedores com o mesmo
 * preço de etiqueta custam diferente conforme a UF de origem (ICMS 7%, 12%
 * ou 18%) e o IPI destacado. O líquido é o que sobra de custo real depois de
 * descontar o que a empresa recupera como crédito — é o número que ordena
 * corretamente as propostas.
 *
 * Camada pura, sem `db/`, testada em `custoCompra.test.ts`.
 */

import {
  calcularImpostos,
  inferirCodigoFiscal,
  presetPorCodigo,
} from './calcImpostos';
import type { CalcImpostosInputs, CalculoImpostosResultado } from './calcImpostos';
import type { CotacaoPropostaDraft, CotacaoPropostaItemDraft } from '../types';

export interface CustoCompraItem {
  /** Preset fiscal aplicado (C1..C5, A3, ISENTO) — o do item, quando gravado, senão o inferido pela UF de origem. */
  codigoFiscal: string;
  /** Entradas efetivamente usadas na apuração — o que a memória de cálculo precisa mostrar. */
  inputs: CalcImpostosInputs;
  impostos: CalculoImpostosResultado;
  /** Preço cotado do item (com ICMS/PIS/COFINS, sem IPI), como o fornecedor mandou. */
  precoCotado: number;
  /** Valor da nota: preço cotado + IPI. */
  precoBruto: number;
  freteTeorico: number;
  /** O que sai do caixa: valor da nota + frete. */
  desembolso: number;
  /** Preço líquido total do item, deduzidos os tributos recuperáveis. */
  precoLiquido: number;
  precoLiquidoUnitario: number;
  /** Composição do custo da compra: preço líquido + frete. */
  custoTotal: number;
  custoUnitario: number;
  /** `true` quando faltou preço para apurar — o item existe mas não entra em conta nenhuma. */
  incompleto: boolean;
}

export interface OpcoesCustoCompra {
  /** UF de destino da mercadoria; a fábrica fica na Bahia. */
  ufDestino?: string;
  /** Sobrescreve o código fiscal do item (a revisão do pedido deixa o comprador trocar). */
  codigoFiscal?: string | null;
}

/** Valor cotado do item — `preco_total_item` quando o fornecedor informou, senão preço × quantidade. */
export function precoCotadoItem(item: CotacaoPropostaItemDraft): number | null {
  if (item.preco_total_item != null) return item.preco_total_item;
  if (item.preco_unitario != null && item.quantidade != null) return item.preco_unitario * item.quantidade;
  return null;
}

/**
 * Monta as entradas da Calc Impostos para um item cotado.
 *
 * Alíquota destacada na proposta sempre ganha do preset: ela é o que vai
 * constar na nota. O preset só preenche o que o fornecedor não destacou —
 * quase toda proposta de balcão vem sem alíquota nenhuma, e sem preset o
 * líquido sairia igual ao bruto, escondendo justamente a diferença entre
 * comprar em São Paulo e comprar em Salvador.
 *
 * O IPI é a exceção: só entra se o item o destacar. Preset com IPI (C5) não
 * pode inventar IPI numa nota que não tem — isso inflaria o valor da nota em
 * 10% sobre um imposto que ninguém vai cobrar.
 */
export function criteriosFiscaisItem(
  item: CotacaoPropostaItemDraft,
  proposta: Pick<CotacaoPropostaDraft, 'fornecedor_uf'>,
  opcoes: OpcoesCustoCompra = {},
): { codigoFiscal: string; inputs: CalcImpostosInputs } {
  const aliqIpiItem = item.aliquota_ipi_pct ?? 0;

  const codigoFiscal =
    (opcoes.codigoFiscal ?? item.codigo_fiscal)
    ?? inferirCodigoFiscal(proposta.fornecedor_uf, {
      temIpi: aliqIpiItem > 0,
      ufDestino: opcoes.ufDestino,
    });

  const preset = presetPorCodigo(codigoFiscal);

  return {
    codigoFiscal,
    inputs: {
      precoComImpostos: precoCotadoItem(item) ?? 0,
      aliqIcms: item.aliquota_icms_pct ?? preset?.aliqIcms ?? 0,
      aliqPis: item.aliquota_pis_pct ?? preset?.aliqPis ?? 0,
      aliqCofins: item.aliquota_cofins_pct ?? preset?.aliqCofins ?? 0,
      aliqIpi: aliqIpiItem,
      fatorReducao: preset?.fatorReducao ?? 1,
      quantidade: item.quantidade != null && item.quantidade > 0 ? item.quantidade : 1,
      unidadePreco: 1,
    },
  };
}

const arredondar2 = (v: number) => Math.round(v * 100) / 100;

/** Apura preço líquido e custo composto de um item, pelos critérios da Calc Impostos. */
export function calcularCustoCompraItem(
  item: CotacaoPropostaItemDraft,
  proposta: Pick<CotacaoPropostaDraft, 'fornecedor_uf'>,
  opcoes: OpcoesCustoCompra = {},
): CustoCompraItem {
  const { codigoFiscal, inputs } = criteriosFiscaisItem(item, proposta, opcoes);
  const impostos = calcularImpostos(inputs);

  const precoCotado = precoCotadoItem(item);
  const freteTeorico = item.frete_teorico ?? 0;
  const quantidade = inputs.quantidade;

  const precoLiquido = arredondar2(impostos.precoLiquido);
  const custoTotal = arredondar2(precoLiquido + freteTeorico);

  return {
    codigoFiscal,
    inputs,
    impostos,
    precoCotado: precoCotado ?? 0,
    precoBruto: arredondar2(impostos.precoBruto),
    freteTeorico,
    desembolso: arredondar2(impostos.precoBruto + freteTeorico),
    precoLiquido,
    precoLiquidoUnitario: precoLiquido / quantidade,
    custoTotal,
    custoUnitario: custoTotal / quantidade,
    incompleto: precoCotado == null,
  };
}

export interface CustoCompraTotais {
  precoBruto: number;
  impostos: number;
  frete: number;
  precoLiquido: number;
  custoTotal: number;
  desembolso: number;
}

/** Soma a composição de custo de vários itens — o rodapé do card de pedido. */
export function somarCustoCompra(custos: CustoCompraItem[]): CustoCompraTotais {
  const totais = custos.reduce<CustoCompraTotais>(
    (acc, c) => {
      if (c.incompleto) return acc;
      acc.precoBruto += c.precoBruto;
      acc.impostos += c.impostos.totalImpostos;
      acc.frete += c.freteTeorico;
      acc.precoLiquido += c.precoLiquido;
      acc.custoTotal += c.custoTotal;
      acc.desembolso += c.desembolso;
      return acc;
    },
    { precoBruto: 0, impostos: 0, frete: 0, precoLiquido: 0, custoTotal: 0, desembolso: 0 },
  );

  return {
    precoBruto: arredondar2(totais.precoBruto),
    impostos: arredondar2(totais.impostos),
    frete: arredondar2(totais.frete),
    precoLiquido: arredondar2(totais.precoLiquido),
    custoTotal: arredondar2(totais.custoTotal),
    desembolso: arredondar2(totais.desembolso),
  };
}

/**
 * Congela a apuração no item, do jeito que vai para o banco ao salvar o
 * pedido. Gravado (e não recalculado a cada leitura) porque é o número que
 * justificou a decisão de compra: alíquota que mude depois não pode
 * reescrever o histórico.
 */
export function aplicarCustoNoItem(
  item: CotacaoPropostaItemDraft,
  custo: CustoCompraItem,
): CotacaoPropostaItemDraft {
  return {
    ...item,
    codigo_fiscal: custo.codigoFiscal,
    preco_liquido_unitario: custo.incompleto ? null : custo.precoLiquidoUnitario,
    preco_liquido_total: custo.incompleto ? null : custo.precoLiquido,
    custo_total_item: custo.incompleto ? null : custo.custoTotal,
  };
}
