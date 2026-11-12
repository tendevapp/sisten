/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportação em PDF executivo de Solicitação de Cadastro SAP (FRM.CAD-0001).
 */

import { Request, RequestAttachment } from '../../types';
import { separarJustificativaCadastroSap } from '../cadastroSapTexto';
import { createDoc, PdfTextWriter, embedAttachments, downloadPdf, docToPdfGerado, baixarPdfGerado, type PdfGerado } from './core';
export type { PdfGerado };

export interface GerarCadastroSapPdfResult extends PdfGerado {
  failedAttachments: string[];
}

export interface ExportCadastroSapPdfResult {
  failedAttachments: string[];
}

export function parseNomeEspecificacoes(request: Request): { nome: string; especificacoes: string } {
  const texto = request.justificativa || '';
  const p = separarJustificativaCadastroSap(texto);
  if (p.tipo === 'item') return { nome: p.nome, especificacoes: p.specs };
  if (p.tipo === 'atualizacao') return { nome: p.nome || 'Conforme cadastro SAP', especificacoes: '-' };
  if (p.tipo === 'fornecedor') return { nome: p.nome, especificacoes: '-' };
  return { nome: texto || '-', especificacoes: '-' };
}

export async function gerarCadastroSapPdf(
  request: Request,
  sectorName: string,
  attachments: RequestAttachment[]
): Promise<GerarCadastroSapPdfResult> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);
  const isFornecedor = request.registration_type === 'Fornecedor';
  const isAtualizacao = isFornecedor && request.fornecedor_operacao === 'atualizacao';
  const { nome, especificacoes } = parseNomeEspecificacoes(request);

  const statusBadge = isFornecedor
    ? isAtualizacao
      ? 'ATUALIZAÇÃO FORNECEDOR'
      : 'CADASTRO FORNECEDOR'
    : 'CADASTRO MATERIAL';

  writer.drawDocumentHeader({
    title: `Solicitação de Cadastro SAP #${request.number}`,
    formCode: 'FRM.CAD-0001 (Rev. 02)',
    protocol: `SAP-${request.number}`,
    statusBadge,
    statusColor: isAtualizacao ? 'amber' : 'blue',
  });

  const gridItems: { label: string; value: string }[] = [
    { label: 'Tipo de Cadastro', value: request.registration_type || 'Material' },
  ];

  if (isFornecedor) {
    gridItems.push({
      label: 'Operação',
      value: isAtualizacao ? 'Atualização de Cadastro' : 'Novo Cadastro',
    });
  }

  gridItems.push(
    { label: 'Solicitante', value: request.solicitante_name },
    { label: 'Setor Solicitante', value: sectorName },
    { label: 'Data de Abertura', value: new Date(request.created_at).toLocaleString('pt-BR') },
  );

  if (isAtualizacao && request.codigo_fornecedor_sap) {
    gridItems.push({ label: 'Código Fornecedor SAP (atual)', value: request.codigo_fornecedor_sap });
  }

  gridItems.push(
    { label: isFornecedor ? (isAtualizacao ? 'NOVO Razão Social / Nome Fantasia' : 'Razão Social / Nome Fantasia') : 'Nome / Descrição Curta', value: nome },
    { label: isFornecedor ? (isAtualizacao ? 'NOVO CNPJ / Site Corporativo' : 'CNPJ / Site Corporativo') : 'Fabricante / Marca', value: request.brand || '-' },
  );

  if (request.codigo_sap_gerado) {
    gridItems.push({
      label: isFornecedor ? 'Cód. Fornecedor SAP Gerado' : 'Cód. Material SAP Gerado',
      value: request.codigo_sap_gerado,
    });
  }

  if (request.ticket_externo) {
    gridItems.push({ label: 'Ticket em Plataforma Externa', value: request.ticket_externo });
  }

  writer.drawInfoGrid(gridItems, 2);

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
  const gerado = await docToPdfGerado(doc, `cadastro-sap-${request.number}.pdf`, `Cadastro SAP #${request.number}`);
  return { ...gerado, failedAttachments };
}

export async function exportCadastroSapPdf(
  request: Request,
  sectorName: string,
  attachments: RequestAttachment[]
): Promise<ExportCadastroSapPdfResult> {
  const res = await gerarCadastroSapPdf(request, sectorName, attachments);
  baixarPdfGerado(res);
  return { failedAttachments: res.failedAttachments };
}
