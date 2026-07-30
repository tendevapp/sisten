/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { localDb } from '../../db/localDb';
import { Request, RequestItem } from '../../types';
import { createDoc, PdfTextWriter, embedAttachments, downloadPdf } from './core';

const CRITICALITY_LABELS: Record<number, string> = {
  1: '1 - Baixa',
  2: '2 - Moderada',
  3: '3 - Urgente',
  4: '4 - Crítica',
  5: '5 - Impeditiva'
};

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
  em_revisao: 'Revisão',
  concluida: 'Concluída'
};

export interface ExportCompraPdfResult {
  failedAttachments: string[];
}

export async function exportCompraPdf(request: Request, sectorName: string, items: RequestItem[]): Promise<ExportCompraPdfResult> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  writer.drawTitle(`Solicitação de Compra #${request.number}`);
  writer.drawField('Status', STATUS_LABELS[request.status] || request.status);
  writer.drawField('Criticidade', CRITICALITY_LABELS[request.criticality] || String(request.criticality));
  writer.drawField('Solicitante', request.solicitante_name);
  writer.drawField('Setor Solicitante', sectorName);
  writer.drawField('Aberta em', new Date(request.created_at).toLocaleString('pt-BR'));
  if (request.data_necessidade) {
    writer.drawField('Data Máxima de Entrega', new Date(request.data_necessidade).toLocaleDateString('pt-BR'));
  }
  writer.drawField('Justificativa e Aplicação', request.justificativa || '-');

  writer.spacer(6);
  writer.drawSubtitle(`Itens Solicitados (${items.length})`);
  items.forEach((it, idx) => {
    const codigo = it.sap_code ? `SAP: ${it.sap_code}` : 'Sem código SAP associado';
    const valor = it.estimated_value > 0 ? ` · R$ ${it.estimated_value.toLocaleString('pt-BR')}` : '';
    writer.drawTableRow(`${idx + 1}. ${it.description}${it.is_generic ? ' [Item Genérico]' : ''}`);
    writer.drawTableRow(`   ${codigo} · Marca: ${it.brand || 'Não informada'} · Qtd: ${it.quantity} ${it.unit}${valor}`);
    if (it.observation) writer.drawTableRow(`   Obs: ${it.observation}`);
  });

  const failedAttachments: string[] = [];

  for (const item of items) {
    const itemAttachments = localDb.getAttachments(request.id, item.id);
    if (itemAttachments.length === 0) continue;
    failedAttachments.push(...await embedAttachments(doc, itemAttachments));
  }

  const generalAttachments = localDb.getAttachments(request.id).filter(a => !a.request_item_id);
  if (generalAttachments.length > 0) {
    failedAttachments.push(...await embedAttachments(doc, generalAttachments));
  }

  await downloadPdf(doc, `compra-${request.number}.pdf`);

  return { failedAttachments };
}
