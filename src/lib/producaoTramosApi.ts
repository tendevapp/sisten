import { supabase } from '../db/supabaseClient';
import type { SnapshotTramoPlanilha } from './producaoTramosImportacao';
import type { MarcoTramo } from './producaoTramos';

export interface TramoAtual {
  tramoId: string;
  serie: number;
  torreNumero: number;
  tramo: string;
  setorAtual: string | null;
  atividadeAtual: string | null;
}

export async function listarTramosAtuais(): Promise<TramoAtual[]> {
  const { data, error } = await (supabase.from as any)('prod_apt_tramos_atual')
    .select('tramo_id,serie,torre_numero,tramo,setor_atual,atividade_atual').order('serie');
  if (error) throw new Error(error.message);
  return (data ?? []).map((item: any) => ({ tramoId: item.tramo_id, serie: Number(item.serie), torreNumero: Number(item.torre_numero), tramo: item.tramo, setorAtual: item.setor_atual, atividadeAtual: item.atividade_atual }));
}

export async function salvarEventoTramo(input: { tramoId: string; dataOperacional: string; marco?: MarcoTramo; setor?: string; atividade?: string; reparosSolda?: number }) {
  const { data, error } = await (supabase.rpc as any)('prod_apt_salvar_evento_tramo', { p: input });
  if (error) throw new Error(error.message);
  return data as { id: string; codigo: string };
}

export async function importarHistoricoTramos(loteId: string, snapshots: SnapshotTramoPlanilha[]) {
  const { data, error } = await (supabase.rpc as any)('prod_apt_importar_snapshot_tramos', { p: { loteId, snapshots } });
  if (error) throw new Error(error.message);
  return data as { eventosInseridos: number };
}
