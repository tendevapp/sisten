/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Catálogo de itens da BOM (Almox > Cadastro de Itens > Itens BOM > Exportar
 * catálogo). A BOM é uma árvore indentada e cada linha é um uso da peça num
 * conjunto; o catálogo segue essa árvore.
 *
 * Capítulos = seção da linha (S1..S5 são os tramos da torre; "S1/S2" são os
 * flanges entre dois tramos; "TORRE" são os itens gerais). Linha sem seção
 * herda a do pai. Dentro do capítulo a ordem é a da BOM, e a indentação é
 * relativa ao próprio capítulo: um filho que caiu num capítulo diferente do pai
 * aparece na raiz desse capítulo, sem sugerir um pai que não está ali.
 */

import { montarArvore, type BomLinha, type NoBom } from './projetosBom';

export const SEM_SECAO = 'Sem seção';

/** Campos do cadastro (`alm_bom_itens_cadastro`) que o catálogo usa. */
export interface CadastroCatalogo {
  posicao_estoque?: string | null;
  etiqueta_descricao?: string | null;
  url_imagem?: string | null;
}

/** Linha da BOM com o código equivalente Qingdao (campo da view, fora de `BomLinha`). */
export type LinhaBomCatalogo = BomLinha & { codigo_equivalente_qingdao?: string | null };

export interface LinhaCatalogo {
  id: number;
  /** Nível da BOM (L1 = conjunto principal). */
  nivel: number;
  /** Recuo dentro do capítulo, em níveis (0 = raiz do capítulo). */
  recuo: number;
  conjunto: boolean;
  /** Part number normalizado: chave do cadastro e da contagem de peças. */
  chave: string;
  partNumber: string;
  /** Português: o nome editado no cadastro vale mais que o da BOM. */
  descricao: string;
  /** Inglês da BOM; vazio quando igual ao português. */
  descricaoEn: string;
  codSap: string | null;
  qingdao: string | null;
  grupo: string;
  qtdPorTorre: number | null;
  localizacao: string;
  /** URL assinada da foto da peça, se houver. */
  urlFoto: string | null;
}

export interface TotaisCatalogo {
  /** Linhas da BOM (cada uso da peça). */
  linhas: number;
  /** Part numbers distintos. */
  pecas: number;
  /** Linhas que são conjunto (têm peças abaixo). */
  conjuntos: number;
  /** Part numbers distintos com foto. */
  comFoto: number;
  /** Part numbers distintos com localização no depósito. */
  comLocalizacao: number;
}

export interface CapituloCatalogo {
  secao: string;
  linhas: LinhaCatalogo[];
  totais: TotaisCatalogo;
}

export interface CatalogoBom {
  capitulos: CapituloCatalogo[];
  totais: TotaisCatalogo;
}

const texto = (v: string | null | undefined) => (v ?? '').trim();

/** Ordem dos capítulos: torre, depois tramo, com a junção logo após o tramo de baixo. */
export function ordemSecaoCatalogo(secao: string): number {
  if (secao === SEM_SECAO) return 1000;
  if (secao === 'TORRE') return 0;
  const n = Number(secao.match(/\d+/)?.[0]);
  if (!Number.isFinite(n)) return 500;
  return n + (secao.includes('/') ? 0.5 : 0);
}

/** Título do capítulo, em português corrente. */
export function rotuloSecao(secao: string): string {
  if (secao === SEM_SECAO) return 'Sem seção';
  if (secao === 'TORRE') return 'Torre (itens gerais)';
  if (secao.includes('/')) return `Junção ${secao.replace('/', '-')}`;
  return `Seção ${secao}`;
}

function totaisDe(linhas: LinhaCatalogo[]): TotaisCatalogo {
  const pecas = new Set<string>();
  const comFoto = new Set<string>();
  const comLocal = new Set<string>();
  let conjuntos = 0;
  for (const l of linhas) {
    if (l.chave) pecas.add(l.chave);
    if (l.conjunto) conjuntos += 1;
    if (l.chave && l.urlFoto) comFoto.add(l.chave);
    if (l.chave && l.localizacao) comLocal.add(l.chave);
  }
  return {
    linhas: linhas.length,
    pecas: pecas.size,
    conjuntos,
    comFoto: comFoto.size,
    comLocalizacao: comLocal.size,
  };
}

/**
 * Árvore da BOM dividida em capítulos por seção. Código equivalente e SAP são
 * os da primeira linha da peça que os tiver, como no cadastro de itens.
 */
export function montarCatalogoBom(
  linhas: LinhaBomCatalogo[],
  cadastros: Map<string, CadastroCatalogo> = new Map(),
): CatalogoBom {
  const arvore = montarArvore(linhas);
  const brutaPorId = new Map(linhas.map((l) => [l.id, l]));

  const qingdaoPorPeca = new Map<string, string>();
  const sapPorPeca = new Map<string, string>();
  for (const no of arvore.nos) {
    const bruta = brutaPorId.get(no.id);
    if (!no.partNumberNorm) continue;
    const q = texto(bruta?.codigo_equivalente_qingdao);
    if (q && !qingdaoPorPeca.has(no.partNumberNorm)) qingdaoPorPeca.set(no.partNumberNorm, q);
    if (no.codSap && !sapPorPeca.has(no.partNumberNorm)) sapPorPeca.set(no.partNumberNorm, no.codSap);
  }

  const porSecao = new Map<string, LinhaCatalogo[]>();
  const todas: LinhaCatalogo[] = [];

  const linhaDoNo = (no: NoBom, recuo: number): LinhaCatalogo => {
    const cad = cadastros.get(no.partNumberNorm);
    const descricao = texto(cad?.etiqueta_descricao) || no.descricao || no.description || no.partNumber;
    const en = no.description;
    return {
      id: no.id,
      nivel: no.level,
      recuo,
      conjunto: !no.folha,
      chave: no.partNumberNorm,
      partNumber: no.partNumber || no.partNumberNorm,
      descricao,
      descricaoEn: en && en.toLowerCase() !== descricao.toLowerCase() ? en : '',
      codSap: no.codSap ?? sapPorPeca.get(no.partNumberNorm) ?? null,
      qingdao: qingdaoPorPeca.get(no.partNumberNorm) ?? null,
      grupo: no.grupo,
      qtdPorTorre: no.qtdPorTorre,
      localizacao: texto(cad?.posicao_estoque),
      urlFoto: cad?.url_imagem ?? null,
    };
  };

  // Caminha a árvore na ordem da BOM. `secoesAcima` são as seções dos ancestrais:
  // o recuo é quantos ancestrais estão no mesmo capítulo.
  const percorrer = (id: number, secaoPai: string | null, secoesAcima: string[]) => {
    const no = arvore.porId.get(id);
    if (!no) return;
    const secao = no.secao ?? secaoPai ?? SEM_SECAO;
    const recuo = secoesAcima.filter((s) => s === secao).length;
    const linha = linhaDoNo(no, recuo);
    todas.push(linha);
    const lista = porSecao.get(secao) ?? [];
    lista.push(linha);
    porSecao.set(secao, lista);
    for (const filho of no.filhos) percorrer(filho, secao, [...secoesAcima, secao]);
  };
  arvore.raizes.forEach((raiz) => percorrer(raiz, null, []));

  const capitulos: CapituloCatalogo[] = [...porSecao.entries()]
    .sort(([a], [b]) => ordemSecaoCatalogo(a) - ordemSecaoCatalogo(b) || a.localeCompare(b, 'pt-BR'))
    .map(([secao, lista]) => ({ secao, linhas: lista, totais: totaisDe(lista) }));

  return { capitulos, totais: totaisDe(todas) };
}
