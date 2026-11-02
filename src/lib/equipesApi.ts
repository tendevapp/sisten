/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin > Equipes — leitura dos eventos pela função `adm_equipes_eventos`
 * (só administrador). Uma chamada por período: devolve pessoas e eventos.
 */

import { supabase } from '../db/supabaseClient';
import type { DadosEquipes, EventoEquipe, PessoaEquipe } from './equipes';

const numOuNulo = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function carregarDadosEquipes(de: string, ate: string): Promise<DadosEquipes> {
  const { data, error } = await supabase.rpc('adm_equipes_eventos' as any, { p_de: de, p_ate: ate } as any);
  if (error) throw new Error(error.message);
  const bruto = (data ?? {}) as { pessoas?: any[]; eventos?: any[] };
  const pessoas: PessoaEquipe[] = (bruto.pessoas ?? []).map(p => ({
    id: String(p.id),
    nome: String(p.nome ?? '').trim() || 'Sem nome',
    setor: p.setor == null ? null : String(p.setor),
    status: p.status ?? null,
    cargo: p.cargo ?? null,
  }));
  const eventos: EventoEquipe[] = (bruto.eventos ?? []).map(e => ({
    t: e.t,
    u: String(e.u),
    em: String(e.em),
    q: numOuNulo(e.q),
    d: numOuNulo(e.d),
    f: e.f == null ? null : Boolean(e.f),
    n: numOuNulo(e.n),
    v: numOuNulo(e.v),
  }));
  return { de, ate, pessoas, eventos };
}
