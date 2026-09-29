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

import { supabase } from '../db/supabaseClient';
import { localDb } from '../db/localDb';
import { comprimirImagemUpload } from './imageCompression';
import { isProjetoItem } from './demandas';
import { gerarCodigoFormulario, proximoIndiceCodigo } from './codigosFormulario';
import { SSMA_BOOK_EPIS_BUCKET } from './ssmaBookEpisApi';
import { buscarMateriais, normalizarTermo, ehCodigoSapInativo } from './materiais';
import type { EstoqueItem, CadastroGrupoMercadoria, RequestAttachment, Profile } from '../types';

export const PREFIXO_CAT_ITEM = 'CAT';
export const BUCKET_CATALOGO = 'request-attachments';
export const PASTA_CATALOGO = 'almox-catalogo';
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
  fotoArquivo?: File | null;
  removerFoto?: boolean;
}

/**
 * Recupera itens salvos no catalogo local do almoxarifado.
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

/**
 * Salva itens no catalogo local do almoxarifado.
 */
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

const cacheUrlsAssinadas = new Map<string, { url: string; expiraEm: number }>();

/**
 * Obtém URL assinada da imagem do catálogo no Supabase Storage com cache em memória.
 * Suporta o bucket oficial do catálogo, contingência alm-catalogo e o bucket do Book de EPIs (ssma-book-epis).
 */
export async function obterUrlFotoCatalogo(path?: string | null, bucketPreferencial?: string): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (!supabase) return null;

  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const cacheKey = `${bucketPreferencial || 'auto'}:${cleanPath}`;
  const emCache = cacheUrlsAssinadas.get(cacheKey);
  if (emCache && emCache.expiraEm > Date.now()) {
    return emCache.url;
  }

  try {
    const bucket = bucketPreferencial || (cleanPath.startsWith('epis/') ? SSMA_BOOK_EPIS_BUCKET : BUCKET_CATALOGO);
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(cleanPath, 86400);
    if (!error && data?.signedUrl) {
      cacheUrlsAssinadas.set(cacheKey, { url: data.signedUrl, expiraEm: Date.now() + 80000 * 1000 });
      return data.signedUrl;
    }
    // Fallback caso a foto resida em outro bucket
    const outros = [SSMA_BOOK_EPIS_BUCKET, BUCKET_CATALOGO, 'alm-catalogo'].filter(b => b !== bucket);
    for (const b of outros) {
      const { data: d2 } = await supabase.storage.from(b).createSignedUrl(cleanPath, 86400);
      if (d2?.signedUrl) {
        cacheUrlsAssinadas.set(cacheKey, { url: d2.signedUrl, expiraEm: Date.now() + 80000 * 1000 });
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

  const porBucket = new Map<string, string[]>();
  for (const item of itens) {
    if (!item.path) continue;
    if (item.path.startsWith('http://') || item.path.startsWith('https://')) {
      mapa.set(item.path, item.path);
      continue;
    }
    const cleanPath = item.path.startsWith('/') ? item.path.slice(1) : item.path;
    const cacheKey = `${item.bucket || 'auto'}:${cleanPath}`;
    const emCache = cacheUrlsAssinadas.get(cacheKey);
    if (emCache && emCache.expiraEm > Date.now()) {
      mapa.set(cleanPath, emCache.url);
      continue;
    }

    const b = item.bucket || (cleanPath.startsWith('epis/') ? SSMA_BOOK_EPIS_BUCKET : BUCKET_CATALOGO);
    const lista = porBucket.get(b) || [];
    if (!lista.includes(cleanPath)) lista.push(cleanPath);
    porBucket.set(b, lista);
  }

  // Executa em paralelo para cada bucket em apenas 1 requisição batch
  await Promise.all(
    Array.from(porBucket.entries()).map(async ([bucket, paths]) => {
      if (paths.length === 0) return;
      try {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 86400);
        if (!error && data) {
          for (const res of data) {
            if (res.signedUrl && res.path) {
              mapa.set(res.path, res.signedUrl);
              cacheUrlsAssinadas.set(`${bucket}:${res.path}`, {
                url: res.signedUrl,
                expiraEm: Date.now() + 80000 * 1000,
              });
            }
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
  try {
    const itens = obterItensCatalogoLocal().filter(it => it.ativo !== false);
    return itens.sort((a, b) => a.codigo_sap.localeCompare(b.codigo_sap, 'pt-BR'));
  } catch (err) {
    console.warn('[almoxCatalogoApi] Falha ao listar itens do catalogo local:', err);
    return [];
  }
}

/**
 * Busca uma foto específica do catálogo pelo código SAP do material.
 * Se o material não tiver foto no catálogo geral local, puxa automaticamente do Book de EPIs.
 */
export async function buscarFotoCatalogoPorCodigoSap(codigoSap: string): Promise<CatalogoItem | null> {
  const limpo = String(codigoSap || '').trim();
  if (!limpo) return null;

  try {
    // 1. Procura no catálogo local
    const itens = obterItensCatalogoLocal();
    const item = itens.find(i => i.codigo_sap === limpo && i.ativo !== false);
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
    // 1. Consulta o catálogo local
    const itensLocais = obterItensCatalogoLocal();
    for (const item of itensLocais) {
      if (item.ativo !== false && item.imagem_path && codigos.includes(item.codigo_sap)) {
        if (!item.url_imagem) {
          item.url_imagem = await obterUrlFotoCatalogo(item.imagem_path);
        }
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
    const itemExistente = mapaMateriais.get(material);

    if (itemExistente) {
      itemExistente.saldo_total += quantidade;
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
        saldo_total: quantidade,
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
    const qtd = Math.max(0, Number(row.quantidade) || 0);
    const dep = String(row.deposito || '').trim();

    const existente = mapaCandidatos.get(mat);
    if (existente) {
      existente.saldo_total += qtd;
      if (dep && !existente.depositos.includes(dep)) {
        existente.depositos.push(dep);
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
        saldo_total: qtd,
        depositos: dep ? [dep] : [],
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
            existente.saldo_total = r.qtdEstoque;
          }
          if (r.depositos && existente.depositos.length === 0) {
            existente.depositos = r.depositos;
          }
        } else {
          const cat = dadosCompletos?.itensCatalogo.find(c => c.codigo_sap === mat);
          const epi = dadosCompletos?.mapaEpis.get(mat);
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
            saldo_total: r.qtdEstoque || (rowEstoque ? Math.max(0, Number(rowEstoque.quantidade) || 0) : 0),
            depositos: r.depositos || (rowEstoque?.deposito ? [String(rowEstoque.deposito).trim()] : []),
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
              saldo_total: rowEstoque ? Math.max(0, Number(rowEstoque.quantidade) || 0) : 0,
              depositos: rowEstoque?.deposito ? [String(rowEstoque.deposito).trim()] : [],
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
  const [grupos, itensCatalogo, mapaEpis] = await Promise.all([
    carregarGruposMercadoria(),
    listarItensCatalogo(),
    listarEpisComFoto(),
  ]);

  // Verifica se já existe lista fixa do catálogo persistida
  let listaFixa = obterListaFixaCatalogoLocal();

  if (listaFixa.length === 0) {
    // Primeira carga inicial: se não houver estoque local em memória, busca uma única vez
    let estoqueLocal = localDb.getEstoque();
    if (!estoqueLocal || estoqueLocal.length === 0) {
      try {
        estoqueLocal = await localDb.fetchEstoque(false);
      } catch {
        estoqueLocal = [];
      }
    }
    if (estoqueLocal && estoqueLocal.length > 0) {
      listaFixa = filtrarEAgruparZl0024Consumiveis(estoqueLocal, grupos, itensCatalogo, true, mapaEpis);
      salvarListaFixaCatalogoLocal(listaFixa);
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

    return {
      ...it,
      item_catalogo: cat || it.item_catalogo,
      tem_foto: temFotoCat || temFotoEpi,
      url_foto: cat?.url_imagem || epi?.url_imagem || it.url_foto || null,
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
      const novoItem: ItemConsumivelZl0024 = {
        codigo_sap: cat.codigo_sap,
        descricao: cat.descricao,
        texto_tecnico: cat.texto_tecnico || (epi?.ca ? `CA: ${epi.ca}` : ''),
        grp_mercad: cat.grp_mercad || (epi ? 'M11' : ''),
        grupo_mercadorias: cat.grupo_mercadorias || (epi ? 'EPI E UNIFORMES' : ''),
        classificacao_nivel1: cat.classificacao_nivel1 || 'CONSUMÍVEL',
        classificacao_nivel2: cat.classificacao_nivel2 || (epi ? 'EPI - Segurança' : ''),
        saldo_total: cat.saldo_zl0024 || 0,
        umb: cat.umb || 'UN',
        depositos: [],
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

  return {
    itens: itensAtualizados,
    estoqueCompleto: (localDb.getEstoque() || []) as EstoqueItem[],
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
      const { data, error } = await (supabase.from as any)('cadastro_grupo_mercadoria')
        .select('codigo, denominacao, denominacao2, classificacao_nivel1, classificacao_nivel2, codigo_pai');
      if (!error && data && data.length > 0) {
        return data as CadastroGrupoMercadoria[];
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

/**
 * Salva ou atualiza um item no catálogo do almoxarifado, comprimindo a foto
 * antes de subir para o Storage (cumprindo a Regra 1 e a Regra 2 do AGENTS.md).
 * Salva localmente com persistência em localStorage, sem erros 404 no Supabase.
 */
export async function salvarItemCatalogo(
  payload: SalvarItemCatalogoPayload,
  user: Profile
): Promise<CatalogoItem> {
  if (!payload.codigo_sap) {
    throw new Error('Código SAP é obrigatório para cadastrar no catálogo.');
  }

  const codigoSap = payload.codigo_sap.trim();
  const hoje = new Date().toISOString().slice(0, 10);

  // Consulta se o item já existe para manter código ou substituir imagem
  const itemExistente = await buscarFotoCatalogoPorCodigoSap(codigoSap);

  let codigoRegistro = itemExistente?.codigo_registro;
  if (!codigoRegistro || codigoRegistro.startsWith('EPI-')) {
    // Busca códigos existentes para calcular o próximo índice sequencial (Regra 2)
    const itens = await listarItensCatalogo();
    const codigosExistentes = itens.map(i => i.codigo_registro).filter(Boolean);
    const indice = proximoIndiceCodigo(PREFIXO_CAT_ITEM, codigosExistentes);
    codigoRegistro = gerarCodigoFormulario(PREFIXO_CAT_ITEM, hoje, indice);
  }

  let imagemPath = itemExistente?.imagem_path ?? null;
  let imagemNome = itemExistente?.imagem_nome ?? null;
  let imagemMime = itemExistente?.imagem_mime ?? null;
  let imagemTamanho = itemExistente?.imagem_tamanho ?? null;

  // Remoção de foto solicitada
  if (payload.removerFoto && itemExistente?.imagem_path) {
    await removerFotoDoStorage(itemExistente.imagem_path);
    imagemPath = null;
    imagemNome = null;
    imagemMime = null;
    imagemTamanho = null;
  }

  // Upload de nova foto
  if (payload.fotoArquivo) {
    // 1. Compressão OBRIGATÓRIA (Regra 1 do AGENTS.md)
    const arquivoComprimido = await comprimirImagemUpload(payload.fotoArquivo);

    // Comprimida, a foto volta como Blob JPEG (sem `name`); sem compressão
    // (HEIC fora do Safari, ou já pequena) volta o File original.
    const ext = extensaoDaImagem(arquivoComprimido, payload.fotoArquivo);
    const nomeLimpo = `material-${codigoSap}-${Date.now()}.${ext}`;
    const storagePath = `${PASTA_CATALOGO}/${nomeLimpo}`;

    // Remove foto anterior se houver
    if (itemExistente?.imagem_path && itemExistente.imagem_path !== storagePath) {
      await removerFotoDoStorage(itemExistente.imagem_path).catch(() => {});
    }

    // Upload para o Storage
    if (supabase) {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_CATALOGO)
        .upload(storagePath, arquivoComprimido, {
          contentType: arquivoComprimido.type || 'image/jpeg',
          // Caminho único (leva o timestamp): não há o que sobrescrever, e o
          // bucket não tem política de UPDATE — upsert seria barrado pelo RLS.
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Falha no upload da foto: ${uploadError.message}`);
      }
    }

    imagemPath = storagePath;
    imagemNome = payload.fotoArquivo.name || nomeLimpo;
    imagemMime = arquivoComprimido.type || 'image/jpeg';
    imagemTamanho = arquivoComprimido.size;
  }

  const itemId = itemExistente?.id && !itemExistente.id.startsWith('epi-')
    ? itemExistente.id
    : `cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const itemSalvo: CatalogoItem = {
    id: itemId,
    codigo_registro: codigoRegistro,
    codigo_sap: codigoSap,
    descricao: payload.descricao.trim(),
    texto_tecnico: payload.texto_tecnico?.trim() || null,
    grp_mercad: payload.grp_mercad?.trim() || null,
    grupo_mercadorias: payload.grupo_mercadorias?.trim() || null,
    classificacao_nivel1: payload.classificacao_nivel1?.trim() || 'CONSUMÍVEL',
    classificacao_nivel2: payload.classificacao_nivel2?.trim() || null,
    umb: payload.umb?.trim() || 'UN',
    saldo_zl0024: payload.saldo_zl0024 ?? 0,
    imagem_path: imagemPath,
    imagem_nome: imagemNome,
    imagem_mime: imagemMime,
    imagem_tamanho: imagemTamanho,
    observacao: payload.observacao?.trim() || null,
    ativo: true,
    criado_por: itemExistente?.criado_por || user.id,
    criado_por_nome: itemExistente?.criado_por_nome || user.name,
    atualizado_por: user.id,
    atualizado_por_nome: user.name,
    created_at: itemExistente?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Salva no catálogo local
  const itensLocais = obterItensCatalogoLocal();
  const index = itensLocais.findIndex(i => i.codigo_sap === codigoSap);
  if (index >= 0) {
    itensLocais[index] = itemSalvo;
  } else {
    itensLocais.push(itemSalvo);
  }
  salvarItensCatalogoLocal(itensLocais);

  // Também atualiza/insere na lista fixa local para que o item permaneça fixo no catálogo
  const listaFixa = obterListaFixaCatalogoLocal();
  const idxFixa = listaFixa.findIndex(i => i.codigo_sap === codigoSap);
  const itemConsumivel: ItemConsumivelZl0024 = {
    codigo_sap: itemSalvo.codigo_sap,
    descricao: itemSalvo.descricao,
    texto_tecnico: itemSalvo.texto_tecnico || '',
    grp_mercad: itemSalvo.grp_mercad || '',
    grupo_mercadorias: itemSalvo.grupo_mercadorias || '',
    classificacao_nivel1: itemSalvo.classificacao_nivel1 || 'CONSUMÍVEL',
    classificacao_nivel2: itemSalvo.classificacao_nivel2 || '',
    saldo_total: itemSalvo.saldo_zl0024 || 0,
    umb: itemSalvo.umb || 'UN',
    depositos: idxFixa >= 0 ? listaFixa[idxFixa].depositos : [],
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
      saldo_total: listaFixa[idxFixa].saldo_total || itemConsumivel.saldo_total,
    };
  } else {
    listaFixa.unshift(itemConsumivel);
  }
  salvarListaFixaCatalogoLocal(listaFixa);

  if (itemSalvo.imagem_path) {
    itemSalvo.url_imagem = await obterUrlFotoCatalogo(itemSalvo.imagem_path);
  }
  return itemSalvo;
}

/**
 * Remove uma foto do Supabase Storage.
 */
async function removerFotoDoStorage(storagePath: string): Promise<void> {
  if (!storagePath || !supabase) return;
  try {
    const cleanPath = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath;
    await supabase.storage.from(BUCKET_CATALOGO).remove([cleanPath]);
  } catch (err) {
    console.warn('[almoxCatalogoApi] Falha ao excluir arquivo do storage:', err);
  }
}

/**
 * Desativa/remove um item do catálogo local.
 */
export async function excluirItemCatalogo(id: string, user: Profile): Promise<void> {
  if (!id) return;

  const itensLocais = obterItensCatalogoLocal();
  const index = itensLocais.findIndex(i => i.id === id);
  if (index >= 0) {
    const item = itensLocais[index];
    if (item.imagem_path) {
      await removerFotoDoStorage(item.imagem_path).catch(() => {});
    }
    itensLocais[index] = {
      ...item,
      ativo: false,
      imagem_path: null,
      atualizado_por: user.id,
      atualizado_por_nome: user.name,
      updated_at: new Date().toISOString(),
    };
    salvarItensCatalogoLocal(itensLocais);
  }
}
