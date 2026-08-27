/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Conversão de PDF e imagem para Markdown via IA (OCR/transcrição) — chama a
 * Edge Function `converter-markdown-ia` (Gemini com fallback OpenRouter, ver
 * supabase/functions/converter-markdown-ia/index.ts). Planilha/JSON/XML não
 * passam por aqui: são convertidos no navegador, sem rede, em
 * markdownConvert.ts.
 *
 * Também expõe o histórico consultável (tabela `conversoes_markdown`): a via
 * 'ia' é gravada pela própria Edge Function (service_role, já tem tudo à
 * mão ali); a via 'local' é gravada daqui mesmo, pelo cliente, depois de
 * cada conversão de planilha/JSON/XML — client-side porque não há chamada
 * de rede nenhuma nessa via, só a gravação do registro em si.
 */

import { supabase } from '../db/supabaseClient';
import { montarResultado, type ResultadoConversao } from './markdownConvert';
import type { ConversaoMarkdownLog, ConversaoMarkdownResumo } from '../types';

const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024;

function lerComoBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Falha ao ler "${file.name}" para conversão.`));
    reader.onload = () => {
      // reader.result é "data:<mime>;base64,<dados>" — só a parte depois da vírgula interessa.
      const resultado = reader.result as string;
      resolve(resultado.slice(resultado.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

/** Converte um PDF ou imagem para Markdown via IA. Lança um erro cujo `.message` já é o texto pronto para exibir ao usuário. */
export async function converterComIA(file: File): Promise<ResultadoConversao> {
  if (file.size > TAMANHO_MAXIMO_BYTES) {
    throw new Error(`"${file.name}" tem mais de ${TAMANHO_MAXIMO_BYTES / (1024 * 1024)} MB — reduza o tamanho antes de enviar para conversão com IA.`);
  }

  const inicio = performance.now();
  const conteudoBase64 = await lerComoBase64(file);

  const { data, error } = await supabase.functions.invoke('converter-markdown-ia', {
    body: {
      nome_arquivo: file.name,
      mime_type: file.type || 'application/octet-stream',
      conteudo_base64: conteudoBase64,
    },
  });

  if (error) {
    const contexto = (error as any)?.context;
    const corpo = typeof contexto?.json === 'function' ? await contexto.json().catch(() => null) : null;
    throw new Error(corpo?.erro?.mensagem ?? error.message ?? 'Falha ao chamar a conversão por IA.');
  }
  if ((data as any)?.erro) {
    throw new Error((data as any).erro.mensagem ?? 'Falha ao converter o arquivo com IA.');
  }

  const resposta = data as {
    markdown: string;
    uso: { total_tokens: number } | null;
    custo_usd: number | null;
    modelo: string;
  };

  return {
    ...montarResultado(resposta.markdown, inicio),
    tokensReais: resposta.uso?.total_tokens,
    custoUsd: resposta.custo_usd,
    modelo: resposta.modelo,
  };
}

/**
 * Registra no histórico consultável uma conversão local (planilha/JSON/XML —
 * sem IA). Melhor esforço: uma falha aqui não deve derrubar a conversão em
 * si, que já terminou — só loga no console e segue.
 */
export async function registrarConversaoLocal(params: {
  userId: string;
  userName: string;
  nomeArquivo: string;
  formato: string;
  tamanhoBytes: number;
  sucesso: boolean;
  resultado?: ResultadoConversao;
  erroMensagem?: string;
}): Promise<void> {
  try {
    const { error } = await supabase.from('ops_conversoes_markdown').insert({
      user_id: params.userId,
      user_name: params.userName,
      nome_arquivo: params.nomeArquivo,
      formato: params.formato,
      tamanho_bytes: params.tamanhoBytes,
      via: 'local',
      modelo: null,
      caracteres: params.resultado?.caracteres ?? null,
      tokens: params.resultado?.tokensEstimados ?? null,
      tokens_reais: false,
      custo_usd: null,
      duracao_ms: params.resultado?.duracaoMs ?? null,
      sucesso: params.sucesso,
      erro_mensagem: params.erroMensagem ?? null,
      markdown: params.resultado?.markdown ?? null,
    });
    if (error) throw error;
  } catch (err) {
    console.error('Falha ao registrar conversão local no histórico:', err);
  }
}

/** Histórico consultável de conversões (local + IA), mais recentes primeiro. Sem o markdown de cada linha — ver `buscarConversaoMarkdown` para o conteúdo completo de um item. */
export async function listarConversoesMarkdown(limit = 200): Promise<ConversaoMarkdownResumo[]> {
  const { data, error } = await supabase
    .from('ops_conversoes_markdown')
    .select('id, user_id, user_name, nome_arquivo, formato, tamanho_bytes, via, modelo, caracteres, tokens, tokens_reais, custo_usd, duracao_ms, sucesso, erro_mensagem, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Falha ao carregar histórico de conversões: ${error.message}`);
  return (data ?? []) as ConversaoMarkdownResumo[];
}

/** Registro completo (com markdown) de um item do histórico, buscado sob demanda ao abrir/copiar. */
export async function buscarConversaoMarkdown(id: string): Promise<ConversaoMarkdownLog> {
  const { data, error } = await supabase.from('ops_conversoes_markdown').select('*').eq('id', id).single();
  if (error) throw new Error(`Falha ao carregar a conversão: ${error.message}`);
  return data as ConversaoMarkdownLog;
}

/**
 * Busca no histórico do Supabase a conversão mais recente com sucesso para um determinado arquivo.
 * Permite detectar conversões já feitas por outros usuários ou em sessões anteriores,
 * possibilitando puxar os dados existentes em vez de gastar tokens/tempo convertendo de novo.
 */
export async function buscarUltimaConversaoPorArquivo(nomeArquivo: string, _tamanhoBytes?: number): Promise<ConversaoMarkdownLog | null> {
  try {
    const { data, error } = await supabase
      .from('ops_conversoes_markdown')
      .select('*')
      .ilike('nome_arquivo', nomeArquivo.trim())
      .eq('sucesso', true)
      .not('markdown', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;
    return data[0] as ConversaoMarkdownLog;
  } catch (err) {
    console.warn('Falha ao consultar histórico de conversão duplicada no Supabase:', err);
    return null;
  }
}
