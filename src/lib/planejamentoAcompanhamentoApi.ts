import { supabase } from '../db/supabaseClient';
import {
  parseAcompanhamentoWorkbook,
  parseCronogramaWorkbook,
  ACOMPANHAMENTO_IMPORT_PROGRESS,
  type AcompanhamentoRowPayload,
  type CronogramaRowPayload,
} from './planejamentoAcompanhamentoImportacao';

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
