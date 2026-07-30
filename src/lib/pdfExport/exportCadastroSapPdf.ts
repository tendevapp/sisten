/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, RequestAttachment } from '../../types';
import { createDoc, PdfTextWriter, embedAttachments, downloadPdf } from './core';

const CRITICALITY_LABELS: Record<number, string> = {
  1: '1 - Baixa',
  2: '2 - Moderada',
  3: '3 - Urgente',
  4: '4 - Crítica',
  5: '5 - Impeditiva'
};

const STATUS_LABELS: Record<string, string> = {
  aberto: 'Aberto na Fila',
  em_atendimento: 'Em Atendimento',
  aguardando_solicitante: 'Aguardando Solicitante',
  resolvido: 'Resolvido',
  fechado: 'Fechado/Concluído'
};

export interface ExportCadastroSapPdfResult {
  failedAttachments: string[];
}

export async function exportCadastroSapPdf(request: Request, sectorName: string, attachments: RequestAttachment[]): Promise<ExportCadastroSapPdfResult> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  writer.drawTitle(`Solicitação de Cadastro SAP #${request.number}`);
  writer.drawField('Tipo de Registro', request.registration_type || '-');
  writer.drawField('Status', STATUS_LABELS[request.status] || request.status);
  writer.drawField('Criticidade', CRITICALITY_LABELS[request.criticality] || String(request.criticality));
  writer.drawField('Solicitante', request.solicitante_name);
  writer.drawField('Setor Solicitante', sectorName);
  writer.drawField('Aberta em', new Date(request.created_at).toLocaleString('pt-BR'));
  writer.drawField('Atendente Atribuído', request.atendente_name || 'Ninguém assumiu ainda');
  writer.drawField('Justificativa da Demanda', request.justificativa || '-');

  const failedAttachments = await embedAttachments(doc, attachments);
  await downloadPdf(doc, `cadastro-sap-${request.number}.pdf`);

  return { failedAttachments };
}
