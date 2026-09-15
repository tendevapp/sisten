/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Andamento automático da compra depois de aprovada — sem isso, `request.status`
 * trava em `aprovada` para sempre e o stepper da Central de Solicitações nunca
 * mostra "Em cotação", "Pedido emitido" ou "Entregue" (esses três rótulos já
 * existiam em `RequestDetailPanel.tsx`, mas nada os produzia).
 *
 * Regra (a mesma que já rege a Central de Compras, em `views/Compras.tsx`,
 * só que agora escrita de volta em `requests.status`):
 *   - RM aparece na ME5A (`vw_sap_requisicoes_enriquecidas`)         → Fila de suprimentos (aprovada)
 *   - RM tem item num processo de cotação (`sup_cotacao_processo_itens`) → Em cotação
 *   - RM tem PO (`status_requisicao === 'Processado'`)                → Pedido emitido
 *   - RM tem MIGO (`data_migo` preenchida)                            → Entregue
 *
 * Cada critério é independente (não é uma máquina de estados que exige passar
 * por todos): uma RM pode pular direto de "Fila de suprimentos" para "Pedido
 * emitido" se o comprador não passou pelo módulo de Cotações, e mesmo assim
 * `calcularEstagioCompraPorSap` deve apontar o estágio mais avançado batido
 * pelos dados do SAP. `proximoStatusAutomaticoCompra` só deixa o status andar
 * para frente — nunca volta uma compra que já avançou, mesmo que uma consulta
 * futura não repita o sinal (ex.: página de PO removida do cache local).
 */

import type { EnrichedSAPRecord, RequestStatus } from '../types';

/** Estágios que este motor decide sozinho — os anteriores (`pendente` → `aprovada`) continuam manuais, decisão do gestor. */
export const ESTAGIOS_AUTOMATICOS_COMPRA: RequestStatus[] = ['aprovada', 'em_cotacao', 'pedido_emitido', 'concluida'];

/** Tolera zero à esquerda dos dois lados — mesmo padrão usado no resto da Central de Compras (ver `centralComprasSisten.ts`). */
export function normalizarRm(valor: string | null | undefined): string {
  const s = (valor || '').trim();
  const semZeros = s.replace(/^0+/, '');
  return semZeros || s;
}

type RegistroSapParaEstagio = Pick<EnrichedSAPRecord, 'documento_compra' | 'data_migo' | 'status_requisicao'>;

/**
 * Estágio mais avançado indicado pelos dados do SAP para uma RM, ou `null`
 * quando a RM ainda não apareceu na ME5A (nada para decidir — a solicitação
 * fica onde está).
 */
export function calcularEstagioCompraPorSap(
  registrosDaRm: RegistroSapParaEstagio[],
  temProcessoCotacao: boolean,
): RequestStatus | null {
  if (registrosDaRm.length === 0) return null;

  const temMigo = registrosDaRm.some(r => !!r.data_migo);
  if (temMigo) return 'concluida';

  const temPO = registrosDaRm.some(r => r.status_requisicao === 'Processado');
  if (temPO) return 'pedido_emitido';

  if (temProcessoCotacao) return 'em_cotacao';

  return 'aprovada';
}

/**
 * Próximo status a gravar, ou `null` quando não há nada a fazer: status atual
 * fora do trecho automático (`pendente`, `rejeitada`...), estágio calculado
 * igual ou anterior ao atual, ou RM ainda sem dado no SAP.
 */
export function proximoStatusAutomaticoCompra(
  statusAtual: RequestStatus,
  estagioCalculado: RequestStatus | null,
): RequestStatus | null {
  if (!estagioCalculado) return null;

  const idxAtual = ESTAGIOS_AUTOMATICOS_COMPRA.indexOf(statusAtual);
  if (idxAtual === -1) return null; // pendente, rejeitada, cancelada... fora do trecho automático

  const idxAlvo = ESTAGIOS_AUTOMATICOS_COMPRA.indexOf(estagioCalculado);
  if (idxAlvo <= idxAtual) return null; // já está lá, ou o motor não regride

  return estagioCalculado;
}

/** Comentário gravado no histórico de status para cada transição automática. */
export function comentarioStatusAutomaticoCompra(estagio: RequestStatus): string {
  switch (estagio) {
    case 'em_cotacao':
      return 'Atualização automática: processo de cotação aberto no SAP.';
    case 'pedido_emitido':
      return 'Atualização automática: pedido de compra (PO) emitido no SAP.';
    case 'concluida':
      return 'Atualização automática: material recebido (MIGO) no SAP.';
    default:
      return 'Atualização automática a partir dos dados do SAP.';
  }
}
