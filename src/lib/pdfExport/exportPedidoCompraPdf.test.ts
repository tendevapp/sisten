/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PdfTextWriter, PAGE_WIDTH, MARGIN } from './core';
import type { PedidoFornecedor } from '../pedidoCompra';

describe('exportPedidoCompraPdf & core layout', () => {
  it('largura util da pagina deve acomodar as colunas da tabela de itens', () => {
    const contentWidth = PAGE_WIDTH - MARGIN * 2; // 515.28
    const tableHeaders = [
      { label: 'ITEM / DESCRIÇÃO', width: 200, align: 'left' as const },
      { label: 'RI', width: 45, align: 'center' as const },
      { label: 'MARCA', width: 65, align: 'left' as const },
      { label: 'QTD / UND', width: 65, align: 'center' as const },
      { label: 'UNIT.', width: 70, align: 'right' as const },
      { label: 'TOTAL', width: 70, align: 'right' as const },
    ];
    const totalHeadersWidth = tableHeaders.reduce((acc, h) => acc + h.width, 0);

    expect(totalHeadersWidth).toBe(515);
    expect(totalHeadersWidth).toBeLessThanOrEqual(contentWidth);
  });

  it('PdfTextWriter renderiza header com titulo longo, infoGrid com fullWidth e tabela sem erros', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const writer = new PdfTextWriter(doc, font, fontBold, null);

    // Titulo longo que ultrapassaria margem no layout antigo
    writer.drawDocumentHeader({
      title: 'Pedido de Compra — CONFEROL-COMERCIAL DE FERRAMENTAS E PRODUTOS INDUSTRIAIS LTDA',
      formCode: 'FRM.SUP-0007 (Rev. 00)',
      protocol: 'COT-100926-02',
    });

    // InfoGrid com fornecedor fullWidth
    writer.drawInfoGrid([
      { label: 'Fornecedor', value: 'CONFEROL-COMERCIAL DE FERRAMENTAS E PRODUTOS INDUSTRIAIS LTDA', fullWidth: true },
      { label: 'CNPJ', value: '02.435.456/0001-00' },
      { label: 'Cidade/UF', value: 'Salvador/BA' },
      { label: 'Telefone', value: '71 3172-9000' },
    ], 3);

    // Tabela com colunas
    const tableHeaders = [
      { label: 'ITEM / DESCRIÇÃO', width: 200, align: 'left' as const },
      { label: 'RI', width: 45, align: 'center' as const },
      { label: 'MARCA', width: 65, align: 'left' as const },
      { label: 'QTD / UND', width: 65, align: 'center' as const },
      { label: 'UNIT.', width: 70, align: 'right' as const },
      { label: 'TOTAL', width: 70, align: 'right' as const },
    ];

    const rows = [
      ['MACHO AR/M 8X1.25MM HTOM [fora do escopo da RM]', '-', 'HTOM', '2 JG', 'R$ 150,00', 'R$ 300,00'],
    ];

    writer.drawTable(tableHeaders, rows);

    writer.drawCallout(
      'Totais',
      'Subtotal dos itens: R$ 300,00   |   Total do pedido: R$ 300,00'
    );

    const pdfBytes = await doc.save();
    expect(pdfBytes.byteLength).toBeGreaterThan(1000);
  });
});
