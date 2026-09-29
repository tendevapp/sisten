/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Utilitário universal de busca por palavras-chave (Keywords / Multi-termos).
 *
 * Permite que barras de pesquisa aceitem termos separados por espaço em qualquer
 * ordem, com insensibilidade a acentos (diacríticos) e maiúsculas/minúsculas,
 * além de suporte a expressões exatas entre aspas duplas (ex: "fita dupla").
 */

/**
 * Normaliza um texto removendo acentos, diacríticos e convertendo para minúsculas.
 */
export function normalizarParaBusca(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Extrai as palavras-chave da consulta digitada pelo usuário.
 * Expressões entre aspas duplas são mantidas intactas como um único token.
 * Os demais termos são separados por espaços em branco.
 *
 * @example
 * extrairPalavrasChave('parafuso sextavado m16') // ['parafuso', 'sextavado', 'm16']
 * extrairPalavrasChave('"fita dupla face" 3m')    // ['fita dupla face', '3m']
 * extrairPalavrasChave('  Válvula   Esfera ')     // ['valvula', 'esfera']
 */
export function extrairPalavrasChave(termoBusca: string | null | undefined): string[] {
  const bruto = (termoBusca ?? '').trim();
  if (!bruto) return [];

  const tokens: string[] = [];

  // 1. Extrai expressões entre aspas duplas mantendo-as inteiras
  const semAspas = bruto.replace(/"([^"]+)"/g, (_, frase: string) => {
    const norm = normalizarParaBusca(frase).trim();
    if (norm) tokens.push(norm);
    return ' ';
  });

  // 2. Extrai as palavras restantes separadas por espaço
  const palavras = normalizarParaBusca(semAspas)
    .split(/\s+/)
    .filter(Boolean);

  for (const p of palavras) {
    tokens.push(p);
  }

  return tokens;
}

/**
 * Verifica se o alvo (texto ou array de campos) atende a todos os tokens pré-extraídos.
 * Ideal para ser utilizado dentro de loops (.filter) sem reprocessar a query a cada linha.
 *
 * @param alvo Texto único ou lista de campos (ex: [codigo, descricao, fornecedor, po])
 * @param tokens Array de tokens de busca já normalizados
 * @returns true se todas as palavras-chave estiverem contidas no alvo
 */
export function casarTokens(
  alvo: string | null | undefined | (string | null | undefined)[],
  tokens: string[],
): boolean {
  if (tokens.length === 0) return true;

  let textoAlvo = '';
  if (Array.isArray(alvo)) {
    textoAlvo = normalizarParaBusca(alvo.filter(Boolean).join(' '));
  } else {
    textoAlvo = normalizarParaBusca(alvo);
  }

  if (!textoAlvo) return false;

  // Busca cumulativa (AND): todos os tokens devem ser encontrados no texto consolidado
  return tokens.every(token => textoAlvo.includes(token));
}

/**
 * Verifica se um texto ou lista de campos atende a todas as palavras-chave da busca.
 *
 * @param alvo Texto único ou lista de campos (ex: [codigo, descricao, fornecedor])
 * @param termoBusca Texto digitado pelo usuário na barra de pesquisa
 */
export function casarPalavrasChave(
  alvo: string | null | undefined | (string | null | undefined)[],
  termoBusca: string | null | undefined,
): boolean {
  if (!termoBusca || !termoBusca.trim()) return true;
  const tokens = extrairPalavrasChave(termoBusca);
  return casarTokens(alvo, tokens);
}

/**
 * Cria uma função predicado de filtragem pré-otimizada para uso direto com Array.filter().
 *
 * @param termoBusca Consulta do usuário
 * @param extratorCampos Função que recebe o item e retorna os campos textuais a pesquisar
 *
 * @example
 * const filtro = criarFiltroPalavrasChave(busca, r => [r.material, r.descricao, r.fornecedor]);
 * const resultados = itens.filter(filtro);
 */
export function criarFiltroPalavrasChave<T>(
  termoBusca: string | null | undefined,
  extratorCampos: (item: T) => (string | null | undefined)[],
): (item: T) => boolean {
  const tokens = extrairPalavrasChave(termoBusca);
  if (tokens.length === 0) return () => true;

  return (item: T) => {
    const campos = extratorCampos(item);
    return casarTokens(campos, tokens);
  };
}

/**
 * Adiciona novas palavras-chave a uma lista existente de chips, evitando duplicatas.
 * Aceita palavras separadas por espaço e expressões entre aspas duplas.
 */
export function adicionarChipsKeywords(chipsAtuais: string[], novoTexto: string): string[] {
  const novosTermos = extrairPalavrasChave(novoTexto);
  if (novosTermos.length === 0) return chipsAtuais;
  const lista = [...chipsAtuais];
  let alterou = false;
  for (const termo of novosTermos) {
    if (!lista.some(c => c.toLowerCase() === termo.toLowerCase())) {
      lista.push(termo);
      alterou = true;
    }
  }
  return alterou ? lista : chipsAtuais;
}

/**
 * Remove um chip específico da lista de chips (case-insensitive).
 */
export function removerChipKeyword(chipsAtuais: string[], chipParaRemover: string): string[] {
  return chipsAtuais.filter(c => c.toLowerCase() !== chipParaRemover.toLowerCase());
}

