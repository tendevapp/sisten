/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Carga do Gemba. Só lê: estoque da ZL0024 (cache do aparelho), última posição
 * guardada de cada material e o cadastro de itens. Sem rede, o cliente Supabase
 * devolve a última cópia guardada (`fetchOffline`).
 */

import { localDb } from '../db/localDb';
import { carregarPosicoesMaterial, listarItensCatalogo } from './almoxCatalogoApi';
import { montarIndiceGemba, type IndiceGemba } from './gembaIndice';

export async function carregarIndiceGemba(forcar = false): Promise<IndiceGemba> {
  const [estoque, posicoes, catalogo] = await Promise.all([
    localDb.fetchEstoque(forcar),
    carregarPosicoesMaterial(),
    listarItensCatalogo(),
  ]);
  return montarIndiceGemba(estoque, posicoes, catalogo);
}
