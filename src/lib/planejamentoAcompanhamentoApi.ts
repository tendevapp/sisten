import { supabase } from '../db/supabaseClient';
import {
  parseAcompanhamentoWorkbook,
  parseCronogramaWorkbook,
  ACOMPANHAMENTO_IMPORT_PROGRESS,
  type AcompanhamentoRowPayload,
  type CronogramaRowPayload,
} from './planejamentoAcompanhamentoImportacao';
import type { AcompanhamentoDiarioConfiguracao, AcompanhamentoDiarioMeta, AcompanhamentoDiarioMetaSemanal, AcompanhamentoDiarioRealizado } from './planejamentoAcompanhamentoDiario';

export interface AcompanhamentoImportResult {
  importacao_id: string;
  linhas_bd: number;
  linhas_cronograma: number;
}

export interface AcompanhamentoSnapshot {
  base: Record<string, unknown>[];
  engine: Record<string, unknown>[];
  pcp: Record<string, unknown>[];
  weekly: Record<string, unknown>[];
  torres: Record<string, unknown>[];
  postos: Record<string, unknown>[];
  reparos: Record<string, unknown>[];
  divergencias: Record<string, unknown>[];
  ultimaImportacao: Record<string, unknown> | null;
}

export interface AcompanhamentoDiarioAuditoria {
  id: string;
  entidade: 'metas' | 'metas_semanais' | 'realizados' | 'feriados';
  acao: 'INSERT' | 'UPDATE' | 'DELETE';
  chave: Record<string, unknown>;
  alterado_por: string | null;
  alterado_em: string;
}

export interface AcompanhamentoDiarioDados extends AcompanhamentoDiarioConfiguracao {
  auditoria: AcompanhamentoDiarioAuditoria[];
}

const db = (table: string) => (supabase.from as any)(table);

async function readView(name: string, order?: string): Promise<Record<string, unknown>[]> {
  let query = db(name).select('*');
  if (order) query = query.order(order, { ascending: true });
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

export async function importarAcompanhamento(params: {
  arquivoBd: File;
  arquivoCronograma?: File | null;
  onProgress?: (progress: { value: number; label: string }) => void;
}): Promise<AcompanhamentoImportResult> {
  const report = (progress: { value: number; label: string }) => params.onProgress?.(progress);
  report(ACOMPANHAMENTO_IMPORT_PROGRESS[0]);
  const bdParsed = parseAcompanhamentoWorkbook(await params.arquivoBd.arrayBuffer());
  report(ACOMPANHAMENTO_IMPORT_PROGRESS[1]);
  const cronogramaParsed = params.arquivoCronograma
    ? parseCronogramaWorkbook(await params.arquivoCronograma.arrayBuffer())
    : { headers: [], rows: [] as CronogramaRowPayload[] };
  report(ACOMPANHAMENTO_IMPORT_PROGRESS[2]);
  const { data, error } = await (supabase.rpc as any)('planejamento_importar_acompanhamento', {
    p_arquivo_bd: params.arquivoBd.name,
    p_arquivo_cronograma: params.arquivoCronograma?.name ?? null,
    p_cabecalhos_bd: bdParsed.bdHeaders,
    p_bd_rows: bdParsed.bdRows as AcompanhamentoRowPayload[],
    p_cronograma_rows: cronogramaParsed.rows,
  });
  if (error) throw new Error(error.message);
  report(ACOMPANHAMENTO_IMPORT_PROGRESS[3]);
  return data as AcompanhamentoImportResult;
}

export async function carregarAcompanhamentoSnapshot(): Promise<AcompanhamentoSnapshot> {
  const [base, engine, pcp, weekly, torres, postos, reparos, divergencias, imports] = await Promise.all([
    readView('vw_planejamento_acompanhamento_base', 'linha_origem'),
    readView('vw_planejamento_acompanhamento_engine', 'sequencial'),
    readView('vw_planejamento_acompanhamento_pcp', 'etapa'),
    readView('vw_planejamento_acompanhamento_weekly', 'semana_inicio'),
    readView('vw_planejamento_acompanhamento_torres', 'torre'),
    readView('vw_planejamento_acompanhamento_postos', 'posto'),
    readView('vw_planejamento_acompanhamento_reparos', 'rank_reparos'),
    readView('vw_planejamento_acompanhamento_divergencias', 'sequencial'),
    db('planejamento_importacoes').select('*').order('iniciado_em', { ascending: false }).limit(1),
  ]);
  const importResult = imports as Record<string, unknown>[];
  return {
    base, engine, pcp, weekly, torres, postos, reparos, divergencias,
    ultimaImportacao: importResult[0] ?? null,
  };
}

export async function carregarAcompanhamentoDiarioDados(ano: number): Promise<AcompanhamentoDiarioDados> {
  const inicio = `${ano}-01-01`;
  const fim = `${ano + 1}-01-01`;
  const inicioSemanas = `${ano - 1}-12-25`;
  const [metasResult, metasSemanaisResult, realizadosResult, feriadosResult, auditoriaResult] = await Promise.all([
    db('planejamento_acomp_diario_metas').select('area, ano, mes, meta, dias_uteis').eq('ano', ano).order('area').order('mes'),
    db('planejamento_acomp_diario_metas_semanais').select('area, semana_inicio, meta, dias_uteis').gte('semana_inicio', inicioSemanas).lt('semana_inicio', fim).order('semana_inicio').order('area'),
    db('planejamento_acomp_diario_realizados').select('area, data, realizado').gte('data', inicio).lt('data', fim).order('data'),
    db('planejamento_acomp_diario_feriados').select('data').gte('data', inicio).lt('data', fim).order('data'),
    db('planejamento_acomp_diario_auditoria').select('id, entidade, acao, chave, alterado_por, alterado_em').order('alterado_em', { ascending: false }).limit(30),
  ]);
  for (const result of [metasResult, metasSemanaisResult, realizadosResult, feriadosResult, auditoriaResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  return {
    metas: (metasResult.data ?? []).map((item: Record<string, unknown>) => ({
      area: item.area,
      ano: Number(item.ano),
      mes: Number(item.mes),
      meta: Number(item.meta),
      dias_uteis: Number(item.dias_uteis),
    })) as AcompanhamentoDiarioMeta[],
    metasSemanais: (metasSemanaisResult.data ?? []).map((item: Record<string, unknown>) => ({
      area: item.area,
      semana_inicio: String(item.semana_inicio),
      meta: Number(item.meta),
      dias_uteis: Number(item.dias_uteis),
    })) as AcompanhamentoDiarioMetaSemanal[],
    realizados: (realizadosResult.data ?? []).map((item: Record<string, unknown>) => ({
      area: item.area,
      data: String(item.data),
      realizado: Number(item.realizado),
    })) as AcompanhamentoDiarioRealizado[],
    feriados: (feriadosResult.data ?? []).map((item: Record<string, unknown>) => String(item.data)),
    auditoria: (auditoriaResult.data ?? []) as AcompanhamentoDiarioAuditoria[],
  };
}

export async function salvarMetasAcompanhamentoDiario(metas: AcompanhamentoDiarioMeta[]): Promise<void> {
  if (!metas.length) return;
  const { error } = await db('planejamento_acomp_diario_metas').upsert(metas, { onConflict: 'area,ano,mes' });
  if (error) throw new Error(error.message);
}

export async function salvarMetasSemanaisAcompanhamentoDiario(metas: AcompanhamentoDiarioMetaSemanal[]): Promise<void> {
  if (!metas.length) return;
  const { error } = await db('planejamento_acomp_diario_metas_semanais').upsert(metas, { onConflict: 'area,semana_inicio' });
  if (error) throw new Error(error.message);
}

export async function removerMetaSemanalAcompanhamentoDiario(area: string, semanaInicio: string): Promise<void> {
  const { error } = await db('planejamento_acomp_diario_metas_semanais').delete().eq('area', area).eq('semana_inicio', semanaInicio);
  if (error) throw new Error(error.message);
}

export async function salvarRealizadoAcompanhamentoDiario(realizado: AcompanhamentoDiarioRealizado): Promise<void> {
  const { error } = await db('planejamento_acomp_diario_realizados').upsert(realizado, { onConflict: 'area,data' });
  if (error) throw new Error(error.message);
}

export async function removerRealizadoAcompanhamentoDiario(area: string, data: string): Promise<void> {
  const { error } = await db('planejamento_acomp_diario_realizados').delete().eq('area', area).eq('data', data);
  if (error) throw new Error(error.message);
}

export async function salvarFeriadoAcompanhamentoDiario(data: string, descricao?: string): Promise<void> {
  const { error } = await db('planejamento_acomp_diario_feriados').upsert({ data, descricao: descricao?.trim() || null }, { onConflict: 'data' });
  if (error) throw new Error(error.message);
}

export async function removerFeriadoAcompanhamentoDiario(data: string): Promise<void> {
  const { error } = await db('planejamento_acomp_diario_feriados').delete().eq('data', data);
  if (error) throw new Error(error.message);
}
