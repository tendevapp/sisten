/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * O coração do módulo: preço efetivo, custo total desembarcado e a
 * comparação item × fornecedor que vira o mapa de cotação. Sem React, sem
 * Supabase — só números, para ser testável isoladamente (é a lógica que
 * decide dinheiro; um erro aqui passa despercebido na tela).
 */

import type { ItemExtraido } from './tipos';

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * "ISENTO", "-", "N/A", vazio → 0. Alíquotas em texto livre viram número.
 * A Edge Function já deveria normalizar isso, mas a UI de edição manual
 * também precisa aceitar o texto cru do fornecedor.
 */
export function normalizarAliquota(valor: string | number | null | undefined): number {
  if (valor == null) return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const texto = valor.trim().toUpperCase();
  if (texto === '' || texto === 'ISENTO' || texto === '-' || texto === 'N/A' || texto === '—') return 0;
  const numerico = texto.replace('%', '').replace(',', '.').trim();
  const n = Number(numerico);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Preço unitário efetivo = subtotal / quantidade quando houver subtotal;
 * senão preço bruto − desconto. NUNCA o preço cheio — é o caso do
 * e-commerce com desconto por item (Loja do Mecânico: item 4540, preço
 * cheio R$ 116,56, mas o efetivo real é R$ 104,90 = 419,60 / 4).
 */
export function precoUnitarioEfetivo(item: ItemExtraido): number | null {
  if (item.subtotal != null && item.quantidade) {
    return round2(item.subtotal / item.quantidade);
  }
  if (item.preco_unitario_bruto != null) {
    const descontoUnitario = item.desconto_valor != null && item.quantidade
      ? item.desconto_valor / item.quantidade
      : item.preco_unitario_bruto * ((item.desconto_percentual ?? 0) / 100);
    return round2(item.preco_unitario_bruto - descontoUnitario);
  }
  return null;
}

/**
 * Custo total desembarcado = efetivo + IPI + ST + FCP, por valor quando
 * informado, por alíquota quando não. Frete fica de fora por decisão do
 * módulo — ele entra só no total da proposta (ver compararPropostas), nunca
 * rateado por item.
 */
export function custoTotalUnitario(item: ItemExtraido): number | null {
  const efetivo = precoUnitarioEfetivo(item);
  if (efetivo == null) return null;

  const qtd = item.quantidade || 1;

  const ipi = item.ipi_valor != null
    ? item.ipi_valor / qtd
    : efetivo * (normalizarAliquota(item.ipi_percentual ?? 0) / 100);

  const st = item.st_valor != null
    ? item.st_valor / qtd
    : efetivo * (normalizarAliquota(item.st_percentual ?? 0) / 100);

  const fcp = item.fcp_valor != null ? item.fcp_valor / qtd : 0;

  return round2(efetivo + ipi + st + fcp);
}

export interface ItemComparado {
  propostaId: string;
  itemExtraido: ItemExtraido;
  precoEfetivo: number | null;
  custoTotal: number | null;
  /** true quando o vínculo aponta produto diferente do canônico — nunca é sugerido vencedor. */
  divergente: boolean;
}

export interface ComparacaoItem {
  cotacaoItemId: string;
  itens: ItemComparado[];
  /** id da proposta vencedora entre os NÃO divergentes, pelo menor custo total. */
  propostaVencedoraId: string | null;
  /** Δ% de cada proposta contra o vencedor (positivo = mais caro). null para o próprio vencedor e para divergentes. */
  deltaPercentual: Record<string, number | null>;
}

/** Compara as propostas vinculadas a um mesmo item canônico e aponta o vencedor. */
export function compararItem(cotacaoItemId: string, itens: ItemComparado[]): ComparacaoItem {
  const elegiveis = itens.filter(i => !i.divergente && i.custoTotal != null);
  const vencedor = elegiveis.length > 0
    ? elegiveis.reduce((menor, atual) => (atual.custoTotal! < menor.custoTotal! ? atual : menor))
    : null;

  const deltaPercentual: Record<string, number | null> = {};
  for (const item of itens) {
    if (item.divergente || item.custoTotal == null || !vencedor || vencedor.custoTotal == null || vencedor.custoTotal === 0) {
      deltaPercentual[item.propostaId] = null;
      continue;
    }
    if (item.propostaId === vencedor.propostaId) {
      deltaPercentual[item.propostaId] = 0;
      continue;
    }
    deltaPercentual[item.propostaId] = round2(((item.custoTotal - vencedor.custoTotal) / vencedor.custoTotal) * 100);
  }

  return {
    cotacaoItemId,
    itens,
    propostaVencedoraId: vencedor?.propostaId ?? null,
    deltaPercentual,
  };
}

export interface TotalProposta {
  propostaId: string;
  somaItens: number;
  freteValor: number;
  totalComFrete: number;
}

/**
 * Vencedor por soma de itens pode divergir do vencedor por total quando o
 * frete pesa muito (ele não é rateado por item — só entra aqui). O mapa
 * sinaliza essa divergência em vez de escondê-la.
 */
export function compararTotais(totais: TotalProposta[]): {
  vencedorPorSomaItensId: string | null;
  vencedorPorTotalId: string | null;
  divergenciaFreteTotal: boolean;
} {
  if (totais.length === 0) {
    return { vencedorPorSomaItensId: null, vencedorPorTotalId: null, divergenciaFreteTotal: false };
  }
  const vencedorPorSomaItens = totais.reduce((menor, atual) => (atual.somaItens < menor.somaItens ? atual : menor));
  const vencedorPorTotal = totais.reduce((menor, atual) => (atual.totalComFrete < menor.totalComFrete ? atual : menor));
  return {
    vencedorPorSomaItensId: vencedorPorSomaItens.propostaId,
    vencedorPorTotalId: vencedorPorTotal.propostaId,
    divergenciaFreteTotal: vencedorPorSomaItens.propostaId !== vencedorPorTotal.propostaId,
  };
}
