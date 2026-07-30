/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage } from 'pdf-lib';
import { localDb } from '../../db/localDb';
import { RequestAttachment } from '../../types';

export const PAGE_WIDTH = 595.28; // A4 portrait, pt
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 48;

const LOGO_SIZE = 32; // pt, desenhado no canto superior direito da 1ª página

// Buscado uma vez por sessão e reaproveitado entre exportações — é o mesmo
// arquivo estático em public/logo.png. `undefined` = ainda não tentou buscar;
// `null` = tentou e falhou (não trava a exportação por causa da logo).
let cachedLogoBytes: ArrayBuffer | null | undefined;

async function getLogoBytes(): Promise<ArrayBuffer | null> {
  if (cachedLogoBytes !== undefined) return cachedLogoBytes;
  try {
    const response = await fetch('/logo.png');
    if (!response.ok) throw new Error(`Falha ao buscar logo (${response.status})`);
    cachedLogoBytes = await response.arrayBuffer();
  } catch (e) {
    console.error('Falha ao carregar logo do Sisten para o PDF:', e);
    cachedLogoBytes = null;
  }
  return cachedLogoBytes;
}

function sanitizeText(text: string): string {
  // WinAnsi (fonte padrão do pdf-lib) não cobre todo Unicode — troca caracteres
  // fora do intervalo básico (emojis etc.) por "?" em vez de deixar o pdf-lib
  // lançar erro de encoding no meio da exportação.
  return text.replace(/[^\x00-\xFF]/g, '?');
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ');
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

/** Escreve texto em páginas A4, quebrando linha e criando páginas novas conforme necessário. */
export class PdfTextWriter {
  private page: PDFPage;
  private y: number;
  private readonly contentWidth: number;

  constructor(private doc: PDFDocument, private font: PDFFont, private fontBold: PDFFont, private logo: PDFImage | null = null) {
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
    this.contentWidth = PAGE_WIDTH - MARGIN * 2;

    if (this.logo) {
      this.page.drawImage(this.logo, {
        x: PAGE_WIDTH - MARGIN - LOGO_SIZE,
        y: PAGE_HEIGHT - MARGIN - LOGO_SIZE + 8,
        width: LOGO_SIZE,
        height: LOGO_SIZE
      });
    }
  }

  private ensureSpace(needed: number) {
    if (this.y - needed < MARGIN) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  drawTitle(text: string) {
    this.ensureSpace(24);
    this.page.drawText(sanitizeText(text), { x: MARGIN, y: this.y, size: 18, font: this.fontBold, color: rgb(0.1, 0.1, 0.1) });
    this.y -= 28;
  }

  drawSubtitle(text: string) {
    this.ensureSpace(18);
    this.page.drawText(sanitizeText(text), { x: MARGIN, y: this.y, size: 12, font: this.fontBold, color: rgb(0.15, 0.15, 0.15) });
    this.y -= 20;
  }

  drawField(label: string, value: string) {
    this.ensureSpace(14);
    this.page.drawText(sanitizeText(label.toUpperCase()), { x: MARGIN, y: this.y, size: 8, font: this.fontBold, color: rgb(0.45, 0.45, 0.45) });
    this.y -= 12;
    const lines = wrapText(sanitizeText(value || '-'), this.font, 10, this.contentWidth);
    for (const line of lines) {
      this.ensureSpace(14);
      this.page.drawText(line, { x: MARGIN, y: this.y, size: 10, font: this.font, color: rgb(0.1, 0.1, 0.1) });
      this.y -= 14;
    }
    this.y -= 8;
  }

  /** Linha de tabela simples: rótulos separados por " · ", tamanho fixo por coluna não é necessário aqui. */
  drawTableRow(text: string) {
    this.ensureSpace(14);
    const lines = wrapText(sanitizeText(text), this.font, 9, this.contentWidth);
    for (const line of lines) {
      this.ensureSpace(14);
      this.page.drawText(line, { x: MARGIN, y: this.y, size: 9, font: this.font, color: rgb(0.15, 0.15, 0.15) });
      this.y -= 12;
    }
    this.y -= 4;
  }

  spacer(height: number) {
    this.y -= height;
  }
}

export async function createDoc(): Promise<{ doc: PDFDocument; font: PDFFont; fontBold: PDFFont; logo: PDFImage | null }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = await getLogoBytes();
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null;

  return { doc, font, fontBold, logo };
}

/**
 * pdf-lib só embute JPEG e PNG nativamente — sem suporte a WebP (formato em
 * que os anexos são salvos após a recompressão no upload, ver
 * imageCompression.ts). Para qualquer formato que não seja JPEG puro,
 * redecodifica via canvas (o navegador sabe abrir WebP/PNG/etc.) e reexporta
 * como PNG antes de embutir, em vez de assumir "não é PNG, então é JPEG".
 */
async function toEmbeddablePng(bytes: ArrayBuffer, mimeType: string | undefined): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType || 'image/jpeg' }));
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível para converter imagem.');
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Falha ao reexportar imagem como PNG.');
    return await blob.arrayBuffer();
  } finally {
    bitmap.close();
  }
}

async function embedImageAttachment(doc: PDFDocument, bytes: ArrayBuffer, mimeType: string | undefined): Promise<void> {
  const image = mimeType === 'image/jpeg' || mimeType === 'image/jpg'
    ? await doc.embedJpg(bytes)
    : await doc.embedPng(await toEmbeddablePng(bytes, mimeType));

  const scale = Math.min(1, (PAGE_WIDTH - MARGIN * 2) / image.width, (PAGE_HEIGHT - MARGIN * 2) / image.height);
  const w = image.width * scale;
  const h = image.height * scale;

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawImage(image, {
    x: (PAGE_WIDTH - w) / 2,
    y: (PAGE_HEIGHT - h) / 2,
    width: w,
    height: h
  });
}

async function mergePdfAttachment(doc: PDFDocument, bytes: ArrayBuffer): Promise<void> {
  const attachmentDoc = await PDFDocument.load(bytes);
  const pages = await doc.copyPages(attachmentDoc, attachmentDoc.getPageIndices());
  pages.forEach(p => doc.addPage(p));
}

/**
 * Embute cada anexo no documento (imagem vira página, PDF tem as páginas
 * mescladas). Anexos que falharem (rede, formato inesperado) são pulados —
 * o nome de cada um é devolvido para o chamador avisar o usuário, sem
 * abortar a exportação inteira.
 */
export async function embedAttachments(doc: PDFDocument, attachments: RequestAttachment[]): Promise<string[]> {
  const failed: string[] = [];
  for (const attachment of attachments) {
    try {
      const path = attachment.storage_path || attachment.url;
      const signedUrl = await localDb.getAttachmentUrl(path);
      if (!signedUrl) throw new Error('URL do anexo indisponível');

      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error(`Falha ao baixar anexo (${response.status})`);
      const bytes = await response.arrayBuffer();

      if (attachment.mime_type === 'application/pdf') {
        await mergePdfAttachment(doc, bytes);
      } else {
        await embedImageAttachment(doc, bytes, attachment.mime_type);
      }
    } catch (e) {
      console.error(`Falha ao incluir anexo "${attachment.name}" no PDF:`, e);
      failed.push(attachment.name);
    }
  }
  return failed;
}

export async function downloadPdf(doc: PDFDocument, filename: string): Promise<void> {
  const pdfBytes = await doc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
