/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportação em PDF executivo de Solicitação de Cadastro SAP (FRM.CAD-0001).
 */

import { Request, RequestAttachment } from '../../types';
import { createDoc, PdfTextWriter, embedAttachments, downloadPdf } from './core';

export interface ExportCadastroSapPdfResult {
  failedAttachments: string[];
}

function parseNomeEspecificacoes(request: Request): { nome: string; especificacoes: string } {
  const texto = request.justificativa || '';
  const itemMatch = texto.match(/^Nome: (.*?)\. Specs: (.*?)\. Justificativa: [\s\S]*$/);
  if (itemMatch) return { nome: itemMatch[1], especificacoes: itemMatch[2] };

  const fornecedorMatch = texto.match(/^Nome: (.*?)\. Justificativa: [\s\S]*$/);
  if (fornecedorMatch) return { nome: fornecedorMatch[1], especificacoes: '-' };

  return { nome: texto || '-', especificacoes: '-' };
}

export async function exportCadastroSapPdf(
  request: Request,
  sectorName: string,
  attachments: RequestAttachment[]
): Promise<ExportCadastroSapPdfResult> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);
  const isFornecedor = request.registration_type === 'Fornecedor';
  const { nome, especificacoes } = parseNomeEspecificacoes(request);

  writer.drawDocumentHeader({
    title: `Solicitação de Cadastro SAP #${request.number}`,
    formCode: 'FRM.CAD-0001 (Rev. 01)',
    protocol: `SAP-${request.number}`,
    statusBadge: isFornecedor ? 'CADASTRO FORNECEDOR' : 'CADASTRO MATERIAL',
    statusColor: 'blue',
  });

  writer.drawInfoGrid([
    { label: 'Tipo de Cadastro', value: request.registration_type || 'Material' },
    { label: 'Solicitante', value: request.solicitante_name },
    { label: 'Setor Solicitante', value: sectorName },
    { label: 'Data de Abertura', value: new Date(request.created_at).toLocaleString('pt-BR') },
    { label: isFornecedor ? 'Razão Social / Nome Fantasia' : 'Nome / Descrição Curta', value: nome },
    { label: isFornecedor ? 'CNPJ / Site Corporativo' : 'Fabricante / Marca', value: request.brand || '-' },
  ], 2);

  if (!isFornecedor && especificacoes && especificacoes !== '-') {
    writer.drawSectionHeader('Especificações Técnicas');
    writer.drawCallout('Detalhes do Material', especificacoes);
  }

  if (request.justificativa) {
    writer.drawSectionHeader('Justificativa da Solicitação');
    writer.drawCallout('Justificativa', request.justificativa);
  }

  writer.drawSignatures([
    { role: 'Solicitante', name: request.solicitante_name },
    { role: 'Analista de Cadastro SAP' },
  ]);

  const failedAttachments: string[] = [];
  const photoAttachments: { title: string; reference: string; source: string; description?: string }[] = [];
  const pdfAttachments: RequestAttachment[] = [];

  for (const att of attachments) {
    if (att.mime_type?.startsWith('image/')) {
      photoAttachments.push({
        title: `Anexo de Cadastro SAP #${request.number}`,
        reference: `Cadastro: ${nome} · ${isFornecedor ? 'Fornecedor' : 'Material'} · Solicitante: ${request.solicitante_name}`,
        source: att.storage_path || att.url,
        description: `Arquivo: ${att.name}`,
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

  writer.finalizeDoc('FRM.CAD-0001');
  await downloadPdf(doc, `cadastro-sap-${request.number}.pdf`);

  return { failedAttachments };
}
