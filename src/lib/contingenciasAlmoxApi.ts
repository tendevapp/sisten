/**
 * Chamadas das contingências do almoxarifado. Tudo passa por RPC security
 * definer — as tabelas de tratativa, eventos e log da Extraordinária não têm
 * grant direto. Telas administrativas: fora da fila offline de propósito.
 */
import { supabase } from '../db/supabaseClient';
import type { Contingencia } from './contingenciasAlmox';

export async function verificarContingencias(incluirTratadas = false): Promise<Contingencia[]> {
  const { data, error } = await supabase.rpc('alm_contingencias_verificar' as any, { p_incluir_tratadas: incluirTratadas } as any);
  if (error) throw new Error(error.message);
  return (data ?? []) as Contingencia[];
}

/** Justifica uma ou várias referências da mesma verificação; devolve quantas. */
export async function justificarContingencias(verificacao: string, referencias: string[], justificativa: string): Promise<number> {
  const { data, error } = await supabase.rpc('alm_contingencia_justificar' as any, {
    p_verificacao: verificacao, p_referencias: referencias, p_justificativa: justificativa,
  } as any);
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function reabrirContingencia(tratativaId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('alm_contingencia_reabrir' as any, { p_tratativa: tratativaId, p_motivo: motivo } as any);
  if (error) throw new Error(error.message);
}

/** Correção automática (gerar/restaurar requisição, regularizar retirada). Devolve o resumo do que foi feito. */
export async function corrigirContingencia(verificacao: string, referencia: string): Promise<string> {
  const { data, error } = await supabase.rpc('alm_contingencia_corrigir' as any, { p_verificacao: verificacao, p_referencia: referencia } as any);
  if (error) throw new Error(error.message);
  return String(data ?? '');
}

export interface EventoHistorico {
  em: string;
  fonte: string;
  codigo: string | null;
  acao: string;
  resumo: string | null;
  por: string | null;
  alteracoes: unknown;
}

/** Logs da RQB, da Extraordinária e das contingências do código (e dos registros ligados a ele). */
export async function historicoContingencia(codigo: string): Promise<EventoHistorico[]> {
  const { data, error } = await supabase.rpc('alm_contingencia_historico' as any, { p_codigo: codigo } as any);
  if (error) throw new Error(error.message);
  return (data ?? []) as EventoHistorico[];
}

export interface RetiradaCandidata {
  codigo: string;
  data: string;
  status: string;
  itens: { material: string; descricao?: string; quantidade: number; unidade?: string }[];
  itens_iguais: number;
}

/** Retiradas sem saldo sem origem, da mesma pessoa, até 15 dias da ficha, com item da ficha. */
export async function retiradasCandidatas(fichaCodigo: string): Promise<RetiradaCandidata[]> {
  const { data, error } = await supabase.rpc('alm_contingencia_rss_candidatas' as any, { p_ficha: fichaCodigo } as any);
  if (error) throw new Error(error.message);
  return (data ?? []) as RetiradaCandidata[];
}

/** Liga a retirada à ficha (o banco confere pessoa e itens). Devolve o resumo. */
export async function vincularRetirada(rssCodigo: string, fichaCodigo: string): Promise<string> {
  const { data, error } = await supabase.rpc('alm_contingencia_vincular_rss' as any, { p_rss: rssCodigo, p_ficha: fichaCodigo } as any);
  if (error) throw new Error(error.message);
  return String(data ?? '');
}

export interface TratativaRegistrada {
  id: string;
  verificacao: string;
  referencia: string;
  justificativa: string;
  tratado_por_nome: string | null;
  created_at: string;
  revogada_em: string | null;
  revogada_por_nome: string | null;
  revogacao_motivo: string | null;
}

export async function listarTratativas(limite = 200): Promise<TratativaRegistrada[]> {
  const { data, error } = await supabase.rpc('alm_contingencias_tratativas_listar' as any, { p_limite: limite } as any);
  if (error) throw new Error(error.message);
  return (data ?? []) as TratativaRegistrada[];
}
