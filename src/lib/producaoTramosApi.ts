/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Apontamento por tramo — acesso ao Supabase.
 *
 * Gravação só por RPC (prod_apt_registrar_tramos / prod_apt_corrigir_evento_tramo):
 * a cronologia, o código APT e a autoria ficam no banco. As duas RPCs estão em
 * configFormularios.ts, então sem rede o lançamento entra na fila do aparelho.
 */

import { supabase } from '../db/supabaseClient';
import { ehRespostaOffline } from './offline/configFormularios';
import type { SnapshotTramoPlanilha } from './producaoTramosImportacao';
import {
  MARCOS_TRAMO,
  type EtapaTramo,
  type EventoTramo,
  type MarcoTramo,
  type MetaMarco,
  type PrazoMarco,
  type SituacaoTramo,
  type TramoAtual,
} from './producaoTramos';

const db = (tabela: string) => (supabase.from as any)(tabela);
const rpc = (nome: string, args: Record<string, unknown>) => (supabase.rpc as any)(nome, args);

function falhar(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export async function listarTramosAtuais(): Promise<TramoAtual[]> {
  const { data, error } = await db('prod_apt_tramos_atual').select('*').order('serie');
  falhar(error);
  return (data ?? []).map((l: any): TramoAtual => {
    const marcos: Partial<Record<MarcoTramo, string>> = {};
    for (const marco of MARCOS_TRAMO) if (l[`${marco}_em`]) marcos[marco] = String(l[`${marco}_em`]).slice(0, 10);
    return {
      tramoId: l.tramo_id,
      serie: Number(l.serie),
      torreNumero: Number(l.torre_numero),
      tramo: l.tramo,
      marcos,
      etapa: l.etapa as EtapaTramo,
      situacaoId: l.situacao_id,
      setorAtual: l.setor_atual,
      atividadeAtual: l.atividade_atual,
      situacaoEm: l.situacao_em,
      reparosSolda: Number(l.reparos_solda ?? 0),
      ultimoEventoEm: l.ultimo_evento_em,
      eventos: Number(l.eventos ?? 0),
    };
  });
}

const mapearEvento = (l: any): EventoTramo => ({
  id: l.id,
  codigo: l.codigo,
  tramoId: l.tramo_id,
  tipo: l.tipo,
  marco: l.marco,
  dataOperacional: l.data_operacional,
  situacaoId: l.situacao_id,
  setor: l.setor,
  atividade: l.atividade,
  reparosSolda: l.reparos_solda,
  observacao: l.observacao,
  origem: l.origem,
  criadoPor: l.criado_por,
  createdAt: l.created_at,
  excluidoEm: l.excluido_em,
  motivoExclusao: l.motivo_exclusao,
  corrigeEventoId: l.corrige_evento_id,
});

const COLUNAS_EVENTO =
  'id,codigo,tramo_id,tipo,marco,data_operacional,situacao_id,setor,atividade,reparos_solda,observacao,origem,criado_por,created_at,excluido_em,motivo_exclusao,corrige_evento_id';

/** Linha do tempo de um tramo, inclusive o que foi corrigido (para auditoria). */
export async function listarEventosTramo(tramoId: string): Promise<EventoTramo[]> {
  const { data, error } = await db('prod_apt_tramo_eventos')
    .select(COLUNAS_EVENTO)
    .eq('tramo_id', tramoId)
    .order('data_operacional', { ascending: false })
    .order('created_at', { ascending: false });
  falhar(error);
  return (data ?? []).map(mapearEvento);
}

/** Eventos válidos de um tipo, para as análises (ex.: reparos por mês). */
export async function listarEventosPorTipo(tipo: EventoTramo['tipo']): Promise<EventoTramo[]> {
  const { data, error } = await db('prod_apt_tramo_eventos')
    .select(COLUNAS_EVENTO)
    .eq('tipo', tipo)
    .is('excluido_em', null)
    .order('data_operacional');
  falhar(error);
  return (data ?? []).map(mapearEvento);
}

/** Nomes de quem lançou (criado_por → core_perfis.name). */
export async function nomesUsuarios(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return new Map();
  const { data, error } = await db('core_perfis').select('id,name').in('id', unicos);
  falhar(error);
  return new Map((data ?? []).map((p: any) => [String(p.id), String(p.name ?? '')]));
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

export interface RegistrarTramosInput {
  tramoIds: string[];
  dataOperacional: string;
  marco?: MarcoTramo | null;
  situacaoId?: string | null;
  reparos?: number;
  observacao?: string;
}

export interface ResultadoRegistro {
  id: string;
  codigos: string[];
  /** Sem rede: ficou na fila do aparelho e sobe sozinho. */
  offline: boolean;
}

export async function registrarTramos(input: RegistrarTramosInput): Promise<ResultadoRegistro> {
  const loteId = crypto.randomUUID();
  const { data, error } = await rpc('prod_apt_registrar_tramos', {
    p: {
      loteId,
      tramoIds: input.tramoIds,
      dataOperacional: input.dataOperacional,
      marco: input.marco ?? null,
      situacaoId: input.situacaoId ?? null,
      reparos: input.reparos ?? 0,
      observacao: input.observacao?.trim() || null,
    },
  });
  falhar(error);
  return { id: data?.id ?? loteId, codigos: data?.codigos ?? [], offline: ehRespostaOffline(data) };
}

export interface CorrigirEventoInput {
  eventoId: string;
  motivo: string;
  excluir?: boolean;
  dataOperacional?: string;
  situacaoId?: string;
  reparos?: number;
}

export async function corrigirEventoTramo(input: CorrigirEventoInput): Promise<{ codigo: string | null; offline: boolean }> {
  const { data, error } = await rpc('prod_apt_corrigir_evento_tramo', { p: input });
  falhar(error);
  return { codigo: data?.codigo ?? null, offline: ehRespostaOffline(data) };
}

export async function importarHistoricoTramos(loteId: string, snapshots: SnapshotTramoPlanilha[]) {
  const { data, error } = await rpc('prod_apt_importar_snapshot_tramos', { p: { loteId, snapshots } });
  falhar(error);
  return data as { eventosInseridos: number; jaImportado?: boolean };
}

// ---------------------------------------------------------------------------
// Situações (cadastro)
// ---------------------------------------------------------------------------

export async function listarSituacoes(): Promise<SituacaoTramo[]> {
  const { data, error } = await db('prod_apt_situacoes').select('*').order('ordem');
  falhar(error);
  return (data ?? []).map((l: any) => ({
    id: l.id,
    etapa: l.etapa,
    setor: l.setor,
    atividade: l.atividade,
    categoriaEntrega: l.categoria_entrega,
    ordem: Number(l.ordem),
    ativo: !!l.ativo,
  }));
}

export async function salvarSituacao(s: Omit<SituacaoTramo, 'id'> & { id?: string }): Promise<void> {
  const linha = {
    etapa: s.etapa,
    setor: s.setor.trim(),
    atividade: s.atividade.trim(),
    categoria_entrega: s.categoriaEntrega,
    ordem: s.ordem,
    ativo: s.ativo,
  };
  const { error } = s.id ? await db('prod_apt_situacoes').update(linha).eq('id', s.id) : await db('prod_apt_situacoes').insert(linha);
  falhar(error);
}

// ---------------------------------------------------------------------------
// Metas e prazos por marco (Planejamento)
// ---------------------------------------------------------------------------

export async function listarMetasMarco(): Promise<MetaMarco[]> {
  const { data, error } = await db('prod_apt_metas_marco').select('marco,granularidade,ano,periodo,quantidade');
  falhar(error);
  return (data ?? []).map((l: any) => ({ ...l, ano: Number(l.ano), periodo: Number(l.periodo), quantidade: Number(l.quantidade) }));
}

export async function listarPrazosMarco(): Promise<PrazoMarco[]> {
  const { data, error } = await db('prod_apt_prazos_marco').select('marco,total,prazo');
  falhar(error);
  return (data ?? []).map((l: any) => ({ marco: l.marco, total: Number(l.total), prazo: l.prazo }));
}

/** Grava as metas alteradas: quantidade vazia apaga a meta do período. */
export async function salvarMetasMarco(alteracoes: Array<Omit<MetaMarco, 'quantidade'> & { quantidade: number | null }>): Promise<void> {
  const gravar = alteracoes.filter(a => a.quantidade !== null);
  const apagar = alteracoes.filter(a => a.quantidade === null);
  if (gravar.length) {
    const { error } = await db('prod_apt_metas_marco').upsert(
      gravar.map(a => ({ ...a, atualizado_em: new Date().toISOString() })),
      { onConflict: 'marco,granularidade,ano,periodo' },
    );
    falhar(error);
  }
  for (const a of apagar) {
    const { error } = await db('prod_apt_metas_marco')
      .delete()
      .match({ marco: a.marco, granularidade: a.granularidade, ano: a.ano, periodo: a.periodo });
    falhar(error);
  }
}

export async function salvarPrazoMarco(p: PrazoMarco): Promise<void> {
  const { error } = await db('prod_apt_prazos_marco').upsert(
    { marco: p.marco, total: p.total, prazo: p.prazo || null, atualizado_em: new Date().toISOString() },
    { onConflict: 'marco' },
  );
  falhar(error);
}
