/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * API e Utilitários para Gestão de Envios de E-mails (Outlook / mailto:)
 * Permite gerenciar dinamicamente destinatários (Para, CC, BCC) e assuntos
 * utilizados pelos módulos do SISTEN.
 */

import { supabase } from '../db/supabaseClient';
import type { ConfigEnvioEmail, EmailModulo } from '../types';

/**
 * Configurações padrão embutidas (fallback resiliente se a base estiver offline
 * ou durante o primeiro carregamento).
 */
export const CONFIGS_EMAIL_PADRAO: ConfigEnvioEmail[] = [
  {
    id: 'padrao-cadastro-sap',
    chave: 'cadastro_sap',
    nome: 'Solicitação de Cadastro SAP (Itens / Fornecedores)',
    modulo: 'SUPRIMENTOS',
    descricao: 'Disparado após o preenchimento de uma solicitação de cadastro no SAP (aba Cadastro SAP em Nova Solicitação).',
    destinatarios: 'jefferson.santana@ten.ind.br',
    copia: null,
    copia_oculta: null,
    assunto_padrao: 'Cadastro SAP',
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'padrao-expedicao-chegada',
    chave: 'expedicao_chegada',
    nome: 'Aviso de Chegada de Veículo na Portaria (Expedição)',
    modulo: 'LOGISTICA',
    descricao: 'Disparado no momento em que o caminhão/veículo encosta na portaria para carregamento de tramos.',
    destinatarios: 'andre.araujo@ten.ind.br',
    copia: null,
    copia_oculta: null,
    assunto_padrao: 'Chegada na portaria',
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'padrao-expedicao-tramos',
    chave: 'expedicao_tramos',
    nome: 'Relatório de Carregamento de Tramos (Expedição Completa)',
    modulo: 'LOGISTICA',
    descricao: 'Disparado ao concluir e salvar o relatório de expedição com tramos, placas, motorista e fotos.',
    destinatarios: 'andre.araujo@ten.ind.br',
    copia: null,
    copia_oculta: null,
    assunto_padrao: 'Carregamento Tramos',
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'padrao-portaria-relatorio',
    chave: 'portaria_relatorio',
    nome: 'Relatório de Turno e Ocorrências da Portaria',
    modulo: 'PORTARIA',
    descricao: 'Disparado para envio do fechamento de turno e ocorrências operacionais da portaria.',
    destinatarios: 'andre.araujo@ten.ind.br',
    copia: null,
    copia_oculta: null,
    assunto_padrao: 'Relatório de Turno - Portaria TEN',
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'padrao-helpdesk-juridico',
    chave: 'helpdesk_juridico',
    nome: 'Avisos de Chamados do Jurídico & Contratos',
    modulo: 'HELPDESK',
    descricao: 'Notificação de novos chamados e solicitações direcionadas ao setor Jurídico.',
    destinatarios: 'juridico@ten.ind.br',
    copia: null,
    copia_oculta: null,
    assunto_padrao: 'Chamado Jurídico - SISTEN',
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Cache em memória para consultas rápidas nos formulários
let cacheConfigs: ConfigEnvioEmail[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minuto

export function invalidarCacheConfigsEmail() {
  cacheConfigs = null;
  cacheTime = 0;
}

/**
 * Normaliza e separa uma string com múltiplos e-mails (separados por vírgula,
 * ponto e vírgula ou quebras de linha).
 */
export function normalizarListaEmails(emails?: string | null): string[] {
  if (!emails) return [];
  return emails
    .split(/[,;\n\r]+/)
    .map(e => e.trim())
    .filter(e => e.length > 0 && e.includes('@'));
}

/**
 * Monta URL `mailto:` com suporte a múltiplos destinatários, CC, BCC, assunto
 * e corpo codificados com quebras de linha no padrão Windows / Outlook (\r\n).
 */
export function montarMailtoComConfig(params: {
  destinatarios: string;
  copia?: string | null;
  copiaOculta?: string | null;
  assunto?: string | null;
  corpo: string;
}): string {
  const listaTo = normalizarListaEmails(params.destinatarios);
  const listaCc = normalizarListaEmails(params.copia);
  const listaBcc = normalizarListaEmails(params.copiaOculta);

  // E-mail principal (se vazio, usa 'mailto:')
  const toEncoded = encodeURIComponent(listaTo.join(','));
  let url = `mailto:${toEncoded}`;

  const queryParams: string[] = [];

  if (listaCc.length > 0) {
    queryParams.push(`cc=${encodeURIComponent(listaCc.join(','))}`);
  }

  if (listaBcc.length > 0) {
    queryParams.push(`bcc=${encodeURIComponent(listaBcc.join(','))}`);
  }

  if (params.assunto) {
    queryParams.push(`subject=${encodeURIComponent(params.assunto)}`);
  }

  if (params.corpo) {
    queryParams.push(`body=${encodeURIComponent(params.corpo.replace(/\r?\n/g, '\r\n'))}`);
  }

  if (queryParams.length > 0) {
    url += `?${queryParams.join('&')}`;
  }

  return url;
}

/**
 * Lista todas as configurações de e-mail cadastradas no Supabase.
 */
export async function listarConfigsEmail(apenasAtivos = false): Promise<ConfigEnvioEmail[]> {
  const now = Date.now();
  if (cacheConfigs && now - cacheTime < CACHE_TTL_MS && !apenasAtivos) {
    return cacheConfigs;
  }

  if (!supabase) {
    return apenasAtivos
      ? CONFIGS_EMAIL_PADRAO.filter(c => c.ativo)
      : CONFIGS_EMAIL_PADRAO;
  }

  try {
    let query = supabase
      .from('config_envio_emails')
      .select('*')
      .order('modulo', { ascending: true })
      .order('nome', { ascending: true });

    if (apenasAtivos) {
      query = query.eq('ativo', true);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('Erro ao consultar config_envio_emails no Supabase, usando padrão:', error);
      return apenasAtivos
        ? CONFIGS_EMAIL_PADRAO.filter(c => c.ativo)
        : CONFIGS_EMAIL_PADRAO;
    }

    if (!data || data.length === 0) {
      return apenasAtivos
        ? CONFIGS_EMAIL_PADRAO.filter(c => c.ativo)
        : CONFIGS_EMAIL_PADRAO;
    }

    cacheConfigs = data as ConfigEnvioEmail[];
    cacheTime = now;

    return data as ConfigEnvioEmail[];
  } catch (err) {
    console.warn('Exceção ao listar configs de e-mail:', err);
    return apenasAtivos
      ? CONFIGS_EMAIL_PADRAO.filter(c => c.ativo)
      : CONFIGS_EMAIL_PADRAO;
  }
}

/**
 * Obtém a configuração de e-mail para um gatilho específico pelo seu identificador `chave`.
 */
export async function obterConfigEmail(chave: string): Promise<ConfigEnvioEmail | null> {
  const lista = await listarConfigsEmail(false);
  const encontrada = lista.find(c => c.chave.toLowerCase() === chave.toLowerCase());
  if (encontrada) return encontrada;

  const fallback = CONFIGS_EMAIL_PADRAO.find(c => c.chave.toLowerCase() === chave.toLowerCase());
  return fallback || null;
}

/**
 * Cadastra uma nova regra de envio de e-mail.
 */
export async function criarConfigEmail(
  dados: Omit<ConfigEnvioEmail, 'id' | 'created_at' | 'updated_at'>
): Promise<ConfigEnvioEmail> {
  invalidarCacheConfigsEmail();

  if (!supabase) {
    const novo: ConfigEnvioEmail = {
      ...dados,
      id: 'local-' + Math.random().toString(36).slice(2, 9),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return novo;
  }

  const { data, error } = await supabase
    .from('config_envio_emails')
    .insert([
      {
        chave: dados.chave.trim().toLowerCase().replace(/\s+/g, '_'),
        nome: dados.nome.trim(),
        modulo: dados.modulo,
        descricao: dados.descricao?.trim() || null,
        destinatarios: dados.destinatarios.trim(),
        copia: dados.copia?.trim() || null,
        copia_oculta: dados.copia_oculta?.trim() || null,
        assunto_padrao: dados.assunto_padrao?.trim() || null,
        ativo: dados.ativo ?? true,
        criado_por: dados.criado_por || null,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar configuração de e-mail:', error);
    throw error;
  }

  return data as ConfigEnvioEmail;
}

/**
 * Atualiza os dados de uma regra existente.
 */
export async function atualizarConfigEmail(
  id: string,
  dados: Partial<ConfigEnvioEmail>
): Promise<void> {
  invalidarCacheConfigsEmail();

  if (!supabase) return;

  const payload: any = {
    updated_at: new Date().toISOString(),
  };

  if (dados.chave !== undefined) payload.chave = dados.chave.trim().toLowerCase().replace(/\s+/g, '_');
  if (dados.nome !== undefined) payload.nome = dados.nome.trim();
  if (dados.modulo !== undefined) payload.modulo = dados.modulo;
  if (dados.descricao !== undefined) payload.descricao = dados.descricao?.trim() || null;
  if (dados.destinatarios !== undefined) payload.destinatarios = dados.destinatarios.trim();
  if (dados.copia !== undefined) payload.copia = dados.copia?.trim() || null;
  if (dados.copia_oculta !== undefined) payload.copia_oculta = dados.copia_oculta?.trim() || null;
  if (dados.assunto_padrao !== undefined) payload.assunto_padrao = dados.assunto_padrao?.trim() || null;
  if (dados.ativo !== undefined) payload.ativo = dados.ativo;

  const { error } = await supabase
    .from('config_envio_emails')
    .update(payload)
    .eq('id', id);

  if (error) {
    console.error('Erro ao atualizar configuração de e-mail:', error);
    throw error;
  }
}

/**
 * Alterna rapidamente o status ativo/inativo de uma configuração.
 */
export async function alternarStatusConfigEmail(id: string, ativo: boolean): Promise<void> {
  invalidarCacheConfigsEmail();

  if (!supabase) return;

  const { error } = await supabase
    .from('config_envio_emails')
    .update({
      ativo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Erro ao alternar status da configuração de e-mail:', error);
    throw error;
  }
}

/**
 * Exclui permanentemente uma configuração de envio de e-mail.
 */
export async function excluirConfigEmail(id: string): Promise<void> {
  invalidarCacheConfigsEmail();

  if (!supabase) return;

  const { error } = await supabase
    .from('config_envio_emails')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Erro ao excluir configuração de e-mail:', error);
    throw error;
  }
}
