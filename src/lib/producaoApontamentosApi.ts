/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Produção › Apontamentos — acesso ao Supabase.
 *
 * Tabelas `prod_apt_*`, view `prod_apt_realizado_semanal` e RPCs
 * `prod_apt_salvar_lancamento` / `prod_apt_excluir_lancamento` (migration
 * `20260925150000_simplificar_prod_apontamentos.sql`). Fora de
 * `database.types.ts`, por isso `.from()`/`.rpc()` com `as any`.
 *
 * Lançamento novo é offline-first: o id nasce no aparelho; se a rede falhar,
 * vai para o outbox (`lib/outbox.ts`) e é reenviado em
 * `processarFilaApontamentos()`. A RPC trata o mesmo id como regravação, então
 * o reenvio não duplica. Edição e exclusão são online.
 */

import { supabase } from '../db/supabaseClient';
import { gerarUUID } from './ids';
import * as outbox from './outbox';
import type {
  EtapaApontamento,
  ItemLancamento,
  LancamentoApontamento,
  Nave,
  QuantidadeSemanal,
} from './producaoApontamentos';

const db = (tabela: string) => (supabase.from as any)(tabela);
const rpc = (nome: string, args: Record<string, unknown>) => supabase.rpc(nome as any, args as any);

const TIPO_OUTBOX = 'prod_apontamento';
const PAGINA = 1000;

function erro(e: { message: string } | null): void {
  if (e) throw new Error(e.message);
}

/** Lê todas as páginas — o PostgREST corta em 1000 linhas por resposta. */
async function lerTudo<T>(montar: () => any): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await montar().range(de, de + PAGINA - 1);
    erro(error);
    linhas.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) return linhas;
  }
}

// ---------------------------------------------------------------------------
// Etapas
// ---------------------------------------------------------------------------

export async function listarEtapas(): Promise<EtapaApontamento[]> {
  const { data, error } = await db('prod_apt_etapas').select('*').order('nave').order('ordem');
  erro(error);
  return data ?? [];
}

/** Cria ou atualiza uma etapa (RLS exige a flag `prod_apt_cadastros`). */
export async function salvarEtapa(etapa: Omit<EtapaApontamento, 'ativa'> & { ativa?: boolean }): Promise<void> {
  const { error } = await db('prod_apt_etapas').upsert(etapa);
  erro(error);
}

// ---------------------------------------------------------------------------
// Programado e realizado semanais
// ---------------------------------------------------------------------------

const normalizar = (r: any): QuantidadeSemanal => ({
  ano: Number(r.ano),
  semana: Number(r.semana),
  etapa_id: r.etapa_id,
  quantidade: Number(r.quantidade),
});

export async function listarProgramacao(anos: number[]): Promise<QuantidadeSemanal[]> {
  const linhas = await lerTudo<any>(() =>
    db('prod_apt_programacao').select('ano,semana,etapa_id,quantidade').in('ano', anos).order('ano').order('semana').order('etapa_id'),
  );
  return linhas.map(normalizar);
}

export async function listarRealizadoSemanal(anos: number[]): Promise<QuantidadeSemanal[]> {
  const linhas = await lerTudo<any>(() =>
    db('prod_apt_realizado_semanal').select('ano,semana,etapa_id,quantidade').in('ano', anos).order('ano').order('semana').order('etapa_id'),
  );
  return linhas.map(normalizar);
}

/** Grava as células alteradas da grade do Planejamento: vazio/zero apaga. */
export async function salvarProgramacao(
  celulas: Array<{ ano: number; semana: number; etapa_id: string; quantidade: number | null }>,
  usuarioNome: string,
): Promise<void> {
  const gravar = celulas.filter(c => c.quantidade != null && c.quantidade > 0);
  const apagar = celulas.filter(c => c.quantidade == null || c.quantidade <= 0);
  if (gravar.length) {
    const agora = new Date().toISOString();
    const { error } = await db('prod_apt_programacao').upsert(
      gravar.map(c => ({ ...c, atualizado_por_nome: usuarioNome, updated_at: agora })),
      { onConflict: 'ano,semana,etapa_id' },
    );
    erro(error);
  }
  for (const c of apagar) {
    const { error } = await db('prod_apt_programacao').delete().eq('ano', c.ano).eq('semana', c.semana).eq('etapa_id', c.etapa_id);
    erro(error);
  }
}

// ---------------------------------------------------------------------------
// Lançamentos de realizado
// ---------------------------------------------------------------------------

export async function listarLancamentos(nave: Nave, data: string): Promise<LancamentoApontamento[]> {
  const { data: rows, error } = await db('prod_apt_lancamentos')
    .select('*, itens:prod_apt_lancamento_itens(etapa_id,quantidade)')
    .eq('nave', nave)
    .eq('data', data)
    .is('excluido_em', null)
    .order('created_at');
  erro(error);
  return (rows ?? []).map((r: any) => ({
    ...r,
    itens: (r.itens ?? []).map((i: any) => ({ etapa_id: i.etapa_id, quantidade: Number(i.quantidade) })),
  }));
}

export interface SalvarLancamentoInput {
  /** Ausente = lançamento novo. */
  id?: string;
  data: string;
  nave: Nave;
  observacao: string;
  itens: ItemLancamento[];
}

interface OutboxPayload {
  p: Record<string, unknown>;
}

/** `TypeError: Failed to fetch` e afins — falha de conectividade, não de validação. */
function pareceFalhaDeRede(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /failed to fetch|networkerror|network request failed|load failed|err_internet|err_network/i.test(msg);
}

async function enviar(p: Record<string, unknown>): Promise<{ codigo: string }> {
  const { data, error } = await rpc('prod_apt_salvar_lancamento', { p });
  erro(error);
  return { codigo: data.codigo };
}

export async function salvarLancamento(input: SalvarLancamentoInput): Promise<{ enfileirado: boolean; codigo?: string }> {
  const novo = !input.id;
  const p = {
    id: input.id ?? gerarUUID(),
    data: input.data,
    nave: input.nave,
    observacao: input.observacao.trim() || null,
    itens: input.itens.filter(i => i.quantidade > 0),
  };
  try {
    return { enfileirado: false, ...(await enviar(p)) };
  } catch (e) {
    if (!novo || !pareceFalhaDeRede(e)) throw e;
    await outbox.enfileirar<OutboxPayload>({ id: p.id, tipo: TIPO_OUTBOX, payload: { p } });
    return { enfileirado: true };
  }
}

export async function excluirLancamento(id: string): Promise<void> {
  const { error } = await rpc('prod_apt_excluir_lancamento', { p_id: id });
  erro(error);
}

/** Reenvia o outbox. Chamar no boot, em `online` e ao ganhar foco. */
export async function processarFilaApontamentos(): Promise<{ enviados: number; falharam: number }> {
  return outbox.processarFila<OutboxPayload>(TIPO_OUTBOX, async item => {
    await enviar(item.payload.p);
  });
}

export const assinarOutboxApontamentos = (fn: () => void): (() => void) => outbox.subscribe(fn);

export async function listarPendentesApontamentos(): Promise<Array<{ id: string; ultimoErro: string | null | undefined; tentativas: number }>> {
  const itens = await outbox.listarPendentes<OutboxPayload>(TIPO_OUTBOX);
  return itens.map(i => ({ id: i.id, ultimoErro: i.ultimoErro, tentativas: i.tentativas }));
}

export const descartarPendenteApontamento = (id: string): Promise<void> => outbox.remover(id);
