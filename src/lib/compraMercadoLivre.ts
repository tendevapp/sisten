/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Central de Compras — itens destinados à compra pelo Mercado Livre.
 *
 * Uma compra do ML (um carrinho, um boleto) junta itens de várias RMs e chega
 * em várias NFs de lojas diferentes. O que amarra tudo é o número da compra
 * do ML: o comprador grava o link do anúncio em cada item e, ao fechar o
 * carrinho, o número da compra nos itens comprados. Aqui ficam as regras
 * puras; o I/O está em `compraMercadoLivreApi.ts`.
 */

export interface ItemMercadoLivre {
  ri: string;
  rm: string | null;
  item_reqc: string | null;
  material_code: string | null;
  texto_breve: string | null;
  qtd: number | null;
  unidade: string | null;
  link: string;
  numero_compra: string | null;
  compra_registrada_em: string | null;
  compra_registrada_por_nome: string | null;
  criado_por_nome: string | null;
  created_at: string;
  updated_at: string;
}

/** Filtro da subpágina M Livre: todos, só os que faltam comprar, ou uma compra. */
export type FiltroCompraMl = 'todos' | 'sem_compra' | string;
export const FILTRO_ML_TODOS = 'todos';
export const FILTRO_ML_SEM_COMPRA = 'sem_compra';

/** Número da compra do ML tem 16 dígitos hoje; aceita a partir de 10 para não travar em mudança de formato. */
const MIN_DIGITOS_COMPRA = 10;

/**
 * Número da compra só com dígitos — o comprador cola do jeito que o ML mostra
 * ("# 2000015616071149", "Compra #2000015616071149"). Devolve null se não
 * sobrar um número plausível.
 */
export function normalizarNumeroCompraMl(texto: string): string | null {
  const digitos = (texto ?? '').replace(/\D/g, '');
  return digitos.length >= MIN_DIGITOS_COMPRA ? digitos : null;
}

/**
 * Link do anúncio pronto para gravar, ou null se não for um endereço web.
 * Aceita colado sem protocolo ("produto.mercadolivre.com.br/...").
 */
export function normalizarLinkMl(texto: string): string | null {
  const bruto = (texto ?? '').trim();
  if (!bruto) return null;
  const comProtocolo = /^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`;
  try {
    const url = new URL(comProtocolo);
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Link de outro domínio é aceito (loja oficial fora do ML), mas a tela avisa. */
export function ehLinkMercadoLivre(link: string): boolean {
  try {
    const host = new URL(link).hostname.toLowerCase();
    // meli.la é o encurtador do botão "Compartilhar" do app do ML.
    return /(^|\.)(mercadolivre|mercadolibre)\.com/.test(host) || host === 'meli.la' || host.endsWith('.meli.la');
  } catch {
    return false;
  }
}

/** Texto que entra na Observação do comprador: "Compra ML #2000015616071149". */
export function rotuloCompraMl(numero: string): string {
  return `Compra ML #${numero}`;
}

/**
 * Acrescenta o número da compra na observação do comprador, sem duplicar se
 * o número já estiver lá (gravar duas vezes não repete o texto).
 */
export function observacaoComCompraMl(obs: string | null | undefined, numero: string): string {
  const atual = (obs ?? '').trim();
  if (atual.includes(numero)) return atual;
  return atual ? `${atual}\n${rotuloCompraMl(numero)}` : rotuloCompraMl(numero);
}

export interface ResumoCompraMl {
  numero: string;
  itens: number;
  rms: string[];
  registradaEm: string | null;
}

/** Compras do ML com os itens e RMs de cada uma, a mais recente primeiro. */
export function resumirComprasMl(itens: ItemMercadoLivre[]): ResumoCompraMl[] {
  const porNumero = new Map<string, ResumoCompraMl & { rmSet: Set<string> }>();
  for (const it of itens) {
    if (!it.numero_compra) continue;
    let resumo = porNumero.get(it.numero_compra);
    if (!resumo) {
      resumo = { numero: it.numero_compra, itens: 0, rms: [], registradaEm: null, rmSet: new Set() };
      porNumero.set(it.numero_compra, resumo);
    }
    resumo.itens++;
    if (it.rm) resumo.rmSet.add(it.rm);
    if (it.compra_registrada_em && (!resumo.registradaEm || it.compra_registrada_em > resumo.registradaEm)) {
      resumo.registradaEm = it.compra_registrada_em;
    }
  }
  return Array.from(porNumero.values())
    .map(({ rmSet, ...r }) => ({ ...r, rms: Array.from(rmSet).sort() }))
    .sort((a, b) => (b.registradaEm ?? '').localeCompare(a.registradaEm ?? '') || b.numero.localeCompare(a.numero));
}

/** O item passa no filtro da subpágina M Livre? */
export function passaFiltroCompraMl(item: ItemMercadoLivre | undefined, filtro: FiltroCompraMl): boolean {
  if (!item) return false;
  if (filtro === FILTRO_ML_TODOS) return true;
  if (filtro === FILTRO_ML_SEM_COMPRA) return !item.numero_compra;
  return item.numero_compra === filtro;
}
