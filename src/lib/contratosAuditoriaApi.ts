/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Leitura das views da Auditoria de contratos. Todas paginadas por
 * `buscarTudo` (o PostgREST corta em 1.000 linhas sem avisar) com ordem
 * estável. As views ainda não estão em `database.types.ts`, por isso o
 * cliente sem tipo.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../db/supabaseClient';
import { buscarTudo } from './buscarTudo';
import type {
  AlteracaoContrato, CoberturaAuditoria, PartidaMiroRow, PartidaSemPedidoRow, PedidoAuditoria,
} from './contratosAuditoria';

export interface DadosAuditoria {
  pedidos: PedidoAuditoria[];
  partidas: PartidaMiroRow[];
  semPedido: PartidaSemPedidoRow[];
  alteracoes: AlteracaoContrato[];
  cobertura: CoberturaAuditoria | null;
}

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function carregarDadosAuditoria(): Promise<DadosAuditoria> {
  if (!supabase) throw new Error('Sem conexão com o servidor.');
  const db = supabase as unknown as SupabaseClient;

  const [pedidos, partidas, semPedido, alteracoes, cobertura] = await Promise.all([
    buscarTudo<PedidoAuditoria>((de, ate) =>
      db.from('vw_contratos_aud_pedidos').select('*').order('contrato').order('pedido').range(de, ate)),
    buscarTudo<PartidaMiroRow>((de, ate) =>
      db.from('vw_contratos_aud_partidas').select('*')
        .order('contrato').order('doc_miro').order('ano_miro').order('fbl_id', { nullsFirst: true }).range(de, ate)),
    buscarTudo<PartidaSemPedidoRow>((de, ate) =>
      db.from('vw_contratos_aud_partidas_sem_pedido').select('*').order('fbl_id').range(de, ate)),
    buscarTudo<AlteracaoContrato>((de, ate) =>
      db.from('sup_contratos_alteracoes').select('*').order('id').range(de, ate)),
    db.from('vw_contratos_aud_cobertura').select('*').maybeSingle(),
  ]);
  if (cobertura.error) throw new Error(cobertura.error.message);

  // numeric do Postgres pode chegar como string; normaliza os valores somados.
  return {
    pedidos: pedidos.map(p => ({ ...p, valor: numero(p.valor), valor_eliminado: numero(p.valor_eliminado) })),
    partidas: partidas.map(p => ({
      ...p,
      valor_miro_estimado: numero(p.valor_miro_estimado),
      montante_moeda_doc: numero(p.montante_moeda_doc),
      montante_irf: numero(p.montante_irf),
    })),
    semPedido: semPedido.map(p => ({ ...p, montante_moeda_doc: numero(p.montante_moeda_doc) })),
    alteracoes,
    cobertura: (cobertura.data as CoberturaAuditoria | null) ?? null,
  };
}
