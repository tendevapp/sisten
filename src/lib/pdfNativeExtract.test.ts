/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { extrairTextoPdfNativo, converterPdfNativoParaMarkdown } from './pdfNativeExtract';

describe('Extração Nativa de PDF', () => {
  it('deve extrair texto de um PDF digital com cabeçalho, CNPJ e itens tabulares', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);

    page.drawText('PROPOSTA COMERCIAL - FORNECEDOR INDUSTRIAL', { x: 50, y: 360, size: 14 });
    page.drawText('CNPJ: 12.345.678/0001-90', { x: 50, y: 330, size: 10 });
    page.drawText('Data: 10/09/2026', { x: 400, y: 330, size: 10 });

    page.drawText('Item', { x: 50, y: 290, size: 10 });
    page.drawText('Descricao', { x: 100, y: 290, size: 10 });
    page.drawText('Qtd', { x: 350, y: 290, size: 10 });
    page.drawText('Preco Unit', { x: 420, y: 290, size: 10 });

    page.drawText('1', { x: 50, y: 260, size: 10 });
    page.drawText('Tubo de Aco Carbono 4 pol', { x: 100, y: 260, size: 10 });
    page.drawText('20', { x: 350, y: 260, size: 10 });
    page.drawText('R$ 85,00', { x: 420, y: 260, size: 10 });

    const pdfBytes = await pdfDoc.save();
    const resultado = await extrairTextoPdfNativo(pdfBytes);

    expect(resultado).not.toBeNull();
    expect(resultado!.paginas).toBe(1);
    expect(resultado!.markdown).toContain('PROPOSTA COMERCIAL');
    expect(resultado!.markdown).toContain('12.345.678/0001-90');
    expect(resultado!.markdown).toContain('Tubo de Aco Carbono 4 pol');
    expect(resultado!.markdown).toContain('R$ 85,00');
  });

  it('deve separar páginas quando o PDF tiver múltiplas páginas', async () => {
    const pdfDoc = await PDFDocument.create();
    const page1 = pdfDoc.addPage([600, 400]);
    page1.drawText('Conteudo da Primeira Pagina da Proposta Comercial de Teste', { x: 50, y: 350, size: 12 });

    const page2 = pdfDoc.addPage([600, 400]);
    page2.drawText('Condicoes Comerciais e Pagamento na Segunda Pagina do PDF', { x: 50, y: 350, size: 12 });

    const pdfBytes = await pdfDoc.save();
    const resultado = await extrairTextoPdfNativo(pdfBytes);

    expect(resultado).not.toBeNull();
    expect(resultado!.paginas).toBe(2);
    expect(resultado!.markdown).toContain('## Página 1');
    expect(resultado!.markdown).toContain('## Página 2');
    expect(resultado!.markdown).toContain('Primeira Pagina');
    expect(resultado!.markdown).toContain('Segunda Pagina');
  });

  it('deve retornar null para PDF sem texto suficiente (simulando documento escaneado/imagem)', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    // Apenas 5 caracteres
    page.drawText('Scan', { x: 50, y: 350, size: 10 });

    const pdfBytes = await pdfDoc.save();
    const resultado = await extrairTextoPdfNativo(pdfBytes, 50);

    // Deve retornar null para disparar fallback para IA OCR
    expect(resultado).toBeNull();
  });

  it('converterPdfNativoParaMarkdown deve retornar custo zero e modelo nativo', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    page.drawText('Orcamento Tecnico de Fornecedor com mais de cinquenta caracteres para teste de extracao nativa sem IA', {
      x: 50, y: 350, size: 10,
    });

    const pdfBytes = await pdfDoc.save();
    const fakeFile = new File([pdfBytes], 'proposta_sap.pdf', { type: 'application/pdf' });

    const resultado = await converterPdfNativoParaMarkdown(fakeFile);
    expect(resultado).not.toBeNull();
    expect(resultado!.custoBrl).toBe(0);
    expect(resultado!.custoUsd).toBe(0);
    expect(resultado!.modelo).toContain('Nativo');
    expect(resultado!.caracteres).toBeGreaterThan(50);
  });
});
