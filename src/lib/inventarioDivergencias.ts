/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Inventário Cíclico — lista de divergências para recontar.
 *
 * Uma linha por item encerrado como divergente. "Atual" é a divergência que
 * ainda vale: o último resultado daquele material × depósito (em qualquer
 * inventário) é ela — se uma recontagem posterior conferiu, a antiga fica
 * como histórico. Item que já está em contagem aberta noutro inventário não
 * pode ir para uma nova recontagem, nem item que saiu da ZL0024 atual (o banco
 * só aceita no inventário material × depósito presente nela).
 */

import { chaveItem, itemEncerrado, type ItemInventario } from './inventarioCiclico';

/** O que a regra lê de cada inventário (a `InventarioRow` da API serve). */
export interface InventarioRowBase {
  id: string;
  codigo: string;
  data: string;
  status: 'aberto' | 'concluido';
  itens: ItemInventario[];
}

/** Critério gravado no inventário aberto a partir desta lista. */
export const CRITERIO_RECONTAGEM = 'Recontagem de divergências';

export interface LinhaDivergencia {
  chave: string;
  itemId: string;
  material: string;
  descricao: string;
  unidade: string;
  deposito: string;
  classe: string | null;
  inventarioId: string;
  inventarioCodigo: string;
  data: string;
  encerradoEm: string | null;
  contado: number | null;
  sistema: number | null;
  diferenca: number | null;
  contagens: number;
  contadoPor: string | null;
  causa: string | null;
  causaDetalhe: string | null;
  /** É o último resultado deste material × depósito. */
  atual: boolean;
  /** Código do inventário aberto em que o item já está para contar. */
  emRecontagem: string | null;
  /** Material × depósito está na ZL0024 atual (`null` = não informado). */
  naZl0024: boolean | null;
}

/** Pode ir para um inventário de recontagem. */
export function podeRecontar(l: LinhaDivergencia): boolean {
  return !l.emRecontagem && l.naZl0024 !== false;
}

/** Quando o resultado foi fechado — o encerramento, ou a data do inventário (histórico importado). */
function momento(item: ItemInventario, inv: InventarioRowBase): string {
  return item.encerrado_em ?? `${inv.data}T23:59:59`;
}

export function divergenciasDosInventarios(
  inventarios: InventarioRowBase[],
  /** Chaves (`chaveItem`) da ZL0024 atual; sem ela, `naZl0024` fica nulo. */
  chavesZl0024?: Set<string>,
): LinhaDivergencia[] {
  const ultimo = new Map<string, string>();
  const abertos = new Map<string, string>();
  for (const inv of inventarios) {
    for (const item of inv.itens) {
      const chave = chaveItem(item.material, item.deposito);
      if (itemEncerrado(item)) {
        const quando = momento(item, inv);
        if ((ultimo.get(chave) ?? '') < quando) ultimo.set(chave, quando);
      } else if (inv.status === 'aberto' && !abertos.has(chave)) {
        abertos.set(chave, inv.codigo);
      }
    }
  }

  const linhas: LinhaDivergencia[] = [];
  for (const inv of inventarios) {
    for (const item of inv.itens) {
      if (item.status !== 'divergente') continue;
      const chave = chaveItem(item.material, item.deposito);
      const quando = momento(item, inv);
      const ultimaContagem = item.contagens[item.contagens.length - 1];
      linhas.push({
        chave,
        itemId: item.id,
        material: item.material,
        descricao: item.descricao || '',
        unidade: item.unidade || '',
        deposito: item.deposito,
        classe: item.classe,
        inventarioId: inv.id,
        inventarioCodigo: inv.codigo,
        data: inv.data,
        encerradoEm: item.encerrado_em,
        contado: item.qtd_final,
        sistema: item.saldo_sistema,
        diferenca: item.diferenca,
        contagens: item.contagens.length,
        contadoPor: ultimaContagem?.contado_por_nome ?? null,
        causa: item.causa_encerramento ?? ultimaContagem?.causa ?? null,
        causaDetalhe: item.causa_encerramento_detalhe ?? ultimaContagem?.causa_detalhe ?? null,
        atual: ultimo.get(chave) === quando,
        emRecontagem: abertos.get(chave) ?? null,
        naZl0024: chavesZl0024 ? chavesZl0024.has(chave) : null,
      });
    }
  }
  // Mais recentes primeiro; dentro do mesmo inventário, a ordem dos itens.
  return linhas.sort((a, b) => (b.encerradoEm ?? b.data).localeCompare(a.encerradoEm ?? a.data));
}

/** Uma vez cada material × depósito, para não pôr o mesmo item duas vezes na recontagem. */
export function itensParaRecontagem(linhas: LinhaDivergencia[]): { material: string; deposito: string; classe: string | null }[] {
  const vistos = new Set<string>();
  const itens: { material: string; deposito: string; classe: string | null }[] = [];
  for (const l of linhas) {
    if (vistos.has(l.chave) || !podeRecontar(l)) continue;
    vistos.add(l.chave);
    itens.push({ material: l.material, deposito: l.deposito, classe: l.classe });
  }
  return itens;
}
