/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Etapa da Requisição no Balcão no caminho até o SAP, para as abas da lista:
 *
 *   Aguardando confirmação → Não exportada → Exportada (alerta: ainda sem
 *   doc. SAP) → Concluído SAP (doc. SAP gravado).
 *
 * "Concluído SAP" é ter doc. SAP: vindo da planilha concluída (doc. por item)
 * ou informado à mão na requisição. Importação parcial — parte dos itens com
 * doc., parte sem — continua em Exportada, com os itens que faltam, porque é
 * exatamente o que ainda não foi gerado no SAP.
 *
 * Requisição com doc. SAP que nunca foi exportada (lançada à mão no SAP) vai
 * para Concluído: deixá-la em "Não exportada" a colocaria na próxima planilha
 * e o SAP receberia o movimento duas vezes.
 */

export type EtapaSapBalcao = 'aguardando' | 'nao_exportada' | 'exportada' | 'concluida';

export interface RequisicaoParaEtapa {
  pendente_confirmacao?: boolean | null;
  exportacao_id?: string | null;
  doc_sap?: string | null;
  itens: { doc_sap?: string | null }[];
}

/** Itens ainda sem doc. SAP numa requisição em que outros já têm. */
export function itensSemDocParcial(r: RequisicaoParaEtapa): number {
  const comDoc = r.itens.filter((i) => i.doc_sap).length;
  if (comDoc === 0 || comDoc === r.itens.length) return 0;
  return r.itens.length - comDoc;
}

export function etapaSapBalcao(r: RequisicaoParaEtapa): EtapaSapBalcao {
  if (r.pendente_confirmacao) return 'aguardando';
  const temDoc = !!r.doc_sap || r.itens.some((i) => i.doc_sap);
  if (temDoc && itensSemDocParcial(r) === 0) return 'concluida';
  return r.exportacao_id ? 'exportada' : 'nao_exportada';
}
