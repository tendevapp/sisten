/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Financeiro > Mercado Livre — I/O de `fin_ml_compras`, `fin_ml_baixas` e
 * `vw_fin_ml_itens` (migration 20261028190000). Tabelas fora de
 * `database.types.ts`, daí o `as any`. Regras em `finMercadoLivre.ts`.
 *
 * Tela administrativa: não entra na fila offline (`configFormularios.ts`) —
 * baixa financeira sem rede deve falhar, não ficar pendente no aparelho.
 */

import { supabase } from '../db/supabaseClient';
import type { BaixaFinMl, CompraFinMl, ItemFinMl } from './finMercadoLivre';

const db = (tabela: string) => (supabase as any).from(tabela);

interface Usuario { id: string; nome: string }

export interface DadosFinMl {
  itens: ItemFinMl[];
  compras: CompraFinMl[];
  baixas: BaixaFinMl[];
}

export async function carregarFinMercadoLivre(): Promise<DadosFinMl> {
  const [itens, compras, baixas] = await Promise.all([
    db('vw_fin_ml_itens').select('*'),
    db('fin_ml_compras').select('*'),
    db('fin_ml_baixas').select('*').order('data_baixa', { ascending: false }),
  ]);
  const erro = itens.error || compras.error || baixas.error;
  if (erro) throw new Error(erro.message);
  return {
    itens: (itens.data ?? []) as ItemFinMl[],
    compras: (compras.data ?? []) as CompraFinMl[],
    baixas: (baixas.data ?? []) as BaixaFinMl[],
  };
}

export interface DadosBoleto {
  valor_boleto: number | null;
  vencimento: string | null;
  linha_digitavel: string | null;
  pago_em: string | null;
  doc_adiantamento: string | null;
  observacao: string | null;
}

export async function salvarBoletoMl(numeroCompra: string, dados: DadosBoleto, usuario: Usuario): Promise<void> {
  const { error } = await db('fin_ml_compras').upsert({
    numero_compra: numeroCompra,
    ...dados,
    atualizado_por_id: usuario.id,
    atualizado_por_nome: usuario.nome,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'numero_compra' });
  if (error) throw new Error(error.message);
}

export interface NovaBaixa {
  numero_compra: string;
  ri: string | null;
  valor: number;
  data_baixa: string;
  nota_fiscal: string | null;
  doc_compensacao: string | null;
  observacao: string | null;
}

/** Lança várias baixas de uma vez (uma por item marcado). */
export async function lancarBaixasMl(baixas: NovaBaixa[], usuario: Usuario): Promise<void> {
  if (baixas.length === 0) return;
  const { error } = await db('fin_ml_baixas').insert(
    baixas.map(b => ({ ...b, criado_por_id: usuario.id, criado_por_nome: usuario.nome })),
  );
  if (error) throw new Error(error.message);
}

/** Estorno não apaga a baixa: marca quem estornou e por quê. */
export async function estornarBaixaMl(id: string, motivo: string, usuario: Usuario): Promise<void> {
  const { data, error } = await db('fin_ml_baixas')
    .update({ estornado_em: new Date().toISOString(), estornado_por_nome: usuario.nome, motivo_estorno: motivo })
    .eq('id', id)
    .is('estornado_em', null)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Só quem lançou a baixa (ou um admin) pode estorná-la.');
}
