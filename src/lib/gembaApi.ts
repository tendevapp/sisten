/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Carga do Gemba. Só lê: estoque da ZL0024 (cache do aparelho), última posição
 * guardada de cada material, o cadastro de itens e as peças da BOM com
 * localização (com o saldo do Projetos). Sem rede, o cliente Supabase devolve a
 * última cópia guardada (`fetchOffline`).
 */

import { localDb } from '../db/localDb';
import { supabase } from '../db/supabaseClient';
import { carregarPosicoesMaterial, listarItensCatalogo } from './almoxCatalogoApi';
import { TABELA_CADASTRO_BOM } from './almoxBomCadastroApi';
import { buscarTudo } from './buscarTudo';
import { montarIndiceGemba, type IndiceGemba, type PecaBomGemba } from './gembaIndice';

interface CadastroBomGemba {
  projeto: string;
  part_number: string;
  part_number_norm: string;
  posicao_estoque: string | null;
  etiqueta_descricao: string | null;
  imagem_path: string | null;
}

interface SaldoProjetoGemba {
  projeto: string;
  part_number_norm: string;
  cod_sap: string | null;
  descricao: string | null;
  uom: string | null;
  saldo: number | string | null;
}

/** Lote do `in(...)`: mantém a URL do PostgREST curta. */
const LOTE_IN = 150;

/** Peças da BOM com localização no Cadastro de Itens. Falha aqui não derruba o mapa. */
export async function carregarPecasBomGemba(): Promise<PecaBomGemba[]> {
  if (!supabase) return [];
  try {
    const cadastros = await buscarTudo<CadastroBomGemba>((de, ate) =>
      (supabase!.from as any)(TABELA_CADASTRO_BOM)
        .select('projeto, part_number, part_number_norm, posicao_estoque, etiqueta_descricao, imagem_path')
        .not('posicao_estoque', 'is', null)
        .neq('posicao_estoque', '')
        .order('projeto')
        .order('part_number_norm')
        .range(de, ate));
    if (cadastros.length === 0) return [];

    const saldos = new Map<string, SaldoProjetoGemba>();
    const chaves = [...new Set(cadastros.map(c => c.part_number_norm))];
    for (let i = 0; i < chaves.length; i += LOTE_IN) {
      const { data, error } = await (supabase.from as any)('vw_proj_saldo_almox')
        .select('projeto, part_number_norm, cod_sap, descricao, uom, saldo')
        .in('part_number_norm', chaves.slice(i, i + LOTE_IN));
      if (error) throw new Error(error.message);
      for (const s of (data ?? []) as SaldoProjetoGemba[]) saldos.set(`${s.projeto}|${s.part_number_norm}`, s);
    }

    return cadastros.map((c): PecaBomGemba => {
      const s = saldos.get(`${c.projeto}|${c.part_number_norm}`);
      return {
        partNumber: c.part_number || c.part_number_norm,
        codSap: s?.cod_sap?.trim() || null,
        descricao: c.etiqueta_descricao?.trim() || s?.descricao?.trim() || c.part_number,
        umb: s?.uom?.trim() || '',
        posicao: c.posicao_estoque ?? '',
        saldo: s?.saldo != null ? Number(s.saldo) || 0 : null,
        imagemPath: c.imagem_path,
      };
    });
  } catch (err) {
    console.warn('[gembaApi] Falha ao carregar as peças da BOM com localização:', err);
    return [];
  }
}

export async function carregarIndiceGemba(forcar = false): Promise<IndiceGemba> {
  const [estoque, posicoes, catalogo, pecasBom] = await Promise.all([
    localDb.fetchEstoque(forcar),
    carregarPosicoesMaterial(),
    listarItensCatalogo(),
    carregarPecasBomGemba(),
  ]);
  return montarIndiceGemba(estoque, posicoes, catalogo, pecasBom);
}
