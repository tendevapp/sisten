/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Geral › Pendências › Retiradas sem saldo — visão "Por PO": quais pedidos
 * ainda precisam da NF lançada para as retiradas sem saldo darem baixa.
 *
 * A retirada (RSS) não guarda o pedido, só o material. Para cada item que o
 * saldo da ZL0024 ainda não cobre, os POs abertos do material vêm de
 * `alm_situacao_material` (`pendenciaNfDoMaterial`: os que chegaram sem MIGO
 * primeiro, depois pela previsão de entrega). A quantidade retirada consome o
 * pendente de cada PO nessa ordem, das retiradas mais antigas para as mais
 * novas. O que sobra:
 *  - PO já entregue há pouco (entrada a partir de 30 dias antes da retirada):
 *    a NF entrou e o saldo não está lá — foi consumido (ex.: baixa direta 221
 *    no SAP) ou a MIGO não foi para depósito. Não é falta de NF: é
 *    regularizar a retirada;
 *  - RM aberta sem pedido;
 *  - nada (sem PO nem RM).
 *
 * Módulo puro.
 */

import { normalizeCode } from './almoxarifado';
import type { PendenciaNfMaterial, SaidaSap } from './relatorioSolExtra';
import type { SolExtra } from './solicitacaoExtraApi';

/** Item de retirada que a ZL0024 ainda não cobre. */
export interface ItemAguardandoNf {
  registroId: string;
  codigo: string | null;
  data: string;
  material: string;
  descricao: string;
  unidade: string;
  quantidade: number;
}

export interface LinhaPo {
  /** `pedido/item` do PO (vazio nos grupos sem PO). */
  itemPedido: string;
  material: string;
  descricao: string;
  unidade: string;
  /** Quantidade das retiradas que este PO cobre. */
  quantidade: number;
  /** Pendente no PO (ZL0132) — o que a NF ainda vai trazer. */
  pendentePo: number | null;
  /** Códigos RSS das retiradas atendidas por esta linha. */
  retiradas: { id: string; codigo: string | null }[];
  /** Grupo `po_entregue`: entrada (MIGO) do PO e a última saída do material no SAP. */
  entradaEm?: string | null;
  saidaSap?: SaidaSap | null;
}

export type TipoGrupoPo = 'po' | 'po_entregue' | 'rm_sem_po' | 'sem_po';

/** Dias antes da retirada em que uma entrada do PO ainda conta como a compra dela. */
export const JANELA_ENTREGA_DIAS = 30;

function menosDias(iso: string, dias: number): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d) - dias * 86_400_000);
  return t.toISOString().slice(0, 10);
}

export interface GrupoPo {
  chave: string;
  tipo: TipoGrupoPo;
  /** Número do PO (sem o item) — vazio nos grupos sem PO. */
  pedido: string;
  fornecedor: string | null;
  /** Previsão de entrega mais próxima entre os itens. */
  remessaPrevista: string | null;
  /** Algum item já chegou fisicamente e só falta a MIGO. */
  chegouSemMigo: boolean;
  /** RMs abertas (grupo `rm_sem_po`). */
  rms: string[];
  /** Data da retirada mais antiga que espera este PO. */
  desde: string;
  linhas: LinhaPo[];
  /** Retiradas distintas que esperam o PO. */
  totalRetiradas: number;
}

/** Itens das retiradas pendentes que o saldo ainda não cobre (`cobertura` da ZL0024). */
export function itensAguardandoNf(
  registros: Pick<SolExtra, 'id' | 'codigo' | 'data' | 'itens'>[],
  cobertura: ReadonlyMap<string, boolean[]> | null,
): ItemAguardandoNf[] {
  const out: ItemAguardandoNf[] = [];
  for (const r of registros) {
    const cobertos = cobertura?.get(r.id);
    r.itens.forEach((it, i) => {
      if (cobertos?.[i]) return;
      const quantidade = Number(it.quantidade) || 0;
      if (!it.material || quantidade <= 0) return;
      out.push({
        registroId: r.id, codigo: r.codigo, data: r.data,
        material: normalizeCode(it.material), descricao: it.descricao, unidade: it.unidade, quantidade,
      });
    });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || (a.codigo ?? '').localeCompare(b.codigo ?? ''));
}

const numeroPedido = (itemPedido: string) => itemPedido.split('/')[0];

export function agruparPorPo(
  itens: ItemAguardandoNf[],
  pendencias: ReadonlyMap<string, PendenciaNfMaterial>,
): GrupoPo[] {
  const grupos = new Map<string, GrupoPo>();
  // Pendente que ainda resta em cada PO/item, consumido pelas retiradas mais antigas.
  const restante = new Map<string, number>();

  const grupo = (chave: string, base: Omit<GrupoPo, 'linhas' | 'totalRetiradas' | 'desde' | 'chave'>, data: string) => {
    let g = grupos.get(chave);
    if (!g) {
      g = { ...base, chave, desde: data, linhas: [], totalRetiradas: 0 };
      grupos.set(chave, g);
    }
    if (data < g.desde) g.desde = data;
    return g;
  };
  const somar = (
    g: GrupoPo, it: ItemAguardandoNf, itemPedido: string, quantidade: number, pendentePo: number | null,
    extra: Pick<LinhaPo, 'entradaEm' | 'saidaSap'> = {},
  ) => {
    let linha = g.linhas.find(l => l.itemPedido === itemPedido && l.material === it.material);
    if (!linha) {
      linha = { itemPedido, material: it.material, descricao: it.descricao, unidade: it.unidade, quantidade: 0, pendentePo, retiradas: [], ...extra };
      g.linhas.push(linha);
    }
    linha.quantidade += quantidade;
    if (!linha.retiradas.some(r => r.id === it.registroId)) linha.retiradas.push({ id: it.registroId, codigo: it.codigo });
  };

  for (const it of itens) {
    const p = pendencias.get(it.material);
    let falta = it.quantidade;
    for (const po of p?.pedidos ?? []) {
      if (falta <= 0) break;
      const disponivel = restante.get(po.pedido) ?? po.quantidadePendente;
      if (disponivel <= 0) continue;
      const usa = Math.min(falta, disponivel);
      restante.set(po.pedido, disponivel - usa);
      falta -= usa;
      const pedido = numeroPedido(po.pedido);
      const g = grupo(`po:${pedido}`, {
        tipo: 'po', pedido, fornecedor: po.fornecedor, remessaPrevista: po.remessaPrevista,
        chegouSemMigo: po.chegouSemMigo, rms: [],
      }, it.data);
      if (!g.fornecedor && po.fornecedor) g.fornecedor = po.fornecedor;
      if (po.remessaPrevista && (!g.remessaPrevista || po.remessaPrevista < g.remessaPrevista)) g.remessaPrevista = po.remessaPrevista;
      g.chegouSemMigo ||= po.chegouSemMigo;
      somar(g, it, po.pedido, usa, po.quantidadePendente);
    }
    if (falta <= 0) continue;
    // Sobra sem PO aberto que a cubra.
    const entregue = (p?.entregues ?? []).find(e => e.entradaEm && e.entradaEm >= menosDias(it.data, JANELA_ENTREGA_DIAS));
    if (entregue) {
      const g = grupo('po_entregue', { tipo: 'po_entregue', pedido: '', fornecedor: null, remessaPrevista: null, chegouSemMigo: false, rms: [] }, it.data);
      somar(g, it, entregue.pedido, falta, null, { entradaEm: entregue.entradaEm, saidaSap: p?.ultimaSaida ?? null });
    } else if (p?.rmsSemPedido.length) {
      const g = grupo('rm_sem_po', { tipo: 'rm_sem_po', pedido: '', fornecedor: null, remessaPrevista: null, chegouSemMigo: false, rms: [] }, it.data);
      for (const rm of p.rmsSemPedido) if (!g.rms.includes(rm)) g.rms.push(rm);
      somar(g, it, '', falta, null);
    } else {
      const g = grupo('sem_po', { tipo: 'sem_po', pedido: '', fornecedor: null, remessaPrevista: null, chegouSemMigo: false, rms: [] }, it.data);
      somar(g, it, '', falta, null);
    }
  }

  const ordemTipo: Record<TipoGrupoPo, number> = { po: 0, po_entregue: 1, rm_sem_po: 2, sem_po: 3 };
  return [...grupos.values()]
    .map(g => ({
      ...g,
      linhas: g.linhas.sort((a, b) => a.itemPedido.localeCompare(b.itemPedido, 'pt-BR', { numeric: true }) || a.material.localeCompare(b.material)),
      totalRetiradas: new Set(g.linhas.flatMap(l => l.retiradas.map(r => r.id))).size,
    }))
    .sort((a, b) =>
      ordemTipo[a.tipo] - ordemTipo[b.tipo]
      || Number(b.chegouSemMigo) - Number(a.chegouSemMigo)
      || a.desde.localeCompare(b.desde)
      || a.pedido.localeCompare(b.pedido));
}

/** Situação do PO para o selo: chegou sem MIGO, atrasado (previsão passou) ou aguardando entrega. */
export type SituacaoGrupoPo = 'chegou' | 'atrasado' | 'aguardando';

export function situacaoGrupoPo(g: Pick<GrupoPo, 'chegouSemMigo' | 'remessaPrevista'>, hojeISO: string): SituacaoGrupoPo {
  if (g.chegouSemMigo) return 'chegou';
  if (g.remessaPrevista && g.remessaPrevista < hojeISO) return 'atrasado';
  return 'aguardando';
}

/** Lista para colar no e-mail/WhatsApp: um PO por linha, com fornecedor. */
export function textoListaPos(grupos: GrupoPo[]): string {
  return grupos
    .filter(g => g.tipo === 'po')
    .map(g => [g.pedido, g.fornecedor, `${g.linhas.length} ${g.linhas.length === 1 ? 'item' : 'itens'}`, g.chegouSemMigo ? 'chegou, falta MIGO' : null]
      .filter(Boolean).join(' — '))
    .join('\n');
}
