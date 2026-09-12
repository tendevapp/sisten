/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Vínculo entre o item cotado e o item de RM (RI) do processo, na etapa de
 * extração — e a conferência do que ficou **diferente** entre os dois.
 *
 * A IA que lê a proposta já sugere o RI de cada item: ela tem o texto
 * completo do PDF (bitola, material, marca, embalagem), coisa que a busca
 * por trigrama do banco não tem. Mas sugestão de LLM erra em silêncio, e um
 * RI errado joga o preço no item errado do mapa. Por isso nada aqui confia
 * na sugestão sozinha: o RI só vira vínculo se existir de verdade no escopo
 * do processo, e toda diferença perceptível entre o item cotado e o item da
 * RM (quantidade, unidade, descrição que não se parece) vira um chip de
 * alerta que o comprador vê antes de salvar.
 *
 * Ordem de confiança das origens, da mais fraca para a mais forte:
 * `sugerido` (trigrama) < `ia` < `aprendido` (memória confirmada) < `manual`.
 * Vínculo mais forte nunca é sobrescrito por um mais fraco.
 *
 * Camada pura, sem `db/`, testada em `vinculoCotacao.test.ts`.
 */

import { normalizarDescricao, temValor } from './cotacoes';
import { similaridadeDescricao } from './mapaCotacao';
import type {
  CotacaoProcessoItem,
  CotacaoPropostaItemDraft,
  SugestaoVinculo,
} from '../types';

/** Score atribuído ao vínculo que veio da IA — abaixo de 'aprendido' (0,90+) e acima do trigrama típico. */
export const SCORE_VINCULO_IA = 0.80;

/**
 * Abaixo disso, a descrição cotada e o texto da RM não se parecem o
 * suficiente para um vínculo passar sem conferência humana. O limiar é mais
 * frouxo que o de agrupamento do mapa (0,55): aqui já existe uma afirmação
 * de que são o mesmo item, e o objetivo é pegar o erro grosseiro, não
 * reagrupar.
 */
export const LIMIAR_DESCRICAO_DIVERGENTE = 0.30;

/** Diferença relativa de quantidade que ainda não merece alerta (arredondamento de embalagem). */
const TOLERANCIA_QTD = 0.001;

function unidadeEquivalente(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!temValor(a) || !temValor(b)) return true; // sem os dois lados não há divergência a afirmar
  const na = normalizarDescricao(String(a)).replace(/\.$/, '');
  const nb = normalizarDescricao(String(b)).replace(/\.$/, '');
  if (na === nb) return true;
  // Sinônimos que aparecem misturados entre proposta e SAP no dia a dia.
  const familias = [
    ['UN', 'UND', 'UNID', 'UNIDADE', 'PC', 'PCA', 'PECA'],
    ['CX', 'CAIXA'],
    ['KG', 'QUILO', 'KGS'],
    ['MT', 'M', 'METRO', 'METROS'],
    ['LT', 'L', 'LITRO', 'LITROS'],
    ['PCT', 'PACOTE'],
  ];
  return familias.some(f => f.includes(na) && f.includes(nb));
}

/**
 * O que está diferente entre o item cotado e o item de RM ao qual ele foi
 * vinculado. Devolve frases prontas para exibição — a grade mostra como
 * chip de alerta e o texto vai gravado no item.
 */
export function analisarDivergenciasVinculo(
  item: CotacaoPropostaItemDraft,
  escopoItem: CotacaoProcessoItem | null | undefined,
): string[] {
  if (!escopoItem) return [];
  const divergencias: string[] = [];

  if (item.quantidade != null && escopoItem.qtd_solicitada != null && escopoItem.qtd_solicitada > 0) {
    const relativa = Math.abs(item.quantidade - escopoItem.qtd_solicitada) / escopoItem.qtd_solicitada;
    if (relativa > TOLERANCIA_QTD) {
      divergencias.push(`Quantidade: cotou ${item.quantidade}, a RM pede ${escopoItem.qtd_solicitada}`);
    }
  }

  if (!unidadeEquivalente(item.unidade_medida, escopoItem.unidade_medida)) {
    divergencias.push(`Unidade: cotou ${item.unidade_medida}, a RM pede ${escopoItem.unidade_medida}`);
  }

  const semelhanca = similaridadeDescricao(item.descricao_produto, escopoItem.texto_breve);
  if (semelhanca < LIMIAR_DESCRICAO_DIVERGENTE) {
    divergencias.push('Descrição pouco parecida com a da RM — confira se é o mesmo material');
  }

  return divergencias;
}

/** Junta divergências de fontes diferentes sem repetir a mesma frase. */
function mesclarDivergencias(...listas: (string[] | null | undefined)[]): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const lista of listas) {
    for (const d of lista ?? []) {
      const texto = String(d).trim();
      if (!texto) continue;
      const chave = texto.toLowerCase();
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      saida.push(texto);
    }
  }
  return saida;
}

/** Indexa o escopo por RI normalizado — a IA devolve o RI como texto, com espaço e caixa variáveis. */
function indexarEscopoPorRi(escopo: CotacaoProcessoItem[]): Map<string, CotacaoProcessoItem> {
  const mapa = new Map<string, CotacaoProcessoItem>();
  for (const e of escopo) {
    const chave = normalizarDescricao(e.ri ?? '');
    if (chave) mapa.set(chave, e);
  }
  return mapa;
}

export interface ResumoVinculoIa {
  /** Itens que a IA conseguiu vincular a um RI existente no processo. */
  vinculados: number;
  /** RIs que a IA citou mas que não existem neste processo — sugestão descartada. */
  riInexistente: number;
  /** Itens vinculados com pelo menos uma divergência sinalizada. */
  comDivergencia: number;
}

export interface ParamsVinculoIa {
  itens: CotacaoPropostaItemDraft[];
  escopo: CotacaoProcessoItem[];
  /** Sugestões do trigrama/memória, por índice do item — só para cruzar com o que a IA disse. */
  sugestoes?: Map<number, SugestaoVinculo[]>;
}

/**
 * Aplica o vínculo sugerido pela IA na extração e anota as divergências.
 *
 * Não sobrescreve decisão mais forte: item já resolvido à mão, vindo da
 * memória confirmada ou marcado como desconsiderado fica como está — só
 * ganha a conferência de divergências.
 */
export function aplicarVinculosIa(params: ParamsVinculoIa): {
  itens: CotacaoPropostaItemDraft[];
  resumo: ResumoVinculoIa;
} {
  const porRi = indexarEscopoPorRi(params.escopo);
  const porId = new Map(params.escopo.map(e => [e.id, e]));
  const resumo: ResumoVinculoIa = { vinculados: 0, riInexistente: 0, comDivergencia: 0 };

  const itens = params.itens.map((item, idx) => {
    const bruto = item.extraido_raw;
    const riSugerido = bruto?.Vinculo_RI ? normalizarDescricao(String(bruto.Vinculo_RI)) : '';
    const alvoIa = riSugerido ? porRi.get(riSugerido) : undefined;

    if (riSugerido && !alvoIa) resumo.riInexistente += 1;

    const podeVincular =
      !item.desconsiderado
      && !item.fora_escopo
      && item.vinculo_origem !== 'manual'
      && item.vinculo_origem !== 'aprendido'
      && (!item.processo_item_id || item.vinculo_origem === 'sugerido');

    const aplicaIa = Boolean(alvoIa) && podeVincular;
    const escopoFinal = aplicaIa ? alvoIa! : (item.processo_item_id ? porId.get(item.processo_item_id) : null);

    // Divergência de fonte: a IA leu o documento inteiro, o trigrama só
    // compara texto; quando os dois apontam RIs diferentes, nenhum dos dois
    // deve passar calado.
    const melhorSugestao = params.sugestoes?.get(idx)?.[0];
    const conflitos: string[] = [];
    if (
      alvoIa && melhorSugestao
      && melhorSugestao.processo_item_id !== alvoIa.id
      && melhorSugestao.score >= 0.45
    ) {
      conflitos.push(`A IA vinculou ao ${alvoIa.ri}; a busca por similaridade apontou ${melhorSugestao.ri}`);
    }

    const divergencias = mesclarDivergencias(
      bruto?.Vinculo_Divergencias,
      conflitos,
      analisarDivergenciasVinculo(item, escopoFinal),
    );

    if (aplicaIa) resumo.vinculados += 1;
    if (escopoFinal && divergencias.length > 0) resumo.comDivergencia += 1;

    if (!aplicaIa) {
      return divergencias.length === 0 && item.vinculo_divergencias.length === 0
        ? item
        : { ...item, vinculo_divergencias: divergencias };
    }

    return {
      ...item,
      processo_item_id: alvoIa!.id,
      ri: alvoIa!.ri,
      material_code: alvoIa!.material_code,
      fora_escopo: false,
      vinculo_origem: 'ia' as const,
      vinculo_score: SCORE_VINCULO_IA,
      vinculo_divergencias: divergencias,
    };
  });

  return { itens, resumo };
}

/**
 * Recalcula as divergências de um item depois de o comprador mexer no
 * vínculo, na quantidade ou na unidade — o chip de alerta tem que
 * acompanhar a edição, senão vira aviso fantasma de um estado que não
 * existe mais. Mantém as divergências que a IA apontou sobre o próprio
 * item (aquelas não dependem do vínculo escolhido).
 */
export function revisarDivergencias(
  item: CotacaoPropostaItemDraft,
  escopo: CotacaoProcessoItem[],
): CotacaoPropostaItemDraft {
  if (item.desconsiderado || !item.processo_item_id) {
    return item.vinculo_divergencias.length === 0 ? item : { ...item, vinculo_divergencias: [] };
  }
  const escopoItem = escopo.find(e => e.id === item.processo_item_id) ?? null;
  const divergencias = mesclarDivergencias(
    item.extraido_raw?.Vinculo_Divergencias,
    analisarDivergenciasVinculo(item, escopoItem),
  );
  const igual =
    divergencias.length === item.vinculo_divergencias.length
    && divergencias.every((d, i) => d === item.vinculo_divergencias[i]);
  return igual ? item : { ...item, vinculo_divergencias: divergencias };
}
