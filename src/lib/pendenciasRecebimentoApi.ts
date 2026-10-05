/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pendências de Recebimento — acesso ao Supabase.
 *
 * A tabela `sup_pend_recebimento` só aceita leitura pelo cliente: quem cria é
 * o banco (trigger da conferência/NCR) e quem muda o status são as RPCs
 * `sup_receb_pend_*`, que também gravam as notificações e espelham a
 * tratativa na NCR. Regras puras em `pendenciasRecebimento.ts`.
 */

import { supabase } from '../db/supabaseClient';
import type { DecisaoPendencia, PendenciaRecebimento } from './pendenciasRecebimento';

const db = (tabela: string) => (supabase.from as any)(tabela);

const rpc = async <T>(nome: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(nome as any, args as any);
  if (error) throw new Error(error.message);
  return data as T;
};

/** Abertas inteiras + fechadas dos últimos 90 dias (histórico recente para consulta). */
export async function listarPendenciasRecebimento(): Promise<PendenciaRecebimento[]> {
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data, error } = await db('sup_pend_recebimento')
    .select('*')
    .or(`status.in.(aguardando_comprador,aguardando_almox),updated_at.gte.${desde}`)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PendenciaRecebimento[];
}

/** Lado do almoxarifado: só o que já tem decisão e espera execução, mais o que fechou na última semana. */
export async function listarDevolutivasAlmox(): Promise<PendenciaRecebimento[]> {
  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await db('sup_pend_recebimento')
    .select('*')
    .or(`status.in.(aguardando_comprador,aguardando_almox),and(status.eq.concluida,updated_at.gte.${desde})`)
    .order('decidido_em', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PendenciaRecebimento[];
}

export async function decidirPendencias(
  ids: string[],
  decisao: DecisaoPendencia,
  obs: string,
  pedido: string,
): Promise<{ decididas: number; ncs_abertas?: string[] }> {
  return rpc('sup_receb_pend_decidir', {
    p_ids: ids,
    p_decisao: decisao,
    p_obs: obs.trim() || null,
    p_pedido: pedido.trim() || null,
  });
}

export async function executarPendencias(ids: string[], obs: string): Promise<{ concluidas: number }> {
  return rpc('sup_receb_pend_executar', { p_ids: ids, p_obs: obs.trim() || null });
}

export async function reatribuirPendencias(ids: string[], compradorId: string): Promise<{ reatribuidas: number }> {
  return rpc('sup_receb_pend_reatribuir', { p_ids: ids, p_comprador: compradorId });
}

export async function cancelarPendencias(ids: string[], motivo: string): Promise<{ canceladas: number }> {
  return rpc('sup_receb_pend_cancelar', { p_ids: ids, p_motivo: motivo.trim() });
}

export interface OpcaoComprador {
  id: string;
  nome: string;
  grupo: string | null;
}

/** Quem pode assumir uma pendência: perfis ativos de Suprimentos. */
export async function listarCompradoresAtivos(): Promise<OpcaoComprador[]> {
  const { data, error } = await db('profiles')
    .select('id, name, grupo_compras, roles, status')
    .overlaps('roles', ['comprador', 'coordenador_suprimentos', 'admin']);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; name: string; grupo_compras: string | null; roles: string[]; status: string | null }[])
    .filter((p) => p.status !== 'inativo')
    // compradores de grupo primeiro — são os donos naturais da pendência
    .sort((a, b) => Number(!!b.grupo_compras) - Number(!!a.grupo_compras) || a.name.localeCompare(b.name, 'pt-BR'))
    .map((p) => ({ id: p.id, nome: p.name, grupo: p.grupo_compras }));
}
