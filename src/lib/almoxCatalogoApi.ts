/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * API e serviço de dados do Catálogo de Itens do Almoxarifado (FRM.ALM-0016).
 *
 * Traz os itens com saldo na ZL0024 (`sap_zl0024_stk`), exclusivamente consumíveis
 * (Nível 1 = 'CONSUMÍVEL' da taxonomia de `cadastro_grupo_mercadoria`), excluindo
 * materiais de projeto (prefixo 100000). Permite capturar e vincular fotos
 * comprimidas aos itens para alimentar o catálogo e exibir na Solicitação de Compras.
 */

import { createStore, get, set, type UseStore } from 'idb-keyval';
import { supabase } from '../db/supabaseClient';
import { localDb } from '../db/localDb';
import { buscarTudo } from './buscarTudo';
import { comprimirImagemUpload } from './imageCompression';
import { isProjetoItem } from './demandas';
import { SSMA_BOOK_EPIS_BUCKET } from './ssmaBookEpisApi';
import { buscarMateriais, normalizarTermo, ehCodigoSapInativo } from './materiais';
import { lotesDoCatalogo, normalizarLotesCatalogo, type LoteValidadeCatalogo } from './almoxCatalogoLotes';
import type { EstoqueItem, CadastroGrupoMercadoria, RequestAttachment, Profile } from '../types';

export const PREFIXO_CAT_ITEM = 'CAT';
export const BUCKET_CATALOGO = 'request-attachments';
export const PASTA_CATALOGO = 'almox-catalogo';
/**
 * Cache-Control das fotos do catálogo (s). O nome leva timestamp e o arquivo
 * nunca é sobrescrito, então o navegador pode guardar por um ano.
 */
export const CACHE_FOTO_CATALOGO = '31536000';
/** Tabela do catálogo compartilhado (migration 20260929140000). */
export const TABELA_CATALOGO = 'alm_catalogo_itens';
/** Onde o catálogo morava antes da tabela — só lido para migrar o que ficou no aparelho. */
export const CHAVE_CATALOGO_ITENS = 'sisten_almox_catalogo_itens';
export const CHAVE_CATALOGO_LISTA_FIXA = 'sisten_almox_catalogo_lista_fixa';

export interface CatalogoItem {
  id: string;
  codigo_registro: string;
  codigo_sap: string;
  descricao: string;
  texto_tecnico: string | null;
  grp_mercad: string | null;
  grupo_mercadorias: string | null;
  classificacao_nivel1: string | null;
  classificacao_nivel2: string | null;
  umb: string | null;
  saldo_zl0024: number | null;
  imagem_path: string | null;
  imagem_nome: string | null;
  imagem_mime: string | null;
  imagem_tamanho: number | null;
  observacao: string | null;
  /** Posição no depósito digitada no cadastro; vale mais que a da ZL0024. */
  posicao_estoque?: string | null;
  /** Etiqueta de prateleira: descrição impressa (vazia = a do SAP) e aplicação. */
  etiqueta_descricao?: string | null;
  etiqueta_aplicacao?: string | null;
  etiqueta_impressa_em?: string | null;
  /** Estoque mínimo digitado no cadastro (sai na etiqueta). */
  estoque_minimo?: number | null;
  /** Metadados opcionais do cadastro; não fazem parte da etiqueta. */
  lote?: string | null;
  validade?: string | null;
  lotes_validade?: LoteValidadeCatalogo[];
  ativo: boolean;
  criado_por: string;
  criado_por_nome: string | null;
  atualizado_por: string | null;
  atualizado_por_nome: string | null;
  created_at: string;
  updated_at: string;
  url_imagem?: string | null;
}

export interface EpiFotoInfo {
  imagem_path: string;
  ca?: string;
  descricao?: string;
  url_imagem?: string | null;
}

export interface ItemConsumivelZl0024 {
  codigo_sap: string;
  descricao: string;
  texto_tecnico: string;
  grp_mercad: string;
  grupo_mercadorias: string;
  classificacao_nivel1: string;
  classificacao_nivel2: string;
  saldo_total: number;
  umb: string;
  depositos: string[];
  item_catalogo?: CatalogoItem | null;
  tem_foto: boolean;
  url_foto?: string | null;
  origem_foto?: 'catalogo' | 'book_epi';
  ca_epi?: string;
}

export interface MaterialCandidatoCatalogo {
  codigo_sap: string;
  descricao: string;
  texto_tecnico?: string;
  grp_mercad?: string;
  grupo_mercadorias?: string;
  classificacao_nivel1?: string;
  classificacao_nivel2?: string;
  umb: string;
  saldo_total: number;
  depositos: string[];
  ja_no_catalogo: boolean;
  tem_foto: boolean;
  url_foto?: string | null;
  origem_foto?: 'catalogo' | 'book_epi';
  ca_epi?: string;
}

export interface DadosCatalogoCompleto {
  itens: ItemConsumivelZl0024[];
  estoqueCompleto: EstoqueItem[];
  grupos: CadastroGrupoMercadoria[];
  itensCatalogo: CatalogoItem[];
  mapaEpis: Map<string, EpiFotoInfo>;
  /** Posição no depósito por código SAP (última conhecida, mesmo sem saldo). */
  posicoes?: Map<string, string[]>;
}

export interface SalvarItemCatalogoPayload {
  codigo_sap: string;
  descricao: string;
  texto_tecnico?: string | null;
  grp_mercad?: string | null;
  grupo_mercadorias?: string | null;
  classificacao_nivel1?: string | null;
  classificacao_nivel2?: string | null;
  umb?: string | null;
  saldo_zl0024?: number | null;
  observacao?: string | null;
  posicao_estoque?: string | null;
  etiqueta_descricao?: string | null;
  etiqueta_aplicacao?: string | null;
  /** undefined mantém o gravado; null apaga. */
  estoque_minimo?: number | null;
  /** undefined mantém o gravado; null ou vazio apaga. */
  lote?: string | null;
  validade?: string | null;
  /** undefined mantém a lista; [] remove todos os lotes. */
  lotes_validade?: LoteValidadeCatalogo[];
  fotoArquivo?: File | null;
  removerFoto?: boolean;
}

/**
 * Depósitos desconsiderados no saldo de estoque do almoxarifado no cadastro de itens.
 * O depósito 0105 (Transferência Produção) representa materiais já transferidos
 * para o chão de fábrica / linhas de produção, não fazendo parte do saldo físico
 * disponível no estoque do almoxarifado.
 */
export const DEPOSITOS_EXCLUIDOS_SALDO_CATALOGO: ReadonlySet<string> = new Set(['0105']);

export function ehDepositoExcluidoSaldo(deposito?: string | null): boolean {
  if (!deposito) return false;
  const limpo = String(deposito).trim();
  const normalizado = /^\d+$/.test(limpo) ? limpo.padStart(4, '0') : limpo.toUpperCase();
  return DEPOSITOS_EXCLUIDOS_SALDO_CATALOGO.has(normalizado) || DEPOSITOS_EXCLUIDOS_SALDO_CATALOGO.has(limpo);
}

/**
 * Arredonda quantidades para eliminar dízimas/resíduos de ponto flutuante IEEE 754 (ex: 16.009999999999998 -> 16.01).
 */
export function arredondarSaldo(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 10000) / 10000;
}

/**
 * Calcula o saldo consolidado de um material no estoque ZL0024, desconsiderando depósitos fora do almoxarifado (ex: 0105).
 */
export function calcularSaldoMaterialEstoque(
  estoque: EstoqueItem[],
  materialCode: string
): { saldo: number; depositos: string[] } {
  const mat = materialCode.trim();
  let saldo = 0;
  const depositos: string[] = [];
  for (const row of estoque) {
    if (String(row.material || '').trim() !== mat) continue;
    const dep = String(row.deposito || '').trim();
    if (ehDepositoExcluidoSaldo(dep)) continue;
    const q = Math.max(0, Number(row.quantidade) || 0);
    saldo += q;
    if (dep && !depositos.includes(dep)) depositos.push(dep);
  }
  return { saldo: arredondarSaldo(saldo), depositos };
}

/**
 * Formata um saldo numérico para exibição em tela, arredondando e removendo artefatos flutuantes.
 */
export function formatarSaldo(valor: number | string | null | undefined): string {
  if (valor == null || valor === '') return '0';
  const num = Number(valor);
  if (!Number.isFinite(num)) return '0';
  return String(arredondarSaldo(num));
}

const tabelaCatalogo = () => (supabase.from as any)(TABELA_CATALOGO);

/**
 * Itens que o catálogo guardava no localStorage antes da tabela existir.
 * Só `migrarCatalogoLocalLegado` lê isto.
 */
export function obterItensCatalogoLocal(): CatalogoItem[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CHAVE_CATALOGO_ITENS) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Grava a cópia local legada — usado só por testes e pela migração. */
export function salvarItensCatalogoLocal(itens: CatalogoItem[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CHAVE_CATALOGO_ITENS, JSON.stringify(itens));
    }
  } catch (err) {
    console.warn('[almoxCatalogoApi] Falha ao persistir itens do catalogo local:', err);
  }
}

/**
 * Recupera a lista fixa de itens consumiveis do catalogo do almoxarifado.
 */
export function obterListaFixaCatalogoLocal(): ItemConsumivelZl0024[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CHAVE_CATALOGO_LISTA_FIXA) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Salva a lista fixa de itens consumiveis do catalogo do almoxarifado.
 */
export function salvarListaFixaCatalogoLocal(lista: ItemConsumivelZl0024[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CHAVE_CATALOGO_LISTA_FIXA, JSON.stringify(lista));
    }
  } catch (err) {
    console.warn('[almoxCatalogoApi] Falha ao persistir lista fixa do catalogo local:', err);
  }
}

type UrlAssinada = { url: string; expiraEm: number };
const cacheUrlsAssinadas = new Map<string, UrlAssinada>();

/** A URL assinada vale 24 h; reaproveita por ~22 h para nunca entregar uma prestes a vencer. */
const VALIDADE_URL_S = 86400;
const REUSO_URL_MS = 80000 * 1000;

/** Caminhos por chamada de `createSignedUrls`; o Storage aceita até 1.000. */
const CAMINHOS_POR_ASSINATURA = 500;

/**
 * As URLs assinadas também ficam no aparelho (IndexedDB). Cada assinatura nova
 * leva um token diferente, e URL diferente é foto baixada de novo: sem isso,
 * toda abertura do Cadastro de Itens rebaixava as mil fotos do catálogo em vez
 * de usar o que o navegador já tinha.
 */
const CHAVE_URLS_NO_APARELHO = 'catalogo';
let lojaUrls: UseStore | null | undefined;
let urlsDoAparelho: Promise<void> | null = null;
let gravacaoUrls: ReturnType<typeof setTimeout> | null = null;

function lojaUrlsAssinadas(): UseStore | null {
  if (lojaUrls === undefined) lojaUrls = typeof indexedDB === 'undefined' ? null : createStore('sisten-urls-fotos', 'urls');
  return lojaUrls;
}

function carregarUrlsDoAparelho(): Promise<void> {
  if (!urlsDoAparelho) {
    urlsDoAparelho = (async () => {
      const loja = lojaUrlsAssinadas();
      if (!loja) return;
      try {
        const salvas = await get<Array<[string, UrlAssinada]>>(CHAVE_URLS_NO_APARELHO, loja);
        const agora = Date.now();
        for (const [chave, valor] of salvas ?? []) {
          if (valor.expiraEm > agora && !cacheUrlsAssinadas.has(chave)) cacheUrlsAssinadas.set(chave, valor);
        }
      } catch { /* IndexedDB bloqueado (aba anônima): segue só com a memória */ }
    })();
  }
  return urlsDoAparelho;
}

function guardarUrlAssinada(chave: string, url: string): void {
  cacheUrlsAssinadas.set(chave, { url, expiraEm: Date.now() + REUSO_URL_MS });
  const loja = lojaUrlsAssinadas();
  if (!loja || gravacaoUrls) return;
  // Agrupa as gravações de um lote inteiro numa só escrita.
  gravacaoUrls = setTimeout(() => {
    gravacaoUrls = null;
    const agora = Date.now();
    const validas = [...cacheUrlsAssinadas].filter(([, v]) => v.expiraEm > agora);
    void set(CHAVE_URLS_NO_APARELHO, validas, loja).catch(() => { /* sem espaço: fica só na memória */ });
  }, 500);
}

function bucketDaFoto(cleanPath: string, bucketPreferencial?: string): string {
  return bucketPreferencial || (cleanPath.startsWith('epis/') ? SSMA_BOOK_EPIS_BUCKET : BUCKET_CATALOGO);
}

/**
 * Obtém URL assinada da imagem do catálogo no Supabase Storage com cache em memória.
 * Suporta o bucket oficial do catálogo, contingência alm-catalogo e o bucket do Book de EPIs (ssma-book-epis).
 */
export async function obterUrlFotoCatalogo(path?: string | null, bucketPreferencial?: string): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (!supabase) return null;

  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const bucket = bucketDaFoto(cleanPath, bucketPreferencial);
  const cacheKey = `${bucket}:${cleanPath}`;
  await carregarUrlsDoAparelho();
  const emCache = cacheUrlsAssinadas.get(cacheKey);
  if (emCache && emCache.expiraEm > Date.now()) {
    return emCache.url;
  }

  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(cleanPath, VALIDADE_URL_S);
    if (!error && data?.signedUrl) {
      guardarUrlAssinada(cacheKey, data.signedUrl);
      return data.signedUrl;
    }
    // Fallback caso a foto resida em outro bucket
    const outros = [SSMA_BOOK_EPIS_BUCKET, BUCKET_CATALOGO, 'alm-catalogo'].filter(b => b !== bucket);
    for (const b of outros) {
      const { data: d2 } = await supabase.storage.from(b).createSignedUrl(cleanPath, VALIDADE_URL_S);
      if (d2?.signedUrl) {
        guardarUrlAssinada(cacheKey, d2.signedUrl);
        return d2.signedUrl;
      }
    }
    return null;
  } catch (err) {
    console.warn('[almoxCatalogoApi] Falha ao obter URL assinada da foto:', err);
    return null;
  }
}

/**
 * Resolve em lote (batch) URLs assinadas de fotos para múltiplos caminhos em 1 única requisição por bucket,
 * eliminando waterfalls sequenciais lentos.
 */
export async function obterUrlsFotosCatalogoLote(
  itens: Array<{ path: string; bucket?: string }>
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!supabase || itens.length === 0) return mapa;
  await carregarUrlsDoAparelho();

  const porBucket = new Map<string, string[]>();
  for (const item of itens) {
    if (!item.path) continue;
    if (item.path.startsWith('http://') || item.path.startsWith('https://')) {
      mapa.set(item.path, item.path);
      continue;
    }
    const cleanPath = item.path.startsWith('/') ? item.path.slice(1) : item.path;
    const b = bucketDaFoto(cleanPath, item.bucket);
    const emCache = cacheUrlsAssinadas.get(`${b}:${cleanPath}`);
    if (emCache && emCache.expiraEm > Date.now()) {
      mapa.set(cleanPath, emCache.url);
      continue;
    }

    const lista = porBucket.get(b) || [];
    if (!lista.includes(cleanPath)) lista.push(cleanPath);
    porBucket.set(b, lista);
  }

  // O Storage recusa o pedido INTEIRO acima de 1.000 caminhos
  // (MAX_OBJECTS_PER_REQUEST); o catálogo já passou disso, então assina em
  // fatias, em paralelo, e uma fatia que falhe não derruba as outras.
  const fatias: Array<[string, string[]]> = [];
  for (const [bucket, paths] of porBucket) {
    for (let i = 0; i < paths.length; i += CAMINHOS_POR_ASSINATURA) {
      fatias.push([bucket, paths.slice(i, i + CAMINHOS_POR_ASSINATURA)]);
    }
  }
  await Promise.all(
    fatias.map(async ([bucket, paths]) => {
      try {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, VALIDADE_URL_S);
        if (error) throw error;
        for (const res of data ?? []) {
          if (res.signedUrl && res.path) {
            mapa.set(res.path, res.signedUrl);
            guardarUrlAssinada(`${bucket}:${res.path}`, res.signedUrl);
          }
        }
      } catch (err) {
        console.warn(`[almoxCatalogoApi] Falha no lote de signed URLs do bucket ${bucket}:`, err);
      }
    })
  );

  return mapa;
}

/**
 * Consulta fotos cadastradas no Book de EPIs (`ssma_book_epis`) agrupadas por código SAP.
 */
export async function listarEpisComFoto(): Promise<Map<string, EpiFotoInfo>> {
  const mapa = new Map<string, EpiFotoInfo>();
  if (!supabase) return mapa;

  try {
    const { data, error } = await (supabase.from as any)('ssma_book_epis')
      .select('codigo_sap, imagem_path, ca, descricao_epi')
      .not('imagem_path', 'is', null)
      .eq('ativo', true);

    if (error || !data) return mapa;

    for (const row of data) {
      const cod = String(row.codigo_sap || '').trim();
      if (cod && row.imagem_path && !mapa.has(cod)) {
        mapa.set(cod, {
          imagem_path: row.imagem_path,
          ca: row.ca || undefined,
          descricao: row.descricao_epi || undefined,
        });
      }
    }
    return mapa;
  } catch (err) {
    console.warn('[almoxCatalogoApi] Falha ao consultar fotos do Book de EPIs:', err);
    return mapa;
  }
}

/**
 * Converte um item do catálogo em um anexo compatível com o módulo de Compras (`RequestAttachment`),
 * permitindo que a imagem seja visualizada ou reaproveitada diretamente na Solicitação de Compras.
 */
export function converterItemCatalogoEmAnexo(item: CatalogoItem): RequestAttachment {
  if (!item.codigo_sap || !item.imagem_path) {
    throw new Error('O item precisa ter código SAP e foto para entrar no banco de imagens.');
  }

  return {
    id: `alm-catalogo-${item.id}`,
    request_id: `almox-catalogo-${item.id}`,
    material_code: item.codigo_sap,
    name: item.imagem_nome || `Material ${item.codigo_sap}`,
    url: item.imagem_path,
    storage_path: item.imagem_path,
    mime_type: item.imagem_mime || 'image/jpeg',
    size: item.imagem_tamanho || 0,
    created_at: item.updated_at,
  };
}

/**
 * Consulta a lista completa de itens cadastrados no catálogo do almoxarifado (persistidos localmente).
 * Não realiza requisições REST para a tabela remota inexistente alm_catalogo_itens.
 */
export async function listarItensCatalogo(): Promise<CatalogoItem[]> {
  if (!supabase) return [];
  // Paginado: o catálogo passou de mil itens, e o que passava do corte do
  // PostgREST (os códigos mais altos) sumia da tela de todo mundo.
  try {
    return await buscarTudo<CatalogoItem>((de, ate) =>
      tabelaCatalogo().select('*').eq('ativo', true).order('codigo_sap').order('id').range(de, ate));
  } catch (error) {
    console.error('[almoxCatalogoApi] Falha ao listar o catálogo:', error);
    return [];
  }
}

/** Registro ativo do catálogo para o material — só a tabela, sem o fallback do Book de EPIs. */
export async function buscarItemAtivoCatalogo(codigoSap: string): Promise<CatalogoItem | null> {
  if (!supabase) return null;
  const { data, error } = await tabelaCatalogo()
    .select('*')
    .eq('codigo_sap', codigoSap)
    .eq('ativo', true)
    .maybeSingle();
  if (error) throw new Error(`Falha ao consultar o catálogo: ${error.message}`);
  return (data as CatalogoItem | null) ?? null;
}

/**
 * Busca uma foto específica do catálogo pelo código SAP do material.
 * Se o material não tiver foto no catálogo geral local, puxa automaticamente do Book de EPIs.
 */
export async function buscarFotoCatalogoPorCodigoSap(codigoSap: string): Promise<CatalogoItem | null> {
  const limpo = String(codigoSap || '').trim();
  if (!limpo) return null;

  try {
    // 1. Procura no catálogo
    const item = await buscarItemAtivoCatalogo(limpo);
    if (item && item.imagem_path) {
      if (!item.url_imagem) {
        item.url_imagem = await obterUrlFotoCatalogo(item.imagem_path);
      }
      return item;
    }

    // 2. Se não encontrou foto no catálogo do almoxarifado, busca no Book de EPIs (ssma_book_epis)
    if (supabase) {
      const { data: epi } = await (supabase.from as any)('ssma_book_epis')
        .select('*')
        .eq('codigo_sap', limpo)
        .not('imagem_path', 'is', null)
        .eq('ativo', true)
        .maybeSingle();

      if (epi && epi.imagem_path) {
        const url = await obterUrlFotoCatalogo(epi.imagem_path, SSMA_BOOK_EPIS_BUCKET);
        return {
          id: `epi-${epi.id}`,
          codigo_registro: `EPI-${epi.ca || 'BOOK'}`,
          codigo_sap: limpo,
          descricao: epi.descricao_sap || epi.descricao_epi || '',
          texto_tecnico: epi.indicacao || (epi.ca ? `CA: ${epi.ca}` : null),
          grp_mercad: 'M11',
          grupo_mercadorias: 'EPI E UNIFORMES',
          classificacao_nivel1: 'CONSUMÍVEL',
          classificacao_nivel2: 'EPI - Segurança',
          umb: 'UN',
          saldo_zl0024: 0,
          imagem_path: epi.imagem_path,
          imagem_nome: epi.imagem_nome || epi.descricao_epi,
          imagem_mime: epi.imagem_mime || 'image/jpeg',
          imagem_tamanho: epi.imagem_tamanho || 0,
          observacao: epi.ca ? `CA: ${epi.ca}` : null,
          ativo: true,
          criado_por: epi.criado_por || 'sistema',
          criado_por_nome: 'Book de EPIs',
          atualizado_por: null,
          atualizado_por_nome: null,
          created_at: epi.created_at,
          updated_at: epi.updated_at,
          url_imagem: url,
        };
      }
    }

    return item || null;
  } catch (err) {
    console.warn('[almoxCatalogoApi] Falha ao buscar foto por código SAP:', err);
    return null;
  }
}

/**
 * Busca em lote fotos de múltiplos materiais para alimentar Nova Solicitação (`NewRequest.tsx`) e Inventário Cíclico.
 * Integra fotos do catálogo do almoxarifado (local) e do Book de EPIs (remoto).
 */
export async function buscarFotosCatalogoPorCodigosSap(
  codigosSap: string[]
): Promise<Map<string, CatalogoItem>> {
  const mapa = new Map<string, CatalogoItem>();
  const codigos = [...new Set(codigosSap.map(c => String(c || '').trim()).filter(Boolean))];
  if (codigos.length === 0) return mapa;

  try {
    // 1. Consulta o catálogo
    if (supabase) {
      const { data, error } = await tabelaCatalogo()
        .select('*')
        .in('codigo_sap', codigos)
        .eq('ativo', true)
        .not('imagem_path', 'is', null);
      if (error) throw error;
      const itens = (data ?? []) as CatalogoItem[];
      const urls = await obterUrlsFotosCatalogoLote(itens.map(i => ({ path: i.imagem_path as string, bucket: BUCKET_CATALOGO })));
      for (const item of itens) {
        const path = item.imagem_path as string;
        item.url_imagem = urls.get(path.startsWith('/') ? path.slice(1) : path) ?? urls.get(path) ?? null;
        mapa.set(item.codigo_sap, item);
      }
    }

    // 2. Para códigos pendentes que não possuem foto no catálogo do almoxarifado, busca no Book de EPIs
    const pendentes = codigos.filter(c => !mapa.has(c));
    if (pendentes.length > 0 && supabase) {
      const { data: epis } = await (supabase.from as any)('ssma_book_epis')
        .select('*')
        .in('codigo_sap', pendentes)
        .not('imagem_path', 'is', null)
        .eq('ativo', true);

      if (epis) {
        for (const epi of epis) {
          const cod = String(epi.codigo_sap || '').trim();
          if (cod && !mapa.has(cod)) {
            const url = await obterUrlFotoCatalogo(epi.imagem_path, SSMA_BOOK_EPIS_BUCKET);
            mapa.set(cod, {
              id: `epi-${epi.id}`,
              codigo_registro: `EPI-${epi.ca || 'BOOK'}`,
              codigo_sap: cod,
              descricao: epi.descricao_sap || epi.descricao_epi || '',
              texto_tecnico: epi.indicacao || (epi.ca ? `CA: ${epi.ca}` : null),
              grp_mercad: 'M11',
              grupo_mercadorias: 'EPI E UNIFORMES',
              classificacao_nivel1: 'CONSUMÍVEL',
              classificacao_nivel2: 'EPI - Segurança',
              umb: 'UN',
              saldo_zl0024: 0,
              imagem_path: epi.imagem_path,
              imagem_nome: epi.imagem_nome || epi.descricao_epi,
              imagem_mime: epi.imagem_mime || 'image/jpeg',
              imagem_tamanho: epi.imagem_tamanho || 0,
              observacao: epi.ca ? `CA: ${epi.ca}` : null,
              ativo: true,
              criado_por: epi.criado_por || 'sistema',
              criado_por_nome: 'Book de EPIs',
              atualizado_por: null,
              atualizado_por_nome: null,
              created_at: epi.created_at,
              updated_at: epi.updated_at,
              url_imagem: url,
            });
          }
        }
      }
    }

    return mapa;
  } catch (err) {
    console.warn('[almoxCatalogoApi] Falha ao buscar fotos em lote do catálogo:', err);
    return mapa;
  }
}

/**
 * Lista imagens do catálogo como anexos (`RequestAttachment`) para o modal `ImageBankModal` em Compras.
 */
export async function listarImagensCatalogoPorCodigoSap(codigoSap: string): Promise<RequestAttachment[]> {
  const limpo = String(codigoSap || '').trim();
  if (!limpo) return [];

  const item = await buscarFotoCatalogoPorCodigoSap(limpo);
  if (!item || !item.imagem_path) return [];

  return [converterItemCatalogoEmAnexo(item)];
}

/**
 * Localização física de cada material (coluna "Pos.dpst." da ZL0024), por código SAP.
 * Um material em mais de um depósito pode ter mais de uma posição; repetidas e vazias saem.
 * Lida do estoque na hora, não da lista fixa: a lista fixa é cópia local e fica velha a cada importação.
 */
export function mapaPosicoesEstoque(estoque: EstoqueItem[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const row of estoque) {
    const material = String(row.material || '').trim();
    const posicao = String(row.posicao_estoque || '').trim();
    if (!material || !posicao) continue;
    const lista = mapa.get(material);
    if (!lista) mapa.set(material, [posicao]);
    else if (!lista.includes(posicao)) lista.push(posicao);
  }
  for (const lista of mapa.values()) lista.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  return mapa;
}

/**
 * Posição que a tela mostra: a digitada no cadastro (se houver) ou, na falta dela,
 * a última conhecida da ZL0024 — que continua valendo para o item que zerou.
 */
export function posicaoDoMaterial(
  codigoSap: string,
  catalogo: Pick<CatalogoItem, 'posicao_estoque'> | null | undefined,
  posicoes: Map<string, string[]> | undefined,
): string {
  const digitada = (catalogo?.posicao_estoque ?? '').trim();
  if (digitada) return digitada;
  return (posicoes?.get(codigoSap) ?? []).join(', ');
}

/**
 * Última posição conhecida de cada material, guardada em `alm_posicao_material`
 * (um trigger anota a cada importação da ZL0024). Vale também para o material que
 * zerou e saiu da ZL0024: a prateleira é a mesma. A view devolve só as posições da
 * última importação em que o material apareceu.
 */
export async function carregarPosicoesMaterial(): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  if (!supabase) return mapa;
  try {
    const linhas = await buscarTudo<{ codigo_sap: string; posicao: string }>((de, ate) =>
      (supabase!.from as any)('alm_posicao_material_atual')
        .select('codigo_sap, posicao')
        .order('codigo_sap')
        .order('posicao')
        .range(de, ate));
    for (const row of linhas) {
      const lista = mapa.get(row.codigo_sap);
      if (!lista) mapa.set(row.codigo_sap, [row.posicao]);
      else if (!lista.includes(row.posicao)) lista.push(row.posicao);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  } catch (err) {
    console.warn('[almoxCatalogoApi] Falha ao carregar as posições de estoque guardadas:', err);
  }
  return mapa;
}

/**
 * Filtra e agrupa os itens da ZL0024 (`sap_zl0024_stk`), mantendo apenas:
 * 1. Itens com saldo positivo (> 0)
 * 2. Itens consumíveis (Nível 1 = 'CONSUMÍVEL' na taxonomia do grupo de mercadorias)
 * 3. Exclusão rigorosa de itens de projeto (prefixo 100000...)
 */
export function filtrarEAgruparZl0024Consumiveis(
  estoque: EstoqueItem[],
  gruposMercadoria: CadastroGrupoMercadoria[],
  itensCatalogo: CatalogoItem[],
  apenasConsumiveis = true,
  mapaEpis: Map<string, EpiFotoInfo> = new Map()
): ItemConsumivelZl0024[] {
  // Mapa de taxonomia de grupos de mercadoria (código -> CadastroGrupoMercadoria)
  const mapaGrupos = new Map<string, CadastroGrupoMercadoria>();
  for (const grp of gruposMercadoria) {
    if (grp.codigo) {
      mapaGrupos.set(grp.codigo.trim().toUpperCase(), grp);
    }
  }

  // Mapa de itens já cadastrados no catálogo
  const mapaCatalogo = new Map<string, CatalogoItem>();
  for (const cat of itensCatalogo) {
    if (cat.codigo_sap) {
      mapaCatalogo.set(cat.codigo_sap.trim(), cat);
    }
  }

  // Agrupamento por código SAP do material
  const mapaMateriais = new Map<string, ItemConsumivelZl0024>();

  for (const row of estoque) {
    const material = String(row.material || '').trim();
    const quantidade = Number(row.quantidade) || 0;

    // 1. Deve ter saldo na ZL0024
    if (quantidade <= 0) continue;

    // 2. Não pode ser item de projeto (código 100000...)
    if (isProjetoItem(material)) continue;

    const grpCodigo = String(row.grp_mercad || '').trim().toUpperCase();
    const infoGrupo = mapaGrupos.get(grpCodigo);

    const nivel1 = (infoGrupo?.classificacao_nivel1 || '').trim().toUpperCase();
    const nivel2 = (infoGrupo?.classificacao_nivel2 || '').trim();

    // 3. Filtro de consumíveis
    if (apenasConsumiveis) {
      const ehConsumivel =
        nivel1 === 'CONSUMÍVEL' ||
        nivel1 === 'CONSUMIVEL' ||
        // Contingência para grupos conhecidos de consumíveis caso a tabela esteja incompleta
        grpCodigo.startsWith('B') ||
        grpCodigo.startsWith('M04') ||
        grpCodigo.startsWith('M11') ||
        grpCodigo.startsWith('M14') ||
        row.tipo_material === 'HIBE' ||
        row.tipo_material === 'ROH';

      if (!ehConsumivel) continue;
    }

    const deposito = String(row.deposito || '').trim();
    if (ehDepositoExcluidoSaldo(deposito)) continue;

    const itemExistente = mapaMateriais.get(material);

    if (itemExistente) {
      itemExistente.saldo_total = arredondarSaldo(itemExistente.saldo_total + quantidade);
      if (deposito && !itemExistente.depositos.includes(deposito)) {
        itemExistente.depositos.push(deposito);
      }
      if (!itemExistente.texto_tecnico && row.texto_pedido_compra) {
        itemExistente.texto_tecnico = row.texto_pedido_compra.trim();
      }
    } else {
      const cat = mapaCatalogo.get(material) || null;
      const epi = mapaEpis.get(material) || null;
      const temFotoCat = Boolean(cat?.imagem_path);
      const temFotoEpi = !temFotoCat && Boolean(epi?.imagem_path);

      mapaMateriais.set(material, {
        codigo_sap: material,
        descricao: String(row.txt_breve_material || cat?.descricao || epi?.descricao || '').trim(),
        texto_tecnico: String(row.texto_pedido_compra || cat?.texto_tecnico || (epi?.ca ? `CA: ${epi.ca}` : '')).trim(),
        grp_mercad: grpCodigo || cat?.grp_mercad || (epi ? 'M11' : ''),
        grupo_mercadorias: String(row.grupo_mercadorias || infoGrupo?.denominacao || cat?.grupo_mercadorias || (epi ? 'EPI E UNIFORMES' : '')).trim(),
        classificacao_nivel1: infoGrupo?.classificacao_nivel1 || cat?.classificacao_nivel1 || (nivel1 ? 'CONSUMÍVEL' : 'CONSUMÍVEL'),
        classificacao_nivel2: nivel2 || cat?.classificacao_nivel2 || (epi ? 'EPI - Segurança' : ''),
        saldo_total: arredondarSaldo(quantidade),
        umb: String(row.umb || cat?.umb || 'UN').trim(),
        depositos: deposito ? [deposito] : [],
        item_catalogo: cat,
        tem_foto: temFotoCat || temFotoEpi,
        url_foto: cat?.url_imagem || epi?.url_imagem || null,
        origem_foto: temFotoCat ? 'catalogo' : (temFotoEpi ? 'book_epi' : undefined),
        ca_epi: epi?.ca,
      });
    }
  }

  // Também inclui itens que já foram cadastrados no catálogo alm_catalogo_itens
  // mesmo que não possuam saldo momentâneo na ZL0024, mantendo o histórico de fotos
  for (const cat of itensCatalogo) {
    if (!cat.codigo_sap) continue;
    const mat = cat.codigo_sap.trim();
    if (!mapaMateriais.has(mat)) {
      const epi = mapaEpis.get(mat) || null;
      const temFotoCat = Boolean(cat.imagem_path);
      const temFotoEpi = !temFotoCat && Boolean(epi?.imagem_path);

      mapaMateriais.set(mat, {
        codigo_sap: mat,
        descricao: cat.descricao || epi?.descricao || mat,
        texto_tecnico: cat.texto_tecnico || (epi?.ca ? `CA: ${epi.ca}` : ''),
        grp_mercad: cat.grp_mercad || (epi ? 'M11' : ''),
        grupo_mercadorias: cat.grupo_mercadorias || (epi ? 'EPI E UNIFORMES' : ''),
        classificacao_nivel1: cat.classificacao_nivel1 || 'CONSUMÍVEL',
        classificacao_nivel2: cat.classificacao_nivel2 || (epi ? 'EPI - Segurança' : ''),
        saldo_total: cat.saldo_zl0024 || 0,
        umb: cat.umb || 'UN',
        depositos: [],
        item_catalogo: cat,
        tem_foto: temFotoCat || temFotoEpi,
        url_foto: cat.url_imagem || epi?.url_imagem || null,
        origem_foto: temFotoCat ? 'catalogo' : (temFotoEpi ? 'book_epi' : undefined),
        ca_epi: epi?.ca,
      });
    }
  }

  return Array.from(mapaMateriais.values()).sort((a, b) =>
    a.descricao.localeCompare(b.descricao, 'pt-BR')
  );
}

/**
 * Material que já teve saldo na ZL0024 (`alm_catalogo_material_visto`,
 * gravado por trigger a cada importação e nunca apagado). É o que mantém no
 * catálogo o item que zerou — em todos os aparelhos, não só onde foi visto.
 */
export interface MaterialVistoCatalogo {
  codigo_sap: string;
  descricao: string | null;
  texto_tecnico: string | null;
  grp_mercad: string | null;
  grupo_mercadorias: string | null;
  umb: string | null;
}

export async function carregarMateriaisVistos(): Promise<MaterialVistoCatalogo[]> {
  if (!supabase) return [];
  return buscarTudo<MaterialVistoCatalogo>((de, ate) =>
    (supabase!.from as any)('alm_catalogo_material_visto')
      .select('codigo_sap, descricao, texto_tecnico, grp_mercad, grupo_mercadorias, umb')
      .order('codigo_sap')
      .range(de, ate));
}

/**
 * Lista do Cadastro de Itens: tudo o que tem saldo agora (`atuais`, já com os
 * cadastrados à mão), mais o que já teve saldo e zerou (`vistos`), mais o que
 * este aparelho já mostrava (`anterior`) — item que apareceu uma vez não some.
 * O saldo dos que não estão em `atuais` é acertado depois, pela ZL0024.
 */
export function montarListaCatalogo(
  atuais: ItemConsumivelZl0024[],
  vistos: MaterialVistoCatalogo[],
  anterior: ItemConsumivelZl0024[],
  gruposMercadoria: CadastroGrupoMercadoria[],
): ItemConsumivelZl0024[] {
  const mapaGrupos = new Map<string, CadastroGrupoMercadoria>();
  for (const grp of gruposMercadoria) {
    if (grp.codigo) mapaGrupos.set(grp.codigo.trim().toUpperCase(), grp);
  }
  const lista = [...atuais];
  const presentes = new Set(lista.map(it => it.codigo_sap));

  for (const v of vistos) {
    const codigo = String(v.codigo_sap || '').trim();
    if (!codigo || presentes.has(codigo) || isProjetoItem(codigo)) continue;
    const grpCodigo = String(v.grp_mercad || '').trim().toUpperCase();
    const infoGrupo = mapaGrupos.get(grpCodigo);
    lista.push({
      codigo_sap: codigo,
      descricao: String(v.descricao || '').trim(),
      texto_tecnico: String(v.texto_tecnico || '').trim(),
      grp_mercad: grpCodigo,
      grupo_mercadorias: String(v.grupo_mercadorias || infoGrupo?.denominacao || '').trim(),
      classificacao_nivel1: infoGrupo?.classificacao_nivel1 || 'CONSUMÍVEL',
      classificacao_nivel2: (infoGrupo?.classificacao_nivel2 || '').trim(),
      saldo_total: 0,
      umb: String(v.umb || 'UN').trim(),
      depositos: [],
      item_catalogo: null,
      tem_foto: false,
      url_foto: null,
    });
    presentes.add(codigo);
  }

  for (const it of anterior) {
    if (!it.codigo_sap || presentes.has(it.codigo_sap) || isProjetoItem(it.codigo_sap)) continue;
    lista.push({ ...it, saldo_total: 0, depositos: [] });
    presentes.add(it.codigo_sap);
  }
  return lista;
}

/**
 * Busca materiais para cadastrar/adicionar ao catálogo por Código SAP, Descrição ou Texto Técnico.
 * Vascula todo o acervo SAP (com ou sem saldo), catálogo existente e fotos do Book de EPIs.
 */
export function buscarMateriaisParaAdicao(
  termo: string,
  estoque: EstoqueItem[],
  gruposMercadoria: CadastroGrupoMercadoria[],
  itensCatalogo: CatalogoItem[],
  limite = 25,
  mapaEpis: Map<string, EpiFotoInfo> = new Map()
): MaterialCandidatoCatalogo[] {
  const termoLimpo = String(termo || '').trim().toLowerCase();
  if (!termoLimpo) return [];

  const mapaGrupos = new Map<string, CadastroGrupoMercadoria>();
  for (const grp of gruposMercadoria) {
    if (grp.codigo) {
      mapaGrupos.set(grp.codigo.trim().toUpperCase(), grp);
    }
  }

  const mapaCatalogo = new Map<string, CatalogoItem>();
  for (const cat of itensCatalogo) {
    if (cat.codigo_sap) {
      mapaCatalogo.set(cat.codigo_sap.trim(), cat);
    }
  }

  const mapaCandidatos = new Map<string, MaterialCandidatoCatalogo>();

  for (const row of estoque) {
    const mat = String(row.material || '').trim();
    if (!mat || isProjetoItem(mat)) continue;

    const desc = String(row.txt_breve_material || '').trim();
    const textoTecnico = String(row.texto_pedido_compra || '').trim();
    const grpCodigo = String(row.grp_mercad || '').trim().toUpperCase();

    const matLower = mat.toLowerCase();
    const descLower = desc.toLowerCase();
    const tecLower = textoTecnico.toLowerCase();

    const bateu =
      matLower.includes(termoLimpo) ||
      descLower.includes(termoLimpo) ||
      tecLower.includes(termoLimpo);

    if (!bateu) continue;

    const infoGrupo = mapaGrupos.get(grpCodigo);
    const cat = mapaCatalogo.get(mat);
    const epi = mapaEpis.get(mat);
    const temFotoCat = Boolean(cat?.imagem_path);
    const temFotoEpi = !temFotoCat && Boolean(epi?.imagem_path);
    const dep = String(row.deposito || '').trim();
    const depExcluido = ehDepositoExcluidoSaldo(dep);
    const qtd = depExcluido ? 0 : Math.max(0, Number(row.quantidade) || 0);

    const existente = mapaCandidatos.get(mat);
    if (existente) {
      if (!depExcluido) {
        existente.saldo_total = arredondarSaldo(existente.saldo_total + qtd);
        if (dep && !existente.depositos.includes(dep)) {
          existente.depositos.push(dep);
        }
      }
      if (!existente.texto_tecnico && textoTecnico) {
        existente.texto_tecnico = textoTecnico;
      }
    } else {
      mapaCandidatos.set(mat, {
        codigo_sap: mat,
        descricao: desc || cat?.descricao || epi?.descricao || mat,
        texto_tecnico: textoTecnico || cat?.texto_tecnico || (epi?.ca ? `CA: ${epi.ca}` : ''),
        grp_mercad: grpCodigo || cat?.grp_mercad || (epi ? 'M11' : ''),
        grupo_mercadorias: String(row.grupo_mercadorias || infoGrupo?.denominacao || cat?.grupo_mercadorias || (epi ? 'EPI E UNIFORMES' : '')).trim(),
        classificacao_nivel1: infoGrupo?.classificacao_nivel1 || cat?.classificacao_nivel1 || 'CONSUMÍVEL',
        classificacao_nivel2: infoGrupo?.classificacao_nivel2 || cat?.classificacao_nivel2 || (epi ? 'EPI - Segurança' : ''),
        umb: String(row.umb || cat?.umb || 'UN').trim(),
        saldo_total: arredondarSaldo(qtd),
        depositos: dep && !depExcluido ? [dep] : [],
        ja_no_catalogo: Boolean(cat),
        tem_foto: temFotoCat || temFotoEpi,
        url_foto: cat?.url_imagem || epi?.url_imagem || null,
        origem_foto: temFotoCat ? 'catalogo' : (temFotoEpi ? 'book_epi' : undefined),
        ca_epi: epi?.ca,
      });
    }
  }

  // Verifica também se o termo bate com itens já cadastrados no catálogo que possam não estar no estoque
  for (const cat of itensCatalogo) {
    if (!cat.codigo_sap) continue;
    const mat = cat.codigo_sap.trim();
    if (mapaCandidatos.has(mat)) continue;

    const desc = String(cat.descricao || '').trim();
    const tec = String(cat.texto_tecnico || '').trim();

    if (
      mat.toLowerCase().includes(termoLimpo) ||
      desc.toLowerCase().includes(termoLimpo) ||
      tec.toLowerCase().includes(termoLimpo)
    ) {
      const epi = mapaEpis.get(mat);
      const temFotoCat = Boolean(cat.imagem_path);
      const temFotoEpi = !temFotoCat && Boolean(epi?.imagem_path);

      mapaCandidatos.set(mat, {
        codigo_sap: mat,
        descricao: desc || epi?.descricao || mat,
        texto_tecnico: tec || (epi?.ca ? `CA: ${epi.ca}` : ''),
        grp_mercad: cat.grp_mercad || (epi ? 'M11' : ''),
        grupo_mercadorias: cat.grupo_mercadorias || (epi ? 'EPI E UNIFORMES' : ''),
        classificacao_nivel1: cat.classificacao_nivel1 || 'CONSUMÍVEL',
        classificacao_nivel2: cat.classificacao_nivel2 || (epi ? 'EPI - Segurança' : ''),
        umb: cat.umb || 'UN',
        saldo_total: cat.saldo_zl0024 || 0,
        depositos: [],
        ja_no_catalogo: true,
        tem_foto: temFotoCat || temFotoEpi,
        url_foto: cat.url_imagem || epi?.url_imagem || null,
        origem_foto: temFotoCat ? 'catalogo' : (temFotoEpi ? 'book_epi' : undefined),
        ca_epi: epi?.ca,
      });
    }
  }

  // Ordena os resultados com base em relevância
  const lista = Array.from(mapaCandidatos.values());
  lista.sort((a, b) => {
    const aMat = a.codigo_sap.toLowerCase();
    const bMat = b.codigo_sap.toLowerCase();
    const aDesc = a.descricao.toLowerCase();
    const bDesc = b.descricao.toLowerCase();

    // 1. Código exato
    if (aMat === termoLimpo && bMat !== termoLimpo) return -1;
    if (bMat === termoLimpo && aMat !== termoLimpo) return 1;

    // 2. Código começa com o termo
    if (aMat.startsWith(termoLimpo) && !bMat.startsWith(termoLimpo)) return -1;
    if (bMat.startsWith(termoLimpo) && !aMat.startsWith(termoLimpo)) return 1;

    // 3. Descrição começa com o termo
    if (aDesc.startsWith(termoLimpo) && !bDesc.startsWith(termoLimpo)) return -1;
    if (bDesc.startsWith(termoLimpo) && !aDesc.startsWith(termoLimpo)) return 1;

    // 4. Ordem alfabética
    return a.descricao.localeCompare(b.descricao, 'pt-BR');
  });

  return lista.slice(0, limite);
}

/**
 * Pesquisa no catálogo SAP online (RPC `buscar_materiais` sobre 172k itens + base local do almoxarifado).
 * Permite buscar por código SAP ou por descrição, retornando todos os dados cadastrais (descrição,
 * texto técnico, unidade de medida, grupo, saldos, etc.) prontos para vincular a foto.
 */
export async function pesquisarCatalogoSapOnline(
  termo: string,
  dadosCompletos?: DadosCatalogoCompleto | null,
  limite = 30
): Promise<MaterialCandidatoCatalogo[]> {
  const termoLimpo = String(termo || '').trim();
  if (!termoLimpo) return [];

  // 1. Busca inicial imediata na base local (estoque ZL0024 + itens já cadastrados + Book EPIs)
  const mapaCandidatos = new Map<string, MaterialCandidatoCatalogo>();
  if (dadosCompletos) {
    const locais = buscarMateriaisParaAdicao(
      termoLimpo,
      dadosCompletos.estoqueCompleto,
      dadosCompletos.grupos,
      dadosCompletos.itensCatalogo,
      limite,
      dadosCompletos.mapaEpis
    );
    for (const c of locais) {
      mapaCandidatos.set(c.codigo_sap, c);
    }
  }

  // 2. Consulta no catálogo mestre SAP (172k itens via buscarMateriais)
  try {
    const norm = normalizarTermo(termoLimpo);
    if (norm.tipo !== 'curto') {
      const resultadosSap = await buscarMateriais(termoLimpo, {
        limite,
        incluirTecnico: true,
      });

      const mapaGrupos = new Map<string, CadastroGrupoMercadoria>();
      if (dadosCompletos?.grupos) {
        for (const g of dadosCompletos.grupos) {
          if (g.codigo) mapaGrupos.set(g.codigo.trim().toUpperCase(), g);
        }
      }

      for (const r of resultadosSap) {
        const mat = String(r.materialCode || '').trim();
        if (!mat || isProjetoItem(mat) || ehCodigoSapInativo(mat)) continue;

        const existente = mapaCandidatos.get(mat);
        if (existente) {
          // Complementa informações técnicas faltantes
          if (!existente.texto_tecnico && r.technicalText) {
            existente.texto_tecnico = r.technicalText.trim();
          }
          if (r.qtdEstoque && existente.saldo_total === 0) {
            existente.saldo_total = arredondarSaldo(r.qtdEstoque);
          }
          if (r.depositos && existente.depositos.length === 0) {
            existente.depositos = r.depositos.filter(d => !ehDepositoExcluidoSaldo(d));
          }
        } else {
          const cat = dadosCompletos?.itensCatalogo.find(c => c.codigo_sap === mat);
          const epi = dadosCompletos?.mapaEpis.get(mat);
          const calcEstoque = dadosCompletos?.estoqueCompleto
            ? calcularSaldoMaterialEstoque(dadosCompletos.estoqueCompleto, mat)
            : { saldo: 0, depositos: [] };
          const rowEstoque = dadosCompletos?.estoqueCompleto.find(e => String(e.material || '').trim() === mat);
          const grpCodigo = String(rowEstoque?.grp_mercad || cat?.grp_mercad || (epi ? 'M11' : '')).trim().toUpperCase();
          const infoGrupo = mapaGrupos.get(grpCodigo);

          mapaCandidatos.set(mat, {
            codigo_sap: mat,
            descricao: r.description || cat?.descricao || epi?.descricao || mat,
            texto_tecnico: r.technicalText || cat?.texto_tecnico || (epi?.ca ? `CA: ${epi.ca}` : ''),
            grp_mercad: grpCodigo || (epi ? 'M11' : ''),
            grupo_mercadorias: String(rowEstoque?.grupo_mercadorias || infoGrupo?.denominacao || cat?.grupo_mercadorias || (epi ? 'EPI E UNIFORMES' : '')).trim(),
            classificacao_nivel1: infoGrupo?.classificacao_nivel1 || cat?.classificacao_nivel1 || 'CONSUMÍVEL',
            classificacao_nivel2: infoGrupo?.classificacao_nivel2 || cat?.classificacao_nivel2 || (epi ? 'EPI - Segurança' : ''),
            umb: String(r.unit || rowEstoque?.umb || cat?.umb || 'UN').trim(),
            saldo_total: r.qtdEstoque != null ? arredondarSaldo(r.qtdEstoque) : calcEstoque.saldo,
            depositos: r.depositos ? r.depositos.filter(d => !ehDepositoExcluidoSaldo(d)) : calcEstoque.depositos,
            ja_no_catalogo: Boolean(cat),
            tem_foto: Boolean(cat?.imagem_path || epi?.imagem_path),
            url_foto: cat?.url_imagem || epi?.url_imagem || null,
            origem_foto: cat?.imagem_path ? 'catalogo' : (epi?.imagem_path ? 'book_epi' : undefined),
            ca_epi: epi?.ca,
          });
        }
      }

      // Se a RPC não encontrou nada e o termo tem pelo menos 3 caracteres, tenta consulta direta em materials
      if (resultadosSap.length === 0 && termoLimpo.length >= 3 && supabase) {
        const { data: matsFallback } = await supabase
          .from('materials')
          .select('material_code, description, technical_text, unit, grupo_mercadoria_desc')
          .or(`material_code.ilike.%${termoLimpo}%,description.ilike.%${termoLimpo}%`)
          .limit(limite);

        if (matsFallback) {
          for (const m of matsFallback) {
            const mat = String(m.material_code || '').trim();
            if (!mat || isProjetoItem(mat) || ehCodigoSapInativo(mat) || mapaCandidatos.has(mat)) continue;

            const cat = dadosCompletos?.itensCatalogo.find(c => c.codigo_sap === mat);
            const epi = dadosCompletos?.mapaEpis.get(mat);
            const calcEstoque = dadosCompletos?.estoqueCompleto
              ? calcularSaldoMaterialEstoque(dadosCompletos.estoqueCompleto, mat)
              : { saldo: 0, depositos: [] };
            const rowEstoque = dadosCompletos?.estoqueCompleto.find(e => String(e.material || '').trim() === mat);
            const grpCodigo = String(rowEstoque?.grp_mercad || cat?.grp_mercad || (epi ? 'M11' : '')).trim().toUpperCase();
            const infoGrupo = mapaGrupos.get(grpCodigo);

            mapaCandidatos.set(mat, {
              codigo_sap: mat,
              descricao: m.description || mat,
              texto_tecnico: m.technical_text || cat?.texto_tecnico || (epi?.ca ? `CA: ${epi.ca}` : ''),
              grp_mercad: grpCodigo || (epi ? 'M11' : ''),
              grupo_mercadorias: String(rowEstoque?.grupo_mercadorias || m.grupo_mercadoria_desc || infoGrupo?.denominacao || cat?.grupo_mercadorias || (epi ? 'EPI E UNIFORMES' : '')).trim(),
              classificacao_nivel1: infoGrupo?.classificacao_nivel1 || cat?.classificacao_nivel1 || 'CONSUMÍVEL',
              classificacao_nivel2: infoGrupo?.classificacao_nivel2 || cat?.classificacao_nivel2 || (epi ? 'EPI - Segurança' : ''),
              umb: String(m.unit || rowEstoque?.umb || cat?.umb || 'UN').trim(),
              saldo_total: calcEstoque.saldo,
              depositos: calcEstoque.depositos,
              ja_no_catalogo: Boolean(cat),
              tem_foto: Boolean(cat?.imagem_path || epi?.imagem_path),
              url_foto: cat?.url_imagem || epi?.url_imagem || null,
              origem_foto: cat?.imagem_path ? 'catalogo' : (epi?.imagem_path ? 'book_epi' : undefined),
              ca_epi: epi?.ca,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[almoxCatalogoApi] Falha na busca remota do catálogo SAP via RPC:', err);
    if (termoLimpo.length >= 3 && supabase) {
      try {
        const { data: matsFallback } = await supabase
          .from('materials')
          .select('material_code, description, technical_text, unit, grupo_mercadoria_desc')
          .or(`material_code.ilike.%${termoLimpo}%,description.ilike.%${termoLimpo}%`)
          .limit(limite);

        if (matsFallback) {
          for (const m of matsFallback) {
            const mat = String(m.material_code || '').trim();
            if (!mat || isProjetoItem(mat) || ehCodigoSapInativo(mat) || mapaCandidatos.has(mat)) continue;

            const cat = dadosCompletos?.itensCatalogo.find(c => c.codigo_sap === mat);
            const epi = dadosCompletos?.mapaEpis.get(mat);

            mapaCandidatos.set(mat, {
              codigo_sap: mat,
              descricao: m.description || mat,
              texto_tecnico: m.technical_text || (epi?.ca ? `CA: ${epi.ca}` : ''),
              grp_mercad: epi ? 'M11' : '',
              grupo_mercadorias: m.grupo_mercadoria_desc || (epi ? 'EPI E UNIFORMES' : ''),
              classificacao_nivel1: 'CONSUMÍVEL',
              classificacao_nivel2: epi ? 'EPI - Segurança' : '',
              umb: m.unit || 'UN',
              saldo_total: 0,
              depositos: [],
              ja_no_catalogo: Boolean(cat),
              tem_foto: Boolean(cat?.imagem_path || epi?.imagem_path),
              url_foto: cat?.url_imagem || epi?.url_imagem || null,
              origem_foto: cat?.imagem_path ? 'catalogo' : (epi?.imagem_path ? 'book_epi' : undefined),
              ca_epi: epi?.ca,
            });
          }
        }
      } catch {
        // Fallback silencioso
      }
    }
  }

  // 3. Fallback pontual caso o termo seja um código numérico exato
  if (/^\d{5,10}$/.test(termoLimpo) && !mapaCandidatos.has(termoLimpo) && supabase) {
    try {
      const { data: matDireto } = await supabase
        .from('materials')
        .select('material_code, description, technical_text, unit, grupo_mercadoria_desc')
        .eq('material_code', termoLimpo)
        .maybeSingle();

      if (matDireto && !isProjetoItem(matDireto.material_code) && !ehCodigoSapInativo(matDireto.material_code)) {
        const mat = String(matDireto.material_code).trim();
        const cat = dadosCompletos?.itensCatalogo.find(c => c.codigo_sap === mat);
        const epi = dadosCompletos?.mapaEpis.get(mat);

        mapaCandidatos.set(mat, {
          codigo_sap: mat,
          descricao: matDireto.description || mat,
          texto_tecnico: matDireto.technical_text || (epi?.ca ? `CA: ${epi.ca}` : ''),
          grp_mercad: epi ? 'M11' : '',
          grupo_mercadorias: matDireto.grupo_mercadoria_desc || (epi ? 'EPI E UNIFORMES' : ''),
          classificacao_nivel1: 'CONSUMÍVEL',
          classificacao_nivel2: epi ? 'EPI - Segurança' : '',
          umb: matDireto.unit || 'UN',
          saldo_total: 0,
          depositos: [],
          ja_no_catalogo: Boolean(cat),
          tem_foto: Boolean(cat?.imagem_path || epi?.imagem_path),
          url_foto: cat?.url_imagem || epi?.url_imagem || null,
          origem_foto: cat?.imagem_path ? 'catalogo' : (epi?.imagem_path ? 'book_epi' : undefined),
          ca_epi: epi?.ca,
        });
      }
    } catch (err) {
      console.warn('[almoxCatalogoApi] Falha no fallback pontual de código SAP:', err);
    }
  }

  // Ordenação por relevância
  const lista = Array.from(mapaCandidatos.values());
  const buscaLower = termoLimpo.toLowerCase();
  lista.sort((a, b) => {
    const aMat = a.codigo_sap.toLowerCase();
    const bMat = b.codigo_sap.toLowerCase();
    const aDesc = a.descricao.toLowerCase();
    const bDesc = b.descricao.toLowerCase();

    // 1. Código exato
    if (aMat === buscaLower && bMat !== buscaLower) return -1;
    if (bMat === buscaLower && aMat !== buscaLower) return 1;

    // 2. Código inicia com o termo
    if (aMat.startsWith(buscaLower) && !bMat.startsWith(buscaLower)) return -1;
    if (bMat.startsWith(buscaLower) && !aMat.startsWith(buscaLower)) return 1;

    // 3. Descrição inicia com o termo
    if (aDesc.startsWith(buscaLower) && !bDesc.startsWith(buscaLower)) return -1;
    if (bDesc.startsWith(buscaLower) && !aDesc.startsWith(buscaLower)) return 1;

    // 4. Se um tem foto e outro não, prioriza itens com foto
    if (a.tem_foto && !b.tem_foto) return -1;
    if (b.tem_foto && !a.tem_foto) return 1;

    return a.descricao.localeCompare(b.descricao, 'pt-BR');
  });

  return lista.slice(0, limite);
}

/**
 * Carrega a estrutura de dados completa do catálogo do almoxarifado.
 * Não realiza recarregamentos de rede da ZL0024:
 * Mantém uma lista fixa persistida (inicializada a partir do estoque em cache local no primeiro uso)
 * e atualiza com fotos do catálogo e do Book de EPIs. Novos itens podem ser adicionados livremente.
 */
export async function carregarDadosCatalogoCompleto(_forcar = false): Promise<DadosCatalogoCompleto> {
  await migrarCatalogoLocalLegado().catch(err => console.warn('[almoxCatalogoApi] Migração do catálogo local falhou:', err));

  const [grupos, itensCatalogo, mapaEpis, vistos] = await Promise.all([
    carregarGruposMercadoria(),
    listarItensCatalogo(),
    listarEpisComFoto(),
    carregarMateriaisVistos().catch((err) => {
      console.warn('[almoxCatalogoApi] Materiais já vistos indisponíveis; fica a lista do aparelho:', err);
      return [] as MaterialVistoCatalogo[];
    }),
  ]);

  // ZL0024 conferida pela versão da importação (fetchEstoque só rebaixa se mudou).
  let estoqueLocal: EstoqueItem[];
  try {
    estoqueLocal = ((await localDb.fetchEstoque(false)) || []) as EstoqueItem[];
  } catch {
    estoqueLocal = (localDb.getEstoque() || []) as EstoqueItem[];
  }

  // A lista era montada uma vez por aparelho e só crescia por cadastro manual:
  // material novo na ZL0024 nunca entrava. Agora é refeita a cada abertura —
  // tudo com saldo (não só consumível) + o que já teve saldo e zerou + o que o
  // aparelho já mostrava.
  let listaFixa = obterListaFixaCatalogoLocal();
  if (estoqueLocal.length > 0 || vistos.length > 0) {
    const atuais = filtrarEAgruparZl0024Consumiveis(estoqueLocal, grupos, itensCatalogo, false, mapaEpis);
    listaFixa = montarListaCatalogo(atuais, vistos, listaFixa, grupos);
  }

  // Mapa de saldos atuais da ZL0024 excluindo depósitos fora do almoxarifado (ex: 0105 - Transferência Produção)
  const mapaSaldos = new Map<string, { saldo: number; depositos: string[] }>();
  if (estoqueLocal && estoqueLocal.length > 0) {
    for (const row of estoqueLocal) {
      const mat = String(row.material || '').trim();
      const dep = String(row.deposito || '').trim();
      if (!mat || ehDepositoExcluidoSaldo(dep)) continue;
      const q = Math.max(0, Number(row.quantidade) || 0);
      const atual = mapaSaldos.get(mat) || { saldo: 0, depositos: [] };
      atual.saldo = arredondarSaldo(atual.saldo + q);
      if (dep && !atual.depositos.includes(dep)) atual.depositos.push(dep);
      mapaSaldos.set(mat, atual);
    }
  }

  // Mapa de itens do catálogo persistidos
  const mapaCatalogo = new Map<string, CatalogoItem>();
  for (const c of itensCatalogo) {
    if (c.codigo_sap) mapaCatalogo.set(c.codigo_sap, c);
  }

  const itensAtualizados: ItemConsumivelZl0024[] = listaFixa.map(it => {
    const cat = mapaCatalogo.get(it.codigo_sap);
    const epi = mapaEpis.get(it.codigo_sap);
    const temFotoCat = Boolean(cat?.imagem_path);
    const temFotoEpi = !temFotoCat && Boolean(epi?.imagem_path);

    // Sincroniza saldo e depósitos com o estoque ZL0024 atual, garantindo que 0105 seja removido
    // e corrigindo eventuais imprecisões de ponto flutuante herdadas do armazenamento local.
    const infoEstoque = mapaSaldos.get(it.codigo_sap);
    const saldoAtualizado = estoqueLocal && estoqueLocal.length > 0
      ? (infoEstoque ? infoEstoque.saldo : 0)
      : arredondarSaldo(it.saldo_total);
    const depositosAtualizados = estoqueLocal && estoqueLocal.length > 0
      ? (infoEstoque ? infoEstoque.depositos : [])
      : (it.depositos || []).filter(d => !ehDepositoExcluidoSaldo(d));

    it.saldo_total = saldoAtualizado;
    it.depositos = depositosAtualizados;

    // O registro e a URL vêm sempre da tabela/Book de EPIs: o que a lista
    // fixa guardou pode ter sido trocado por outro usuário, e a URL assinada
    // guardada expira em 24 h.
    return {
      ...it,
      saldo_total: saldoAtualizado,
      depositos: depositosAtualizados,
      item_catalogo: cat ?? null,
      tem_foto: temFotoCat || temFotoEpi,
      url_foto: cat?.url_imagem || epi?.url_imagem || null,
      origem_foto: temFotoCat ? 'catalogo' : (temFotoEpi ? 'book_epi' : it.origem_foto),
      ca_epi: epi?.ca || it.ca_epi,
    };
  });

  // Também garante que qualquer item que foi cadastrado no catálogo mas ainda não constava na lista fixa seja integrado
  for (const cat of itensCatalogo) {
    if (!cat.codigo_sap) continue;
    const jaExiste = itensAtualizados.some(i => i.codigo_sap === cat.codigo_sap);
    if (!jaExiste) {
      const epi = mapaEpis.get(cat.codigo_sap);
      const infoEstoque = mapaSaldos.get(cat.codigo_sap);
      const novoItem: ItemConsumivelZl0024 = {
        codigo_sap: cat.codigo_sap,
        descricao: cat.descricao,
        texto_tecnico: cat.texto_tecnico || (epi?.ca ? `CA: ${epi.ca}` : ''),
        grp_mercad: cat.grp_mercad || (epi ? 'M11' : ''),
        grupo_mercadorias: cat.grupo_mercadorias || (epi ? 'EPI E UNIFORMES' : ''),
        classificacao_nivel1: cat.classificacao_nivel1 || 'CONSUMÍVEL',
        classificacao_nivel2: cat.classificacao_nivel2 || (epi ? 'EPI - Segurança' : ''),
        saldo_total: infoEstoque ? infoEstoque.saldo : arredondarSaldo(cat.saldo_zl0024 || 0),
        umb: cat.umb || 'UN',
        depositos: infoEstoque ? infoEstoque.depositos : [],
        item_catalogo: cat,
        tem_foto: Boolean(cat.imagem_path),
        url_foto: cat.url_imagem || null,
        origem_foto: 'catalogo',
        ca_epi: epi?.ca,
      };
      itensAtualizados.unshift(novoItem);
      listaFixa.unshift(novoItem);
    }
  }

  // Mantém a lista fixa sincronizada
  salvarListaFixaCatalogoLocal(listaFixa);

  // Coleta caminhos de fotos APENAS dos itens que efetivamente estão na lista e têm foto pendente de URL
  const caminhosParaAssinar: Array<{ path: string; bucket?: string }> = [];
  for (const it of itensAtualizados) {
    if (it.tem_foto && !it.url_foto) {
      if (it.origem_foto === 'book_epi') {
        const epi = mapaEpis.get(it.codigo_sap);
        if (epi?.imagem_path) {
          caminhosParaAssinar.push({ path: epi.imagem_path, bucket: SSMA_BOOK_EPIS_BUCKET });
        }
      } else if (it.item_catalogo?.imagem_path) {
        caminhosParaAssinar.push({ path: it.item_catalogo.imagem_path, bucket: BUCKET_CATALOGO });
      }
    }
  }

  // Resolve URLs assinadas em lote (1 única requisição batch de alta performance)
  if (caminhosParaAssinar.length > 0) {
    const urlsResolvidas = await obterUrlsFotosCatalogoLote(caminhosParaAssinar);
    for (const it of itensAtualizados) {
      if (it.tem_foto && !it.url_foto) {
        const path = it.origem_foto === 'book_epi'
          ? mapaEpis.get(it.codigo_sap)?.imagem_path
          : it.item_catalogo?.imagem_path;
        if (path) {
          const clean = path.startsWith('/') ? path.slice(1) : path;
          const url = urlsResolvidas.get(clean) || urlsResolvidas.get(path);
          if (url) {
            it.url_foto = url;
            if (it.item_catalogo) it.item_catalogo.url_imagem = url;
          }
        }
      }
    }
  }

  const estoqueCompleto = estoqueLocal;

  // Posição guardada no banco; o estoque local só completa o que o banco ainda não tem.
  const posicoes = await carregarPosicoesMaterial();
  for (const [material, lista] of mapaPosicoesEstoque(estoqueCompleto)) {
    if (!posicoes.has(material)) posicoes.set(material, lista);
  }

  return {
    itens: itensAtualizados,
    estoqueCompleto,
    posicoes,
    grupos,
    itensCatalogo,
    mapaEpis,
  };
}

/**
 * Carrega a lista consolidada e enriquecida de itens consumíveis da ZL0024 / Catálogo.
 */
export async function carregarItensConsumiveisZl0024(forcar = false): Promise<ItemConsumivelZl0024[]> {
  const dados = await carregarDadosCatalogoCompleto(forcar);
  return dados.itens;
}

/**
 * Consulta a lista de grupos de mercadoria com níveis 1 e 2.
 */
export async function carregarGruposMercadoria(): Promise<CadastroGrupoMercadoria[]> {
  if (supabase) {
    try {
      const data = await buscarTudo<CadastroGrupoMercadoria>((de, ate) =>
        (supabase!.from as any)('cadastro_grupo_mercadoria')
          .select('codigo, denominacao, denominacao2, classificacao_nivel1, classificacao_nivel2, codigo_pai')
          .order('codigo')
          .range(de, ate));
      if (data.length > 0) {
        return data;
      }
    } catch (err) {
      console.warn('[almoxCatalogoApi] Falha ao consultar cadastro_grupo_mercadoria:', err);
    }
  }
  return localDb.getGruposMercadoria() as CadastroGrupoMercadoria[];
}

const EXTENSAO_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/heic': 'heic', 'image/heif': 'heif',
};

/** Extensão do arquivo que vai ao Storage: pelo tipo do que será enviado, senão pelo nome do original. */
export function extensaoDaImagem(enviado: Blob, original: File): string {
  const porMime = EXTENSAO_POR_MIME[(enviado.type || '').toLowerCase()];
  if (porMime) return porMime;
  const porNome = (original.name ?? '').split('.').pop()?.toLowerCase();
  return porNome && porNome !== original.name?.toLowerCase() ? porNome : 'jpg';
}

/** Colunas que o cliente grava — id, código e datas são do banco. */
type LinhaCatalogo = Omit<CatalogoItem, 'id' | 'codigo_registro' | 'created_at' | 'updated_at' | 'url_imagem'>;

function linhaDoPayload(
  payload: SalvarItemCatalogoPayload,
  existente: CatalogoItem | null,
  imagem: Pick<CatalogoItem, 'imagem_path' | 'imagem_nome' | 'imagem_mime' | 'imagem_tamanho'>,
  user: Profile,
): LinhaCatalogo {
  // Campo que o payload não trouxe mantém o gravado — "remover foto" manda
  // só código e descrição, e não pode apagar texto técnico nem observação.
  const texto = (campo: keyof SalvarItemCatalogoPayload & keyof CatalogoItem): string | null => {
    const v = payload[campo];
    if (v === undefined) return (existente?.[campo] as string | null | undefined) ?? null;
    return typeof v === 'string' ? v.trim() || null : null;
  };
  const lotes = payload.lotes_validade !== undefined ? normalizarLotesCatalogo(payload.lotes_validade)
    : payload.lote !== undefined || payload.validade !== undefined
      ? normalizarLotesCatalogo([{ lote: texto('lote'), validade: texto('validade') }, ...lotesDoCatalogo(existente).slice(1)])
      : lotesDoCatalogo(existente);
  return {
    codigo_sap: payload.codigo_sap.trim(),
    descricao: payload.descricao.trim() || existente?.descricao || payload.codigo_sap.trim(),
    texto_tecnico: texto('texto_tecnico'),
    grp_mercad: texto('grp_mercad'),
    grupo_mercadorias: texto('grupo_mercadorias'),
    classificacao_nivel1: texto('classificacao_nivel1') || 'CONSUMÍVEL',
    classificacao_nivel2: texto('classificacao_nivel2'),
    umb: texto('umb') || 'UN',
    saldo_zl0024: payload.saldo_zl0024 !== undefined ? payload.saldo_zl0024 ?? 0 : existente?.saldo_zl0024 ?? 0,
    ...imagem,
    observacao: texto('observacao'),
    posicao_estoque: texto('posicao_estoque'),
    etiqueta_descricao: texto('etiqueta_descricao'),
    etiqueta_aplicacao: texto('etiqueta_aplicacao'),
    estoque_minimo: payload.estoque_minimo !== undefined ? payload.estoque_minimo : existente?.estoque_minimo ?? null,
    lotes_validade: lotes,
    // Compatibilidade com leitores antigos: o par único espelha a primeira linha.
    lote: lotes[0]?.lote ?? null,
    validade: lotes[0]?.validade ?? null,
    ativo: true,
    criado_por: existente?.criado_por || user.id,
    criado_por_nome: existente?.criado_por_nome || user.name,
    atualizado_por: user.id,
    atualizado_por_nome: user.name,
  };
}

/** Mantém a lista da tela (cache local derivado da ZL0024) em dia com o item salvo. */
function refletirNaListaFixa(itemSalvo: CatalogoItem): void {
  const listaFixa = obterListaFixaCatalogoLocal();
  const idxFixa = listaFixa.findIndex(i => i.codigo_sap === itemSalvo.codigo_sap);
  const itemConsumivel: ItemConsumivelZl0024 = {
    codigo_sap: itemSalvo.codigo_sap,
    descricao: itemSalvo.descricao,
    texto_tecnico: itemSalvo.texto_tecnico || '',
    grp_mercad: itemSalvo.grp_mercad || '',
    grupo_mercadorias: itemSalvo.grupo_mercadorias || '',
    classificacao_nivel1: itemSalvo.classificacao_nivel1 || 'CONSUMÍVEL',
    classificacao_nivel2: itemSalvo.classificacao_nivel2 || '',
    saldo_total: arredondarSaldo(itemSalvo.saldo_zl0024 || 0),
    umb: itemSalvo.umb || 'UN',
    depositos: idxFixa >= 0 ? listaFixa[idxFixa].depositos.filter(d => !ehDepositoExcluidoSaldo(d)) : [],
    item_catalogo: itemSalvo,
    tem_foto: Boolean(itemSalvo.imagem_path),
    url_foto: null,
    origem_foto: itemSalvo.imagem_path ? 'catalogo' : undefined,
    ca_epi: idxFixa >= 0 ? listaFixa[idxFixa].ca_epi : undefined,
  };

  if (idxFixa >= 0) {
    listaFixa[idxFixa] = {
      ...listaFixa[idxFixa],
      ...itemConsumivel,
      saldo_total: arredondarSaldo(listaFixa[idxFixa].saldo_total || itemConsumivel.saldo_total),
    };
  } else {
    listaFixa.unshift(itemConsumivel);
  }
  salvarListaFixaCatalogoLocal(listaFixa);
}

/**
 * Salva ou atualiza o item do catálogo (`alm_catalogo_itens`), comprimindo a
 * foto antes de subir ao Storage (regra 1 do CLAUDE.md). O código
 * `CAT-DDMMYY-NN` é gerado pelo banco na inclusão (regra 2).
 *
 * Ordem: sobe a foto nova, grava o registro e só então apaga a foto
 * anterior — se a gravação falhar, remove a foto recém-enviada e o registro
 * antigo continua apontando para uma imagem que existe.
 */
export async function salvarItemCatalogo(
  payload: SalvarItemCatalogoPayload,
  user: Profile
): Promise<CatalogoItem> {
  if (!payload.codigo_sap) {
    throw new Error('Código SAP é obrigatório para cadastrar no catálogo.');
  }
  if (!supabase) throw new Error('Sem conexão com o banco de dados.');

  const codigoSap = payload.codigo_sap.trim();
  const itemExistente = await buscarItemAtivoCatalogo(codigoSap);

  let imagem = {
    imagem_path: itemExistente?.imagem_path ?? null,
    imagem_nome: itemExistente?.imagem_nome ?? null,
    imagem_mime: itemExistente?.imagem_mime ?? null,
    imagem_tamanho: itemExistente?.imagem_tamanho ?? null,
  };
  if (payload.removerFoto) {
    imagem = { imagem_path: null, imagem_nome: null, imagem_mime: null, imagem_tamanho: null };
  }

  let pathEnviado: string | null = null;
  if (payload.fotoArquivo) {
    const arquivoComprimido = await comprimirImagemUpload(payload.fotoArquivo);
    // Comprimida, a foto volta como Blob JPEG (sem `name`); sem compressão
    // (HEIC fora do Safari, ou já pequena) volta o File original.
    const ext = extensaoDaImagem(arquivoComprimido, payload.fotoArquivo);
    const nomeLimpo = `material-${codigoSap}-${Date.now()}.${ext}`;
    const storagePath = `${PASTA_CATALOGO}/${nomeLimpo}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_CATALOGO)
      .upload(storagePath, arquivoComprimido, {
        contentType: arquivoComprimido.type || 'image/jpeg',
        // Caminho único (leva o timestamp): não há o que sobrescrever, e o
        // bucket não tem política de UPDATE — upsert seria barrado pelo RLS.
        upsert: false,
        cacheControl: CACHE_FOTO_CATALOGO,
      });
    if (uploadError) throw new Error(`Falha no upload da foto: ${uploadError.message}`);

    pathEnviado = storagePath;
    imagem = {
      imagem_path: storagePath,
      imagem_nome: payload.fotoArquivo.name || nomeLimpo,
      imagem_mime: arquivoComprimido.type || 'image/jpeg',
      imagem_tamanho: arquivoComprimido.size,
    };
  }

  const linha = linhaDoPayload(payload, itemExistente, imagem, user);
  const { data, error } = itemExistente
    ? await tabelaCatalogo().update(linha).eq('id', itemExistente.id).select('*').single()
    : await tabelaCatalogo().insert(linha).select('*').single();

  if (error || !data) {
    if (pathEnviado) await removerFotoDoStorage(pathEnviado);
    const duplicado = error?.code === '23505';
    throw new Error(duplicado
      ? 'Outro usuário acabou de cadastrar este material no catálogo. Recarregue a lista e tente de novo.'
      : `Falha ao salvar no catálogo: ${error?.message ?? 'resposta vazia'}`);
  }

  const itemSalvo = data as CatalogoItem;
  const pathAnterior = itemExistente?.imagem_path;
  if (pathAnterior && pathAnterior !== itemSalvo.imagem_path) {
    await removerFotoDoStorage(pathAnterior);
  }

  refletirNaListaFixa(itemSalvo);

  if (itemSalvo.imagem_path) {
    itemSalvo.url_imagem = await obterUrlFotoCatalogo(itemSalvo.imagem_path);
  }
  return itemSalvo;
}

/**
 * Carimba a data da última impressão da etiqueta nos itens que têm registro no
 * catálogo (item sem registro imprime com os dados do SAP e não guarda a data).
 * Falha aqui não desfaz o PDF já baixado — só não marca.
 */
export async function marcarEtiquetasImpressas(codigosSap: string[]): Promise<string | null> {
  const codigos = [...new Set(codigosSap.map(c => c.trim()).filter(Boolean))];
  if (codigos.length === 0 || !supabase) return null;
  const agora = new Date().toISOString();
  const { error } = await tabelaCatalogo()
    .update({ etiqueta_impressa_em: agora })
    .in('codigo_sap', codigos)
    .eq('ativo', true);
  if (error) {
    console.warn('[almoxCatalogoApi] Falha ao marcar etiquetas impressas:', error);
    return null;
  }
  return agora;
}

/**
 * Leva para a tabela o que ficou no localStorage de quem cadastrou antes da
 * tabela existir. Roda ao abrir o catálogo; o que subir sai do aparelho, o
 * que falhar (sem rede) fica para a próxima abertura.
 *
 * A foto não é migrada: até aqui nenhum upload do catálogo tinha dado certo
 * (a pasta `almox-catalogo/` estava vazia no Storage), então todo
 * `imagem_path` guardado no aparelho aponta para arquivo inexistente.
 */
export async function migrarCatalogoLocalLegado(): Promise<number> {
  const locais = obterItensCatalogoLocal().filter(i => i.ativo !== false && i.codigo_sap);
  if (locais.length === 0 || !supabase) return 0;

  const { data: jaNoBanco, error } = await tabelaCatalogo()
    .select('codigo_sap')
    .in('codigo_sap', locais.map(i => i.codigo_sap))
    .eq('ativo', true);
  if (error) return 0;
  const existentes = new Set((jaNoBanco ?? []).map((r: { codigo_sap: string }) => r.codigo_sap));

  const pendentes: CatalogoItem[] = [];
  let migrados = 0;
  for (const item of locais) {
    if (existentes.has(item.codigo_sap)) continue;
    const { error: erroInsert } = await tabelaCatalogo().insert({
      codigo_sap: item.codigo_sap,
      descricao: item.descricao || item.codigo_sap,
      texto_tecnico: item.texto_tecnico,
      grp_mercad: item.grp_mercad,
      grupo_mercadorias: item.grupo_mercadorias,
      classificacao_nivel1: item.classificacao_nivel1,
      classificacao_nivel2: item.classificacao_nivel2,
      umb: item.umb,
      saldo_zl0024: item.saldo_zl0024,
      observacao: item.observacao,
      ativo: true,
      criado_por: item.criado_por,
      criado_por_nome: item.criado_por_nome,
      atualizado_por: item.atualizado_por,
      atualizado_por_nome: item.atualizado_por_nome,
    });
    // 23505: outro aparelho já migrou o mesmo material — nada a fazer.
    if (!erroInsert) migrados += 1;
    else if (erroInsert.code !== '23505') pendentes.push(item);
  }

  if (pendentes.length > 0) {
    salvarItensCatalogoLocal(pendentes);
  } else if (typeof localStorage !== 'undefined') {
    try { localStorage.removeItem(CHAVE_CATALOGO_ITENS); } catch { /* ignora */ }
  }
  return migrados;
}

// ---------------------------------------------------------------------------
// Fotos adicionais do item
//
// A foto principal (`imagem_path`) é a que o Recebimento também alimenta. As
// adicionais moram em `alm_catalogo_item_fotos` e só entram e saem pelo
// Cadastro de Itens — nada do Recebimento escreve ou lê esta tabela.
// ---------------------------------------------------------------------------

export const TABELA_FOTOS_ADICIONAIS = 'alm_catalogo_item_fotos';

/** Limite por item — o suficiente para ângulos, embalagem e detalhe; evita o cadastro virar galeria. */
export const MAX_FOTOS_ADICIONAIS = 8;

export interface FotoAdicionalCatalogo {
  id: string;
  catalogo_item_id: string;
  imagem_path: string;
  imagem_nome: string | null;
  imagem_mime: string | null;
  imagem_tamanho: number | null;
  ordem: number;
  criado_por_nome: string | null;
  created_at: string;
  /** URL assinada, resolvida na leitura. */
  url?: string | null;
}

const tabelaFotosAdicionais = () => (supabase.from as any)(TABELA_FOTOS_ADICIONAIS);

/** Fotos adicionais do item, na ordem em que foram incluídas, já com URL assinada. */
export async function listarFotosAdicionais(catalogoItemId: string): Promise<FotoAdicionalCatalogo[]> {
  if (!catalogoItemId || !supabase) return [];
  const { data, error } = await tabelaFotosAdicionais()
    .select('*')
    .eq('catalogo_item_id', catalogoItemId)
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Falha ao carregar as fotos adicionais: ${error.message}`);

  const fotos = (data ?? []) as FotoAdicionalCatalogo[];
  const urls = await obterUrlsFotosCatalogoLote(fotos.map(f => ({ path: f.imagem_path, bucket: BUCKET_CATALOGO })));
  return fotos.map(f => ({ ...f, url: urls.get(f.imagem_path) ?? null }));
}

/**
 * Inclui fotos adicionais no item (que já precisa ter registro no catálogo).
 * Cada arquivo passa pela compressão única (regra 1 do CLAUDE.md) antes de
 * subir; se a gravação da linha falhar, o arquivo recém-enviado é removido.
 * Uma foto que falha não impede as demais — o retorno diz quais entraram e quais não.
 */
export async function adicionarFotosAdicionais(
  catalogoItemId: string,
  codigoSap: string,
  arquivos: File[],
  user: Profile,
): Promise<{ salvas: FotoAdicionalCatalogo[]; falhas: { arquivo: File; motivo: string }[] }> {
  if (!catalogoItemId) throw new Error('O item ainda não tem registro no catálogo.');
  if (!supabase) throw new Error('Sem conexão com o banco de dados.');

  const { count } = await tabelaFotosAdicionais()
    .select('id', { count: 'exact', head: true })
    .eq('catalogo_item_id', catalogoItemId);
  const jaGravadas = count ?? 0;
  if (jaGravadas + arquivos.length > MAX_FOTOS_ADICIONAIS) {
    throw new Error(`Cada item aceita até ${MAX_FOTOS_ADICIONAIS} fotos adicionais (já tem ${jaGravadas}).`);
  }

  const salvas: FotoAdicionalCatalogo[] = [];
  const falhas: { arquivo: File; motivo: string }[] = [];
  for (let i = 0; i < arquivos.length; i++) {
    const original = arquivos[i];
    let pathEnviado: string | null = null;
    try {
      const comprimido = await comprimirImagemUpload(original);
      const ext = extensaoDaImagem(comprimido, original);
      const caminho = `${PASTA_CATALOGO}/material-${codigoSap}-extra-${Date.now()}-${i}.${ext}`;
      const { error: erroUpload } = await supabase.storage
        .from(BUCKET_CATALOGO)
        .upload(caminho, comprimido, { contentType: comprimido.type || 'image/jpeg', cacheControl: CACHE_FOTO_CATALOGO, upsert: false });
      if (erroUpload) throw new Error(erroUpload.message);
      pathEnviado = caminho;

      const { data, error } = await tabelaFotosAdicionais()
        .insert({
          catalogo_item_id: catalogoItemId,
          imagem_path: caminho,
          imagem_nome: original.name || null,
          imagem_mime: comprimido.type || 'image/jpeg',
          imagem_tamanho: comprimido.size,
          ordem: jaGravadas + i,
          criado_por: user.id,
          criado_por_nome: user.name,
        })
        .select('*')
        .single();
      if (error || !data) throw new Error(error?.message ?? 'resposta vazia');
      salvas.push({ ...(data as FotoAdicionalCatalogo), url: await obterUrlFotoCatalogo(caminho) });
    } catch (err: any) {
      if (pathEnviado) await removerFotoDoStorage(pathEnviado);
      falhas.push({ arquivo: original, motivo: err?.message ?? 'falha desconhecida' });
    }
  }
  return { salvas, falhas };
}

/**
 * Troca uma foto adicional por outra, mantendo a posição dela na lista.
 * Sobe o arquivo novo, grava a linha nova (mesma `ordem`) e só então apaga a
 * antiga — se qualquer passo falhar, o que já tinha continua como estava.
 */
export async function substituirFotoAdicional(
  foto: FotoAdicionalCatalogo,
  arquivo: File,
  codigoSap: string,
  user: Profile,
): Promise<FotoAdicionalCatalogo> {
  if (!supabase) throw new Error('Sem conexão com o banco de dados.');

  const comprimido = await comprimirImagemUpload(arquivo);
  const ext = extensaoDaImagem(comprimido, arquivo);
  const caminho = `${PASTA_CATALOGO}/material-${codigoSap}-extra-${Date.now()}.${ext}`;
  const { error: erroUpload } = await supabase.storage
    .from(BUCKET_CATALOGO)
    .upload(caminho, comprimido, { contentType: comprimido.type || 'image/jpeg', cacheControl: CACHE_FOTO_CATALOGO, upsert: false });
  if (erroUpload) throw new Error(`Falha no upload da foto: ${erroUpload.message}`);

  const { data, error } = await tabelaFotosAdicionais()
    .insert({
      catalogo_item_id: foto.catalogo_item_id,
      imagem_path: caminho,
      imagem_nome: arquivo.name || null,
      imagem_mime: comprimido.type || 'image/jpeg',
      imagem_tamanho: comprimido.size,
      ordem: foto.ordem,
      criado_por: user.id,
      criado_por_nome: user.name,
    })
    .select('*')
    .single();
  if (error || !data) {
    await removerFotoDoStorage(caminho);
    throw new Error(`Falha ao gravar a foto nova: ${error?.message ?? 'resposta vazia'}`);
  }
  const nova = data as FotoAdicionalCatalogo;

  const { error: erroApagar } = await tabelaFotosAdicionais().delete().eq('id', foto.id);
  if (erroApagar) {
    // Não deu para tirar a antiga: desfaz a nova para não ficar foto duplicada.
    await tabelaFotosAdicionais().delete().eq('id', nova.id);
    await removerFotoDoStorage(caminho);
    throw new Error(`Falha ao trocar a foto: ${erroApagar.message}`);
  }
  await removerFotoDoStorage(foto.imagem_path);

  return { ...nova, url: await obterUrlFotoCatalogo(caminho) };
}

/** Apaga a linha e o arquivo de uma foto adicional. */
export async function removerFotoAdicional(foto: Pick<FotoAdicionalCatalogo, 'id' | 'imagem_path'>): Promise<void> {
  if (!foto.id || !supabase) return;
  const { error } = await tabelaFotosAdicionais().delete().eq('id', foto.id);
  if (error) throw new Error(`Falha ao remover a foto adicional: ${error.message}`);
  await removerFotoDoStorage(foto.imagem_path);
}

/**
 * O catálogo só pode apagar o que ele mesmo gravou: a pasta `almox-catalogo/`.
 * Foto do Recebimento (bucket `alm-recebimento`) e do Book de EPIs são copiadas
 * para cá antes de virar foto do catálogo, nunca referenciadas — trocar ou
 * remover foto no cadastro jamais deve tocar nos arquivos delas.
 */
export function caminhoEhDoCatalogo(storagePath: string): boolean {
  const limpo = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath;
  return limpo.startsWith(`${PASTA_CATALOGO}/`) && !limpo.includes('..');
}

/**
 * Remove uma foto do Supabase Storage (só da pasta do catálogo).
 */
async function removerFotoDoStorage(storagePath: string): Promise<void> {
  if (!storagePath || !supabase) return;
  if (!caminhoEhDoCatalogo(storagePath)) {
    console.warn('[almoxCatalogoApi] Arquivo fora da pasta do catálogo não será apagado:', storagePath);
    return;
  }
  try {
    const cleanPath = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath;
    await supabase.storage.from(BUCKET_CATALOGO).remove([cleanPath]);
  } catch (err) {
    console.warn('[almoxCatalogoApi] Falha ao excluir arquivo do storage:', err);
  }
}

/**
 * Tira o item do catálogo: desativa o registro (o histórico fica) e apaga a
 * foto do Storage.
 */
export async function excluirItemCatalogo(id: string, user: Profile): Promise<void> {
  if (!id || !supabase) return;

  const { data: atual, error: erroBusca } = await tabelaCatalogo()
    .select('imagem_path')
    .eq('id', id)
    .maybeSingle();
  if (erroBusca) throw new Error(`Falha ao consultar o catálogo: ${erroBusca.message}`);

  const { error } = await tabelaCatalogo()
    .update({
      ativo: false,
      imagem_path: null,
      atualizado_por: user.id,
      atualizado_por_nome: user.name,
    })
    .eq('id', id);
  if (error) throw new Error(`Falha ao remover do catálogo: ${error.message}`);

  if (atual?.imagem_path) await removerFotoDoStorage(atual.imagem_path);

  // As fotos adicionais saem junto: o item é só desativado, então a exclusão em
  // cascata do banco não alcança as linhas nem os arquivos.
  try {
    const { data: extras } = await tabelaFotosAdicionais().select('id, imagem_path').eq('catalogo_item_id', id);
    for (const foto of (extras ?? []) as Pick<FotoAdicionalCatalogo, 'id' | 'imagem_path'>[]) {
      await removerFotoAdicional(foto);
    }
  } catch (err) {
    console.warn('[almoxCatalogoApi] Falha ao remover fotos adicionais do item excluído:', err);
  }
}
