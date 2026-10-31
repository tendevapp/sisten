/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Contagem avulsa de um material no Inventário Cíclico — o caminho do QR da
 * etiqueta (cabeçalho) e do botão "Contar" do Cadastro de Itens.
 *
 * O item não precisa estar num inventário planejado: se já há contagem em
 * aberto dele (de qualquer inventário), vai nela; senão entra no inventário
 * "avulso" do dia da pessoa, que é criado na primeira leitura. Assim cada
 * contagem fica num formulário INV de verdade, com quem contou e quando, e
 * passa pela mesma preparação/controle de movimentação da contagem normal.
 */

import type { EstoqueGiro, EstoqueItem, Profile } from '../types';
import { localDb } from '../db/localDb';
import { normalizeCode } from './almoxarifado';
import { chaveItem, itemEncerrado, montarCandidatos, type CriterioCurva, type ItemInventario } from './inventarioCiclico';
import { adicionarItensInventario, criarInventario, listarInventarios, type InventarioRow } from './inventarioCiclicoApi';
import { podeEditarFormulario } from './permissoesFormularios';
import { hojeISO } from './recebimentoAlmox';

/**
 * Critério gravado no inventário aberto pela contagem avulsa. As contagens do
 * dia da mesma pessoa vão para o mesmo inventário, em vez de abrir um por item.
 * O texto fica como está: inventários antigos já foram gravados com ele.
 */
export const CRITERIO_QR = 'Leitura de QR da etiqueta';

// Depósitos e critério da última seleção — conveniência do aparelho.
const CHAVE_PREFERENCIAS = 'sisten_inventario_ciclico_selecao';
export interface PreferenciasInventario { depositos: string[]; criterio: CriterioCurva }

export function lerPreferenciasInventario(): PreferenciasInventario {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_PREFERENCIAS) || '{}');
    return {
      depositos: Array.isArray(p.depositos) ? p.depositos : ['0001', '0002'],
      criterio: p.criterio === 'valor' ? 'valor' : 'consumo',
    };
  } catch {
    return { depositos: ['0001', '0002'], criterio: 'consumo' };
  }
}

export function gravarPreferenciasInventario(p: PreferenciasInventario): void {
  try { localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(p)); } catch { /* sem storage: só não lembra */ }
}

export type ResultadoPreparoContagem =
  | { tipo: 'pronto'; inventario: InventarioRow; item: ItemInventario; inventarios: InventarioRow[] }
  /** O item está em contagem aberta no inventário de outra pessoa. */
  | { tipo: 'de_outro'; inventario: InventarioRow; inventarios: InventarioRow[] }
  /** Material sem linha na ZL0024 — não há saldo para comparar. */
  | { tipo: 'fora_zl0024' }
  /** Gravação ficou na fila do aparelho (sem rede). */
  | { tipo: 'offline'; inventarios: InventarioRow[] };

/**
 * Deixa o material pronto para contar e diz em qual item de qual inventário.
 * Depósitos: os da última seleção do aparelho; se o material não está em
 * nenhum deles, todos em que tem saldo.
 */
export async function prepararContagemDoMaterial(
  codigo: string,
  user: Profile,
  estoque: EstoqueItem[],
  giro: EstoqueGiro[],
): Promise<ResultadoPreparoContagem> {
  const pref = lerPreferenciasInventario();
  const alvo = normalizeCode(codigo);
  const doMaterialEm = (base: EstoqueItem[]) => montarCandidatos(base, giro, pref.criterio, [])
    .filter((c) => normalizeCode(c.material) === alvo);
  let doMaterial = doMaterialEm(estoque);
  // Cópia do aparelho pode ser de antes da última importação: confere no servidor antes de recusar.
  if (doMaterial.length === 0) doMaterial = doMaterialEm(await localDb.fetchEstoque(true));
  if (doMaterial.length === 0) return { tipo: 'fora_zl0024' };

  const preferidos = pref.depositos.map((d) => d.trim().padStart(4, '0'));
  const naPreferencia = doMaterial.filter((c) => preferidos.includes(c.deposito));
  const candidatos = naPreferencia.length > 0 ? naPreferencia : doMaterial;
  const chaves = new Set(candidatos.map((c) => c.chave));
  const doAlvo = (i: ItemInventario) => chaves.has(chaveItem(i.material, i.deposito));
  const aberto = (inv: InventarioRow) => inv.status === 'aberto';

  let lista = await listarInventarios();

  // 1) Já existe contagem em aberto deste item (de qualquer inventário): vai direto a ela.
  for (const inv of lista.filter(aberto)) {
    const item = inv.itens.find((i) => doAlvo(i) && !itemEncerrado(i));
    if (!item) continue;
    return inv.criado_por_id === user.id
      ? { tipo: 'pronto', inventario: inv, item, inventarios: lista }
      : { tipo: 'de_outro', inventario: inv, inventarios: lista };
  }

  // 2) Senão, entra no inventário avulso do dia desta pessoa (ou abre um).
  const hoje = hojeISO();
  const meu = lista.find((i) => aberto(i) && i.criterio === CRITERIO_QR && i.data === hoje && podeEditarFormulario(user, i));
  const itens = candidatos.map((c) => ({ material: c.material, deposito: c.deposito, classe: c.classe }));
  let inventarioId: string;
  if (meu) {
    const faltam = itens.filter((i) => !meu.itens.some((x) => chaveItem(x.material, x.deposito) === chaveItem(i.material, i.deposito)));
    if (faltam.length > 0) await adicionarItensInventario(meu.id, faltam);
    inventarioId = meu.id;
  } else {
    const r = await criarInventario({
      data: hoje,
      criterio: CRITERIO_QR,
      observacao: null,
      conferente_nome: user.name,
      criado_por_nome: user.name,
    }, itens);
    inventarioId = r.id;
  }

  lista = await listarInventarios();
  const inv = lista.find((i) => i.id === inventarioId);
  // Se já foi contado e encerrado hoje, devolve o resultado dele.
  const item = inv?.itens.find((i) => doAlvo(i) && !itemEncerrado(i)) ?? inv?.itens.find(doAlvo);
  if (!inv || !item) return { tipo: 'offline', inventarios: lista };
  if (inv.criado_por_id !== user.id) return { tipo: 'de_outro', inventario: inv, inventarios: lista };
  return { tipo: 'pronto', inventario: inv, item, inventarios: lista };
}
