/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fotos do item na Central de Compras — miniatura ao lado da descrição.
 *
 * Três fontes, nesta ordem:
 *   1. Solicitação: imagens anexadas ao item da solicitação do SISTEN que
 *      originou a RM (vínculo de `lib/centralComprasSisten.ts`). É a foto do
 *      que foi pedido de fato.
 *   2. Cadastro de Itens: foto principal + fotos adicionais do material
 *      (`alm_catalogo_itens` / `alm_catalogo_item_fotos`). As do Book de EPIs
 *      já entram no cadastro, então não são buscadas à parte.
 *   3. Outras solicitações do mesmo material: quem repete a compra costuma
 *      anexar a foto só na primeira vez (ex.: correia 1449040 com foto na
 *      #4000022 e sem foto na #3001107).
 *
 * Item genérico só usa a própria solicitação: o código é guarda-chuva para
 * várias coisas parecidas, e a foto de outro pedido não mostra o que foi pedido.
 *
 * Todas as fotos estão no bucket `request-attachments`. A assinatura passa por
 * `obterUrlsFotosCatalogoLote` (cache no aparelho, 22 h) e é agrupada: as
 * miniaturas que entram na tela no mesmo instante saem num único pedido ao
 * Storage, em vez de um por linha.
 */

import { supabase } from '../db/supabaseClient';
import { buscarTudo } from './buscarTudo';
import { BUCKET_CATALOGO, TABELA_CATALOGO, TABELA_FOTOS_ADICIONAIS, obterUrlsFotosCatalogoLote } from './almoxCatalogoApi';
import type { RequestAttachment } from '../types';

export type OrigemFotoItem = 'solicitacao' | 'cadastro' | 'outra_solicitacao';

export interface FotoItemCompra {
  /** Caminho no bucket `request-attachments`. */
  path: string;
  origem: OrigemFotoItem;
  legenda: string;
}

export const ROTULO_ORIGEM_FOTO: Record<OrigemFotoItem, string> = {
  solicitacao: 'Solicitação',
  cadastro: 'Cadastro de Itens',
  outra_solicitacao: 'Outra solicitação do material',
};

function limparCaminho(path: string): string {
  return path.trim().replace(/^\/+/, '');
}

/** Tolera zero à esquerda — o SAP às vezes traz o MATNR com zeros. */
export function chaveMaterialFoto(codigo: string | null | undefined): string {
  const s = (codigo || '').trim();
  return s.replace(/^0+/, '') || s;
}

function ehImagem(a: RequestAttachment): boolean {
  return (a.mime_type || '').startsWith('image/');
}

/** Imagens anexadas a itens de solicitação, por `request_item_id`. */
export function indexarFotosSolicitacaoPorItem(anexos: RequestAttachment[]): Map<string, RequestAttachment[]> {
  const mapa = new Map<string, RequestAttachment[]>();
  for (const a of anexos) {
    if (!a.request_item_id || !ehImagem(a)) continue;
    const lista = mapa.get(a.request_item_id) ?? [];
    lista.push(a);
    mapa.set(a.request_item_id, lista);
  }
  return mapa;
}

/** Item de solicitação com o que a indexação por material precisa. */
export interface ItemSolicitacaoFoto {
  id: string;
  request_id: string;
  sap_code?: string | null;
  is_generic?: boolean | null;
  has_no_sap_code?: boolean | null;
}

/**
 * Imagens de itens de solicitação por material (chave sem zeros), para
 * mostrar a foto de um pedido anterior do mesmo código. Item genérico ou sem
 * código SAP fica de fora; o material vem do item, e na falta dele do anexo.
 * `numeroPorRequest` vira a legenda ("Solicitação #4000022").
 */
export function indexarFotosSolicitacaoPorMaterial(
  anexos: RequestAttachment[],
  itens: ItemSolicitacaoFoto[],
  numeroPorRequest: Map<string, string | number> = new Map(),
): Map<string, FotoItemCompra[]> {
  const itemPorId = new Map(itens.map(i => [i.id, i]));
  const mapa = new Map<string, FotoItemCompra[]>();
  // Mais recente primeiro: a foto do último pedido tende a ser a do item atual.
  const ordenados = [...anexos].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  for (const a of ordenados) {
    if (!a.request_item_id || !ehImagem(a)) continue;
    const item = itemPorId.get(a.request_item_id);
    if (item?.is_generic || item?.has_no_sap_code) continue;
    const chave = chaveMaterialFoto(item?.sap_code || a.material_code);
    const path = limparCaminho(a.storage_path || a.url || '');
    if (!chave || !path) continue;
    const numero = numeroPorRequest.get(a.request_id);
    const legenda = numero ? `Solicitação #${numero}` : (a.name || 'Foto de outra solicitação');
    mapa.set(chave, [...(mapa.get(chave) ?? []), { path, origem: 'outra_solicitacao', legenda }]);
  }
  return mapa;
}

/**
 * Junta as fotos do item: solicitação primeiro, depois o cadastro e as outras
 * solicitações do mesmo material (essas duas não valem para item genérico).
 * O mesmo arquivo pode estar em mais de uma fonte — reaproveitar uma foto do
 * banco de imagens grava outra linha apontando para o mesmo caminho, e a
 * própria solicitação também aparece no índice por material —, então
 * repetidos saem.
 */
export function montarFotosDoItem(params: {
  anexosSolicitacao?: RequestAttachment[] | null;
  fotosCadastro?: FotoItemCompra[] | null;
  fotosOutrasSolicitacoes?: FotoItemCompra[] | null;
  ehGenerico?: boolean;
}): FotoItemCompra[] {
  const saida: FotoItemCompra[] = [];
  const vistos = new Set<string>();
  const incluir = (foto: FotoItemCompra) => {
    const path = limparCaminho(foto.path);
    if (!path || vistos.has(path)) return;
    vistos.add(path);
    saida.push({ ...foto, path });
  };

  for (const a of params.anexosSolicitacao ?? []) {
    if (!ehImagem(a)) continue;
    incluir({ path: a.storage_path || a.url, origem: 'solicitacao', legenda: a.name || 'Foto da solicitação' });
  }
  if (!params.ehGenerico) {
    for (const f of params.fotosCadastro ?? []) incluir(f);
    for (const f of params.fotosOutrasSolicitacoes ?? []) incluir(f);
  }
  return saida;
}

// ── Cadastro de Itens ────────────────────────────────────────────────────────

/** O cadastro muda pouco durante o uso da Central; relê a cada 10 min. */
const VALIDADE_CADASTRO_MS = 10 * 60 * 1000;
let cadastroEmCache: { carregadoEm: number; promessa: Promise<Map<string, FotoItemCompra[]>> } | null = null;

interface LinhaCatalogo { id: string; codigo_sap: string; descricao: string | null; imagem_path: string | null }
interface LinhaFotoAdicional { id: string; catalogo_item_id: string; imagem_path: string; ordem: number | null }

async function lerFotosCadastro(): Promise<Map<string, FotoItemCompra[]>> {
  const mapa = new Map<string, FotoItemCompra[]>();
  if (!supabase) return mapa;
  const sb = supabase as any;

  // Só as colunas da foto: ~1.400 itens, duas páginas do PostgREST.
  const [itens, adicionais] = await Promise.all([
    buscarTudo<LinhaCatalogo>((de, ate) =>
      sb.from(TABELA_CATALOGO)
        .select('id, codigo_sap, descricao, imagem_path')
        .eq('ativo', true)
        .not('imagem_path', 'is', null)
        .order('id')
        .range(de, ate)),
    buscarTudo<LinhaFotoAdicional>((de, ate) =>
      sb.from(TABELA_FOTOS_ADICIONAIS)
        .select('id, catalogo_item_id, imagem_path, ordem')
        .order('id')
        .range(de, ate)),
  ]);

  const adicionaisPorItem = new Map<string, LinhaFotoAdicional[]>();
  for (const f of adicionais) {
    const lista = adicionaisPorItem.get(f.catalogo_item_id) ?? [];
    lista.push(f);
    adicionaisPorItem.set(f.catalogo_item_id, lista);
  }

  for (const item of itens) {
    const chave = chaveMaterialFoto(item.codigo_sap);
    if (!chave || !item.imagem_path) continue;
    const descricao = item.descricao || item.codigo_sap;
    const fotos: FotoItemCompra[] = [{ path: item.imagem_path, origem: 'cadastro', legenda: descricao }];
    const extras = (adicionaisPorItem.get(item.id) ?? []).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    extras.forEach((f, i) => fotos.push({ path: f.imagem_path, origem: 'cadastro', legenda: `${descricao} (${i + 2})` }));
    mapa.set(chave, [...(mapa.get(chave) ?? []), ...fotos]);
  }
  return mapa;
}

/**
 * Fotos do Cadastro de Itens por material (chave sem zeros à esquerda).
 * Falha de leitura devolve mapa vazio — a Central segue funcionando sem foto.
 */
export function carregarFotosCadastroPorMaterial(): Promise<Map<string, FotoItemCompra[]>> {
  const agora = Date.now();
  if (cadastroEmCache && agora - cadastroEmCache.carregadoEm < VALIDADE_CADASTRO_MS) return cadastroEmCache.promessa;
  const promessa = lerFotosCadastro().catch(err => {
    console.warn('[fotosItemCompra] Falha ao ler as fotos do cadastro de itens:', err);
    cadastroEmCache = null;
    return new Map<string, FotoItemCompra[]>();
  });
  cadastroEmCache = { carregadoEm: agora, promessa };
  return promessa;
}

// ── Assinatura agrupada ──────────────────────────────────────────────────────

let filaAssinatura = new Map<string, Array<(url: string | null) => void>>();
let timerAssinatura: ReturnType<typeof setTimeout> | null = null;

async function assinarFila(): Promise<void> {
  timerAssinatura = null;
  const lote = filaAssinatura;
  filaAssinatura = new Map();
  let urls = new Map<string, string>();
  try {
    urls = await obterUrlsFotosCatalogoLote([...lote.keys()].map(path => ({ path, bucket: BUCKET_CATALOGO })));
  } catch (err) {
    console.warn('[fotosItemCompra] Falha ao assinar fotos:', err);
  }
  lote.forEach((resolvers, path) => resolvers.forEach(r => r(urls.get(path) ?? null)));
}

/** URL assinada da foto; pedidos feitos no mesmo instante saem juntos. */
export function assinarFotoItem(path: string): Promise<string | null> {
  const limpo = limparCaminho(path);
  if (!limpo) return Promise.resolve(null);
  return new Promise(resolve => {
    const lista = filaAssinatura.get(limpo) ?? [];
    lista.push(resolve);
    filaAssinatura.set(limpo, lista);
    if (!timerAssinatura) timerAssinatura = setTimeout(() => { void assinarFila(); }, 40);
  });
}
