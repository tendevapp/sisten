/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Conferência aritmética da extração — os documentos reais trazem seus
 * próprios checksums (unit × qtd = subtotal; Σ subtotais = total declarado;
 * contagem declarada de itens), e eles fecham exatamente. Rodar essa
 * conferência antes de qualquer coisa chegar à tela transforma uma extração
 * "provavelmente certa" em extração "conferida" — e localiza precisamente
 * onde um número saiu colado ou partido pela conversão do PDF.
 *
 * Nunca bloqueia: quando a soma não fecha, quem chama (api.ts) reprocessa
 * uma vez informando o total esperado; se falhar de novo, a proposta entra
 * marcada e totalmente editável — o módulo funciona com zero IA.
 */

import { round2 } from './calculo';
import type { ItemExtraido, PropostaExtraida } from './tipos';

const TOLERANCIA_REAIS = 0.03;

export interface ResultadoValidacaoItem {
  ok: boolean;
  subtotalCalculado: number | null;
  diferenca: number | null;
}

/** `subtotal ≈ quantidade × preço_unitário_bruto − desconto`, tolerância de arredondamento. */
export function validarItem(item: ItemExtraido): ResultadoValidacaoItem {
  if (item.quantidade == null || item.preco_unitario_bruto == null) {
    return { ok: true, subtotalCalculado: null, diferenca: null };
  }
  const bruto = item.quantidade * item.preco_unitario_bruto;
  const desconto = item.desconto_valor != null
    ? item.desconto_valor
    : bruto * ((item.desconto_percentual ?? 0) / 100);
  const calculado = round2(bruto - desconto);

  if (item.subtotal == null) {
    return { ok: true, subtotalCalculado: calculado, diferenca: null };
  }
  const diferenca = round2(item.subtotal - calculado);
  return { ok: Math.abs(diferenca) <= TOLERANCIA_REAIS, subtotalCalculado: calculado, diferenca };
}

export interface ResultadoValidacaoProposta {
  status: 'ok' | 'divergente' | 'nao_declarado';
  /** A reconciliação (dentre soma pura / soma+IPI / soma+frete) mais próxima do total declarado. */
  totalCalculado: number;
  totalDeclarado: number | null;
  diferenca: number | null;
  /** linha_ordem dos itens cujo subtotal não bate com quantidade × preço − desconto. */
  itensComProblema: number[];
  /** null quando o documento não declara contagem; true quando o número de itens extraídos diverge da contagem declarada. */
  contagemDivergente: boolean | null;
  detalhe: string | null;
}

/**
 * Confere a soma dos itens contra o total declarado. Os documentos reais
 * variam no que compõe esse total — soma pura (Manglog, Ferimport), soma +
 * IPI (Anhanguera), soma + frete (Loja do Mecânico) — então tentamos as
 * três reconciliações e ficamos com a mais próxima.
 */
export function validarProposta(proposta: PropostaExtraida): ResultadoValidacaoProposta {
  const somaSubtotais = round2(
    proposta.itens.reduce((acc, it) => acc + (validarItem(it).subtotalCalculado ?? it.subtotal ?? 0), 0),
  );
  const somaIpi = round2(proposta.itens.reduce((acc, it) => acc + (it.ipi_valor ?? 0), 0));
  const frete = proposta.frete_valor ?? 0;

  const itensComProblema = proposta.itens.filter(it => !validarItem(it).ok).map(it => it.linha_ordem);
  const contagemDivergente = proposta.itens_declarados == null
    ? null
    : proposta.itens.length !== proposta.itens_declarados;

  if (proposta.total_declarado == null) {
    return {
      status: 'nao_declarado',
      totalCalculado: somaSubtotais,
      totalDeclarado: null,
      diferenca: null,
      itensComProblema,
      contagemDivergente,
      detalhe: null,
    };
  }

  const candidatos = [
    { valor: somaSubtotais, rotulo: 'soma dos itens' },
    { valor: round2(somaSubtotais + somaIpi), rotulo: 'soma dos itens + IPI' },
    { valor: round2(somaSubtotais + frete), rotulo: 'soma dos itens + frete' },
  ];

  let melhor = candidatos[0];
  let menorDiferenca = Math.abs(round2(proposta.total_declarado - melhor.valor));
  for (const candidato of candidatos.slice(1)) {
    const diferenca = Math.abs(round2(proposta.total_declarado - candidato.valor));
    if (diferenca < menorDiferenca) {
      menorDiferenca = diferenca;
      melhor = candidato;
    }
  }

  const fechou = menorDiferenca <= TOLERANCIA_REAIS;
  const ok = fechou && itensComProblema.length === 0 && contagemDivergente !== true;

  return {
    status: ok ? 'ok' : 'divergente',
    totalCalculado: melhor.valor,
    totalDeclarado: proposta.total_declarado,
    diferenca: round2(proposta.total_declarado - melhor.valor),
    itensComProblema,
    contagemDivergente,
    detalhe: ok
      ? null
      : `Soma (${melhor.rotulo}) = R$ ${melhor.valor.toFixed(2)}; total declarado = R$ ${proposta.total_declarado.toFixed(2)}; diferença = R$ ${menorDiferenca.toFixed(2)}.`,
  };
}

/**
 * Monta o prompt de reprocessamento: informa à IA o total esperado e as
 * linhas suspeitas, para que ela revise em vez de repetir o mesmo erro.
 */
export function montarContextoReprocessamento(resultado: ResultadoValidacaoProposta): string {
  const partes: string[] = [];
  if (resultado.totalDeclarado != null) {
    partes.push(
      `A extração anterior somou R$ ${resultado.totalCalculado.toFixed(2)}, mas o documento declara total de R$ ${resultado.totalDeclarado.toFixed(2)} (diferença de R$ ${Math.abs(resultado.diferenca ?? 0).toFixed(2)}). Revise os itens, prestando atenção a números que podem ter ficado colados ou partidos na conversão do PDF.`,
    );
  }
  if (resultado.itensComProblema.length > 0) {
    partes.push(`Linhas com subtotal inconsistente com quantidade × preço: ${resultado.itensComProblema.join(', ')}.`);
  }
  if (resultado.contagemDivergente) {
    partes.push('A quantidade de itens extraídos não bate com a contagem declarada no documento — confira se algum item foi perdido ou duplicado.');
  }
  return partes.join(' ');
}
