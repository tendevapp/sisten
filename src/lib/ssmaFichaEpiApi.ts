/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ficha de EPI (FRM.SEG-0008) — acesso ao Supabase. As regras ficam em
 * `fichaEpi.ts`; a escrita passa pelas RPCs da migration
 * `create_ssma_fichas_epi` (a ficha assinada não aceita UPDATE direto).
 */

import { supabase } from '../db/supabaseClient';
import { gerarCodigoFormulario, proximoIndiceCodigo } from './codigosFormulario';
import type { ItemFichaPayload, ItemHistorico, LinhaConsumo, MotivoMed } from './fichaEpi';

export const PREFIXO_FICHA_EPI = 'EPI';

export interface ColaboradorFichaEpi {
  id: string;
  registro: string;
  nome: string;
  cargo: string | null;
  area: string | null;
  subsetor: string | null;
}

export interface SsmaFichaEpiItem {
  id: string;
  ficha_id: string;
  ordem: number;
  epi_book_id: string | null;
  requisito_id: string | null;
  grupo_epi: string;
  categoria: string | null;
  descricao: string;
  ca: string | null;
  codigo_sap: string | null;
  tamanho: string | null;
  quantidade: number;
  motivo: MotivoMed;
  fora_da_matriz: boolean;
  data_devolucao: string | null;
  devolucao_observacao: string | null;
  devolucao_registrada_por: string | null;
  devolucao_registrada_por_nome: string | null;
  devolucao_registrada_em: string | null;
}

export interface SsmaFichaEpi {
  id: string;
  codigo: string;
  pessoa_id: string;
  registro: string;
  nome: string;
  cargo_rh: string | null;
  setor: string | null;
  funcao_id: string;
  funcao_nome: string;
  data_admissao: string | null;
  data_demissao: string | null;
  data_entrega: string;
  /** Só vem nas consultas de detalhe/PDF — a listagem não carrega a imagem. */
  assinatura_colaborador?: string;
  assinado_em: string;
  observacoes: string | null;
  status: 'ATIVA' | 'CANCELADA';
  cancelamento_motivo: string | null;
  cancelado_por_nome: string | null;
  cancelado_em: string | null;
  criado_por: string;
  criado_por_nome: string | null;
  created_at: string;
  itens: SsmaFichaEpiItem[];
}

export interface NovaFichaEpi {
  pessoa_id: string;
  registro: string;
  nome: string;
  cargo_rh: string | null;
  setor: string | null;
  funcao_id: string;
  funcao_nome: string;
  data_admissao: string | null;
  data_demissao: string | null;
  data_entrega: string;
  assinatura_colaborador: string;
  observacoes: string | null;
}

const fichas = () => (supabase.from as any)('ssma_fichas_epi');
const rpc = (nome: string, args: Record<string, unknown>) => (supabase.rpc as any)(nome, args);

const COLUNAS_FICHA_SEM_ASSINATURA =
  'id, codigo, pessoa_id, registro, nome, cargo_rh, setor, funcao_id, funcao_nome, data_admissao, data_demissao, ' +
  'data_entrega, assinado_em, observacoes, status, cancelamento_motivo, cancelado_por_nome, cancelado_em, ' +
  'criado_por, criado_por_nome, created_at';
const COLUNAS_ITENS = 'itens:ssma_fichas_epi_itens(*)';

export function mensagemErroFichaEpi(erro: unknown): string {
  const detalhe = erro && typeof erro === 'object' ? erro as Record<string, unknown> : {};
  if (detalhe.status === 404 || detalhe.code === 'PGRST205' || detalhe.code === '42P01' || detalhe.code === 'PGRST202') {
    return 'A Ficha de EPI ainda não está disponível no banco. Aplique a migration do SSMA.';
  }
  return typeof detalhe.message === 'string' && detalhe.message ? detalhe.message : 'Não foi possível concluir a operação da Ficha de EPI.';
}

function ordenarItens<T extends { itens?: SsmaFichaEpiItem[] }>(ficha: T): T {
  return { ...ficha, itens: [...(ficha.itens || [])].sort((a, b) => a.ordem - b.ordem) };
}

export async function buscarColaboradoresFichaEpi(termo: string): Promise<ColaboradorFichaEpi[]> {
  const t = termo.trim().replace(/[%,()]/g, ' ');
  let query = supabase.from('rh_pessoas').select('id, registro, nome, cargo, area, subsetor').eq('ativo', true);
  if (t) query = query.or(`nome.ilike.%${t}%,registro.ilike.%${t}%`);
  const { data, error } = await query.order('nome').limit(20);
  if (error) throw error;
  return (data || []) as ColaboradorFichaEpi[];
}

export async function listarColaboradoresAtivos(): Promise<ColaboradorFichaEpi[]> {
  const { data, error } = await supabase
    .from('rh_pessoas')
    .select('id, registro, nome, cargo, area, subsetor')
    .eq('ativo', true)
    .order('nome');
  if (error) throw error;
  return (data || []) as ColaboradorFichaEpi[];
}

export function setorDoColaborador(pessoa: Pick<ColaboradorFichaEpi, 'area' | 'subsetor'>): string | null {
  const partes = [pessoa.area, pessoa.subsetor].map(p => p?.trim()).filter(Boolean);
  return partes.length ? [...new Set(partes)].join(' / ') : null;
}

/** Fichas do colaborador, mais recentes primeiro, com ou sem a assinatura. */
export async function listarFichasDoColaborador(pessoaId: string, comAssinatura = false): Promise<SsmaFichaEpi[]> {
  const colunas = `${COLUNAS_FICHA_SEM_ASSINATURA}${comAssinatura ? ', assinatura_colaborador' : ''}, ${COLUNAS_ITENS}`;
  const { data, error } = await fichas()
    .select(colunas)
    .eq('pessoa_id', pessoaId)
    .order('data_entrega', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(ordenarItens);
}

export async function listarFichas(params: { busca?: string; limite?: number } = {}): Promise<SsmaFichaEpi[]> {
  let query = fichas()
    .select(`${COLUNAS_FICHA_SEM_ASSINATURA}, ${COLUNAS_ITENS}`)
    .order('data_entrega', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(params.limite ?? 300);
  const t = params.busca?.trim().replace(/[%,()]/g, ' ');
  if (t) query = query.or(`nome.ilike.%${t}%,registro.ilike.%${t}%,codigo.ilike.%${t}%,funcao_nome.ilike.%${t}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(ordenarItens);
}

/** Itens já entregues ao colaborador (fichas ativas), para o histórico. */
export function historicoDasFichas(fichasColaborador: SsmaFichaEpi[]): ItemHistorico[] {
  return fichasColaborador
    .filter(f => f.status === 'ATIVA')
    .flatMap(f => f.itens.map(item => ({
      item_id: item.id,
      grupo_epi: item.grupo_epi,
      categoria: item.categoria,
      epi_book_id: item.epi_book_id,
      descricao: item.descricao,
      tamanho: item.tamanho,
      quantidade: Number(item.quantidade),
      data_entrega: f.data_entrega,
      codigo_ficha: f.codigo,
      data_devolucao: item.data_devolucao,
    })));
}

/**
 * Próximo `EPI-DDMMYY-NN`. O índice reinicia por mês (mesmo recorte do RID):
 * a ficha é lançada em lote na admissão, e um recorte diário devolveria
 * códigos repetidos demais para conferência em papel.
 */
async function proximoCodigoFicha(dataEntrega: string): Promise<string> {
  const [ano, mes] = dataEntrega.split('-');
  const { data, error } = await fichas()
    .select('codigo')
    .like('codigo', `${PREFIXO_FICHA_EPI}-__${mes}${ano.slice(-2)}-%`);
  if (error) throw error;
  const indice = proximoIndiceCodigo(PREFIXO_FICHA_EPI, (data || []).map((f: { codigo: string }) => f.codigo));
  return gerarCodigoFormulario(PREFIXO_FICHA_EPI, dataEntrega, indice);
}

export async function criarFichaEpi(ficha: NovaFichaEpi, itens: ItemFichaPayload[]): Promise<{ id: string; codigo: string }> {
  if (!itens.length) throw new Error('Inclua ao menos um EPI na ficha.');
  // Dois técnicos lançando no mesmo instante podem calcular o mesmo índice;
  // o unique(codigo) recusa o segundo e ele tenta o próximo.
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const codigo = await proximoCodigoFicha(ficha.data_entrega);
    const { data, error } = await rpc('ssma_ficha_epi_criar', { p_ficha: { ...ficha, codigo }, p_itens: itens });
    if (!error) return { id: data as string, codigo };
    if (error.code !== '23505') throw error;
  }
  throw new Error('Não foi possível reservar o código da ficha. Tente salvar novamente.');
}

export async function registrarDevolucaoEpi(itemId: string, data: string | null, observacao?: string): Promise<void> {
  const { error } = await rpc('ssma_ficha_epi_registrar_devolucao', { p_item_id: itemId, p_data: data, p_observacao: observacao ?? null });
  if (error) throw error;
}

export async function cancelarFichaEpi(fichaId: string, motivo: string): Promise<void> {
  const { error } = await rpc('ssma_ficha_epi_cancelar', { p_ficha_id: fichaId, p_motivo: motivo });
  if (error) throw error;
}

/** Todo o consumo das fichas ativas; o recorte de período é feito na tela. */
export async function listarConsumoEpi(): Promise<LinhaConsumo[]> {
  const linhas: LinhaConsumo[] = [];
  const pagina = 1000;
  for (let inicio = 0; ; inicio += pagina) {
    const { data, error } = await (supabase.from as any)('ssma_fichas_epi_consumo')
      .select('item_id, ficha_id, pessoa_id, registro, nome, setor, funcao_id, funcao_nome, data_entrega, grupo_epi, categoria, quantidade, motivo, fora_da_matriz, data_devolucao')
      .order('data_entrega')
      .order('item_id')
      .range(inicio, inicio + pagina - 1);
    if (error) throw error;
    linhas.push(...(data || []).map((l: LinhaConsumo) => ({ ...l, quantidade: Number(l.quantidade) })));
    if (!data || data.length < pagina) break;
  }
  return linhas;
}
