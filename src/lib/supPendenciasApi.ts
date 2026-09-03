/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Integração Supabase do chamado "Pendência de Processamento" (destino
 * Suprimentos): grava as linhas de NF do chamado, lista para a tela de baixa e
 * conclui cada nota notificando quem abriu o chamado.
 *
 * O parser do texto colado, o e-mail e o protocolo ficam no módulo puro
 * `supPendenciasProcessamento.ts`.
 */

import { supabase } from '../db/supabaseClient';
import { localDb } from '../db/localDb';
import type { SupPendenciaAcaoLog, SupPendenciaProcessamentoNF } from '../types';
import {
  formatarDataDDMMAA,
  rotuloNumero,
  type LinhaPendencia,
  type DadosAjustePedido,
  type MetaPendencia,
} from './supPendenciasProcessamento';

const TABELA = 'sup_pend_processamento_nf';
const BUCKET_ANEXOS = 'request-attachments';

/**
 * Próximo índice sequencial de protocolo para o dia — conta quantos protocolos
 * `SUP-<ddmmaa>-*` distintos já existem e soma 1.
 */
export async function proximoIndiceProtocoloDia(dataISO: string): Promise<number> {
  if (!supabase) return 1;
  const prefixo = `SUP-${formatarDataDDMMAA(dataISO)}-`;
  const { data, error } = await (supabase as any)
    .from(TABELA)
    .select('protocolo')
    .like('protocolo', `${prefixo}%`);
  if (error || !data) {
    if (error) console.error('Falha ao contar protocolos do dia:', error);
    return 1;
  }
  const distintos = new Set((data as { protocolo: string }[]).map(r => r.protocolo));
  return distintos.size + 1;
}

/** Grava, em lote, as linhas de NF de um chamado recém-criado. */
export async function criarPendencias(
  requestId: string,
  protocolo: string,
  linhas: LinhaPendencia[],
  meta?: MetaPendencia,
): Promise<void> {
  if (!supabase || linhas.length === 0) return;
  const classif = {
    observacao_chamado: meta?.observacao?.trim() || null,
    classif_causa: meta?.classif_causa || null,
    classif_responsavel: meta?.classif_responsavel || null,
    classif_impacto: meta?.classif_impacto || null,
    classif_recorrencia: meta?.classif_recorrencia || null,
  };
  const rows = linhas.map((l, i) => ({
    request_id: requestId,
    protocolo,
    modelo: l.modelo,
    numero_nfse: l.numero_nfse,
    data_emissao_nfse: l.data_emissao_nfse || null,
    nome_fornecedor: l.nome_fornecedor || null,
    observacao: l.observacao || null,
    nfse_cancelada: l.nfse_cancelada || null,
    fornecedor: l.fornecedor || null,
    valor_nfse: l.valor_nfse,
    valor_nfse_raw: l.valor_nfse_raw || null,
    mes_competencia: l.mes_competencia || null,
    documento_status: l.documento_status || null,
    serie: l.serie || null,
    uf_emissor: l.uf_emissor || null,
    chegou: l.chegou || null,
    documento_compras: l.documento_compras || null,
    comprador: l.comprador || null,
    data_envio: l.data_envio || null,
    ...classif,
    status: 'pendente',
    ordem: i,
  }));
  const { error } = await (supabase as any).from(TABELA).insert(rows);
  if (error) {
    console.error('Falha ao gravar pendências de processamento:', error);
    throw error;
  }
}

/**
 * Grava a linha única do chamado "Ajuste de Pedido" e devolve o id gerado
 * (usado em seguida para anexar a imagem).
 */
export async function criarAjustePedido(
  requestId: string,
  protocolo: string,
  dados: DadosAjustePedido,
  meta?: MetaPendencia,
): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await (supabase as any)
    .from(TABELA)
    .insert({
      request_id: requestId,
      protocolo,
      modelo: 'ajuste_pedido',
      numero_nfse: dados.nf.trim(),
      documento_compras: dados.pedido.trim() || null,
      nome_fornecedor: dados.fornecedor.trim() || null,
      comprador: dados.comprador?.trim() || null,
      observacao: dados.demanda.trim() || null,
      observacao_chamado: meta?.observacao?.trim() || null,
      classif_causa: meta?.classif_causa || null,
      classif_responsavel: meta?.classif_responsavel || null,
      classif_impacto: meta?.classif_impacto || null,
      classif_recorrencia: meta?.classif_recorrencia || null,
      status: 'pendente',
      ordem: 0,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('Falha ao gravar o ajuste de pedido:', error);
    throw error || new Error('Insert sem retorno');
  }
  return (data as { id: string }).id;
}

/**
 * Sobe as imagens já comprimidas para o bucket privado e grava os caminhos na
 * linha (`imagem_paths`, e o primeiro em `imagem_path` por compat). Uma falha
 * aqui não desfaz o chamado — o usuário pode reenviar pela página de Pendências.
 */
export async function salvarImagensAjuste(
  rowId: string,
  requestId: string,
  arquivos: { blob: Blob; mimeType: string }[],
): Promise<boolean> {
  if (!supabase || arquivos.length === 0) return false;

  const paths: string[] = [];
  for (let i = 0; i < arquivos.length; i++) {
    const { blob, mimeType } = arquivos[i];
    const ext = mimeType.includes('webp') ? 'webp' : mimeType.includes('png') ? 'png' : 'jpg';
    const path = `${requestId}/ajuste-pedido/${rowId}-${i + 1}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET_ANEXOS)
      .upload(path, blob, { contentType: mimeType, upsert: true });
    if (upErr) {
      console.error('Falha ao enviar imagem do ajuste de pedido:', upErr);
      continue;
    }
    paths.push(path);
  }

  if (paths.length === 0) return false;

  const { error } = await (supabase as any)
    .from(TABELA)
    .update({ imagem_paths: paths, imagem_path: paths[0] })
    .eq('id', rowId);
  if (error) {
    console.error('Falha ao vincular as imagens ao ajuste de pedido:', error);
    return false;
  }
  return paths.length === arquivos.length;
}

/** Linhas de um chamado específico, na ordem em que foram coladas. */
export async function listarPendenciasPorRequest(requestId: string): Promise<SupPendenciaProcessamentoNF[]> {
  if (!supabase) return [];
  const { data, error } = await (supabase as any)
    .from(TABELA)
    .select('*')
    .eq('request_id', requestId)
    .order('ordem', { ascending: true });
  if (error || !data) {
    if (error) console.error('Falha ao listar pendências do chamado:', error);
    return [];
  }
  return data as SupPendenciaProcessamentoNF[];
}

export interface GrupoPendencia {
  request_id: string;
  protocolo: string;
  modelo: SupPendenciaProcessamentoNF['modelo'];
  numero: string;
  solicitante_id: string;
  solicitante_name: string;
  solicitante_sector_id?: string;
  criticality: number;
  status: string;
  created_at: string;
  linhas: SupPendenciaProcessamentoNF[];
  total: number;
  concluidas: number;
  /** Classificação/observação do chamado (categoria "Pendência de Processamento"). */
  observacao_chamado?: string | null;
  classif_causa?: string | null;
  classif_responsavel?: string | null;
  classif_impacto?: string | null;
  classif_recorrencia?: string | null;
}

/**
 * Pendências agrupadas por chamado, com os dados da solicitação anexados
 * (número, solicitante, setor). Base da tela de baixa do Suprimentos.
 */
export async function listarPendenciasAgrupadas(apenasComPendencia = true): Promise<GrupoPendencia[]> {
  if (!supabase) return [];
  const { data, error } = await (supabase as any)
    .from(TABELA)
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) {
    if (error) console.error('Falha ao listar pendências de processamento:', error);
    return [];
  }

  const linhas = data as SupPendenciaProcessamentoNF[];
  const requests = localDb.getRequests();

  const porReq = new Map<string, SupPendenciaProcessamentoNF[]>();
  linhas.forEach(l => {
    const arr = porReq.get(l.request_id) || [];
    arr.push(l);
    porReq.set(l.request_id, arr);
  });

  const grupos: GrupoPendencia[] = [];
  porReq.forEach((ls, reqId) => {
    const r = requests.find(x => x.id === reqId);
    const ordenadas = [...ls].sort((a, b) => a.ordem - b.ordem);
    const concluidas = ordenadas.filter(l => l.status === 'concluido').length;
    if (apenasComPendencia && concluidas === ordenadas.length) return;
    grupos.push({
      request_id: reqId,
      protocolo: ordenadas[0].protocolo,
      modelo: ordenadas[0].modelo || 'nfse',
      numero: r?.number || '—',
      solicitante_id: r?.solicitante_id || '',
      solicitante_name: r?.solicitante_name || '—',
      solicitante_sector_id: r?.solicitante_sector_id,
      criticality: r?.criticality || 1,
      status: r?.status || 'aberto',
      created_at: ordenadas[0].created_at,
      linhas: ordenadas,
      total: ordenadas.length,
      concluidas,
      observacao_chamado: ordenadas[0].observacao_chamado ?? null,
      classif_causa: ordenadas[0].classif_causa ?? null,
      classif_responsavel: ordenadas[0].classif_responsavel ?? null,
      classif_impacto: ordenadas[0].classif_impacto ?? null,
      classif_recorrencia: ordenadas[0].classif_recorrencia ?? null,
    });
  });

  return grupos.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function extrairHistoricoExistente(
  row: { historico_acoes?: any; resolvido_por?: string | null; resolvido_em?: string | null; resolucao?: string | null } | null | undefined
): SupPendenciaAcaoLog[] {
  if (!row) return [];
  if (Array.isArray(row.historico_acoes) && row.historico_acoes.length > 0) {
    return [...row.historico_acoes];
  }
  if (row.resolvido_em) {
    const perfis = localDb.getProfiles();
    const p = perfis.find(x => x.id === row.resolvido_por);
    return [
      {
        tipo: 'concluido',
        usuario_id: row.resolvido_por || null,
        usuario_nome: p?.name || 'Suprimentos',
        data_hora: row.resolvido_em,
        resolucao: row.resolucao || null,
      },
    ];
  }
  return [];
}

/**
 * Dá baixa numa nota e notifica quem abriu o chamado. O chamado em si não muda
 * de status — o atendente o resolve manualmente quando julgar concluído.
 */
export async function concluirPendencia(
  id: string,
  resolucao: string,
  linhaAtual?: SupPendenciaProcessamentoNF
): Promise<boolean> {
  if (!supabase) return false;
  const user = localDb.getCurrentUser();
  const texto = resolucao.trim();
  const agoraISO = new Date().toISOString();

  let hist: SupPendenciaAcaoLog[] = [];
  if (linhaAtual) {
    hist = extrairHistoricoExistente(linhaAtual);
  } else {
    const { data: row } = await (supabase as any)
      .from(TABELA)
      .select('historico_acoes, resolvido_por, resolvido_em, resolucao')
      .eq('id', id)
      .maybeSingle();
    hist = extrairHistoricoExistente(row);
  }

  const novaAcao: SupPendenciaAcaoLog = {
    tipo: 'concluido',
    usuario_id: user?.id || null,
    usuario_nome: user?.name || 'Suprimentos',
    data_hora: agoraISO,
    resolucao: texto || null,
  };
  hist.push(novaAcao);

  const { data, error } = await (supabase as any)
    .from(TABELA)
    .update({
      status: 'concluido',
      resolucao: texto || null,
      resolvido_por: user?.id || null,
      resolvido_em: agoraISO,
      historico_acoes: hist,
    })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    console.error('Falha ao concluir pendência:', error);
    return false;
  }

  const linha = data as SupPendenciaProcessamentoNF;
  const req = localDb.getRequests().find(r => r.id === linha.request_id);
  if (req) {
    const rotulo = rotuloNumero(linha.modelo);
    localDb.createNotification(
      req.solicitante_id,
      `Item processado — chamado #${req.number}`,
      `${linha.protocolo} · ${rotulo} ${linha.numero_nfse} foi baixado pelo Suprimentos.${texto ? ` Resolução: ${texto}` : ''}`,
      'success',
      req.id,
      req.number,
    );
  }
  return true;
}

/** Reabre uma linha concluída registrando a reabertura no histórico de ações. */
export async function reabrirPendencia(
  id: string,
  motivo?: string,
  linhaAtual?: SupPendenciaProcessamentoNF
): Promise<boolean> {
  if (!supabase) return false;
  const user = localDb.getCurrentUser();
  const agoraISO = new Date().toISOString();

  let hist: SupPendenciaAcaoLog[] = [];
  if (linhaAtual) {
    hist = extrairHistoricoExistente(linhaAtual);
  } else {
    const { data: row } = await (supabase as any)
      .from(TABELA)
      .select('historico_acoes, resolvido_por, resolvido_em, resolucao')
      .eq('id', id)
      .maybeSingle();
    hist = extrairHistoricoExistente(row);
  }

  const novaAcao: SupPendenciaAcaoLog = {
    tipo: 'reaberto',
    usuario_id: user?.id || null,
    usuario_nome: user?.name || 'Suprimentos',
    data_hora: agoraISO,
    motivo: motivo?.trim() || null,
  };
  hist.push(novaAcao);

  const { error } = await (supabase as any)
    .from(TABELA)
    .update({
      status: 'pendente',
      resolucao: null,
      resolvido_por: null,
      resolvido_em: null,
      historico_acoes: hist,
    })
    .eq('id', id);

  if (error) {
    console.error('Falha ao reabrir pendência:', error);
    return false;
  }
  return true;
}

/** Conclui múltiplas notas de pendência em lote e gera as notificações para os solicitantes. */
export async function concluirPendenciasEmLote(
  itens: { id: string; resolucao: string; linhaAtual?: SupPendenciaProcessamentoNF }[]
): Promise<boolean> {
  if (!supabase || itens.length === 0) return false;
  const user = localDb.getCurrentUser();
  const agoraISO = new Date().toISOString();

  const promises = itens.map(async item => {
    const texto = item.resolucao.trim();
    let hist: SupPendenciaAcaoLog[] = [];
    if (item.linhaAtual) {
      hist = extrairHistoricoExistente(item.linhaAtual);
    } else {
      const { data: row } = await (supabase as any)
        .from(TABELA)
        .select('historico_acoes, resolvido_por, resolvido_em, resolucao')
        .eq('id', item.id)
        .maybeSingle();
      hist = extrairHistoricoExistente(row);
    }

    const novaAcao: SupPendenciaAcaoLog = {
      tipo: 'concluido',
      usuario_id: user?.id || null,
      usuario_nome: user?.name || 'Suprimentos',
      data_hora: agoraISO,
      resolucao: texto || null,
    };
    hist.push(novaAcao);

    return (supabase as any)
      .from(TABELA)
      .update({
        status: 'concluido',
        resolucao: texto || null,
        resolvido_por: user?.id || null,
        resolvido_em: agoraISO,
        historico_acoes: hist,
      })
      .eq('id', item.id)
      .select()
      .single();
  });

  const results = await Promise.all(promises);
  let sucessoCount = 0;

  results.forEach(res => {
    if (!res.error && res.data) {
      sucessoCount++;
      const linha = res.data as SupPendenciaProcessamentoNF;
      const req = localDb.getRequests().find(r => r.id === linha.request_id);
      if (req) {
        const rotulo = rotuloNumero(linha.modelo);
        const texto = linha.resolucao;
        localDb.createNotification(
          req.solicitante_id,
          `Item processado — chamado #${req.number}`,
          `${linha.protocolo} · ${rotulo} ${linha.numero_nfse} foi baixado pelo Suprimentos.${texto ? ` Resolução: ${texto}` : ''}`,
          'success',
          req.id,
          req.number,
        );
      }
    }
  });

  return sucessoCount > 0;
}

