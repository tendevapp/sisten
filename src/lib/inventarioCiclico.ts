/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Inventário Cíclico (FRM.ALM-0015) — regras puras.
 *
 * Seleção dos itens a contar pela curva 80/20 e a montagem das linhas de
 * resultado usadas na tela, na planilha e no PDF. A comparação com a ZL0024
 * NÃO mora aqui: é feita no banco (`alm_inv_registrar_contagem`) para a
 * contagem continuar cega — o aparelho só recebe o saldo quando o item
 * encerra.
 */

import { normalizeCode } from './almoxarifado';
import type { EstoqueGiro, EstoqueItem } from '../types';

export const PREFIXO_INVENTARIO = 'INV';
export const FORM_CODIGO_INVENTARIO = 'FRM.ALM-0015';

/** Espelha `alm_inv_max_contagens()` do banco. */
export const MAX_CONTAGENS = 3;

export type StatusItemInventario = 'pendente' | 'aguardando_decisao' | 'conferido' | 'divergente';

export const ROTULO_STATUS_ITEM: Record<StatusItemInventario, string> = {
  pendente: 'A contar',
  aguardando_decisao: 'Divergente — recontar?',
  conferido: 'Conferido',
  divergente: 'Divergente',
};

/**
 * Base da curva 80/20:
 * - `consumo`: valor consumido na janela da MB51 (`vw_estoque_giro`) — os
 *   itens que mais giram, que é o que o inventário cíclico costuma cobrir;
 * - `valor`: valor imobilizado na ZL0024.
 */
export type CriterioCurva = 'consumo' | 'valor';

export const ROTULO_CRITERIO: Record<CriterioCurva, string> = {
  consumo: 'Consumo (MB51)',
  valor: 'Valor em estoque',
};

export type ClasseCurva = 'A' | 'B' | 'C';

export interface CandidatoInventario {
  chave: string;
  material: string;
  descricao: string;
  deposito: string;
  unidade: string;
  classe: ClasseCurva;
  /** Posição na curva, 1 = maior. */
  posicao: number;
}

export function chaveItem(material: string, deposito: string): string {
  return `${normalizeCode(material)}|${String(deposito).trim().padStart(4, '0')}`;
}

/**
 * Candidatos a contagem: uma linha por material × depósito da ZL0024 nos
 * depósitos escolhidos (lista vazia = todos), classificados na curva.
 *
 * A classe é calculada sobre o conjunto filtrado — "os 80/20 do depósito
 * 0001" é justamente o que o almoxarife quer contar. Item entra na classe A
 * enquanto o acumulado ANTES dele não passou de 80%, então sempre há ao
 * menos um A quando existe valor; sem valor nenhum (score 0) é C.
 */
export function montarCandidatos(
  estoque: EstoqueItem[],
  giro: EstoqueGiro[],
  criterio: CriterioCurva,
  depositos: string[],
): CandidatoInventario[] {
  const filtro = new Set(depositos.map((d) => d.trim().padStart(4, '0')));
  const consumo = new Map<string, number>();
  giro.forEach((g) => consumo.set(normalizeCode(g.material), Number(g.valor_consumido) || 0));

  const porChave = new Map<string, { material: string; descricao: string; deposito: string; unidade: string; score: number }>();
  estoque.forEach((e) => {
    // O material vai à RPC como está na ZL0024 (ela compara texto exato);
    // o código normalizado só casa com o giro e forma a chave.
    const material = String(e.material ?? '').trim();
    const deposito = String(e.deposito ?? '').trim().padStart(4, '0');
    if (!material || !e.deposito) return;
    if (filtro.size > 0 && !filtro.has(deposito)) return;
    const chave = chaveItem(material, deposito);
    const atual = porChave.get(chave);
    const valorLinha = Number(e.valor_total) || 0;
    if (atual) {
      if (criterio === 'valor') atual.score += valorLinha;
      return;
    }
    porChave.set(chave, {
      material,
      descricao: e.txt_breve_material || '',
      deposito,
      unidade: e.umb || '',
      score: criterio === 'valor' ? valorLinha : consumo.get(normalizeCode(material)) || 0,
    });
  });

  const lista = Array.from(porChave.entries()).sort(
    (a, b) => b[1].score - a[1].score || a[1].material.localeCompare(b[1].material),
  );
  const total = lista.reduce((s, [, v]) => s + Math.max(v.score, 0), 0);
  let acumulado = 0;
  return lista.map(([chave, v], i) => {
    const antes = total > 0 ? acumulado / total : 1;
    acumulado += Math.max(v.score, 0);
    const classe: ClasseCurva = v.score <= 0 || total <= 0 ? 'C' : antes < 0.8 ? 'A' : antes < 0.95 ? 'B' : 'C';
    return {
      chave,
      material: v.material,
      descricao: v.descricao,
      deposito: v.deposito,
      unidade: v.unidade,
      classe,
      posicao: i + 1,
    };
  });
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export interface ContagemInventario {
  id: string;
  numero: number;
  quantidade: number;
  divergente: boolean;
  endereco_encontrado: string | null;
  validade: string | null;
  observacao: string | null;
  contado_por_nome: string | null;
  created_at: string;
}

export interface ItemInventario {
  id: string;
  ordem: number;
  material: string;
  descricao: string | null;
  unidade: string | null;
  deposito: string;
  classe: string | null;
  status: StatusItemInventario;
  saldo_sistema: number | null;
  qtd_final: number | null;
  diferenca: number | null;
  alerta: string | null;
  encerrado_em: string | null;
  contagens: ContagemInventario[];
}

export function itemEncerrado(item: Pick<ItemInventario, 'status'>): boolean {
  return item.status === 'conferido' || item.status === 'divergente';
}

/** Próxima contagem que o item aceita, ou `null` se encerrado/esgotado. */
export function proximaContagem(item: ItemInventario): number | null {
  if (itemEncerrado(item)) return null;
  const n = item.contagens.length + 1;
  return n > MAX_CONTAGENS ? null : n;
}

export interface ResumoInventario {
  total: number;
  pendentes: number;
  aguardando: number;
  conferidos: number;
  divergentes: number;
  /** Contados = já têm ao menos uma contagem. */
  contados: number;
  /** % de itens encerrados que bateram com a ZL0024 (acuracidade). */
  acuracidade: number | null;
}

export function resumirInventario(itens: ItemInventario[]): ResumoInventario {
  const r = { total: itens.length, pendentes: 0, aguardando: 0, conferidos: 0, divergentes: 0, contados: 0 };
  itens.forEach((i) => {
    if (i.status === 'pendente') r.pendentes += 1;
    else if (i.status === 'aguardando_decisao') r.aguardando += 1;
    else if (i.status === 'conferido') r.conferidos += 1;
    else r.divergentes += 1;
    if (i.contagens.length > 0) r.contados += 1;
  });
  const encerrados = r.conferidos + r.divergentes;
  return { ...r, acuracidade: encerrados > 0 ? (r.conferidos / encerrados) * 100 : null };
}

/** Uma linha do resultado — mesma forma para planilha e PDF. */
export interface LinhaResultado {
  item: number;
  material: string;
  descricao: string;
  deposito: string;
  unidade: string;
  classe: string;
  contagens: (number | null)[];
  /** Mesma posição de `contagens`: `true` quando aquela contagem não bateu com a ZL0024. */
  contagensDivergentes: boolean[];
  /** Item encerrado como divergente. */
  divergente: boolean;
  qtdFinal: number | null;
  /** Só com o item encerrado — antes disso a contagem é cega. */
  saldo: number | null;
  diferenca: number | null;
  status: string;
  situacao: StatusItemInventario;
  endereco: string;
  validade: string;
  alerta: string;
}

export function linhasResultado(itens: ItemInventario[]): LinhaResultado[] {
  return [...itens]
    .sort((a, b) => a.ordem - b.ordem)
    .map((i, idx) => {
      const cont = [...i.contagens].sort((a, b) => a.numero - b.numero);
      const encerrado = itemEncerrado(i);
      const ultimaComEndereco = [...cont].reverse().find((c) => c.endereco_encontrado);
      const ultimaComValidade = [...cont].reverse().find((c) => c.validade);
      return {
        item: idx + 1,
        material: i.material,
        descricao: i.descricao || '',
        deposito: i.deposito,
        unidade: i.unidade || '',
        classe: i.classe || '',
        contagens: Array.from({ length: MAX_CONTAGENS }, (_, n) => cont.find((c) => c.numero === n + 1)?.quantidade ?? null),
        contagensDivergentes: Array.from({ length: MAX_CONTAGENS }, (_, n) => !!cont.find((c) => c.numero === n + 1)?.divergente),
        divergente: i.status === 'divergente',
        qtdFinal: encerrado ? i.qtd_final : null,
        saldo: encerrado ? i.saldo_sistema : null,
        diferenca: encerrado ? i.diferenca : null,
        status: ROTULO_STATUS_ITEM[i.status],
        situacao: i.status,
        endereco: ultimaComEndereco?.endereco_encontrado || '',
        validade: ultimaComValidade?.validade || '',
        alerta: i.alerta || '',
      };
    });
}

/** `inventario_INV-240926-01.xlsx` */
export function nomeArquivoInventario(codigo: string, ext: 'xlsx' | 'pdf'): string {
  return `inventario_${codigo}.${ext}`;
}

// ---------------------------------------------------------------------------
// Histórico e cobertura
// ---------------------------------------------------------------------------

export interface HistoricoItem {
  /** Data (ISO) do inventário mais recente em que o item foi contado. */
  ultimaData: string;
  /** Vezes em que o item foi contado (inventários distintos). */
  vezes: number;
  /** Já terminou divergente em algum inventário. */
  jaDivergiu: boolean;
}

/** Dias corridos entre duas datas ISO (AAAA-MM-DD), sem passar por fuso. */
export function diasEntre(deISO: string, ateISO: string): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(ateISO) - utc(deISO)) / 86_400_000);
}

/** "hoje", "ontem", "há 12 dias". */
export function rotuloDias(dias: number): string {
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

/**
 * Histórico por material × depósito a partir dos inventários gravados. Só
 * conta item que recebeu ao menos uma contagem — item só listado não foi
 * inventariado.
 */
export function historicoPorItem(
  inventarios: { data: string; itens: Pick<ItemInventario, 'material' | 'deposito' | 'status' | 'contagens'>[] }[],
): Map<string, HistoricoItem> {
  const mapa = new Map<string, HistoricoItem>();
  inventarios.forEach((inv) => {
    inv.itens.forEach((i) => {
      if (i.contagens.length === 0) return;
      const chave = chaveItem(i.material, i.deposito);
      const atual = mapa.get(chave);
      const divergiu = i.status === 'divergente';
      if (!atual) {
        mapa.set(chave, { ultimaData: inv.data, vezes: 1, jaDivergiu: divergiu });
      } else {
        atual.vezes += 1;
        atual.jaDivergiu ||= divergiu;
        if (inv.data > atual.ultimaData) atual.ultimaData = inv.data;
      }
    });
  });
  return mapa;
}

export interface CoberturaInventario {
  /** Itens (material × depósito) na ZL0024. */
  total: number;
  /** Desses, quantos já foram contados ao menos uma vez. */
  inventariados: number;
  pct: number;
}

/**
 * Quanto do almoxarifado já passou por inventário. Base = posição atual da
 * ZL0024 (material × depósito); `depositos` vazio = todos.
 */
export function coberturaInventario(
  estoque: EstoqueItem[],
  historico: Map<string, HistoricoItem>,
  depositos: string[] = [],
): CoberturaInventario {
  const filtro = new Set(depositos.map((d) => d.trim().padStart(4, '0')));
  const chaves = new Set<string>();
  estoque.forEach((e) => {
    if (!e.material || !e.deposito) return;
    const dep = String(e.deposito).trim().padStart(4, '0');
    if (filtro.size > 0 && !filtro.has(dep)) return;
    chaves.add(chaveItem(String(e.material), dep));
  });
  let inventariados = 0;
  chaves.forEach((c) => { if (historico.has(c)) inventariados += 1; });
  const total = chaves.size;
  return { total, inventariados, pct: total > 0 ? (inventariados / total) * 100 : 0 };
}
