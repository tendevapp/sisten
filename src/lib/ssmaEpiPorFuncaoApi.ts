import { supabase } from '../db/supabaseClient';
import { listarBookEpis, type SsmaBookEpi } from './ssmaBookEpisApi';
import { parseCadastroEpiPorFuncaoWorkbook, sugerirEpiDoBook, type CadastroEpiPorFuncaoImportado, type ClassificacaoEpiFuncao } from './epiPorFuncaoImportacao';

export interface SsmaEpiFuncao {
  id: string;
  codigo_origem: string;
  nome: string;
  ativo: boolean;
}

export interface SsmaEpiPorFuncao {
  id: string;
  funcao_id: string;
  epi_book_id: string | null;
  codigo_vinculo_origem: string | null;
  codigo_epi_origem: string;
  descricao_epi_origem: string;
  ca_origem: string | null;
  classificacao: ClassificacaoEpiFuncao;
  condicao_uso: string | null;
  ativo: boolean;
  funcao?: SsmaEpiFuncao;
  epi_book?: SsmaBookEpi | null;
}

export type SalvarEpiPorFuncao = Pick<SsmaEpiPorFuncao,
  'funcao_id' | 'epi_book_id' | 'codigo_epi_origem' | 'descricao_epi_origem' | 'ca_origem' | 'classificacao' | 'condicao_uso' | 'ativo'
> & { id?: string; codigo_vinculo_origem?: string | null };

const funcoes = () => (supabase.from as any)('ssma_epi_funcoes');
const requisitos = () => (supabase.from as any)('ssma_epi_por_funcao');

export function mensagemErroEpiPorFuncao(erro: unknown): string {
  const detalhe = erro && typeof erro === 'object' ? erro as Record<string, unknown> : {};
  if (detalhe.status === 404 || detalhe.code === 'PGRST205' || detalhe.code === '42P01') return 'O cadastro de EPI por função ainda não está disponível no banco. Aplique a migration do SSMA.';
  return typeof detalhe.message === 'string' ? detalhe.message : 'Não foi possível concluir a operação de EPI por função.';
}

export async function listarFuncoesEpi(incluirInativas = false): Promise<SsmaEpiFuncao[]> {
  let query = funcoes().select('*').order('nome');
  if (!incluirInativas) query = query.eq('ativo', true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function listarEpisPorFuncao(funcaoId?: string, incluirInativos = false): Promise<SsmaEpiPorFuncao[]> {
  let query = requisitos().select('*, funcao:ssma_epi_funcoes(*), epi_book:ssma_book_epis(*)').order('codigo_epi_origem');
  if (funcaoId) query = query.eq('funcao_id', funcaoId);
  if (!incluirInativos) query = query.eq('ativo', true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export function proximoCodigoFuncao(existentes: Array<{ codigo_origem: string }>): string {
  let maior = 0;
  for (const item of existentes) {
    const match = item.codigo_origem?.match(/^FUN-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maior) maior = num;
    }
  }
  return `FUN-${String(maior + 1).padStart(3, '0')}`;
}

export function proximoCodigoEpiManual(existentes: Array<{ codigo_epi_origem: string }>): string {
  let maior = 0;
  for (const item of existentes) {
    const match = item.codigo_epi_origem?.match(/^EPI-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maior) maior = num;
    }
  }
  return `EPI-${String(maior + 1).padStart(3, '0')}`;
}

export async function salvarFuncaoEpi(item: {
  id?: string;
  codigo_origem?: string;
  nome: string;
  ativo: boolean;
}): Promise<SsmaEpiFuncao> {
  const nomeLimpo = item.nome.trim().toUpperCase();
  if (!nomeLimpo) throw new Error('O nome da função é obrigatório.');

  if (item.id) {
    const { data, error } = await funcoes()
      .update({
        nome: nomeLimpo,
        ativo: item.ativo,
        ...(item.codigo_origem ? { codigo_origem: item.codigo_origem.trim().toUpperCase() } : {}),
      })
      .eq('id', item.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  // Novo cadastro: calcula código caso não fornecido
  let codigo = item.codigo_origem?.trim().toUpperCase();
  if (!codigo) {
    const todas = await listarFuncoesEpi(true);
    codigo = proximoCodigoFuncao(todas);
  }

  const { data, error } = await funcoes()
    .insert({
      codigo_origem: codigo,
      nome: nomeLimpo,
      ativo: item.ativo ?? true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function excluirEpiPorFuncao(id: string): Promise<void> {
  const { error } = await requisitos().delete().eq('id', id);
  if (error) throw error;
}

export function identificarDuplicadoEpi(
  itemOrigem: { epi_book_id?: string | null; descricao_epi_origem: string },
  itensDestino: Array<{ epi_book_id?: string | null; descricao_epi_origem: string }>
): boolean {
  const descOrigem = itemOrigem.descricao_epi_origem.trim().toUpperCase();
  return itensDestino.some(dest => {
    if (itemOrigem.epi_book_id && dest.epi_book_id && itemOrigem.epi_book_id === dest.epi_book_id) {
      return true;
    }
    return dest.descricao_epi_origem.trim().toUpperCase() === descOrigem;
  });
}

export function prepararRequisitosParaCopia(
  itensOrigem: SsmaEpiPorFuncao[],
  itensDestinoExistentes: SsmaEpiPorFuncao[],
  funcaoDestinoId: string,
  opcoes?: {
    requisitoIds?: string[];
  }
): {
  itensParaInserir: Array<Omit<SalvarEpiPorFuncao, 'id'>>;
  ignoradosDuplicados: number;
} {
  const selecionados = opcoes?.requisitoIds
    ? itensOrigem.filter(r => opcoes.requisitoIds!.includes(r.id))
    : itensOrigem;

  const codigosUsados = new Set<string>(
    itensDestinoExistentes.map(item => item.codigo_epi_origem.trim().toUpperCase())
  );

  let maiorNumero = 0;
  for (const cod of codigosUsados) {
    const match = cod.match(/^EPI-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maiorNumero) maiorNumero = num;
    }
  }

  const gerarProximoCodigo = (): string => {
    maiorNumero += 1;
    let candidato = `EPI-${String(maiorNumero).padStart(3, '0')}`;
    while (codigosUsados.has(candidato)) {
      maiorNumero += 1;
      candidato = `EPI-${String(maiorNumero).padStart(3, '0')}`;
    }
    codigosUsados.add(candidato);
    return candidato;
  };

  const itensParaInserir: Array<Omit<SalvarEpiPorFuncao, 'id'>> = [];
  let ignoradosDuplicados = 0;

  for (const item of selecionados) {
    if (identificarDuplicadoEpi(item, itensDestinoExistentes)) {
      ignoradosDuplicados += 1;
      continue;
    }

    let codigoEscolhido = item.codigo_epi_origem?.trim().toUpperCase();
    if (!codigoEscolhido || codigosUsados.has(codigoEscolhido)) {
      codigoEscolhido = gerarProximoCodigo();
    } else {
      codigosUsados.add(codigoEscolhido);
      const match = codigoEscolhido.match(/^EPI-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maiorNumero) maiorNumero = num;
      }
    }

    itensParaInserir.push({
      funcao_id: funcaoDestinoId,
      epi_book_id: item.epi_book_id,
      codigo_vinculo_origem: null,
      codigo_epi_origem: codigoEscolhido,
      descricao_epi_origem: item.descricao_epi_origem.trim().toUpperCase(),
      ca_origem: item.ca_origem,
      classificacao: item.classificacao,
      condicao_uso: item.condicao_uso,
      ativo: item.ativo,
    });
  }

  return { itensParaInserir, ignoradosDuplicados };
}

export interface CopiarEpisParametros {
  funcaoOrigemId: string;
  funcaoDestinoId: string;
  requisitoIds?: string[];
}

export async function copiarEpisEntreFuncoes(
  params: CopiarEpisParametros
): Promise<{ copiados: SsmaEpiPorFuncao[]; ignoradosDuplicados: number }> {
  const { funcaoOrigemId, funcaoDestinoId, requisitoIds } = params;
  if (!funcaoOrigemId || !funcaoDestinoId) {
    throw new Error('Função de origem e destino são obrigatórias.');
  }
  if (funcaoOrigemId === funcaoDestinoId) {
    throw new Error('A função de origem e a função de destino não podem ser iguais.');
  }

  const [itensOrigem, itensDestinoExistentes] = await Promise.all([
    listarEpisPorFuncao(funcaoOrigemId, true),
    listarEpisPorFuncao(funcaoDestinoId, true),
  ]);

  const { itensParaInserir, ignoradosDuplicados } = prepararRequisitosParaCopia(
    itensOrigem,
    itensDestinoExistentes,
    funcaoDestinoId,
    { requisitoIds }
  );

  if (itensParaInserir.length === 0) {
    return { copiados: [], ignoradosDuplicados };
  }

  const { data, error } = await requisitos()
    .insert(itensParaInserir)
    .select('*, funcao:ssma_epi_funcoes(*), epi_book:ssma_book_epis(*)');

  if (error) throw error;
  return { copiados: data || [], ignoradosDuplicados };
}

export async function salvarEpiPorFuncao(item: SalvarEpiPorFuncao): Promise<SsmaEpiPorFuncao> {
  const { id, ...payload } = item;
  const query = id ? requisitos().update(payload).eq('id', id).select('*, funcao:ssma_epi_funcoes(*), epi_book:ssma_book_epis(*)').single()
    : requisitos().insert(payload).select('*, funcao:ssma_epi_funcoes(*), epi_book:ssma_book_epis(*)').single();
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function importarEpiPorFuncao(cadastro: CadastroEpiPorFuncaoImportado): Promise<{ funcoes: number; requisitos: number; vinculadosBook: number }> {
  const { error: erroFuncoes } = await funcoes().upsert(cadastro.funcoes.map(funcao => ({
    codigo_origem: funcao.codigo, nome: funcao.nome, ativo: funcao.ativo,
  })), { onConflict: 'codigo_origem' });
  if (erroFuncoes) throw erroFuncoes;

  const [funcoesImportadas, book] = await Promise.all([listarFuncoesEpi(true), listarBookEpis(true)]);
  const porCodigo = new Map(funcoesImportadas.map(funcao => [funcao.codigo_origem, funcao.id]));
  const sugestoes = new Map<string, SsmaBookEpi | null>();
  const obterSugestao = (codigo: string, descricao: string) => {
    if (!sugestoes.has(codigo)) sugestoes.set(codigo, sugerirEpiDoBook(descricao, book));
    return sugestoes.get(codigo) || null;
  };
  const payload = cadastro.requisitos.map(requisito => ({
    funcao_id: porCodigo.get(requisito.codigoFuncao),
    epi_book_id: obterSugestao(requisito.codigoEpi, requisito.descricaoEpi)?.id || null,
    codigo_vinculo_origem: requisito.codigoVinculo,
    codigo_epi_origem: requisito.codigoEpi,
    descricao_epi_origem: requisito.descricaoEpi,
    ca_origem: requisito.ca,
    classificacao: requisito.classificacao,
    condicao_uso: requisito.condicaoUso,
    ativo: requisito.ativo,
  }));
  if (payload.some(item => !item.funcao_id)) throw new Error('A planilha possui vínculo para função não cadastrada.');
  const { error: erroRequisitos } = await requisitos().upsert(payload, { onConflict: 'funcao_id,codigo_epi_origem' });
  if (erroRequisitos) throw erroRequisitos;
  return { funcoes: cadastro.funcoes.length, requisitos: payload.length, vinculadosBook: payload.filter(item => item.epi_book_id).length };
}

export async function importarEpiPorFuncaoWorkbook(buffer: ArrayBuffer) {
  return importarEpiPorFuncao(await parseCadastroEpiPorFuncaoWorkbook(buffer));
}
