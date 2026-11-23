/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Responsáveis por receber as solicitações de Cadastro SAP e de compra de
 * Serviço. Não há tabela própria: o responsável é quem está no "Para" do
 * gatilho de e-mail daquele tipo (`config_envio_emails`), editado em
 * Administração › Cadastros Gerais › E-mails. Assim a escolha de quem recebe
 * o e-mail de abertura e de quem atende é uma só, e não divergem.
 */

import type { ConfigEnvioEmail, Profile, Request } from '../types';
import { configsEmailConhecidas, normalizarListaEmails } from './emailConfigApi';

export interface GatilhoResponsavel {
  chave: string;
  rotulo: string;
  descricao: string;
}

/** Tipos de solicitação com responsável escolhido em Cadastros Gerais. */
export const GATILHOS_RESPONSAVEIS: GatilhoResponsavel[] = [
  {
    chave: 'cadastro_sap',
    rotulo: 'Cadastro SAP — Item',
    descricao: 'Recebe as solicitações de cadastro de material no SAP.',
  },
  {
    chave: 'cadastro_sap_fornecedor',
    rotulo: 'Cadastro SAP — Fornecedor',
    descricao: 'Recebe as solicitações de cadastro ou atualização de fornecedor no SAP.',
  },
  {
    chave: 'compra_servico',
    rotulo: 'Solicitação de Serviço',
    descricao: 'Recebe as solicitações de compra do tipo Serviço.',
  },
];

/** Gatilho (e responsável) que corresponde à solicitação, quando ela tem um. */
export function chaveGatilhoDaSolicitacao(r: Pick<Request, 'type' | 'tipo_compra' | 'registration_type'>): string | null {
  if (r.type === 'compra' && r.tipo_compra === 'Serviço') return 'compra_servico';
  if (r.type === 'cadastro_sap') return r.registration_type === 'Fornecedor' ? 'cadastro_sap_fornecedor' : 'cadastro_sap';
  return null;
}

/** E-mails do "Para" do gatilho, em minúsculas. */
export function emailsResponsaveis(config: Pick<ConfigEnvioEmail, 'destinatarios'> | null | undefined): string[] {
  return normalizarListaEmails(config?.destinatarios).map(e => e.toLowerCase());
}

/** O usuário está entre os responsáveis daquele gatilho? */
export function ehResponsavelDoGatilho(
  user: Pick<Profile, 'email'>,
  config: Pick<ConfigEnvioEmail, 'destinatarios'> | null | undefined,
): boolean {
  const email = (user.email || '').trim().toLowerCase();
  return !!email && emailsResponsaveis(config).includes(email);
}

/**
 * O usuário é responsável por esta solicitação, segundo a última leitura das
 * configurações de e-mail (síncrono: vale depois que `listarConfigsEmail`
 * rodou ao menos uma vez na sessão; antes disso responde `false`).
 */
export function ehResponsavelPelaSolicitacao(
  r: Pick<Request, 'type' | 'tipo_compra' | 'registration_type'>,
  user: Pick<Profile, 'email'>,
  configs: ConfigEnvioEmail[] = configsEmailConhecidas(),
): boolean {
  const chave = chaveGatilhoDaSolicitacao(r);
  if (!chave) return false;
  const config = configs.find(c => c.chave.toLowerCase() === chave);
  return ehResponsavelDoGatilho(user, config);
}
