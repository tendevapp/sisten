/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GERAL › Treinamentos — acesso ao banco (trein_trilhas, trein_progresso) e
 * ao bucket `treinamentos`. Regras puras em `treinamentos.ts`.
 *
 * O registro de missão (`trein_registrar_missao`) entra na fila offline
 * (configFormularios.ts): a trilha é feita no pátio também, e a RPC é
 * idempotente — reenviar não duplica nem piora o resultado.
 */

import { supabase } from '../db/supabaseClient';
import {
  argsRegistrarMissao,
  caminhoArquivoTrilha,
  type EventoMissaoConcluida,
  type ProgressoMissao,
  type TrilhaTreinamento,
} from './treinamentos';

const BUCKET = 'treinamentos';
const trilhas = () => (supabase.from as any)('trein_trilhas');
const progresso = () => (supabase.from as any)('trein_progresso');

const COLUNAS_PROGRESSO =
  'trilha_id, missao, titulo_missao, insignia, xp, estrelas, acertos, perguntas, erros_jogo, tentativas, concluida_em, atualizado_em';

export async function listarTrilhas(): Promise<TrilhaTreinamento[]> {
  const { data, error } = await trilhas()
    .select('*')
    .order('setor_id')
    .order('ordem')
    .order('titulo');
  if (error) throw error;
  return (data ?? []) as TrilhaTreinamento[];
}

export async function buscarTrilha(id: string): Promise<TrilhaTreinamento | null> {
  const { data, error } = await trilhas().select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as TrilhaTreinamento | null;
}

/** Progresso do próprio usuário em todas as trilhas (ou numa só). */
export async function listarMeuProgresso(usuarioId: string, trilhaId?: string): Promise<ProgressoMissao[]> {
  let q = progresso().select(COLUNAS_PROGRESSO).eq('usuario_id', usuarioId);
  if (trilhaId) q = q.eq('trilha_id', trilhaId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ProgressoMissao[];
}

export async function registrarMissao(trilhaId: string, ev: EventoMissaoConcluida): Promise<unknown> {
  const { data, error } = await (supabase.rpc as any)('trein_registrar_missao', argsRegistrarMissao(trilhaId, ev));
  if (error) throw error;
  return data;
}

/** HTML da trilha: do próprio app (public/) ou do bucket. */
export async function carregarHtmlTrilha(trilha: Pick<TrilhaTreinamento, 'arquivo_origem' | 'arquivo_path'>): Promise<string> {
  if (trilha.arquivo_origem === 'app') {
    const base = (import.meta as any).env?.BASE_URL ?? '/';
    const resp = await fetch(`${base}${trilha.arquivo_path.replace(/^\/+/, '')}`, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`Arquivo da trilha não encontrado (${resp.status})`);
    return resp.text();
  }
  const { data, error } = await supabase.storage.from(BUCKET).download(trilha.arquivo_path);
  if (error || !data) throw error ?? new Error('Arquivo da trilha não encontrado');
  return data.text();
}

export interface DadosTrilha {
  setor_id: string;
  codigo: string;
  titulo: string;
  descricao: string | null;
  revisao: string | null;
  total_missoes: number;
  duracao_min: number | null;
  ordem: number;
  ativo: boolean;
}

/**
 * Cria ou atualiza a trilha. Com `arquivo`, sobe o HTML novo para o bucket e
 * aponta a trilha para ele (o anterior, se era do bucket, é removido).
 */
export async function salvarTrilha(
  dados: DadosTrilha,
  arquivo: File | null,
  existente?: TrilhaTreinamento,
): Promise<TrilhaTreinamento> {
  let arquivoCampos: Pick<TrilhaTreinamento, 'arquivo_origem' | 'arquivo_path'> | null = null;
  if (arquivo) {
    const caminho = caminhoArquivoTrilha(dados.setor_id, dados.codigo, new Date());
    const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
      contentType: 'text/html',
      upsert: false,
    });
    if (error) throw error;
    arquivoCampos = { arquivo_origem: 'storage', arquivo_path: caminho };
  }

  if (existente) {
    const { data, error } = await trilhas()
      .update({ ...dados, ...(arquivoCampos ?? {}) })
      .eq('id', existente.id)
      .select('*')
      .single();
    if (error) throw error;
    if (arquivoCampos && existente.arquivo_origem === 'storage') {
      await supabase.storage.from(BUCKET).remove([existente.arquivo_path]);
    }
    return data as TrilhaTreinamento;
  }

  if (!arquivoCampos) throw new Error('Selecione o arquivo HTML da trilha.');
  const { data, error } = await trilhas()
    .insert({ ...dados, ...arquivoCampos })
    .select('*')
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([arquivoCampos.arquivo_path]);
    throw error;
  }
  return data as TrilhaTreinamento;
}

export async function alterarAtivoTrilha(id: string, ativo: boolean): Promise<void> {
  const { error } = await trilhas().update({ ativo }).eq('id', id);
  if (error) throw error;
}

export interface ParticipanteTrilha {
  usuario_id: string;
  nome: string | null;
  email: string | null;
  setor: string | null;
  missoes_concluidas: number;
  total_missoes: number;
  xp: number;
  estrelas: number;
  ultima_atividade: string | null;
  concluida_em: string | null;
}

export async function listarParticipantes(trilhaId: string): Promise<ParticipanteTrilha[]> {
  const { data, error } = await (supabase.rpc as any)('trein_participantes', { p_trilha_id: trilhaId });
  if (error) throw error;
  return (data ?? []) as ParticipanteTrilha[];
}
