/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Peças comuns aos formulários da Segurança — ISP (FRM.SEG-0036), Ronda
 * (FRM.SEG-0041) e Observação Comportamental (FRM.SEG-0042):
 *
 * - exclusão lógica com motivo e restauração (RPCs `ssma_seg_excluir_registro`
 *   / `ssma_seg_restaurar_registro`; só autor ou administrador);
 * - log de auditoria (`ssma_seg_formularios_log`, gravado por trigger);
 * - registros que ainda estão na fila offline do aparelho.
 */

import { supabase } from '../db/supabaseClient';
import { argumentosNaFila } from './offline/filaSupabase';
import { podeEditarFormulario } from './permissoesFormularios';

export type FormularioSeguranca = 'isp' | 'ronda' | 'oc';

/** Colunas de exclusão lógica das três tabelas principais. */
export interface ExclusaoRegistro {
  criado_por: string;
  excluido_em: string | null;
  excluido_por: string | null;
  motivo_exclusao: string | null;
}

export const RPC_REGISTRO: Record<FormularioSeguranca, 'ssma_isp_registrar' | 'ssma_ronda_registrar' | 'ssma_oc_registrar'> = {
  isp: 'ssma_isp_registrar',
  ronda: 'ssma_ronda_registrar',
  oc: 'ssma_oc_registrar',
};

export const dataBR = (data: string) => data.split('-').reverse().join('/');

export const mensagemErro = (e: unknown, padrao = 'Não foi possível concluir. Tente de novo.') =>
  e && typeof e === 'object' && 'message' in e && String((e as { message: unknown }).message)
    ? String((e as { message: unknown }).message)
    : padrao;

/** Mesma regra da RPC: autor ou administrador. */
export function podeExcluirRegistro(user: { id: string; roles?: readonly string[] | null }, r: Pick<ExclusaoRegistro, 'criado_por'>) {
  return podeEditarFormulario(user, r);
}

export async function excluirRegistroSeguranca(formulario: FormularioSeguranca, id: string, motivo: string) {
  const { error } = await supabase.rpc('ssma_seg_excluir_registro', { p_formulario: formulario, p_id: id, p_motivo: motivo.trim() });
  if (error) throw error;
}

export async function restaurarRegistroSeguranca(formulario: FormularioSeguranca, id: string) {
  const { error } = await supabase.rpc('ssma_seg_restaurar_registro', { p_formulario: formulario, p_id: id });
  if (error) throw error;
}

export type OperacaoLog = 'inclusao' | 'alteracao' | 'exclusao' | 'restauracao' | 'exclusao_definitiva';

export interface LinhaLogSeguranca {
  id: number;
  operacao: OperacaoLog;
  alteracoes: { campo: string; de: unknown; para: unknown }[];
  /** Só o motivo, na exclusão. */
  motivo: string | null;
  alterado_por_nome: string | null;
  origem: 'app' | 'sistema';
  created_at: string;
}

export async function listarLogSeguranca(formulario: FormularioSeguranca, registroId: string): Promise<LinhaLogSeguranca[]> {
  // O alias com caminho JSON estoura a inferência de tipos do supabase-js.
  const { data, error } = await (supabase as any).from('ssma_seg_formularios_log')
    .select('id,operacao,alteracoes,motivo:depois->>motivo_exclusao,alterado_por_nome,origem,created_at')
    .eq('formulario', formulario).eq('registro_id', registroId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as LinhaLogSeguranca[];
}

/** Argumentos dos registros deste formulário que ainda não subiram (fila do aparelho). */
export async function pendentesNaFila<T>(formulario: FormularioSeguranca): Promise<{ p_id: string; p_dados: T }[]> {
  try {
    return (await argumentosNaFila(RPC_REGISTRO[formulario])) as { p_id: string; p_dados: T }[];
  } catch {
    return [];
  }
}

/** `true` quando a gravação deste id ficou na fila (sem rede) em vez de chegar ao servidor. */
export async function ficouNaFila(formulario: FormularioSeguranca, id: string) {
  return (await pendentesNaFila(formulario)).some(a => a.p_id === id);
}
