/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportação em PDF executivo de Solicitação de Compra (FRM.SUP-0001).
 */

import { localDb } from '../../db/localDb';
import { Request, RequestItem } from '../../types';
import { createDoc, PdfTextWriter, embedAttachments, downloadPdf } from './core';

const CRITICALITY_LABELS: Record<number, string> = {
  1: '1 - Baixa',
  2: '2 - Moderada',
  3: '3 - Urgente',
  4: '4 - Crítica',
  5: '5 - Impeditiva',
};

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'RASCUNHO',
  pendente: 'PENDENTE',
  aprovada: 'APROVADA',
  rejeitada: 'REJEITADA',
  em_revisao: 'EM REVISÃO',
  concluida: 'CONCLUÍDA',
};

const STATUS_COLORS: Record<string, 'green' | 'amber' | 'blue' | 'purple' | 'red'> = {
  rascunho: 'amber',
  pendente: 'blue',
  aprovada: 'green',
  rejeitada: 'red',
  em_revisao: 'purple',
  concluida: 'green',
};

export interface ExportCompraPdfResult {
  failedAttachments: string[];
}

export async function exportCompraPdf(
  request: Request,
  sectorName: string,
  items: RequestItem[]
): Promise<ExportCompraPdfResult> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  const statusStr = STATUS_LABELS[request.status] || request.status.toUpperCase();
  const statusColor = STATUS_COLORS[request.status] || 'blue';

  writer.drawDocumentHeader({
    title: `Solicitação de Compra #${request.number}`,
    formCode: 'FRM.SUP-0001 (Rev. 02)',
    protocol: `SC-${request.number}`,
    statusBadge: statusStr,
    statusColor: statusColor,
  });

  writer.drawInfoGrid([
    { label: 'Solicitante', value: request.solicitante_name },
    { label: 'Setor Solicitante', value: sectorName },
    { label: 'Data de Abertura', value: new Date(request.created_at).toLocaleString('pt-BR') },
    {
      label: 'Data Máxima de Entrega',
      value: request.data_necessidade ? new Date(request.data_necessidade).toLocaleDateString('pt-BR') : 'Não especificada',
    },
    { label: 'Criticidade / Prioridade', value: CRITICALITY_LABELS[request.criticality] || String(request.criticality) },
    {
      label: 'Status do Pedido',
      value: request.status,
      statusBadge: statusStr,
      statusColor: statusColor,
    },
  ], 3);

  if (request.justificativa) {
    writer.drawSectionHeader('Justificativa e Aplicação');
    writer.drawCallout('Justificativa Técnica', request.justificativa);
  }

  writer.drawSectionHeader('Itens da Solicitação', items.length);

  const tableHeaders = [
    { label: 'ITEM / DESCRIÇÃO', width: 200, align: 'left' as const },
    { label: 'CÓDIGO SAP', width: 85, align: 'left' as const },
    { label: 'MARCA / REF', width: 85, align: 'left' as const },
    { label: 'QTD / UND', width: 70, align: 'center' as const },
    { label: 'VALOR EST.', width: 75, align: 'right' as const },
  ];

  const tableRows = items.map((it) => [
    `${it.description}${it.is_generic ? ' [GENÉRICO]' : ''}${it.observation ? `\nObs: ${it.observation}` : ''}`,
    it.sap_code || '-',
    it.brand || '-',
    `${it.quantity} ${it.unit}`,
    it.estimated_value > 0 ? `R$ ${it.estimated_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-',
  ]);

  writer.drawTable(tableHeaders, tableRows);

  writer.drawSignatures([
    { role: 'Solicitante', name: request.solicitante_name },
    { role: 'Aprovador do Setor' },
    { role: 'Comprador Responsável' },
  ]);

  const failedAttachments: string[] = [];
  const photoAttachments: { title: string; reference: string; source: string; description?: string }[] = [];
  const pdfAttachments: RequestAttachment[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemAttachments = localDb.getAttachments(request.id, item.id);
    for (const att of itemAttachments) {
      if (att.mime_type?.startsWith('image/')) {
        photoAttachments.push({
          title: `Item #${idx + 1}: ${item.description}`,
          reference: `Código SAP: ${item.sap_code || 'Não informado'} · Marca: ${item.brand || 'N/A'} · Quantidade: ${item.quantity} ${item.unit}`,
          source: att.storage_path || att.url,
          description: `Arquivo anexado: ${att.name}${item.observation ? ` (Obs: ${item.observation})` : ''}`,
        });
      } else {
        pdfAttachments.push(att);
      }
    }
  }

  const generalAttachments = localDb.getAttachments(request.id).filter((a) => !a.request_item_id);
  for (const att of generalAttachments) {
    if (att.mime_type?.startsWith('image/')) {
      photoAttachments.push({
        title: `Anexo Geral da Solicitação #${request.number}`,
        reference: `Solicitante: ${request.solicitante_name} · Setor: ${sectorName}`,
        source: att.storage_path || att.url,
        description: `Arquivo anexado: ${att.name}`,
      });
    } else {
      pdfAttachments.push(att);
    }
  }

  if (photoAttachments.length > 0) {
    await writer.drawPhotoAttachments(photoAttachments);
  }

  if (pdfAttachments.length > 0) {
    failedAttachments.push(...(await embedAttachments(doc, pdfAttachments)));
  }

  writer.finalizeDoc('FRM.SUP-0001');
  await downloadPdf(doc, `compra-${request.number}.pdf`);

  return { failedAttachments };
}
