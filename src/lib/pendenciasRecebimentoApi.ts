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
import { DECISOES_QUE_ABREM_RNC, contarAguardandoComprador, type AcaoNcr, type DecisaoPendencia, type PendenciaRecebimento, type PendenciaRnc, type StatusNcr } from './pendenciasRecebimento';
import { editarNc } from './recebimentoAlmoxApi';

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

/**
 * Pendências cuja decisão abriu RNC (abrir RNC, devolver, devolver com reposição),
 * já com o estado da NCR no Recebimento. NCR excluída sai da lista.
 */
export async function listarPendenciasRnc(): Promise<PendenciaRnc[]> {
  const { data, error } = await db('sup_pend_recebimento')
    .select('*')
    .in('decisao', DECISOES_QUE_ABREM_RNC)
    .not('nc_id', 'is', null)
    .neq('status', 'cancelada')
    .order('decidido_em', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  const pend = (data ?? []) as PendenciaRecebimento[];
  if (pend.length === 0) return [];

  const ids = [...new Set(pend.map((p) => p.nc_id!))];
  const { data: ncs, error: errNc } = await db('alm_receb_nc')
    .select('id, status, resolucao, acoes, excluido')
    .in('id', ids);
  if (errNc) throw new Error(errNc.message);
  const porId = new Map<string, { status: StatusNcr; resolucao: string | null; acoes: AcaoNcr[] | null; excluido: boolean }>(
    ((ncs ?? []) as any[]).map((n) => [n.id, n]),
  );

  return pend.flatMap((p) => {
    const nc = porId.get(p.nc_id!);
    if (!nc || nc.excluido) return [];
    return [{ ...p, ncr_status: nc.status, ncr_resolucao: nc.resolucao, ncr_acoes: Array.isArray(nc.acoes) ? nc.acoes : [] }];
  });
}

/** Comprador registra o andamento com o fornecedor na NCR (e, se quiser, a encerra). */
export async function registrarAndamentoRnc(
  ncId: string,
  texto: string,
  resolver: boolean,
  user: { id: string; nome: string },
): Promise<void> {
  const t = texto.trim();
  if (!t) throw new Error('Descreva o andamento.');
  await editarNc(
    ncId,
    resolver ? { status: 'resolvida', resolucao: t } : { status: 'em_tratativa' },
    { texto: t },
    { id: user.id, nome: user.nome },
  );
}

/** Balão da subpágina Recebimento: só as colunas necessárias para contar. */
export async function contarMinhasAguardando(usuarioId: string): Promise<number> {
  const { data, error } = await db('sup_pend_recebimento')
    .select('status, comprador_id, decidido_por_id')
    .eq('status', 'aguardando_comprador');
  if (error) throw new Error(error.message);
  return contarAguardandoComprador((data ?? []) as PendenciaRecebimento[], usuarioId);
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
