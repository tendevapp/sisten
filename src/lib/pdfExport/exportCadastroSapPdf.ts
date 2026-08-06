/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, RequestAttachment } from '../../types';
import { createDoc, PdfTextWriter, embedAttachments, downloadPdf } from './core';

export interface ExportCadastroSapPdfResult {
  failedAttachments: string[];
}

/**
 * Nome/Especificações de um cadastro tipo Item são compostos num único texto
 * em `justificativa` na criação (ver handleSubmit em NewRequest.tsx), porque
 * o Request não tem campos próprios pra eles — mesmo parse reverso usado lá
 * pro modo de edição.
 */
function parseNomeEspecificacoes(request: Request): { nome: string; especificacoes: string } {
  const texto = request.justificativa || '';
  const itemMatch = texto.match(/^Nome: (.*?)\. Specs: (.*?)\. Justificativa: [\s\S]*$/);
  if (itemMatch) return { nome: itemMatch[1], especificacoes: itemMatch[2] };

  const fornecedorMatch = texto.match(/^Nome: (.*?)\. Justificativa: [\s\S]*$/);
  if (fornecedorMatch) return { nome: fornecedorMatch[1], especificacoes: '-' };

  // Dado antigo/fora do padrão esperado: melhor mostrar o texto bruto do que
  // nada, já que não há como separar as partes.
  return { nome: texto || '-', especificacoes: '-' };
}

export async function exportCadastroSapPdf(request: Request, sectorName: string, attachments: RequestAttachment[]): Promise<ExportCadastroSapPdfResult> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);
  const isFornecedor = request.registration_type === 'Fornecedor';
  const { nome, especificacoes } = parseNomeEspecificacoes(request);

  writer.drawTitle(`Solicitação de Cadastro SAP #${request.number}`);
  writer.drawField(isFornecedor ? 'Razão Social / Nome Fantasia' : 'Nome / Descrição Curta', nome);
  writer.drawField(isFornecedor ? 'CNPJ / Site Corporativo' : 'Fabricante', request.brand || '-');
  if (!isFornecedor) {
    writer.drawField('Especificações Técnicas', especificacoes);
  }

  const failedAttachments = await embedAttachments(doc, attachments);
  await downloadPdf(doc, `cadastro-sap-${request.number}.pdf`);

  return { failedAttachments };
}
