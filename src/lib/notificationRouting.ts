/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Roteamento inteligente de notificacoes.
 * Determina a tela de destino ao clicar em qualquer notificacao, seja no
 * Header ou no Card de Notificacoes da tela Inicio (Dashboard).
 */

import type { Notification, Profile } from '../types';
import { localDb } from '../db/localDb';

/**
 * Resolve a rota de destino para onde o usuario deve ser navegado ao clicar
 * em uma notificacao.
 */
export function resolverRotaNotificacao(notif: Notification, user: Profile): string {
  const titleLower = (notif.title || '').toLowerCase();
  const descLower = (notif.description || '').toLowerCase();
  const textoCompleto = `${titleLower} ${descLower}`;
  const contextKey = notif.context_key || '';

  // 1. Roteamento por context_key explicito
  if (contextKey.startsWith('rastreio:')) {
    const ri = contextKey.slice('rastreio:'.length);
    return `/rastreio?ri=${encodeURIComponent(ri)}`;
  }

  if (contextKey.startsWith('feedback:')) {
    const feedbackId = contextKey.slice('feedback:'.length);
    return `/admin/feedback?id=${encodeURIComponent(feedbackId)}`;
  }

  if (contextKey.startsWith('expedicao:') || contextKey.startsWith('carregamento:')) {
    const id = contextKey.split(':')[1];
    return `/formularios/logistica-expedicao?id=${encodeURIComponent(id)}`;
  }

  if (contextKey.startsWith('ase:') || contextKey.startsWith('rh_ase:')) {
    const id = contextKey.split(':')[1];
    return `/formularios/rh-ase-hora-extra?id=${encodeURIComponent(id)}`;
  }

  if (contextKey.startsWith('portaria:')) {
    const id = contextKey.split(':')[1];
    return `/formularios/portaria-relatorio?id=${encodeURIComponent(id)}`;
  }

  if (
    contextKey.startsWith('importacao:') ||
    contextKey.startsWith('exportacao:') ||
    contextKey.startsWith('importar:')
  ) {
    return user.roles.includes('admin') ? '/admin/importacao-materiais' : '/materiais/busca';
  }

  if (contextKey.startsWith('/')) {
    return contextKey;
  }

  // 2. Roteamento por request_id vinculado
  if (notif.request_id) {
    const req = localDb.getRequests().find(r => r.id === notif.request_id);
    const ehCadastroSap = req ? req.type === 'cadastro_sap' : textoCompleto.includes('cadastro sap');

    const atendeCadastroSap =
      user.roles.includes('comprador') ||
      user.roles.includes('coordenador_suprimentos') ||
      user.roles.includes('admin') ||
      user.aprovador_cadastro_sap;

    if (ehCadastroSap && atendeCadastroSap) {
      return `/suprimentos/cadastros-sap?id=${notif.request_id}`;
    }

    if (
      user.roles.includes('gestor') &&
      (textoCompleto.includes('compra') || textoCompleto.includes('aprova') || textoCompleto.includes('aguarda'))
    ) {
      return `/solicitacoes?id=${notif.request_id}&escopo=acao`;
    }

    return `/solicitacoes?id=${notif.request_id}`;
  }

  // 3. Fallback por numero da solicitacao (#1234567)
  const numExplicit = notif.request_number;
  const numMatch = (notif.title + ' ' + (notif.description || '')).match(/#(\d{7})/);
  const numero = numExplicit || (numMatch ? numMatch[1] : null);

  if (numero) {
    const matchReq = localDb.getRequests().find(r => r.number === numero);
    if (matchReq) {
      const ehCadastroSap = matchReq.type === 'cadastro_sap';
      const atendeCadastroSap =
        user.roles.includes('comprador') ||
        user.roles.includes('coordenador_suprimentos') ||
        user.roles.includes('admin') ||
        user.aprovador_cadastro_sap;

      if (ehCadastroSap && atendeCadastroSap) {
        return `/suprimentos/cadastros-sap?id=${matchReq.id}`;
      }
      return `/solicitacoes?id=${matchReq.id}`;
    }
  }

  // 4. Roteamento por inferencia de assunto
  if (textoCompleto.includes('novo cadastro') || textoCompleto.includes('aguarda aprova')) {
    return user.roles.includes('admin') ? '/admin/usuarios' : '/perfil';
  }

  if (textoCompleto.includes('status do perfil') || textoCompleto.includes('acesso')) {
    return '/perfil';
  }

  if (
    textoCompleto.includes('feedback') ||
    textoCompleto.includes('bug') ||
    textoCompleto.includes('sugestão') ||
    textoCompleto.includes('sugestao') ||
    textoCompleto.includes('reporte')
  ) {
    return user.roles.includes('admin') ? '/admin/feedback' : '/';
  }

  if (textoCompleto.includes('cadastro sap')) {
    return '/suprimentos/cadastros-sap';
  }

  if (
    textoCompleto.includes('pendência') ||
    textoCompleto.includes('pendencia') ||
    textoCompleto.includes('processamento nf')
  ) {
    return '/suprimentos/pendencias-processamento';
  }

  if (
    textoCompleto.includes('importação') ||
    textoCompleto.includes('importacao') ||
    textoCompleto.includes('exportação') ||
    textoCompleto.includes('exportacao') ||
    textoCompleto.includes('planilha')
  ) {
    return user.roles.includes('admin') ? '/admin/importacao-materiais' : '/materiais/busca';
  }

  if (textoCompleto.includes('expedição') || textoCompleto.includes('expedicao') || textoCompleto.includes('carregamento')) {
    return '/formularios/logistica-expedicao';
  }

  if (textoCompleto.includes('ase') || textoCompleto.includes('hora extra')) {
    return '/formularios/rh-ase-hora-extra';
  }

  if (textoCompleto.includes('portaria')) {
    return '/formularios/portaria';
  }

  if (textoCompleto.includes('rastreio')) {
    return '/rastreio';
  }

  if (
    textoCompleto.includes('diligenciamento') ||
    textoCompleto.includes('sem migo') ||
    textoCompleto.includes('central compras') ||
    textoCompleto.includes('pedido de compra')
  ) {
    return '/suprimentos/compras';
  }

  if (textoCompleto.includes('cotação') || textoCompleto.includes('cotacao') || textoCompleto.includes('cotações') || textoCompleto.includes('cotacoes')) {
    return '/suprimentos/cotacoes';
  }

  if (textoCompleto.includes('contas a pagar') || textoCompleto.includes('contas pagar')) {
    return '/financeiro/contas-pagar';
  }

  if (textoCompleto.includes('estoque') || textoCompleto.includes('almoxarifado')) {
    return '/almoxarifado/estoque';
  }

  // 5. Fallback padrao
  if (user.roles.includes('gestor') && (textoCompleto.includes('aprova') || textoCompleto.includes('pendente'))) {
    return '/solicitacoes?escopo=acao';
  }

  return '/solicitacoes';
}
