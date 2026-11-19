/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Leitura do relatório de chegadas de transporte: registros do período
 * (paginado — o PostgREST corta em 1.000 linhas) e janelas de chegada
 * (`port_transporte_janelas`, editáveis só pelo admin).
 */

import { supabase } from '../db/supabaseClient';
import type { PortRegistroTransporte } from '../types';
import { buscarTudo } from './buscarTudo';
import type { JanelaChegada } from './relatorioChegadasTransporte';

const janelas = () => (supabase.from as any)('port_transporte_janelas');

export async function listarTransportesPeriodo(de: string, ate: string): Promise<PortRegistroTransporte[]> {
  return buscarTudo<PortRegistroTransporte>((ini, fim) => (supabase.from as any)('port_registro_transportes')
    .select('*')
    .is('excluido_em', null)
    .gte('data', de)
    .lte('data', ate)
    .order('data')
    .order('hora_chegada')
    .order('id')
    .range(ini, fim));
}

export async function listarJanelasChegada(): Promise<JanelaChegada[]> {
  const { data, error } = await janelas().select('*').order('ordem');
  if (error) throw new Error(error.message);
  return ((data ?? []) as JanelaChegada[]).map(j => ({
    ...j,
    inicio: String(j.inicio).slice(0, 5),
    fim: String(j.fim).slice(0, 5),
    limite: j.limite ? String(j.limite).slice(0, 5) : null,
  }));
}

/** Grava a lista inteira: atualiza/cria as que vieram e apaga as que saíram. */
export async function salvarJanelasChegada(lista: JanelaChegada[], removidas: string[], porNome: string): Promise<void> {
  if (removidas.length) {
    const { error } = await janelas().delete().in('id', removidas);
    if (error) throw new Error(error.message);
  }
  const linhas = lista.map((j, i) => ({
    ...(j.id.startsWith('nova-') ? {} : { id: j.id }),
    nome: j.nome.trim(),
    inicio: j.inicio,
    fim: j.fim,
    limite: j.limite || null,
    tolerancia_min: Math.max(0, Math.min(180, Math.round(Number(j.tolerancia_min) || 0))),
    ordem: i + 1,
    ativo: j.ativo,
    atualizado_por: porNome,
    updated_at: new Date().toISOString(),
  }));
  const existentes = linhas.filter(l => 'id' in l);
  const novas = linhas.filter(l => !('id' in l));
  if (existentes.length) {
    const { error } = await janelas().upsert(existentes);
    if (error) throw new Error(error.message);
  }
  if (novas.length) {
    const { error } = await janelas().insert(novas);
    if (error) throw new Error(error.message);
  }
}
