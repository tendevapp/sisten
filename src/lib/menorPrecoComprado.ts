/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Menor preço unitário já pago por material — a referência que o mapa
 * comparativo mostra ao lado das ofertas, para o comprador ver se uma compra
 * anterior saiu mais barata que qualquer proposta atual.
 *
 * Lê só pedidos (o que foi efetivamente comprado, em BRL), a partir de
 * `INICIO_HISTORICO_COMPRAS`. Reaproveita `amostrasDePedidos`, então serviço e
 * contrato-quadro já ficam de fora e o preço é o mesmo da aba Preço Médio.
 */

import type { HistoricoPedidoView } from '../types';
import { amostrasDePedidos } from './precoMedio';

/** Compras anteriores a essa data não entram — preço antigo não é referência. */
export const INICIO_HISTORICO_COMPRAS = '2026-01-01';

export interface MenorPrecoComprado {
  /** Preço unitário em BRL. */
  preco: number;
  fornecedor: string;
  /** AAAA-MM-DD. */
  data: string;
  pedido: string;
  qtd: number;
  /** Quantas compras do material entraram na comparação. */
  compras: number;
}

/** Código SAP chega com e sem zeros à esquerda conforme a origem (RM, cotação, pedido). */
export function chaveMaterialSap(codigo: string | null | undefined): string {
  return String(codigo ?? '').trim().replace(/^0+/, '');
}

/**
 * Menor preço por material. Em empate de preço fica a compra mais recente.
 * `ignorar` recebe os códigos genéricos (um código para vários produtos), cujo
 * preço não é comparável item a item.
 */
export function menorPrecoPorMaterial(
  pedidos: readonly HistoricoPedidoView[],
  ignorar: ReadonlySet<string> = new Set(),
  desde: string = INICIO_HISTORICO_COMPRAS,
): Map<string, MenorPrecoComprado> {
  const ignorados = new Set([...ignorar].map(chaveMaterialSap));
  const out = new Map<string, MenorPrecoComprado>();

  for (const a of amostrasDePedidos(pedidos)) {
    if (a.data < desde) continue;
    const chave = chaveMaterialSap(a.material);
    if (!chave || ignorados.has(chave)) continue;

    const atual = out.get(chave);
    const compras = (atual?.compras ?? 0) + 1;
    const melhor = !atual || a.preco < atual.preco || (a.preco === atual.preco && a.data > atual.data);
    out.set(chave, melhor
      ? { preco: a.preco, fornecedor: a.fornecedor, data: a.data, pedido: a.documento, qtd: a.qtd, compras }
      : { ...atual, compras });
  }
  return out;
}

/** Chave pedido × material (código sem zeros à esquerda). */
export function chavePedidoMaterial(pedido: string | null | undefined, material: string | null | undefined): string {
  return `${String(pedido ?? '').trim()}|${chaveMaterialSap(material)}`;
}

/** Linha da ZL0132 com os dois valores do item do pedido. */
export interface LinhaValorPedido {
  doc_compra: string | null;
  material: string | null;
  valor_liquido: number | string | null;
  valor_efetivo: number | string | null;
}

/**
 * Fator gross ÷ líquido de cada pedido × material, pela ZL0132:
 * `valor_efetivo` é o valor do item com os impostos embutidos do código de
 * imposto (o "gross", na mesma base do preço cotado), `valor_liquido` sem
 * eles. A razão vale para o preço unitário que o histórico já calcula — e
 * funciona mesmo quando o pedido tem o material em mais de uma linha.
 *
 * Conferido contra a ZL0136 em 02/11/2026: onde há imposto embutido, o gross
 * bate com o unitário de uma nota do pedido em 62% dos pares (o líquido, em
 * 11%); o resto é IPI somado na nota, preço que mudou ou unidade diferente.
 */
export function fatorGrossPorPedido(linhas: readonly LinhaValorPedido[]): Map<string, number> {
  const somas = new Map<string, { liquido: number; efetivo: number }>();
  for (const l of linhas) {
    const liquido = Number(l.valor_liquido);
    const efetivo = Number(l.valor_efetivo);
    if (!(liquido > 0) || !(efetivo > 0)) continue;
    const chave = chavePedidoMaterial(l.doc_compra, l.material);
    const atual = somas.get(chave) ?? { liquido: 0, efetivo: 0 };
    atual.liquido += liquido;
    atual.efetivo += efetivo;
    somas.set(chave, atual);
  }
  const out = new Map<string, number>();
  for (const [chave, v] of somas) out.set(chave, v.efetivo / v.liquido);
  return out;
}

/**
 * Linha de nota fiscal de um pedido × material, da função
 * `sup_notas_dos_pedidos` (ZL0136). Modelo 55 é a NF-e da mercadoria; 57 é o
 * CT-e do frete daquele item.
 */
export interface NotaPedido {
  pedido: string;
  material: string;
  nota: string;
  serie: string | null;
  modelo: string | null;
  data_documento: string | null;
  quantidade: number | string | null;
  total: number | string | null;
  valor_icms: number | string | null;
  valor_ipi: number | string | null;
  valor_pis: number | string | null;
  valor_cofins: number | string | null;
  valor_difal: number | string | null;
  cfop: string | null;
  codigo_imposto: string | null;
  uf_origem: string | null;
}

/** Notas por pedido × material, da mais antiga para a mais nova; número sem zeros à esquerda. */
export function notasPorPedidoMaterial(notas: readonly NotaPedido[]): Map<string, NotaPedido[]> {
  const out = new Map<string, NotaPedido[]>();
  for (const n of notas) {
    const chave = chavePedidoMaterial(n.pedido, n.material);
    const numero = String(n.nota ?? '').trim().replace(/^0+/, '') || String(n.nota ?? '').trim();
    const lista = out.get(chave) ?? [];
    lista.push({ ...n, nota: numero });
    out.set(chave, lista);
  }
  for (const lista of out.values()) lista.sort((a, b) => (a.data_documento ?? '').localeCompare(b.data_documento ?? ''));
  return out;
}

const valor = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Crédito de PIS/COFINS da TEN (não cumulativo), em %. Mesmo do `ALIQ_CREDITO_PIS_COFINS` da Calc Impostos. */
const CREDITO_PIS_COFINS_PCT = 9.25;

/**
 * A melhor compra passada pelas notas fiscais, na MESMA base do custo de
 * aquisição da oferta atual (uso e consumo): valor da NF-e + DIFAL + frete
 * (CT-e do item) − crédito de PIS/COFINS 9,25% sobre (valor − IPI − ICMS).
 * O ICMS não credita no consumo. É o que torna a comparação justa: a oferta
 * de hoje pode ter o mesmo preço de nota e custar mais (frete, DIFAL).
 */
export interface CompraPelaNf {
  notasProduto: NotaPedido[];
  notasFrete: NotaPedido[];
  qtd: number;
  valorNota: number;
  icms: number;
  ipi: number;
  difal: number;
  frete: number;
  creditoPisCofins: number;
  unitarioNota: number;
  custoUnitario: number;
  codigoImposto: string | null;
  ufOrigem: string | null;
}

export function compraPelaNf(notas: readonly NotaPedido[]): CompraPelaNf | null {
  const produto = notas.filter(n => (n.modelo ?? '55') !== '57');
  const frete = notas.filter(n => n.modelo === '57');
  const qtd = produto.reduce((s, n) => s + valor(n.quantidade), 0);
  const valorNota = produto.reduce((s, n) => s + valor(n.total), 0);
  if (qtd <= 0 || valorNota <= 0) return null;
  const icms = produto.reduce((s, n) => s + valor(n.valor_icms), 0);
  const ipi = produto.reduce((s, n) => s + valor(n.valor_ipi), 0);
  const difal = produto.reduce((s, n) => s + valor(n.valor_difal), 0);
  const valorFrete = frete.reduce((s, n) => s + valor(n.total), 0);
  const creditoPisCofins = (Math.max(0, valorNota - ipi - icms) * CREDITO_PIS_COFINS_PCT) / 100;
  return {
    notasProduto: produto,
    notasFrete: frete,
    qtd,
    valorNota,
    icms,
    ipi,
    difal,
    frete: valorFrete,
    creditoPisCofins,
    unitarioNota: valorNota / qtd,
    custoUnitario: (valorNota + difal + valorFrete - creditoPisCofins) / qtd,
    codigoImposto: produto[0]?.codigo_imposto ?? null,
    ufOrigem: produto[0]?.uf_origem ?? null,
  };
}
