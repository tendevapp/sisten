import { supabase } from '../db/supabaseClient';
import type { RhPessoa } from '../types';

export type StatusMatrizTreinamento = 'pendente' | 'apto' | 'vencido' | 'nao_aplicavel';

export interface RhTreinamentoCatalogo {
  id: string;
  nome: string;
  chave: string;
  conteudo: string | null;
  validade_meses: number | null;
  tipo_informacao: 'interno' | 'externo' | 'nao_informado';
  ativo: boolean;
}

export interface RhTreinamentoFuncao {
  cargo: string;
  cargo_chave: string;
  treinamento_id: string;
}

export interface RhAlertaTreinamento {
  pessoa_id: string;
  treinamento_id: string;
  colaborador: string;
  registro: string;
  treinamento: string;
  status_calculado: StatusMatrizTreinamento | 'proximo_vencimento';
  validade_em: string | null;
  dias_para_vencimento: number | null;
}

export interface RhPessoaTreinamento {
  pessoa_id: string;
  treinamento_id: string;
  status: StatusMatrizTreinamento;
  data_capacitacao: string | null;
  validade_em: string | null;
  observacao: string | null;
  atestado_em: string | null;
}

export async function carregarMatrizTreinamentos(): Promise<{ pessoas: RhPessoa[]; catalogo: RhTreinamentoCatalogo[]; requisitos: RhTreinamentoFuncao[]; registros: RhPessoaTreinamento[]; alertas: RhAlertaTreinamento[] }> {
  const [pessoas, catalogo, requisitos, registros, alertas] = await Promise.all([
    supabase.from('rh_pessoas').select('*').eq('ativo', true).order('nome'),
    (supabase as any).from('rh_treinamentos_catalogo').select('id,nome,chave,conteudo,validade_meses,tipo_informacao,ativo').is('excluido_em', null).eq('ativo', true).order('nome'),
    (supabase as any).from('rh_treinamentos_por_funcao').select('cargo,cargo_chave,treinamento_id').is('excluido_em', null).eq('obrigatorio', true),
    (supabase as any).from('rh_pessoas_treinamentos').select('pessoa_id,treinamento_id,status,data_capacitacao,validade_em,observacao,atestado_em').is('excluido_em', null),
    (supabase as any).from('vw_rh_treinamentos_vencimentos').select('pessoa_id,treinamento_id,colaborador,registro,treinamento,status_calculado,validade_em,dias_para_vencimento').in('status_calculado', ['vencido', 'proximo_vencimento']).order('validade_em'),
  ]);
  for (const result of [pessoas, catalogo, requisitos, registros, alertas]) if (result.error) throw new Error(result.error.message);
  return { pessoas: (pessoas.data || []) as RhPessoa[], catalogo: (catalogo.data || []) as RhTreinamentoCatalogo[], requisitos: (requisitos.data || []) as RhTreinamentoFuncao[], registros: (registros.data || []) as RhPessoaTreinamento[], alertas: (alertas.data || []) as RhAlertaTreinamento[] };
}

export async function atestarTreinamentosEmLote(params: { pessoaIds: string[]; treinamentoId: string; status: StatusMatrizTreinamento; dataCapacitacao?: string | null; validadeEm?: string | null; observacao?: string | null; usuarioId: string }): Promise<void> {
  if (!params.pessoaIds.length) throw new Error('Selecione ao menos um colaborador.');
  if (!params.treinamentoId) throw new Error('Selecione o treinamento.');
  const atestado = params.status === 'apto' ? new Date().toISOString() : null;
  const atualizadoEm = new Date().toISOString();
  const { error } = await (supabase as any).from('rh_pessoas_treinamentos').upsert(params.pessoaIds.map(pessoa_id => ({
    pessoa_id,
    treinamento_id: params.treinamentoId,
    status: params.status,
    data_capacitacao: params.dataCapacitacao || null,
    validade_em: params.validadeEm || null,
    observacao: params.observacao?.trim() || null,
    origem: 'manual',
    atestado_em: atestado,
    atestado_por: params.status === 'apto' ? params.usuarioId : null,
    atualizado_por: params.usuarioId,
    updated_at: atualizadoEm,
  })), { onConflict: 'pessoa_id,treinamento_id' });
  if (error) throw new Error(error.message);
}
