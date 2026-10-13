/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Etiqueta de identificação de material (prateleira do almoxarifado).
 *
 * O QR leva só a identificação do item (`SISTEN-ITEM:1437274`). Quem lê é o
 * botão "Ler QR" da Requisição no Balcão, com o formulário já aberto e o
 * usuário logado: o item fica escolhido e falta só a quantidade. Descrição,
 * depósito e saldo vêm do cadastro e da ZL0024 na hora da leitura — a etiqueta
 * não fica velha quando o texto muda; só o impresso precisa de reimpressão.
 */

export const PREFIXO_QR_ITEM = 'SISTEN-ITEM:';

/** Conteúdo gravado no QR da etiqueta. */
export function conteudoQrEtiqueta(codigoSap: string): string {
  return `${PREFIXO_QR_ITEM}${codigoSap.trim()}`;
}

/**
 * Código SAP de um texto lido pela câmera. Aceita:
 * - o QR da etiqueta (`SISTEN-ITEM:1437274`);
 * - as etiquetas de teste, que levavam o link `...?item=1437274`;
 * - código puro, como o código de barras das etiquetas antigas (`1427577`).
 * Qualquer outro QR (link de fornecedor, texto livre) devolve null.
 */
export function codigoDoQr(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  if (t.toUpperCase().startsWith(PREFIXO_QR_ITEM)) {
    const codigo = t.slice(PREFIXO_QR_ITEM.length).trim();
    return codigo || null;
  }
  if (/^https?:\/\//i.test(t) || t.includes('#/')) {
    const consulta = t.includes('?') ? t.slice(t.lastIndexOf('?') + 1) : '';
    const codigo = (new URLSearchParams(consulta).get('item') ?? '').trim();
    return codigo || null;
  }
  return /^[0-9]{5,12}$/.test(t) ? t : null;
}

export interface DadosEtiqueta {
  codigo_sap: string;
  descricao: string;
  localizacao: string;
  aplicacao: string;
  /** Caminho da foto no Storage (catálogo ou Book de EPIs), se houver. */
  url_foto: string | null;
}

interface ItemParaEtiqueta {
  codigo_sap: string;
  descricao: string;
  url_foto?: string | null;
  item_catalogo?: {
    etiqueta_descricao?: string | null;
    etiqueta_aplicacao?: string | null;
  } | null;
}

/**
 * O que vai impresso: o editado no cadastro vale mais; sem edição, o do SAP.
 * O mínimo não entra — a célula sai em branco para ser preenchida à mão.
 */
export function dadosEtiquetaDoItem(item: ItemParaEtiqueta, localizacao: string): DadosEtiqueta {
  const cat = item.item_catalogo;
  return {
    codigo_sap: item.codigo_sap.trim(),
    descricao: (cat?.etiqueta_descricao || item.descricao || item.codigo_sap).trim(),
    localizacao: localizacao.trim(),
    aplicacao: (cat?.etiqueta_aplicacao ?? '').trim(),
    url_foto: item.url_foto ?? null,
  };
}

/** Grade da folha A4 (pt): 2 colunas × 5 linhas de etiquetas de 90 × 54 mm. */
export const MM = 72 / 25.4;
export const ETIQUETA_LARGURA = 90 * MM;
export const ETIQUETA_ALTURA = 54 * MM;
export const ETIQUETAS_COLUNAS = 2;
export const ETIQUETAS_LINHAS = 5;
export const ETIQUETAS_POR_FOLHA = ETIQUETAS_COLUNAS * ETIQUETAS_LINHAS;
const FOLHA_LARGURA = 595.28;
const FOLHA_ALTURA = 841.89;
const ESPACO_H = 6 * MM;
const ESPACO_V = 2 * MM;

export interface PosicaoEtiqueta {
  pagina: number;
  /** Canto inferior esquerdo, em pt (origem do pdf-lib). */
  x: number;
  y: number;
}

/** Onde cada etiqueta cai: preenche linha a linha, de cima para baixo, centralizado na folha. */
export function posicaoDaEtiqueta(indice: number): PosicaoEtiqueta {
  const pagina = Math.floor(indice / ETIQUETAS_POR_FOLHA);
  const naFolha = indice % ETIQUETAS_POR_FOLHA;
  const linha = Math.floor(naFolha / ETIQUETAS_COLUNAS);
  const coluna = naFolha % ETIQUETAS_COLUNAS;
  const larguraGrade = ETIQUETAS_COLUNAS * ETIQUETA_LARGURA + (ETIQUETAS_COLUNAS - 1) * ESPACO_H;
  const alturaGrade = ETIQUETAS_LINHAS * ETIQUETA_ALTURA + (ETIQUETAS_LINHAS - 1) * ESPACO_V;
  const x0 = (FOLHA_LARGURA - larguraGrade) / 2;
  const topo = FOLHA_ALTURA - (FOLHA_ALTURA - alturaGrade) / 2;
  return {
    pagina,
    x: x0 + coluna * (ETIQUETA_LARGURA + ESPACO_H),
    y: topo - (linha + 1) * ETIQUETA_ALTURA - linha * ESPACO_V,
  };
}
