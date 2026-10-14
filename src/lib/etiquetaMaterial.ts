/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Etiqueta de identificação de material (prateleira do almoxarifado).
 *
 * O QR leva um link curto (`https://sisten.site/#/balcao?item=1437274`) que
 * serve aos dois jeitos de ler:
 * - câmera comum do celular: abre o SISTEN numa Requisição no Balcão nova com o
 *   item escolhido, faltando só a quantidade (se pedir login, o item espera);
 * - botão "Ler QR" do formulário já aberto: o leitor tira o código do link.
 * Descrição, depósito e saldo vêm do cadastro e da ZL0024 na hora da leitura —
 * a etiqueta não fica velha quando o texto muda; só o impresso pede reimpressão.
 */

export const ROTA_REQUISICAO_BALCAO = '/formularios/almoxarifado-requisicao-balcao';
/** Rota curta do QR (App redireciona para a Requisição no Balcão): QR menor, mais fácil de ler. */
export const ROTA_CURTA_QR = '/balcao';
export const PARAMETRO_ITEM = 'item';
/** Endereço de produção — fixo, não o de onde o PDF foi gerado (senão sairia QR de localhost). */
export const ORIGEM_SISTEN = 'https://sisten.site';
/** Formato da 1ª leva de etiquetas (só o código); o leitor ainda aceita. */
export const PREFIXO_QR_ITEM = 'SISTEN-ITEM:';

/** Conteúdo gravado no QR da etiqueta. */
export function conteudoQrEtiqueta(codigoSap: string): string {
  return `${ORIGEM_SISTEN}/#${ROTA_CURTA_QR}?${PARAMETRO_ITEM}=${encodeURIComponent(codigoSap.trim())}`;
}

/** Código SAP do parâmetro `item` de uma rota/endereço (`...?item=1437274`), ou null. */
export function itemDaRota(endereco: string): string | null {
  const consulta = endereco.includes('?') ? endereco.slice(endereco.lastIndexOf('?') + 1) : '';
  const codigo = (new URLSearchParams(consulta).get(PARAMETRO_ITEM) ?? '').trim();
  return codigo || null;
}

/** Hash sem o parâmetro `item` — para o F5 não escolher o item de novo. */
export function hashSemItem(hash: string): string {
  const idx = hash.indexOf('?');
  if (idx < 0) return hash;
  const params = new URLSearchParams(hash.slice(idx + 1));
  params.delete(PARAMETRO_ITEM);
  const resto = params.toString();
  return resto ? `${hash.slice(0, idx)}?${resto}` : hash.slice(0, idx);
}

/**
 * Código SAP de um texto lido pela câmera. Aceita:
 * - o link do QR da etiqueta (`...#/balcao?item=1437274`, ou a rota longa);
 * - a 1ª leva de etiquetas (`SISTEN-ITEM:1437274`);
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
  if (/^https?:\/\//i.test(t) || t.includes('#/')) return itemDaRota(t);
  return /^[0-9]{5,12}$/.test(t) ? t : null;
}

// ---------------------------------------------------------------------------
// Item lido pela câmera comum antes do login
//
// A sessão cai na virada do dia, então a 1ª leitura do dia costuma pedir login
// — e o login (ou o redirecionamento para /login) troca o endereço e perde o
// `?item=`. O App guarda o código assim que o link abre; depois do login vai
// para a Requisição no Balcão, que consome o pendente. Expira em 30 min para
// um item esquecido não aparecer horas depois.
// ---------------------------------------------------------------------------

export const CHAVE_ITEM_QR_PENDENTE = 'sisten_qr_item_pendente';
const VALIDADE_PENDENTE_MS = 30 * 60 * 1000;

export function guardarItemQrPendente(codigo: string, agora = Date.now()): void {
  try {
    sessionStorage.setItem(CHAVE_ITEM_QR_PENDENTE, JSON.stringify({ codigo, em: agora }));
  } catch { /* sem storage: o link ainda funciona se já estiver logado */ }
}

function lerPendente(agora: number): string | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_ITEM_QR_PENDENTE);
    if (!bruto) return null;
    const { codigo, em } = JSON.parse(bruto) as { codigo?: string; em?: number };
    if (!codigo || typeof em !== 'number' || agora - em > VALIDADE_PENDENTE_MS) {
      sessionStorage.removeItem(CHAVE_ITEM_QR_PENDENTE);
      return null;
    }
    return codigo;
  } catch {
    return null;
  }
}

export function haItemQrPendente(agora = Date.now()): boolean {
  return lerPendente(agora) !== null;
}

/** Lê e apaga o pendente (cada leitura entra uma vez só). */
export function consumirItemQrPendente(agora = Date.now()): string | null {
  const codigo = lerPendente(agora);
  try { sessionStorage.removeItem(CHAVE_ITEM_QR_PENDENTE); } catch { /* ignora */ }
  return codigo;
}

export interface DadosEtiqueta {
  codigo_sap: string;
  descricao: string;
  localizacao: string;
  aplicacao: string;
  /** Estoque mínimo do cadastro; null sai em branco na etiqueta (preenchido à mão). */
  minimo: number | null;
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
    estoque_minimo?: number | string | null;
  } | null;
}

/** Número de um campo que pode vir como texto do formulário ("5", "2,5") ou do banco. */
export function numeroOuNull(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim().replace(',', '.');
  if (!texto) return null;
  const n = Number(texto);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * O que vai impresso: o editado no cadastro vale mais; sem edição, o do SAP.
 * Sem estoque mínimo no cadastro, a célula sai em branco para preencher à mão.
 */
export function dadosEtiquetaDoItem(item: ItemParaEtiqueta, localizacao: string): DadosEtiqueta {
  const cat = item.item_catalogo;
  return {
    codigo_sap: item.codigo_sap.trim(),
    descricao: (cat?.etiqueta_descricao || item.descricao || item.codigo_sap).trim(),
    localizacao: localizacao.trim(),
    aplicacao: (cat?.etiqueta_aplicacao ?? '').trim(),
    minimo: numeroOuNull(cat?.estoque_minimo),
    url_foto: item.url_foto ?? null,
  };
}

// ---------------------------------------------------------------------------
// Cor da etiqueta — escolhida na impressão. Pinta a faixa do título e as
// células de rótulo (LOCALIZAÇÃO, CÓDIGO ITEM, APLICAÇÃO...). Valores e QR
// seguem em preto sobre branco.
// ---------------------------------------------------------------------------

export type CorEtiqueta = 'cinza' | 'azul' | 'vermelho' | 'preto' | 'amarelo' | 'verde';

export interface TemaEtiqueta {
  rotulo: string;
  /** Faixa do título. */
  titulo: string;
  /** Células de rótulo. */
  celula: string;
  /** Texto sobre essas faixas (o amarelo pede preto). */
  texto: string;
}

export const CORES_ETIQUETA: Record<CorEtiqueta, TemaEtiqueta> = {
  cinza: { rotulo: 'Cinza', titulo: '#454545', celula: '#666666', texto: '#ffffff' },
  azul: { rotulo: 'Azul', titulo: '#1e3a8a', celula: '#2563eb', texto: '#ffffff' },
  vermelho: { rotulo: 'Vermelho', titulo: '#991b1b', celula: '#dc2626', texto: '#ffffff' },
  preto: { rotulo: 'Preto', titulo: '#000000', celula: '#262626', texto: '#ffffff' },
  amarelo: { rotulo: 'Amarelo', titulo: '#facc15', celula: '#fde047', texto: '#000000' },
  verde: { rotulo: 'Verde', titulo: '#166534', celula: '#16a34a', texto: '#ffffff' },
};

export const ORDEM_CORES_ETIQUETA: CorEtiqueta[] = ['cinza', 'azul', 'vermelho', 'preto', 'amarelo', 'verde'];

export function ehCorEtiqueta(valor: unknown): valor is CorEtiqueta {
  return typeof valor === 'string' && valor in CORES_ETIQUETA;
}

/** '#rrggbb' → componentes 0..1 (para o rgb() do pdf-lib). */
export function hexParaRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
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
