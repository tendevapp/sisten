/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * O que cada pessoa pode fazer com o item ou a peça lidos no QR. Fica fora dos
 * diálogos (`EscolhaAcaoItemQr`, `EscolhaAcaoPecaQr`) para o cabeçalho e o
 * porteiro do QR decidirem se mostram o botão sem carregar os diálogos — eles
 * só baixam quando um QR é lido, e o arquivo principal do app não cresce.
 */

import type { Profile } from '../types';
import { canAccessForm, canAccessPage } from './pages';

export type AcaoItemQr = 'baixa' | 'inventario' | 'extra';
export type AcaoPecaQr = 'cadastro' | 'gemba' | 'projetos';

/** Formulário de cada ação do item SAP, na ordem do diálogo. */
export const FORMULARIO_ACAO_ITEM: Record<AcaoItemQr, string> = {
  baixa: 'form_almoxarifado_requisicao_balcao',
  inventario: 'form_almoxarifado_inventario',
  extra: 'form_almoxarifado_solicitacao_extra',
};

/** Ações que a pessoa pode fazer com um item lido, conforme o acesso aos formulários. */
export function acoesDoItemQr(user: Profile): AcaoItemQr[] {
  return (Object.keys(FORMULARIO_ACAO_ITEM) as AcaoItemQr[]).filter(acao => canAccessForm(user, FORMULARIO_ACAO_ITEM[acao]));
}

/** Tela de cada ação da peça de projeto, na ordem do diálogo. */
export const ACESSO_ACAO_PECA: Record<AcaoPecaQr, (user: Profile) => boolean> = {
  cadastro: user => canAccessForm(user, 'form_almoxarifado_cadastro_itens'),
  gemba: user => canAccessPage(user, 'almox_gemba'),
  projetos: user => canAccessPage(user, 'almox_projetos'),
};

export function acoesDaPecaQr(user: Profile): AcaoPecaQr[] {
  return (Object.keys(ACESSO_ACAO_PECA) as AcaoPecaQr[]).filter(acao => ACESSO_ACAO_PECA[acao](user));
}
