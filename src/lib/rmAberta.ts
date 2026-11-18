/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Solicitação Extraordinária (FRM.ALM-0013): só sai material com RM aberta —
 * a extraordinária é a saída do que ainda não tem saldo porque a NF não foi
 * lançada, então o material tem de estar sendo comprado.
 *
 * "RM aberta" vem da RPC `alm_rm_abertas` (migration 20261118190000; mesma
 * regra da situação do material do Ctrl+K). O banco recusa o item sem RM
 * (gatilho `trg_alm_sol_extra_exige_rm`); aqui a busca mostra primeiro o que
 * tem RM e a tela avisa antes de enviar.
 *
 * Módulo puro (a leitura da RPC fica em `rmAbertaApi.ts`).
 */

import { normalizeCode } from './almoxarifado';
import { buscarMateriais, type MaterialDisponivel } from './requisicaoBalcao';

/** Linha da RPC `alm_rm_abertas`. */
export interface LinhaRmAberta {
  material: string;
  descricao: string | null;
  unidade: string | null;
  rm: string;
  pedido: string | null;
  situacao: 'sem_pedido' | 'em_pedido';
  data_solicitacao: string | null;
}

export interface RmAbertaMaterial {
  material: string;
  descricao: string;
  unidade: string;
  /** `requisição/item`, mais recentes primeiro. */
  rms: string[];
  /** POs das RMs que já viraram pedido (com quantidade a entregar). */
  pedidos: string[];
  /** Alguma RM ainda sem pedido. */
  semPedido: boolean;
}

export const MENSAGEM_SEM_RM =
  'A solicitação extraordinária é só para material que está sendo comprado — abra a RM antes da retirada.';

export function indexarRmAbertas(linhas: LinhaRmAberta[]): Map<string, RmAbertaMaterial> {
  const mapa = new Map<string, RmAbertaMaterial>();
  for (const l of linhas) {
    const k = normalizeCode(l.material);
    if (!k) continue;
    const atual = mapa.get(k) ?? { material: k, descricao: '', unidade: '', rms: [], pedidos: [], semPedido: false };
    if (!atual.descricao && l.descricao) atual.descricao = l.descricao.trim();
    if (!atual.unidade && l.unidade) atual.unidade = l.unidade.trim();
    if (l.rm && !atual.rms.includes(l.rm)) atual.rms.push(l.rm);
    if (l.pedido && !atual.pedidos.includes(l.pedido)) atual.pedidos.push(l.pedido);
    if (l.situacao === 'sem_pedido') atual.semPedido = true;
    mapa.set(k, atual);
  }
  return mapa;
}

/** "RM 1200095365/10 · PO 4100474328" (+N quando há mais de uma). */
export function rotuloRmAberta(r: RmAbertaMaterial): string {
  const mais = (lista: string[]) => (lista.length > 1 ? ` +${lista.length - 1}` : '');
  const rm = r.rms.length ? `RM ${r.rms[0]}${mais(r.rms)}` : 'RM aberta';
  if (r.pedidos.length) return `${rm} · PO ${r.pedidos[0]}${mais(r.pedidos)}`;
  return `${rm} · sem pedido`;
}

export interface ResultadoBuscaRm {
  item: MaterialDisponivel;
  rm: RmAbertaMaterial | null;
}

/**
 * Busca no Cadastro de Itens + nos materiais com RM aberta que não estão no
 * cadastro; o que tem RM aberta vem primeiro (mantendo a ordem da busca dentro
 * de cada grupo). Sem a lista de RMs (`rms` nulo), não reordena.
 */
export function buscarComRmAberta(
  catalogo: MaterialDisponivel[],
  rms: ReadonlyMap<string, RmAbertaMaterial> | null,
  termo: string,
  limite = 12,
): ResultadoBuscaRm[] {
  const noCatalogo = new Set(catalogo.map(m => normalizeCode(m.material)));
  const extras: MaterialDisponivel[] = [];
  for (const r of rms?.values() ?? []) {
    if (!noCatalogo.has(r.material)) extras.push({ material: r.material, descricao: r.descricao || `Material ${r.material}`, unidade: r.unidade || 'UN', saldo: 0 });
  }
  const achados = buscarMateriais(extras.length ? [...catalogo, ...extras] : catalogo, termo, Number.MAX_SAFE_INTEGER)
    .map(item => ({ item, rm: rms?.get(normalizeCode(item.material)) ?? null }));
  if (rms) achados.sort((a, b) => Number(!a.rm) - Number(!b.rm));
  return achados.slice(0, limite);
}

/**
 * Materiais sem RM aberta, sem repetir. Os que o registro já tinha
 * (`jaGravados`) passam — a regra vale para item novo, como no banco.
 */
export function materiaisSemRmAberta(
  materiais: string[],
  rms: ReadonlyMap<string, RmAbertaMaterial>,
  jaGravados: string[] = [],
): string[] {
  const gravados = new Set(jaGravados.map(normalizeCode));
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const m of materiais) {
    const k = normalizeCode(m);
    if (!k || vistos.has(k) || gravados.has(k) || rms.has(k)) continue;
    vistos.add(k);
    out.push(m.trim());
  }
  return out;
}
