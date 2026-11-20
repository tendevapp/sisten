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
  BasePeriodo, ItemParaContar, LinhaAuditoriaRqb, LinhaDivergenciaDoc, RqbDaDivergencia,
} from './requisicaoBalcaoAuditoria';
import { criarInventario, definirReservaInventario } from './inventarioCiclicoApi';
import { dataHojeLocal } from './dataLocal';
import { prepararCasos, type MovimentoSimulacao } from './simulacaoBaixas';
import { BALCAO_CENTRO } from './requisicaoBalcaoPlanilha';
import { sugerirDocsSemSap, type CandidatosSemSap, type ConferenciaSemSap } from './requisicaoBalcaoDocProvavel';
import type { EstoqueItem } from '../types';

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
 * Exportadas sem doc. SAP: o documento mais provável na MB51 de cada uma, casado
 * linha a linha nos dois sentidos (RPC `alm_rqb_sem_doc_candidatos` + `sugerirDocsSemSap`).
 */
export async function sugerirDocsExportadasSemSap(): Promise<{ mapa: Map<string, ConferenciaSemSap>; ate: string | null; ultimo: string | null }> {
  const { data, error } = await (supabase.rpc as any)('alm_rqb_sem_doc_candidatos');
  if (error) throw new Error(error.message);
  const dados = (data ?? {}) as CandidatosSemSap;
  return {
    mapa: sugerirDocsSemSap({
      mb51_ate: dados.mb51_ate ?? null,
      mb51_ultimo: dados.mb51_ultimo ?? null,
      itens: dados.itens ?? [],
      linhas: dados.linhas ?? [],
      estornos: dados.estornos ?? [],
      vinculados: dados.vinculados ?? [],
    }),
    ate: dados.mb51_ate ?? null,
    ultimo: dados.mb51_ultimo ?? null,
  };
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

export async function carregarSimulacaoBaixas() {
  const [pares, itens, estoque, importacao] = await Promise.all([
    listarDivergenciasDoc({ base: 'exportacao' }),
    auditarRequisicoesMb51({ base: 'exportacao' }),
    buscarTudo<EstoqueItem>((de, ate) => supabase.from('sap_zl0024_stk')
      .select('id, material, deposito, quantidade, umb, posicao_estoque').eq('centro', BALCAO_CENTRO).order('id').range(de, ate)),
    supabase.from('ops_importacoes').select('created_at').eq('type', 'ZL0024').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (importacao.error) throw importacao.error;
  const docs = [...new Set(pares.filter(p => ['fora_do_doc', 'parcial'].includes(p.situacao)).map(p => p.doc))];
  const movimentos = await movimentosParaSimular(docs);
  return { casos: prepararCasos(pares, itens, movimentos), estoque, zlEm: importacao.data?.created_at,
    itens, pares, movimentos, mbAte: itens[0]?.mb51_ate };
}

export async function movimentosParaSimular(docs: string[]): Promise<MovimentoSimulacao[]> {
  const movimentos: MovimentoSimulacao[] = [];
  for (let i = 0; i < docs.length; i += 50) {
    movimentos.push(...await buscarTudo<MovimentoSimulacao>((de, ate) => supabase.from('sap_mb51_mov')
      .select('doc_material,material,deposito,tipo_movimento,qtd_um_registro,um_registro')
      .in('doc_material', docs.slice(i, i + 50)).order('id').range(de, ate)));
  }
  return movimentos;
}

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
