import { supabase } from '../db/supabaseClient';
import type { ControleEstoqueItem } from '../types';
import { calcularFaixaDoItem } from './controleEstoque';
import { normalizarLinhaControleEstoque } from './controleEstoqueApi';

/**
 * Situação de estoque do material para a Central de Compras: o comprador vê se
 * o item que vai comprar está zerado, abaixo do mínimo ou perto dele, e prioriza.
 *
 * Mesma faixa do Controle de Estoque (mínimo/máximo da planilha ou override):
 *  - ZERO: saldo de reposição ≤ 0 em material que já movimentou ou tem mínimo
 *    (compra direta que nunca passou pelo estoque não ganha tag);
 *  - CRITICO: saldo abaixo do mínimo;
 *  - ALERTA: saldo entre o mínimo e o máximo.
 */
export type TagEstoque = 'ZERO' | 'CRITICO' | 'ALERTA';

export interface SituacaoEstoqueMaterial {
  tag: TagEstoque | null;
  saldo: number;
  minimo: number | null;
  maximo: number | null;
  coberturaDias: number | null;
  umb: string | null;
}

export const ROTULO_TAG_ESTOQUE: Record<TagEstoque, string> = {
  ZERO: 'Estoque Zero',
  CRITICO: 'Estoque Crítico',
  ALERTA: 'Estoque Alerta',
};

/** Ordem de urgência, a mais grave primeiro. */
export const ORDEM_TAG_ESTOQUE: TagEstoque[] = ['ZERO', 'CRITICO', 'ALERTA'];

type ItemEstoque = Pick<ControleEstoqueItem,
  | 'saldo_reposicao' | 'consumo_total' | 'dias_uteis' | 'lead_time_dias' | 'intervalo_compra_dias'
  | 'preco_medio_sap' | 'quantidade_por_torre' | 'estoque_minimo_override' | 'estoque_maximo_override'
  | 'umb' | 'ultimo_movimento' | 'ultimo_movimento_geral'>;

export function calcularSituacaoEstoque(item: ItemEstoque): SituacaoEstoqueMaterial {
  const faixa = calcularFaixaDoItem(item as ControleEstoqueItem);
  const teveMovimento = !!(item.ultimo_movimento_geral ?? item.ultimo_movimento);
  let tag: TagEstoque | null = null;
  if (item.saldo_reposicao <= 0 && (teveMovimento || (faixa.estoqueMinimo ?? 0) > 0)) tag = 'ZERO';
  else if (faixa.status === 'CRITICO') tag = 'CRITICO';
  else if (faixa.status === 'ALERTA') tag = 'ALERTA';
  return {
    tag,
    saldo: item.saldo_reposicao,
    minimo: faixa.estoqueMinimo,
    maximo: faixa.estoqueMaximo,
    coberturaDias: faixa.coberturaDias,
    umb: item.umb,
  };
}

const chaveMaterial = (codigo: string | null | undefined): string => {
  const limpo = String(codigo ?? '').trim();
  return limpo.replace(/^0+/, '') || limpo;
};

const gravidade = (tag: TagEstoque | null) => (tag === null ? ORDEM_TAG_ESTOQUE.length : ORDEM_TAG_ESTOQUE.indexOf(tag));

/** Mais de um centro para o mesmo material: fica a situação mais grave. */
export function indexarSituacoesEstoque(
  itens: (ItemEstoque & { material: string })[],
): Map<string, SituacaoEstoqueMaterial> {
  const mapa = new Map<string, SituacaoEstoqueMaterial>();
  for (const item of itens) {
    const chave = chaveMaterial(item.material);
    if (!chave) continue;
    const situacao = calcularSituacaoEstoque(item);
    const atual = mapa.get(chave);
    if (!atual || gravidade(situacao.tag) < gravidade(atual.tag)) mapa.set(chave, situacao);
  }
  return mapa;
}

export function situacaoEstoqueDoMaterial(
  mapa: Map<string, SituacaoEstoqueMaterial>,
  codigo: string | null | undefined,
): SituacaoEstoqueMaterial | null {
  return mapa.get(chaveMaterial(codigo)) ?? null;
}

const COLUNAS = [
  'material', 'centro', 'umb', 'saldo_reposicao', 'consumo_total', 'dias_uteis', 'lead_time_dias',
  'intervalo_compra_dias', 'preco_medio_sap', 'quantidade_por_torre', 'estoque_minimo_override',
  'estoque_maximo_override', 'ultimo_movimento', 'ultimo_movimento_geral',
].join(',');

const VALIDADE_CACHE_MS = 10 * 60 * 1000;
let cache: { em: number; mapa: Map<string, SituacaoEstoqueMaterial> } | null = null;

/** Só as colunas da faixa, para não trazer RMs/POs/entregas da view inteira. */
export async function buscarSituacoesEstoque(forcar = false): Promise<Map<string, SituacaoEstoqueMaterial>> {
  if (!forcar && cache && Date.now() - cache.em < VALIDADE_CACHE_MS) return cache.mapa;
  const tamanhoLote = 1000;
  const linhas: Record<string, unknown>[] = [];
  for (let lote = 0; lote < 20; lote += 1) {
    const inicio = lote * tamanhoLote;
    const { data, error } = await (supabase as any)
      .from('vw_almox_controle_estoque')
      .select(COLUNAS)
      .order('material', { ascending: true })
      .range(inicio, inicio + tamanhoLote - 1);
    if (error) throw new Error(error.message || 'Falha ao carregar a situação de estoque.');
    const pagina = (data ?? []) as Record<string, unknown>[];
    linhas.push(...pagina);
    if (pagina.length < tamanhoLote) break;
  }
  const mapa = indexarSituacoesEstoque(linhas.map(normalizarLinhaControleEstoque));
  cache = { em: Date.now(), mapa };
  return mapa;
}
