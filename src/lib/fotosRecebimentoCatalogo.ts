/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fotos tiradas no Recebimento do Almoxarifado (bucket `alm-recebimento`)
 * reaproveitadas no Catálogo de Itens (FRM.ALM-0016).
 *
 * A foto do item na conferência já está ligada ao código do material. Em vez
 * de tirar outra, quem cadastra o item no catálogo escolhe uma dessas — ela
 * é copiada para o bucket do catálogo (comprimida de novo pelo
 * `salvarItemCatalogo`, regra 1 do CLAUDE.md). Daí em diante a Nova
 * Solicitação de Compras a encontra pelo código SAP, como qualquer foto do
 * catálogo, sem depender do bucket do recebimento.
 *
 * Só entra foto escolhida por gente: a foto da conferência é da carga e pode
 * mostrar pallet, canhoto ou outro item ao fundo — por isso não é automática.
 */

import { supabase } from '../db/supabaseClient';
import { assinarEvidencias } from './recebimentoAlmoxApi';
import { buscarItemAtivoCatalogo, salvarItemCatalogo, type CatalogoItem } from './almoxCatalogoApi';
import { isProjetoItem } from './demandas';
import type { PreparedAttachment } from './imageCompression';
import type { AnexoRecebimento } from './recebimentoAlmox';
import type { Profile } from '../types';

export interface FotoRecebimentoMaterial {
  path: string;
  nome: string;
  /** Código da conferência (RCM-…) de onde a foto veio. */
  conferencia: string;
  data: string;
  /** URL assinada para mostrar a miniatura. */
  url: string;
}

interface LinhaItemComFoto {
  material_code: string | null;
  evidencias: AnexoRecebimento[] | null;
  conferencia: { codigo: string; data: string; excluido_em?: string | null } | null;
}

/**
 * Achata as linhas (item de conferência × fotos) em fotos, da conferência mais
 * recente para a mais antiga. Ignora conferência excluída e anexo que não é
 * imagem (PDF).
 */
export function extrairFotosDosItens(
  linhas: LinhaItemComFoto[],
  limite = 8,
): Omit<FotoRecebimentoMaterial, 'url'>[] {
  const fotos: Omit<FotoRecebimentoMaterial, 'url'>[] = [];
  const ordenadas = [...linhas].sort((a, b) => (b.conferencia?.data ?? '').localeCompare(a.conferencia?.data ?? ''));
  for (const linha of ordenadas) {
    if (!linha.conferencia || linha.conferencia.excluido_em) continue;
    for (const ev of linha.evidencias ?? []) {
      if (ev.tipo && !ev.tipo.startsWith('image/')) continue;
      fotos.push({ path: ev.path, nome: ev.nome, conferencia: linha.conferencia.codigo, data: linha.conferencia.data });
    }
  }
  return fotos.slice(0, limite);
}

const semZeros = (v: string) => v.trim().replace(/^0+/, '');

/** Fotos do material nas conferências de recebimento, com miniatura assinada. */
export async function listarFotosRecebimentoDoMaterial(codigoSap: string, limite = 8): Promise<FotoRecebimentoMaterial[]> {
  const codigo = codigoSap.trim();
  if (!codigo || !supabase) return [];

  const variantes = [...new Set([codigo, semZeros(codigo)])].filter(Boolean);
  const { data, error } = await (supabase.from as any)('alm_receb_conferencia_itens')
    .select('material_code, evidencias, conferencia:alm_receb_conferencias!inner(codigo, data, excluido_em)')
    .in('material_code', variantes)
    .is('conferencia.excluido_em', null)
    .limit(60);
  if (error) throw new Error(error.message);

  const fotos = extrairFotosDosItens((data ?? []) as LinhaItemComFoto[], limite);
  if (!fotos.length) return [];
  const urls = await assinarEvidencias(fotos.map((f) => f.path));
  return fotos.filter((f) => urls[f.path]).map((f) => ({ ...f, url: urls[f.path] }));
}

/** Baixa a foto (URL assinada) como `File`, pronta para o fluxo de foto do catálogo. */
export async function fotoRecebimentoComoArquivo(foto: Pick<FotoRecebimentoMaterial, 'url' | 'nome' | 'path'>): Promise<File> {
  const resposta = await fetch(foto.url);
  if (!resposta.ok) throw new Error('Não foi possível baixar a foto do recebimento.');
  const blob = await resposta.blob();
  const nome = foto.nome || foto.path.split('/').pop() || 'recebimento.jpg';
  return new File([blob], nome, { type: blob.type || 'image/jpeg' });
}

/** Item de conferência com a(s) foto(s) para levar ao catálogo. */
export interface ItemParaCatalogar {
  materialCode: string;
  descricao: string;
  unidade?: string | null;
  /** Foto já em mãos (recém-tirada) — usa a imagem limpa, sem o carimbo de data/hora. */
  fotosNovas?: PreparedAttachment[];
  /** Fotos já gravadas no recebimento (bucket `alm-recebimento`); baixa a primeira. */
  fotosGravadas?: AnexoRecebimento[];
}

export interface ResultadoCatalogar {
  /** Itens que entraram no catálogo agora, com a foto. */
  cadastrados: string[];
  /** Itens que já tinham foto no catálogo — nada foi trocado. */
  jaTinham: string[];
  /** Projeto (100000…) não entra no catálogo de consumíveis; sem código não há o que cadastrar. */
  ignorados: string[];
  falhas: { material: string; motivo: string }[];
}

/**
 * Tirou a foto do item no recebimento → o item já vira item do catálogo, com a
 * imagem, mesmo com saldo 0 na ZL0024 (chegou agora, o saldo importado ainda
 * não refletiu). Nunca troca foto que o catálogo já tem — quem quer trocar faz
 * no cadastro. Erro em um item não derruba os outros nem a conferência.
 */
export async function cadastrarItensComFotoNoCatalogo(
  itens: ItemParaCatalogar[],
  user: Profile,
): Promise<ResultadoCatalogar> {
  const r: ResultadoCatalogar = { cadastrados: [], jaTinham: [], ignorados: [], falhas: [] };
  const vistos = new Set<string>();

  for (const item of itens) {
    const codigo = item.materialCode.trim();
    const temFoto = (item.fotosNovas?.length ?? 0) > 0 || (item.fotosGravadas ?? []).some((f) => !f.tipo || f.tipo.startsWith('image/'));
    if (!codigo || isProjetoItem(codigo) || !temFoto) { if (codigo && temFoto) r.ignorados.push(codigo); continue; }
    if (vistos.has(codigo)) continue;
    vistos.add(codigo);

    try {
      const existente = await buscarItemAtivoCatalogo(codigo);
      if (existente?.imagem_path) { r.jaTinham.push(codigo); continue; }

      let fotoArquivo: File;
      const nova = item.fotosNovas?.[0];
      if (nova) {
        fotoArquivo = nova.original ?? new File([nova.blob], nova.name, { type: nova.mimeType || 'image/jpeg' });
      } else {
        const gravada = (item.fotosGravadas ?? []).find((f) => !f.tipo || f.tipo.startsWith('image/'))!;
        const urls = await assinarEvidencias([gravada.path]);
        const url = urls[gravada.path];
        if (!url) throw new Error('Foto do recebimento indisponível.');
        fotoArquivo = await fotoRecebimentoComoArquivo({ url, nome: gravada.nome, path: gravada.path });
      }

      await salvarItemCatalogo({
        codigo_sap: codigo,
        descricao: item.descricao || codigo,
        umb: item.unidade ?? undefined,
        fotoArquivo,
      }, user);
      r.cadastrados.push(codigo);
    } catch (err: any) {
      r.falhas.push({ material: codigo, motivo: err?.message || 'Falha ao cadastrar no catálogo.' });
    }
  }
  return r;
}

/**
 * Cadastra (ou atualiza) o item no catálogo usando a foto do recebimento.
 * Se o item já tinha foto, ela é substituída — quem chama confirma antes.
 */
export async function usarFotoRecebimentoNoCatalogo(
  entrada: {
    foto: Pick<FotoRecebimentoMaterial, 'url' | 'nome' | 'path'>;
    codigoSap: string;
    descricao: string;
    unidade?: string | null;
  },
  user: Profile,
): Promise<CatalogoItem> {
  const fotoArquivo = await fotoRecebimentoComoArquivo(entrada.foto);
  return salvarItemCatalogo({
    codigo_sap: entrada.codigoSap,
    descricao: entrada.descricao,
    umb: entrada.unidade ?? undefined,
    fotoArquivo,
  }, user);
}
