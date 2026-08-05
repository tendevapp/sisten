/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Vínculo em cascata entre uma linha extraída de proposta e o item canônico
 * do lote. A IA sugere, mas a referência decide: fornecedores descrevem o
 * mesmo produto de formas irreconhecíveis entre si (ver o caso da furadeira
 * Bosch GSB 20-2 RE 800W, cotada com três descrições diferentes por três
 * fornecedores), mas a referência/SKU do fabricante costuma bater mesmo
 * quando colada com prefixo de marca ou sufixo de modelo.
 *
 * Cascata:
 *   1. Referência normalizada — contra o item canônico e contra referências
 *      já vinculadas de OUTRAS propostas do mesmo lote (o primeiro
 *      fornecedor com referência limpa "ensina" os demais).
 *   2. NCM + similaridade de descrição (heurística determinística, sem IA).
 *   3. Sugestão da IA (`item_canonico_id_sugerido`) — só aceita um id que
 *      exista de fato na lista de itens canônicos, nunca um id inventado.
 *   4. Nada casou → revisão manual.
 *
 * Divergência (produto parecido mas diferente — modelo, medida, potência)
 * é decidida pela IA, não por esta cascata: quando `item.divergencia` vem
 * preenchido, o vínculo é aceito e marcado, mas o item nunca é sugerido
 * vencedor automático (ver compararItem em calculo.ts).
 */

import type { ItemCanonico, ItemExtraido, OrigemVinculo, ResultadoVinculo } from './tipos';

const NUCLEO_MINIMO = 6;
const LIMIAR_SIMILARIDADE_DESCRICAO = 0.35;
const STOPWORDS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'COM', 'PARA', 'EM', 'A', 'E', 'O', 'UN', 'UND', 'PC']);

export function normalizarReferencia(ref: string | null | undefined): string {
  if (!ref) return '';
  return ref.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Duas referências "correspondem" quando compartilham um núcleo alfanumérico
 * comum de tamanho relevante — não quando são idênticas. Fornecedores colam
 * a referência do fabricante com prefixo de marca ("BOSCH-06011A21E2") ou
 * sufixo de modelo ("06011A21E2GSB 20-2RE"), então exigir igualdade exata
 * perderia justamente os casos que mais importa casar.
 */
export function referenciasCorrespondem(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarReferencia(a);
  const nb = normalizarReferencia(b);
  if (na.length < NUCLEO_MINIMO || nb.length < NUCLEO_MINIMO) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  return maiorSubstringComumTamanho(na, nb) >= NUCLEO_MINIMO;
}

function maiorSubstringComumTamanho(a: string, b: string): number {
  let maior = 0;
  let linhaAnterior: number[] = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const linhaAtual: number[] = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        linhaAtual[j] = linhaAnterior[j - 1] + 1;
        if (linhaAtual[j] > maior) maior = linhaAtual[j];
      }
    }
    linhaAnterior = linhaAtual;
  }
  return maior;
}

function tokenizarDescricao(texto: string): Set<string> {
  const semAcento = texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return new Set(
    semAcento
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter(token => token.length >= 2 && !STOPWORDS.has(token)),
  );
}

/** Similaridade de Jaccard sobre tokens da descrição — 0 (nada em comum) a 1 (idênticas). */
export function similaridadeDescricao(a: string, b: string): number {
  const ta = tokenizarDescricao(a);
  const tb = tokenizarDescricao(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersecao = 0;
  for (const token of ta) if (tb.has(token)) intersecao++;
  const uniao = ta.size + tb.size - intersecao;
  return uniao === 0 ? 0 : intersecao / uniao;
}

export interface ReferenciaConhecida {
  cotacaoItemId: string;
  referencia: string;
}

function extrairDivergencia(item: ItemExtraido): Pick<ResultadoVinculo, 'divergente' | 'divergenciaAtributo' | 'divergenciaDetalhe'> {
  if (item.divergencia) {
    return { divergente: true, divergenciaAtributo: item.divergencia.atributo, divergenciaDetalhe: item.divergencia.detalhe };
  }
  return { divergente: false, divergenciaAtributo: null, divergenciaDetalhe: null };
}

const SEM_VINCULO: ResultadoVinculo = {
  cotacaoItemId: null,
  origem: 'nenhum',
  confianca: null,
  divergente: false,
  divergenciaAtributo: null,
  divergenciaDetalhe: null,
};

export function vincularItem(
  item: ItemExtraido,
  itensCanonicos: ItemCanonico[],
  referenciasConhecidas: ReferenciaConhecida[] = [],
): ResultadoVinculo {
  const divergenciaInfo = extrairDivergencia(item);

  if (item.referencia) {
    for (const canonico of itensCanonicos) {
      if (referenciasCorrespondem(item.referencia, canonico.referencia)) {
        return { cotacaoItemId: canonico.id, origem: 'referencia', confianca: 0.95, ...divergenciaInfo };
      }
    }
    for (const conhecida of referenciasConhecidas) {
      if (referenciasCorrespondem(item.referencia, conhecida.referencia)) {
        return { cotacaoItemId: conhecida.cotacaoItemId, origem: 'referencia', confianca: 0.9, ...divergenciaInfo };
      }
    }
  }

  let melhorPorDescricao: { id: string; score: number } | null = null;
  for (const canonico of itensCanonicos) {
    const score = similaridadeDescricao(item.descricao_bruta, canonico.descricao_canonica);
    if (score >= LIMIAR_SIMILARIDADE_DESCRICAO && (!melhorPorDescricao || score > melhorPorDescricao.score)) {
      melhorPorDescricao = { id: canonico.id, score };
    }
  }
  if (melhorPorDescricao) {
    return { cotacaoItemId: melhorPorDescricao.id, origem: 'ncm_descricao' as OrigemVinculo, confianca: melhorPorDescricao.score, ...divergenciaInfo };
  }

  if (item.item_canonico_id_sugerido && itensCanonicos.some(c => c.id === item.item_canonico_id_sugerido)) {
    return {
      cotacaoItemId: item.item_canonico_id_sugerido,
      origem: 'ia',
      confianca: item.match_confianca ?? 0.5,
      ...divergenciaInfo,
    };
  }

  return SEM_VINCULO;
}
