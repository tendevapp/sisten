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
    assunto_padrao: 'Chegada Expedição',
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
    assunto_padrao: 'Expedição Final',
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
  {
    id: 'padrao-helpdesk-suprimentos',
    chave: 'helpdesk_suprimentos',
    nome: 'Pendências de Processamento de Notas Fiscais (Chamado Suprimentos)',
    modulo: 'SUPRIMENTOS',
    descricao: 'Disparado ao enviar um chamado com destino Suprimentos na categoria "Pendência de Processamento", com a relação de NFS-e coladas da planilha.',
    destinatarios: 'suprimentosten@ten.ind.br',
    copia: null,
    copia_oculta: null,
    assunto_padrao: 'Pendências de Processamento de Notas Fiscais',
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'padrao-rh-ase-hora-extra',
    chave: 'rh_ase_hora_extra',
    nome: 'Autorização para Serviços Extraordinários (ASE - Hora Extra)',
    modulo: 'RH',
    descricao: 'Disparado ao enviar a autorização de horas extras (FRM.RHU-0007) com listagem detalhada de transporte e refeição.',
    destinatarios: 'ase@ten.ind.br',
    copia: null,
    copia_oculta: null,
    assunto_padrao: 'ASE - Autorização de Horas Extras',
    ativo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'padrao-pendencia-processamento-conclusao',
    chave: 'pendencia_processamento_conclusao',
    nome: 'Conclusão de Pendências de Processamento (Suprimentos)',
    modulo: 'SUPRIMENTOS',
    descricao: 'Disparado ao dar baixa (individual ou em lote) em notas fiscais ou lançamentos de pendências de processamento.',
    destinatarios: 'victor.oliveira@ten.ind.br',
    copia: null,
    copia_oculta: null,
    assunto_padrao: 'Conclusão de Processamento',
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(valor?: string | null): boolean {
  if (!valor) return false;
  return UUID_REGEX.test(valor.trim());
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

    const configsDb = (data || []) as ConfigEnvioEmail[];
    const chavesExistentes = new Set(configsDb.map(c => c.chave.toLowerCase()));
    
    // Mesclar gatilhos padrão que ainda não foram persistidos no banco
    const faltantes = CONFIGS_EMAIL_PADRAO.filter(
      p => !chavesExistentes.has(p.chave.toLowerCase())
    );

    let listaFinal = [...configsDb];
    if (faltantes.length > 0) {
      try {
        const registrosParaInserir = faltantes.map(item => ({
          chave: item.chave,
          nome: item.nome,
          modulo: item.modulo,
          descricao: item.descricao,
          destinatarios: item.destinatarios,
          copia: item.copia,
          copia_oculta: item.copia_oculta,
          assunto_padrao: item.assunto_padrao,
          ativo: item.ativo,
        }));

        const { data: inseridos, error: insertErr } = await supabase
          .from('config_envio_emails')
          .insert(registrosParaInserir)
          .select('*');

        if (!insertErr && inseridos && inseridos.length > 0) {
          listaFinal = [...configsDb, ...(inseridos as ConfigEnvioEmail[])];
        } else {
          listaFinal = [...configsDb, ...faltantes];
        }
      } catch (e) {
        console.warn('Auto-seed de config_envio_emails:', e);
        listaFinal = [...configsDb, ...faltantes];
      }
    }

    if (apenasAtivos) {
      listaFinal = listaFinal.filter(c => c.ativo);
    }

    cacheConfigs = listaFinal;
    cacheTime = now;

    return listaFinal;
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
 * Atualiza os dados de uma regra existente (suporta tanto UUID real quanto chave de fallback).
 */
export async function atualizarConfigEmail(
  id: string,
  dados: Partial<ConfigEnvioEmail>
): Promise<void> {
  invalidarCacheConfigsEmail();

  if (!supabase) return;

  const chaveLimpa = dados.chave
    ? dados.chave.trim().toLowerCase().replace(/\s+/g, '_')
    : undefined;

  const payload: any = {
    updated_at: new Date().toISOString(),
  };

  if (chaveLimpa !== undefined) payload.chave = chaveLimpa;
  if (dados.nome !== undefined) payload.nome = dados.nome.trim();
  if (dados.modulo !== undefined) payload.modulo = dados.modulo;
  if (dados.descricao !== undefined) payload.descricao = dados.descricao?.trim() || null;
  if (dados.destinatarios !== undefined) payload.destinatarios = dados.destinatarios.trim();
  if (dados.copia !== undefined) payload.copia = dados.copia?.trim() || null;
  if (dados.copia_oculta !== undefined) payload.copia_oculta = dados.copia_oculta?.trim() || null;
  if (dados.assunto_padrao !== undefined) payload.assunto_padrao = dados.assunto_padrao?.trim() || null;
  if (dados.ativo !== undefined) payload.ativo = dados.ativo;

  // Se o ID não for um UUID válido do Postgres, localiza por chave ou insere no banco
  if (!isUuid(id)) {
    const chaveParaBuscar = chaveLimpa || (id.startsWith('padrao-') ? id.replace(/^padrao-/, '').replace(/-/g, '_') : '');

    if (chaveParaBuscar) {
      const { data: existente } = await supabase
        .from('config_envio_emails')
        .select('id')
        .eq('chave', chaveParaBuscar)
        .maybeSingle();

      if (existente?.id) {
        const { error: updErr } = await supabase
          .from('config_envio_emails')
          .update(payload)
          .eq('id', existente.id);

        if (updErr) {
          console.error('Erro ao atualizar configuração por chave:', updErr);
          throw updErr;
        }
        return;
      }
    }

    // Se o registro não existia ainda no banco, cria diretamente
    const padraoFallback = CONFIGS_EMAIL_PADRAO.find(p => p.chave.toLowerCase() === chaveParaBuscar.toLowerCase());
    const { error: insErr } = await supabase
      .from('config_envio_emails')
      .insert({
        chave: chaveLimpa || chaveParaBuscar || 'gatilho_personalizado',
        nome: dados.nome?.trim() || padraoFallback?.nome || 'Gatilho de E-mail',
        modulo: dados.modulo || padraoFallback?.modulo || 'GERAL',
        descricao: dados.descricao !== undefined ? dados.descricao : (padraoFallback?.descricao || null),
        destinatarios: dados.destinatarios?.trim() || padraoFallback?.destinatarios || '',
        copia: dados.copia !== undefined ? dados.copia : (padraoFallback?.copia || null),
        copia_oculta: dados.copia_oculta !== undefined ? dados.copia_oculta : (padraoFallback?.copia_oculta || null),
        assunto_padrao: dados.assunto_padrao !== undefined ? dados.assunto_padrao : (padraoFallback?.assunto_padrao || null),
        ativo: dados.ativo !== undefined ? dados.ativo : (padraoFallback?.ativo ?? true),
      });

    if (insErr) {
      console.error('Erro ao cadastrar configuração a partir de padrão:', insErr);
      throw insErr;
    }
    return;
  }

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
export async function alternarStatusConfigEmail(id: string, ativo: boolean, chave?: string): Promise<void> {
  invalidarCacheConfigsEmail();

  if (!supabase) return;

  if (!isUuid(id)) {
    const chaveParaBuscar = chave || (id.startsWith('padrao-') ? id.replace(/^padrao-/, '').replace(/-/g, '_') : '');
    if (chaveParaBuscar) {
      const { data: existente } = await supabase
        .from('config_envio_emails')
        .select('id')
        .eq('chave', chaveParaBuscar)
        .maybeSingle();

      if (existente?.id) {
        await supabase
          .from('config_envio_emails')
          .update({ ativo, updated_at: new Date().toISOString() })
          .eq('id', existente.id);
        return;
      }

      const padrao = CONFIGS_EMAIL_PADRAO.find(p => p.chave.toLowerCase() === chaveParaBuscar.toLowerCase());
      if (padrao) {
        await supabase.from('config_envio_emails').insert({
          chave: padrao.chave,
          nome: padrao.nome,
          modulo: padrao.modulo,
          descricao: padrao.descricao,
          destinatarios: padrao.destinatarios,
          copia: padrao.copia,
          copia_oculta: padrao.copia_oculta,
          assunto_padrao: padrao.assunto_padrao,
          ativo,
        });
      }
    }
    return;
  }

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
export async function excluirConfigEmail(id: string, chave?: string): Promise<void> {
  invalidarCacheConfigsEmail();

  if (!supabase) return;

  if (!isUuid(id)) {
    const chaveParaBuscar = chave || (id.startsWith('padrao-') ? id.replace(/^padrao-/, '').replace(/-/g, '_') : '');
    if (chaveParaBuscar) {
      await supabase
        .from('config_envio_emails')
        .delete()
        .eq('chave', chaveParaBuscar);
    }
    return;
  }

  const { error } = await supabase
    .from('config_envio_emails')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Erro ao excluir configuração de e-mail:', error);
    throw error;
  }
}

/**
 * Sincroniza e insere no Supabase quaisquer gatilhos padrão do sistema que ainda não existam.
 */
export async function sincronizarGatilhosPadrao(): Promise<{ inseridos: number }> {
  invalidarCacheConfigsEmail();
  if (!supabase) return { inseridos: 0 };

  const { data, error } = await supabase.from('config_envio_emails').select('chave');
  if (error) {
    console.warn('Erro ao verificar gatilhos existentes para sincronização:', error);
    return { inseridos: 0 };
  }

  const chavesExistentes = new Set(((data || []) as { chave: string }[]).map(c => c.chave.toLowerCase()));
  const faltantes = CONFIGS_EMAIL_PADRAO.filter(p => !chavesExistentes.has(p.chave.toLowerCase()));

  let inseridos = 0;
  for (const item of faltantes) {
    const { error: insertErr } = await supabase.from('config_envio_emails').insert({
      chave: item.chave,
      nome: item.nome,
      modulo: item.modulo,
      descricao: item.descricao,
      destinatarios: item.destinatarios,
      copia: item.copia,
      copia_oculta: item.copia_oculta,
      assunto_padrao: item.assunto_padrao,
      ativo: item.ativo,
    });
    if (!insertErr) inseridos++;
  }

  return { inseridos };
}
