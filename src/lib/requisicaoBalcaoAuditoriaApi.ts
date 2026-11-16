/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Leitura da auditoria Requisição no Balcão × MB51 (RPC
 * `alm_rqb_auditoria_mb51`) e dos lançamentos da MB51 de um material.
 */

import { supabase } from '../db/supabaseClient';
import { buscarTudo } from './buscarTudo';
import type {
  BasePeriodo, ItemParaContar, LinhaAuditoriaRqb, LinhaDivergenciaDoc, RqbDaDivergencia, UltimaImportacaoMb51,
} from './requisicaoBalcaoAuditoria';
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
    doc_qtd: l.doc_qtd == null ? null : Number(l.doc_qtd),
    doc_qtd_rqbs: l.doc_qtd_rqbs == null ? null : Number(l.doc_qtd_rqbs),
  }));
}

/**
 * Documento × material em que as RQBs não batem com o documento na MB51
 * (RPC `alm_rqb_divergencias_doc`). O período filtra pelos itens: entra o par
 * com ao menos um item no período, com as quantidades do par inteiro.
 */
export async function listarDivergenciasDoc(
  p: Omit<ParametrosAuditoria, 'material'> & {
    /** Só estes documentos (ex.: os da planilha que acabou de ser importada). */
    docs?: string[] | null;
    /** Devolve também os pares que batem ('ok') e os de doc. ainda fora da MB51. */
    todas?: boolean;
  },
): Promise<LinhaDivergenciaDoc[]> {
  const linhas = await buscarTudo<LinhaDivergenciaDoc>((de, ate) =>
    (supabase.rpc as any)('alm_rqb_divergencias_doc', {
      p_de: p.de || null,
      p_ate: p.ate || null,
      p_base: p.base,
      p_docs: p.docs?.length ? p.docs : null,
      p_todas: !!p.todas,
    }).range(de, ate));
  return linhas.map((l) => ({
    ...l,
    qtd_rqbs: Number(l.qtd_rqbs),
    qtd_doc: Number(l.qtd_doc),
    falta: Number(l.falta),
    preco_medio: l.preco_medio == null ? null : Number(l.preco_medio),
    valor_falta: Number(l.valor_falta) || 0,
    rqbs: ((l.rqbs ?? []) as RqbDaDivergencia[]).map((r) => ({ ...r, quantidade: Number(r.quantidade) })),
  }));
}

/** Última importação da MB51 (log em ops_importacoes) e até que data ela traz lançamentos. */
export async function ultimaImportacaoMb51(): Promise<UltimaImportacaoMb51> {
  const [log, mov] = await Promise.all([
    (supabase.from as any)('ops_importacoes')
      .select('created_at, user_name, filename')
      .eq('type', 'MB51')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    (supabase.from as any)('sap_mb51_mov')
      .select('data_lancamento')
      .order('data_lancamento', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (log.error) throw new Error(log.error.message);
  if (mov.error) throw new Error(mov.error.message);
  return {
    importadaEm: log.data?.created_at ?? null,
    por: log.data?.user_name ?? null,
    arquivo: log.data?.filename ?? null,
    lancamentosAte: mov.data?.data_lancamento ?? null,
  };
}

/** Quais destes documentos já estão na MB51 importada. */
export async function documentosNaMb51(docs: string[]): Promise<Set<string>> {
  const presentes = new Set<string>();
  for (let i = 0; i < docs.length; i += 100) {
    const lote = docs.slice(i, i + 100);
    const linhas = await buscarTudo<{ doc_material: string }>((de, ate) =>
      (supabase.from as any)('sap_mb51_mov')
        .select('doc_material')
        .in('doc_material', lote)
        .order('id', { ascending: true })
        .range(de, ate));
    for (const l of linhas) presentes.add(String(l.doc_material));
  }
  return presentes;
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
