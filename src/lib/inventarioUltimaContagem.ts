/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Última contagem do Inventário Cíclico por material — mostrada no Cadastro
 * de Itens (cartão e detalhe) e no diálogo do QR da etiqueta.
 *
 * Lê só data, autor e resultado. `alm_inventario_contagens.saldo_ref` não tem
 * grant de leitura (contagem cega): as colunas vão listadas, nunca `*`.
 */

import { supabase } from '../db/supabaseClient';
import { normalizeCode } from './almoxarifado';
import { buscarTudo } from './buscarTudo';
import { diasEntre, rotuloDias, type StatusItemInventario } from './inventarioCiclico';

export interface UltimaContagem {
  material: string;
  deposito: string;
  status: StatusItemInventario;
  inventario: string;
  numero: number;
  contadoEm: string;
  contadoPor: string | null;
}

/** Linha como volta do PostgREST: item com o inventário e as contagens embutidos. */
export interface LinhaItemContado {
  material: string;
  deposito: string;
  status: StatusItemInventario;
  inventario: { codigo: string; excluido: boolean } | null;
  contagens: { numero: number; created_at: string; contado_por_nome: string | null }[] | null;
}

const SELECT_ITEM_CONTADO =
  'material, deposito, status, inventario:alm_inventarios!inner(codigo, excluido), contagens:alm_inventario_contagens!inner(numero, created_at, contado_por_nome)';

/** A contagem mais recente de cada material (qualquer depósito), fora dos inventários excluídos. */
export function ultimasPorMaterial(linhas: LinhaItemContado[]): Map<string, UltimaContagem> {
  const mapa = new Map<string, UltimaContagem>();
  for (const l of linhas) {
    if (!l.inventario || l.inventario.excluido) continue;
    for (const c of l.contagens ?? []) {
      const chave = normalizeCode(l.material);
      const atual = mapa.get(chave);
      if (atual && atual.contadoEm >= c.created_at) continue;
      mapa.set(chave, {
        material: l.material,
        deposito: l.deposito,
        status: l.status,
        inventario: l.inventario.codigo,
        numero: c.numero,
        contadoEm: c.created_at,
        contadoPor: c.contado_por_nome,
      });
    }
  }
  return mapa;
}

/** Todas as últimas contagens — uma consulta paginada para a tela inteira. */
export async function listarUltimasContagens(): Promise<Map<string, UltimaContagem>> {
  const linhas = await buscarTudo<LinhaItemContado>((de, ate) =>
    (supabase.from as any)('alm_inventario_itens')
      .select(SELECT_ITEM_CONTADO)
      .eq('inventario.excluido', false)
      .order('id')
      .range(de, ate),
  );
  return ultimasPorMaterial(linhas);
}

/** Última contagem de um material, ou `null` se nunca foi inventariado. */
export async function ultimaContagemDoMaterial(codigo: string): Promise<UltimaContagem | null> {
  const material = normalizeCode(codigo);
  const { data, error } = await (supabase.from as any)('alm_inventario_itens')
    .select(SELECT_ITEM_CONTADO)
    .eq('material', material)
    .eq('inventario.excluido', false);
  if (error) throw new Error(error.message);
  return ultimasPorMaterial((data ?? []) as LinhaItemContado[]).get(material) ?? null;
}

/** Resultado da última contagem, em frase curta: "Divergiu" é a recontagem ainda por decidir. */
const RESULTADO: Record<StatusItemInventario, string> = {
  conferido: 'Conferido',
  divergente: 'Divergente',
  aguardando_decisao: 'Divergiu',
  pendente: 'Contado',
};

/** "Conferido hoje", "Divergente há 12 dias", "Divergiu ontem". */
export function resumoUltimaContagem(u: UltimaContagem, hojeISO: string): string {
  return `${RESULTADO[u.status]} ${rotuloDias(diasEntre(dataLocalISO(u.contadoEm), hojeISO))}`;
}

/** Dia local (America/Sao_Paulo no aparelho) do carimbo do servidor, em AAAA-MM-DD. */
export function dataLocalISO(carimbo: string): string {
  const d = new Date(carimbo);
  if (Number.isNaN(d.getTime())) return carimbo.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
