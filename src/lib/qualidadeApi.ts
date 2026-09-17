/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Qualidade — API de integração para Gestão de RNC (Relatório de Não
 * Conformidade): CRUD, plano de ação (lista de atividades) e anexos.
 */

import { supabase } from '../db/supabaseClient';
import type {
  QuaRnc,
  QuaRncFiltros,
  QuaRncMetricas,
  QuaRncAnexo,
  QuaPlanoAcaoAtividade,
} from '../types';
import { apenasVigentes, marcarExcluido, marcarRestaurado } from './softDelete';
import { prepareAttachment } from './imageCompression';
import { gerarCodigoFormulario, proximoIndiceCodigo } from './codigosFormulario';
import { buscarHistoricoCampoPortaria } from './portariaApi';

const BUCKET = 'qua-rnc-evidencias';
const PREFIXO = 'RNC';

// `qua_rnc` ainda não existe em `database.types.ts` (gerado pelo Supabase CLI
// a partir do schema remoto) até a migration ser aplicada — mesmo cast usado
// em `buscarHistoricoCampoPortaria` para tabela dinâmica. A tipagem forte do
// módulo vem de `QuaRnc` em `types.ts`, não do client.
const dbRnc = () => (supabase as any).from('qua_rnc');

// =====================================================================
// CÓDIGO DE REGISTRO — RNC-DDMMYY-NN, reinicia por mês
// =====================================================================

/**
 * Próximo número de registro do mês da `dataISO` (hoje, se omitida).
 * Consulta só os registros do mês porque `proximoIndiceCodigo` reinicia o
 * índice por recorte — aqui o recorte escolhido é o mês, igual ao RID.
 */
export async function obterProximoNumeroRegistroRnc(dataISO?: string | null): Promise<string> {
  const dataRef = dataISO ? dataISO.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const [ano, mes] = dataRef.split('-');
  const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate();
  const inicioMes = `${ano}-${mes}-01`;
  const fimMes = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`;

  const { data, error } = await dbRnc()
    .select('numero_registro')
    .gte('data_emissao', inicioMes)
    .lte('data_emissao', fimMes);

  if (error || !data) {
    return gerarCodigoFormulario(PREFIXO, dataRef, 1);
  }

  const indice = proximoIndiceCodigo(PREFIXO, data.map((r) => r.numero_registro));
  return gerarCodigoFormulario(PREFIXO, dataRef, indice);
}

// =====================================================================
// LISTAGEM, MÉTRICAS E CONSULTA
// =====================================================================

export async function listarRncs(filtros?: QuaRncFiltros, incluirExcluidos = false): Promise<QuaRnc[]> {
  let query = dbRnc()
    .select('*')
    .order('data_emissao', { ascending: false })
    .order('created_at', { ascending: false });

  query = apenasVigentes(query, incluirExcluidos);

  if (filtros?.status && filtros.status !== 'TODOS') {
    query = query.eq('status', filtros.status);
  }
  if (filtros?.origem && filtros.origem !== 'TODAS') {
    query = query.eq('origem_nc', filtros.origem);
  }
  if (filtros?.fornecedor) {
    query = query.ilike('fornecedor', `%${filtros.fornecedor}%`);
  }
  if (filtros?.dataInicio) {
    query = query.gte('data_emissao', filtros.dataInicio);
  }
  if (filtros?.dataFim) {
    query = query.lte('data_emissao', filtros.dataFim);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let lista = (data as QuaRnc[]) || [];

  if (filtros?.termo?.trim()) {
    const termo = filtros.termo.trim().toLowerCase();
    lista = lista.filter(
      (r) =>
        r.numero_registro.toLowerCase().includes(termo) ||
        (r.numero_rnc_externo || '').toLowerCase().includes(termo) ||
        (r.fornecedor || '').toLowerCase().includes(termo) ||
        (r.projeto || '').toLowerCase().includes(termo) ||
        (r.cliente || '').toLowerCase().includes(termo) ||
        r.descricao.toLowerCase().includes(termo) ||
        r.emissor_nome.toLowerCase().includes(termo)
    );
  }

  return lista;
}

export async function obterRnc(id: string): Promise<QuaRnc | null> {
  const { data, error } = await dbRnc().select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as QuaRnc) || null;
}

export async function obterMetricasRnc(): Promise<QuaRncMetricas> {
  const { data, error } = await dbRnc().select('status, plano_acao').is('excluido_em', null);

  if (error) {
    console.error('Erro ao obter métricas de RNC:', error);
    return { total: 0, abertas: 0, emTratamento: 0, concluidas: 0, atividadesAtrasadas: 0 };
  }

  const lista = (data as { status: string; plano_acao: QuaPlanoAcaoAtividade[] }[]) || [];
  const hoje = new Date().toISOString().slice(0, 10);

  let atividadesAtrasadas = 0;
  for (const r of lista) {
    for (const atividade of r.plano_acao || []) {
      if (atividade.status !== 'CONCLUIDA' && atividade.quando_fim && atividade.quando_fim < hoje) {
        atividadesAtrasadas++;
      }
    }
  }

  return {
    total: lista.length,
    abertas: lista.filter((r) => r.status === 'ABERTA').length,
    emTratamento: lista.filter((r) => r.status === 'EM_TRATAMENTO').length,
    concluidas: lista.filter((r) => r.status === 'CONCLUIDA').length,
    atividadesAtrasadas,
  };
}

// =====================================================================
// CRUD
// =====================================================================

export type NovaRncInput = Omit<
  QuaRnc,
  'id' | 'numero_registro' | 'anexos' | 'plano_acao' | 'created_at' | 'updated_at' | 'status'
> & { numero_registro?: string; status?: QuaRnc['status'] };

export async function criarRnc(input: NovaRncInput, anexosFiles: File[] = []): Promise<QuaRnc> {
  const numeroRegistroFinal = input.numero_registro || (await obterProximoNumeroRegistroRnc(input.data_emissao));

  const { data: inserido, error } = await dbRnc()
    .insert({
      ...input,
      numero_registro: numeroRegistroFinal,
      status: input.status || 'ABERTA',
      anexos: [],
      plano_acao: [],
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  let rnc = inserido as QuaRnc;

  if (anexosFiles.length > 0) {
    const anexos: QuaRncAnexo[] = [];
    for (const file of anexosFiles) {
      try {
        anexos.push(await uploadAnexoRnc(rnc.id, file));
      } catch (err) {
        console.warn('Falha no upload de anexo da RNC:', err);
      }
    }
    if (anexos.length > 0) {
      const { data: atualizado, error: updErr } = await dbRnc()
        .update({ anexos })
        .eq('id', rnc.id)
        .select()
        .single();
      if (!updErr && atualizado) rnc = atualizado as QuaRnc;
    }
  }

  return rnc;
}

export async function atualizarRnc(id: string, patch: Partial<QuaRnc>): Promise<void> {
  const { error } = await dbRnc()
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function excluirRnc(id: string, excluidoPor?: string): Promise<void> {
  const { error } = await dbRnc().update(marcarExcluido(excluidoPor)).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function restaurarRnc(id: string): Promise<void> {
  const { error } = await dbRnc().update(marcarRestaurado()).eq('id', id);
  if (error) throw new Error(error.message);
}

// =====================================================================
// ANEXOS — fotos comprimidas (regra 1 do CLAUDE.md) e PDFs (boletim/RFI)
// =====================================================================

export async function uploadAnexoRnc(rncId: string, file: File, pasta = 'rnc'): Promise<QuaRncAnexo> {
  const preparado = await prepareAttachment(file);
  const fileId = Math.random().toString(36).substring(2, 9);
  const path = `${rncId}/${pasta}_${fileId}_${preparado.name}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, preparado.blob, { contentType: preparado.mimeType, upsert: false });
  if (upErr) throw new Error(`Falha no upload do anexo: ${upErr.message}`);

  let previewUrl = '';
  try {
    const { data: signData } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24);
    previewUrl = signData?.signedUrl || '';
  } catch {}

  return {
    id: fileId,
    path,
    name: preparado.name,
    size: preparado.sizeCompressed,
    mime_type: preparado.mimeType,
    preview_url: previewUrl,
    created_at: new Date().toISOString(),
  };
}

export async function adicionarAnexosRnc(rncId: string, files: File[]): Promise<QuaRncAnexo[]> {
  const rnc = await obterRnc(rncId);
  if (!rnc) throw new Error('RNC não encontrada.');

  const novos: QuaRncAnexo[] = [];
  for (const file of files) {
    try {
      novos.push(await uploadAnexoRnc(rncId, file));
    } catch (err) {
      console.warn('Falha no upload de anexo adicional da RNC:', err);
    }
  }

  const anexos = [...(rnc.anexos || []), ...novos];
  await atualizarRnc(rncId, { anexos });
  return anexos;
}

export async function removerAnexoRnc(rncId: string, anexoId: string): Promise<void> {
  const rnc = await obterRnc(rncId);
  if (!rnc) throw new Error('RNC não encontrada.');

  const alvo = (rnc.anexos || []).find((a) => a.id === anexoId);
  const anexos = (rnc.anexos || []).filter((a) => a.id !== anexoId);
  await atualizarRnc(rncId, { anexos });

  if (alvo) {
    await supabase.storage.from(BUCKET).remove([alvo.path]).catch(() => {});
  }
}

/** Assina novamente as URLs de preview dos anexos — a assinatura expira em 24h. */
export async function renovarUrlsAnexos(anexos: QuaRncAnexo[]): Promise<QuaRncAnexo[]> {
  const renovados: QuaRncAnexo[] = [];
  for (const anexo of anexos) {
    try {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(anexo.path, 60 * 60 * 24);
      renovados.push({ ...anexo, preview_url: data?.signedUrl || anexo.preview_url });
    } catch {
      renovados.push(anexo);
    }
  }
  return renovados;
}

// =====================================================================
// PLANO DE AÇÃO — lista de atividades (O quê / Quem / Quando / Início real /
// Término real), com anexos próprios por atividade.
// =====================================================================

/**
 * Deriva o status da RNC a partir do plano de ação: nenhuma atividade ainda
 * iniciada mantém "ABERTA"; qualquer uma em andamento ou concluída (sem que
 * todas estejam concluídas) vira "EM_TRATAMENTO"; todas concluídas fecha a
 * RNC como "CONCLUIDA". CANCELADA é sempre manual, nunca derivado aqui.
 */
export function derivarStatusPorPlanoAcao(
  statusAtual: QuaRnc['status'],
  planoAcao: QuaPlanoAcaoAtividade[],
): QuaRnc['status'] {
  if (statusAtual === 'CANCELADA') return statusAtual;
  if (planoAcao.length === 0) return statusAtual === 'CONCLUIDA' ? 'EM_TRATAMENTO' : statusAtual;

  const todasConcluidas = planoAcao.every((a) => a.status === 'CONCLUIDA');
  if (todasConcluidas) return 'CONCLUIDA';

  const algumaIniciada = planoAcao.some((a) => a.status !== 'PENDENTE');
  return algumaIniciada ? 'EM_TRATAMENTO' : 'ABERTA';
}

export async function atualizarPlanoAcaoRnc(id: string, planoAcao: QuaPlanoAcaoAtividade[]): Promise<QuaRnc['status']> {
  const rnc = await obterRnc(id);
  if (!rnc) throw new Error('RNC não encontrada.');

  const novoStatus = derivarStatusPorPlanoAcao(rnc.status, planoAcao);
  await atualizarRnc(id, { plano_acao: planoAcao, status: novoStatus });
  return novoStatus;
}

export async function uploadAnexoAtividade(rncId: string, atividadeId: string, file: File): Promise<QuaRncAnexo> {
  return uploadAnexoRnc(rncId, file, `atividade_${atividadeId}`);
}

// =====================================================================
// AUTOCOMPLETE — valores já digitados em campos livres (fornecedor, área
// geradora, tipo de NC, cliente, projeto), reaproveitando a busca genérica
// já usada pela Portaria.
// =====================================================================

export async function buscarHistoricoCampoRnc(campo: string, limite = 30): Promise<string[]> {
  return buscarHistoricoCampoPortaria('qua_rnc', campo, limite);
}
