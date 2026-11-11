/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Leitura da auditoria Requisição no Balcão × MB51 (RPC
 * `alm_rqb_auditoria_mb51`) e dos lançamentos da MB51 de um material.
 */

import { supabase } from '../db/supabaseClient';
import { buscarTudo } from './buscarTudo';
import type { BasePeriodo, ItemParaContar, LinhaAuditoriaRqb } from './requisicaoBalcaoAuditoria';
import { criarInventario, definirReservaInventario } from './inventarioCiclicoApi';
import { dataHojeLocal } from './dataLocal';

export interface ParametrosAuditoria {
  material?: string | null;
  base: BasePeriodo;
  de?: string | null;
  ate?: string | null;
}

/** Uma linha por item de requisição. Pagina: passa de 1.000 linhas (max_rows do PostgREST). */
export async function auditarRequisicoesMb51(p: ParametrosAuditoria): Promise<LinhaAuditoriaRqb[]> {
  const linhas = await buscarTudo<LinhaAuditoriaRqb>((de, ate) =>
    (supabase.rpc as any)('alm_rqb_auditoria_mb51', {
      p_material: p.material?.trim() || null,
      p_de: p.de || null,
      p_ate: p.ate || null,
      p_base: p.base,
    }).range(de, ate));
  return linhas.map((l) => ({
    ...l,
    quantidade: Number(l.quantidade),
    mb51_coberto: l.mb51_coberto == null ? null : Number(l.mb51_coberto),
    mb51_qtd_dia: l.mb51_qtd_dia == null ? null : Number(l.mb51_qtd_dia),
    esperado_dia: l.esperado_dia == null ? null : Number(l.esperado_dia),
  }));
}

export interface MovimentoMb51 {
  id: number;
  data_lancamento: string;
  doc_material: string;
  tipo_movimento: string;
  deposito: string | null;
  qtd_um_registro: number;
  unid_medida_basica: string | null;
  elemento_pep: string | null;
  nome_usuario: string | null;
  referencia: string | null;
  texto_cabecalho_doc: string | null;
}

/** Movimentos tipos de saída (201/221/241 e estornos) e transferência (311/312) — os que a requisição gera. */
export const TIPOS_MB51_BALCAO = ['201', '202', '221', '222', '241', '242', '311', '312'];

/** Lançamentos da MB51 de um material, do mais recente para o mais antigo. */
export async function movimentosMb51DoMaterial(material: string, desde?: string | null): Promise<MovimentoMb51[]> {
  const codigo = material.trim().replace(/^0+/, '');
  return buscarTudo<MovimentoMb51>((de, ate) => {
    let q = (supabase.from as any)('sap_mb51_mov')
      .select('id, data_lancamento, doc_material, tipo_movimento, deposito, qtd_um_registro, unid_medida_basica, elemento_pep, nome_usuario, referencia, texto_cabecalho_doc')
      .eq('material', codigo)
      .in('tipo_movimento', TIPOS_MB51_BALCAO);
    if (desde) q = q.gte('data_lancamento', desde);
    return q.order('data_lancamento', { ascending: false }).order('id', { ascending: true }).range(de, ate);
  });
}

/**
 * Abre um Inventário Cíclico com os itens escolhidos no relatório, para
 * confirmar a quantidade física. Passa pela mesma reserva da tela de
 * inventário: item já em contagem aberta noutro inventário é recusado pelo
 * banco com o nome de quem tem. Devolve o id e o código INV.
 */
export async function abrirInventarioDaAuditoria(
  itens: ItemParaContar[],
  usuario: { name: string },
  observacao: string,
): Promise<{ id: string; codigo: string }> {
  if (itens.length === 0) throw new Error('Selecione ao menos um item.');
  const sessao = crypto.randomUUID();
  const lista = itens.map((i) => ({ material: i.material, deposito: i.deposito }));
  await definirReservaInventario(sessao, lista);
  return criarInventario({
    data: dataHojeLocal(),
    criterio: 'Auditoria Requisição no Balcão × MB51',
    observacao: observacao || null,
    conferente_nome: null,
    criado_por_nome: usuario.name,
    reserva_sessao: sessao,
  }, lista);
}
