import { supabase } from '../db/supabaseClient';
import type { CadastroTorreTramo } from './producaoTramosImportacao';

export interface CatalogoTramo {
  id: string;
  torreNumero: number;
  tramo: 'T1' | 'T2' | 'T3' | 'T4' | 'T5';
  serie: number;
  subprojetoId: string | null;
}

export interface DivergenciaCadastroTramo {
  tipo: 'TORRE_DIVERGENTE' | 'TRAMO_DIVERGENTE' | 'SERIE_AUSENTE' | 'SERIE_NAO_PLANEJADA';
  serie: number;
  tramo: string;
  esperado: number | string | null;
  atual: number | string | null;
}

function normalizarCatalogoTramo(linha: Record<string, unknown>): CatalogoTramo {
  return {
    id: String(linha.id),
    torreNumero: Number(linha.torre_numero),
    tramo: String(linha.tramo) as CatalogoTramo['tramo'],
    serie: Number(linha.serie),
    subprojetoId: linha.subprojeto_id == null ? null : String(linha.subprojeto_id),
  };
}

export function compararCadastroTramos(
  cadastroPlanilha: CadastroTorreTramo[],
  catalogo: CatalogoTramo[],
): DivergenciaCadastroTramo[] {
  const porSerie = new Map(catalogo.map(item => [item.serie, item]));
  const esperadas = new Set(cadastroPlanilha.map(item => item.sequencial));
  const divergencias: DivergenciaCadastroTramo[] = [];

  for (const esperado of cadastroPlanilha) {
    const atual = porSerie.get(esperado.sequencial);
    if (!atual) {
      divergencias.push({ tipo: 'SERIE_AUSENTE', serie: esperado.sequencial, tramo: esperado.tramo, esperado: esperado.torreNumero, atual: null });
      continue;
    }
    if (atual.torreNumero !== esperado.torreNumero) {
      divergencias.push({ tipo: 'TORRE_DIVERGENTE', serie: esperado.sequencial, tramo: esperado.tramo, esperado: esperado.torreNumero, atual: atual.torreNumero });
    }
    if (atual.tramo !== esperado.tramo) {
      divergencias.push({ tipo: 'TRAMO_DIVERGENTE', serie: esperado.sequencial, tramo: esperado.tramo, esperado: esperado.tramo, atual: atual.tramo });
    }
  }

  for (const atual of catalogo) {
    if (atual.subprojetoId === 'SP01' && !esperadas.has(atual.serie)) {
      divergencias.push({ tipo: 'SERIE_NAO_PLANEJADA', serie: atual.serie, tramo: atual.tramo, esperado: null, atual: atual.torreNumero });
    }
  }
  return divergencias;
}

export async function listarCatalogoTramos(): Promise<CatalogoTramo[]> {
  const { data, error } = await (supabase.from as any)('proj_tramos_gwjaco')
    .select('id, torre_numero, tramo, serie, subprojeto_id')
    .order('torre_numero')
    .order('tramo');
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizarCatalogoTramo);
}
