import { supabase } from '../db/supabaseClient';

export type StatusPlano = 'programado' | 'realizado' | 'atrasado' | 'reagendado' | 'cancelado';
export interface PlanoRh { id: string; codigo: string; treinamento_id: string | null; titulo: string; responsavel: string | null; data_inicio: string; data_termino: string | null; horario: string | null; carga_horaria: number | null; participantes_planejados: number | null; local: string | null; tipo_informacao: 'interno' | 'externo' | 'nao_informado'; modalidade: string | null; objetivo: string | null; custo_total: number; data_realizada: string | null; status: StatusPlano; comentarios: string | null; categoria: string | null; participantes?: Array<{ count: number }>; }
export interface CronogramaRh { id: string; chave: string; treinamento_id: string | null; descricao: string; cotacao: number; unidade_mes: number; quantidade_total: number; meses: Array<{ id?: string; competencia: string; quantidade: number }>; }
export interface CatalogoRh { id: string; nome: string; tipo_informacao: 'interno' | 'externo' | 'nao_informado'; carga_horaria: number | null; }
export interface ParticipantePlanoRh { id: string; pessoa_id: string | null; registro: string; nome: string | null; area: string | null; data_realizada: string | null; status: string | null; }

const falhar = (error: any) => { if (error) throw new Error(error.message); };

export async function carregarPlanoTreinamentos(): Promise<{ planos: PlanoRh[]; catalogo: CatalogoRh[] }> {
  const [planos, catalogo] = await Promise.all([
    (supabase as any).from('rh_plano_treinamentos').select('*,participantes:rh_plano_treinamentos_participantes(count)').is('excluido_em', null).order('data_inicio', { ascending: false }),
    (supabase as any).from('rh_treinamentos_catalogo').select('id,nome,tipo_informacao,carga_horaria').is('excluido_em', null).eq('ativo', true).order('nome'),
  ]);
  falhar(planos.error); falhar(catalogo.error);
  return { planos: planos.data || [], catalogo: catalogo.data || [] };
}

export async function salvarPlanoTreinamento(item: Partial<PlanoRh>, usuarioId: string): Promise<void> {
  const payload = { ...item, atualizado_por: usuarioId, criado_por: item.id ? undefined : usuarioId };
  const query = (supabase as any).from('rh_plano_treinamentos');
  const result = item.id ? await query.update(payload).eq('id', item.id) : await query.insert(payload);
  falhar(result.error);
}

export async function carregarParticipantesPlano(planoId: string): Promise<ParticipantePlanoRh[]> {
  const resultado = await (supabase as any).from('rh_plano_treinamentos_participantes').select('id,pessoa_id,registro,nome,area,data_realizada,status').eq('plano_id', planoId).is('excluido_em', null).order('nome');
  falhar(resultado.error);
  return resultado.data || [];
}

export async function carregarCronogramaTreinamentos(): Promise<{ itens: CronogramaRh[]; catalogo: CatalogoRh[] }> {
  const [itens, catalogo] = await Promise.all([
    (supabase as any).from('rh_cronogramas_treinamentos').select('*,meses:rh_cronogramas_treinamentos_meses(id,competencia,quantidade)').is('excluido_em', null).order('descricao'),
    (supabase as any).from('rh_treinamentos_catalogo').select('id,nome,tipo_informacao,carga_horaria').is('excluido_em', null).eq('ativo', true).order('nome'),
  ]);
  falhar(itens.error); falhar(catalogo.error);
  return { itens: itens.data || [], catalogo: catalogo.data || [] };
}

export async function salvarCronogramaTreinamento(item: Omit<CronogramaRh, 'id'> & { id?: string }, usuarioId: string): Promise<void> {
  const { meses, ...cabecalho } = item;
  const tabela = (supabase as any).from('rh_cronogramas_treinamentos');
  const resultado = item.id ? await tabela.update({ ...cabecalho, atualizado_por: usuarioId }).eq('id', item.id).select('id').single() : await tabela.insert({ ...cabecalho, criado_por: usuarioId, atualizado_por: usuarioId }).select('id').single();
  falhar(resultado.error);
  const cronogramaId = resultado.data.id;
  const mesesTabela = (supabase as any).from('rh_cronogramas_treinamentos_meses');
  const apagados = await mesesTabela.delete().eq('cronograma_id', cronogramaId);
  falhar(apagados.error);
  const ativos = meses.filter(mes => mes.quantidade > 0).map(mes => ({ cronograma_id: cronogramaId, competencia: mes.competencia, quantidade: mes.quantidade }));
  if (ativos.length) { const inseridos = await mesesTabela.insert(ativos); falhar(inseridos.error); }
}
