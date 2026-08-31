/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Core PDF Export Utilities & Design System para o SISTEN.
 * Fornece componentes de layout estruturados, cabeçalhos executivos,
 * grid de metadados, cartões de ocorrência, tabelas, páginas de anexos
 * fotográficos com referência ao preenchimento, e rodapés oficiais.
 */

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage, RGB } from 'pdf-lib';
import { localDb } from '../../db/localDb';
import { RequestAttachment } from '../../types';

export const PAGE_WIDTH = 595.28; // A4 portrait, pt
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 40;

const LOGO_HEIGHT = 44; // pt — proporção real do PNG

// Paleta de Cores Corporativa TEN
export const PDF_COLORS = {
  primaryNavy: rgb(0.06, 0.16, 0.32),    // #0f2952 - Azul TEN Primário
  accentBlue: rgb(0.01, 0.52, 0.78),     // #0384c7 - Azul TEN Destaque
  accentPurple: rgb(0.38, 0.20, 0.65),   // #6133a6 - Roxo Sistema
  darkText: rgb(0.09, 0.12, 0.17),       // #171f2c - Texto Principal
  bodyText: rgb(0.20, 0.24, 0.30),       // #333d4d - Texto Secundário
  mutedLabel: rgb(0.45, 0.50, 0.58),     // #738094 - Rótulos Muted
  cardBg: rgb(0.97, 0.98, 0.99),         // #f8fafc - Fundo de Cartões
  cardBorder: rgb(0.88, 0.90, 0.94),     // #e2e8f0 - Borda Sutil
  tableHeaderBg: rgb(0.08, 0.18, 0.35),  // #142e59 - Fundo Header Tabela
  tableRowAlt: rgb(0.96, 0.97, 0.99),    // #f4f6fa - Linha Alternada Tabela
  borderLight: rgb(0.90, 0.92, 0.95),    // #e6ebf2 - Divisores
  // Badges
  badgeGreenBg: rgb(0.88, 0.96, 0.91),
  badgeGreenText: rgb(0.09, 0.48, 0.26),
  badgeAmberBg: rgb(0.99, 0.95, 0.83),
  badgeAmberText: rgb(0.58, 0.38, 0.05),
  badgeRedBg: rgb(0.99, 0.89, 0.89),
  badgeRedText: rgb(0.68, 0.12, 0.12),
  badgeBlueBg: rgb(0.90, 0.94, 0.99),
  badgeBlueText: rgb(0.10, 0.35, 0.65),
  badgePurpleBg: rgb(0.94, 0.91, 0.99),
  badgePurpleText: rgb(0.38, 0.20, 0.65),
};

const logoCache = new Map<string, ArrayBuffer | null>();

async function getLogoBytes(logoPath = '/logo-adm.png'): Promise<ArrayBuffer | null> {
  if (logoCache.has(logoPath)) return logoCache.get(logoPath)!;
  try {
    const response = await fetch(logoPath);
    if (!response.ok) throw new Error(`Falha ao buscar logo (${response.status})`);
    const bytes = await response.arrayBuffer();
    logoCache.set(logoPath, bytes);
    return bytes;
  } catch (e) {
    console.error(`Falha ao carregar logo (${logoPath}) para o PDF:`, e);
    logoCache.set(logoPath, null);
    return null;
  }
}

export function sanitizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•·]/g, '-')
    .replace(/[^\x00-\xFF]/g, '?');
}

export function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  if (!text) return [''];
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

export interface HeaderOptions {
  title: string;
  formCode: string;
  protocol?: string;
  emissionDate?: string;
  statusBadge?: string;
  statusColor?: 'green' | 'amber' | 'blue' | 'purple' | 'red';
}

export interface GridField {
  label: string;
  value: string;
  fullWidth?: boolean;
  highlight?: boolean;
  statusBadge?: string;
  statusColor?: 'green' | 'amber' | 'blue' | 'purple' | 'red';
}

export interface PhotoAttachmentItem {
  title: string;
  reference: string;
  source: string; // base64 dataUrl or storage URL
  description?: string;
  timestamp?: string;
}

/** Gerenciador de renderização com grid visual, cartões e design corporativo */
export class PdfTextWriter {
  private page: PDFPage;
  private y: number;
  private readonly contentWidth: number;
  private currentFormCode?: string;

  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private fontBold: PDFFont,
    private logo: PDFImage | null = null
  ) {
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
    this.contentWidth = PAGE_WIDTH - MARGIN * 2;
  }

  getPage(): PDFPage {
    return this.page;
  }

  getY(): number {
    return this.y;
  }

  setY(newY: number) {
    this.y = newY;
  }

  getDoc(): PDFDocument {
    return this.doc;
  }

  getFont(): PDFFont {
    return this.font;
  }

  getFontBold(): PDFFont {
    return this.fontBold;
  }

  getContentWidth(): number {
    return this.contentWidth;
  }

  ensureSpace(needed: number) {
    if (this.y - needed < MARGIN + 28) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  spacer(height: number) {
    this.y -= height;
  }

  /** Desenha Cabeçalho Executivo Completo com Logo TEN e Caixa de Protocolo */
  drawDocumentHeader(opts: HeaderOptions) {
    this.currentFormCode = opts.formCode;
    const startY = this.y;

    // 1. Logo à Esquerda
    if (this.logo) {
      const logoWidth = (this.logo.width / this.logo.height) * LOGO_HEIGHT;
      this.page.drawImage(this.logo, {
        x: MARGIN,
        y: startY - LOGO_HEIGHT + 6,
        width: logoWidth,
        height: LOGO_HEIGHT,
      });
    }

    // 2. Caixa de Identificação e Protocolo à Direita
    const rightBoxWidth = 175;
    const rightBoxX = PAGE_WIDTH - MARGIN - rightBoxWidth;
    const rightBoxY = startY - 48;
    const rightBoxHeight = 52;

    this.page.drawRectangle({
      x: rightBoxX,
      y: rightBoxY,
      width: rightBoxWidth,
      height: rightBoxHeight,
      color: PDF_COLORS.cardBg,
      borderColor: PDF_COLORS.cardBorder,
      borderWidth: 1,
    });

    // Badge do Código do Formulário
    const formBadgeText = sanitizeText(opts.formCode);
    const formBadgeWidth = this.fontBold.widthOfTextAtSize(formBadgeText, 7.5) + 12;
    this.page.drawRectangle({
      x: rightBoxX + rightBoxWidth - formBadgeWidth - 6,
      y: rightBoxY + rightBoxHeight - 16,
      width: formBadgeWidth,
      height: 12,
      color: PDF_COLORS.primaryNavy,
    });
    this.page.drawText(formBadgeText, {
      x: rightBoxX + rightBoxWidth - formBadgeWidth,
      y: rightBoxY + rightBoxHeight - 12.5,
      size: 7.5,
      font: this.fontBold,
      color: rgb(1, 1, 1),
    });

    // Protocolo
    if (opts.protocol) {
      this.page.drawText('PROTOCOLO', {
        x: rightBoxX + 8,
        y: rightBoxY + rightBoxHeight - 14,
        size: 6.5,
        font: this.fontBold,
        color: PDF_COLORS.mutedLabel,
      });
      this.page.drawText(sanitizeText(opts.protocol), {
        x: rightBoxX + 8,
        y: rightBoxY + rightBoxHeight - 24,
        size: 9.5,
        font: this.fontBold,
        color: PDF_COLORS.primaryNavy,
      });
    }

    // Data de Emissão / Status
    const emissao = opts.emissionDate || new Date().toLocaleDateString('pt-BR');
    this.page.drawText(`EMISSÃO: ${sanitizeText(emissao)}`, {
      x: rightBoxX + 8,
      y: rightBoxY + 8,
      size: 7,
      font: this.font,
      color: PDF_COLORS.bodyText,
    });

    this.y = startY - 56;

    // 3. Título Principal do Documento
    this.page.drawText(sanitizeText(opts.title), {
      x: MARGIN,
      y: this.y,
      size: 16,
      font: this.fontBold,
      color: PDF_COLORS.primaryNavy,
    });
    this.y -= 8;

    // 4. Linha Divisória com Destaque
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y,
      width: this.contentWidth,
      height: 2.5,
      color: PDF_COLORS.accentBlue,
    });
    this.y -= 14;
  }

  /** Desenha Grid Estruturado de Informações (2 ou 3 colunas) */
  drawInfoGrid(fields: GridField[], columns: 2 | 3 = 2) {
    if (fields.length === 0) return;

    // Calcula altura necessária
    const colWidth = this.contentWidth / columns;
    const rowHeight = 32;
    const numRows = Math.ceil(fields.length / columns);
    const boxHeight = numRows * rowHeight + 10;

    this.ensureSpace(boxHeight + 10);

    const boxY = this.y - boxHeight;

    // Fundo do Card de Informações
    this.page.drawRectangle({
      x: MARGIN,
      y: boxY,
      width: this.contentWidth,
      height: boxHeight,
      color: PDF_COLORS.cardBg,
      borderColor: PDF_COLORS.cardBorder,
      borderWidth: 1,
    });

    // Renderiza cada campo no grid
    fields.forEach((field, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const cellX = MARGIN + col * colWidth + 10;
      const cellY = this.y - 12 - row * rowHeight;

      // Label
      this.page.drawText(sanitizeText(field.label.toUpperCase()), {
        x: cellX,
        y: cellY,
        size: 7,
        font: this.fontBold,
        color: PDF_COLORS.mutedLabel,
      });

      // Valor ou Badge de Status
      const valor = sanitizeText(field.value || '-');
      if (field.statusBadge) {
        const badgeColors = this.getBadgeColors(field.statusColor || 'blue');
        const badgeText = sanitizeText(field.statusBadge);
        const badgeWidth = this.fontBold.widthOfTextAtSize(badgeText, 8) + 12;

        this.page.drawRectangle({
          x: cellX,
          y: cellY - 14,
          width: badgeWidth,
          height: 13,
          color: badgeColors.bg,
        });
        this.page.drawText(badgeText, {
          x: cellX + 6,
          y: cellY - 10,
          size: 8,
          font: this.fontBold,
          color: badgeColors.fg,
        });
      } else {
        const maxTextWidth = colWidth - 18;
        const lines = wrapText(valor, this.fontBold, 9, maxTextWidth);
        const displayLine = lines[0] || valor;
        this.page.drawText(displayLine, {
          x: cellX,
          y: cellY - 12,
          size: 9,
          font: this.fontBold,
          color: PDF_COLORS.darkText,
        });
      }
    });

    this.y = boxY - 12;
  }

  /** Desenha Título de Seção com Barra Indicadora */
  drawSectionHeader(title: string, count?: number | string) {
    this.ensureSpace(24);

    const barHeight = 13;
    const barY = this.y - barHeight + 2;

    // Barra indicadora azul à esquerda
    this.page.drawRectangle({
      x: MARGIN,
      y: barY,
      width: 3.5,
      height: barHeight,
      color: PDF_COLORS.accentBlue,
    });

    // Texto da Seção
    const titleText = sanitizeText(title);
    this.page.drawText(titleText, {
      x: MARGIN + 8,
      y: this.y - 10,
      size: 11,
      font: this.fontBold,
      color: PDF_COLORS.primaryNavy,
    });

    // Contador se houver
    if (count !== undefined && count !== null) {
      const countStr = String(count);
      const textWidth = this.fontBold.widthOfTextAtSize(titleText, 11);
      const badgeX = MARGIN + 12 + textWidth;
      const badgeWidth = this.fontBold.widthOfTextAtSize(countStr, 8) + 10;

      this.page.drawRectangle({
        x: badgeX,
        y: this.y - 12,
        width: badgeWidth,
        height: 12,
        color: PDF_COLORS.badgeBlueBg,
      });
      this.page.drawText(countStr, {
        x: badgeX + 5,
        y: this.y - 9,
        size: 8,
        font: this.fontBold,
        color: PDF_COLORS.badgeBlueText,
      });
    }

    this.y -= 18;
  }

  /** Desenha Cartão Formatado para Ocorrência / Evento do Plantão */
  drawOccurrenceCard(opts: {
    index: number;
    time: string;
    sector: string;
    severity?: string;
    vigilante?: string;
    description: string;
  }) {
    const descLines = wrapText(sanitizeText(opts.description), this.font, 8.5, this.contentWidth - 20);
    const cardHeight = 26 + descLines.length * 11 + 6;

    this.ensureSpace(cardHeight + 6);

    const cardY = this.y - cardHeight;

    // Background do Cartão
    this.page.drawRectangle({
      x: MARGIN,
      y: cardY,
      width: this.contentWidth,
      height: cardHeight,
      color: rgb(1, 1, 1),
      borderColor: PDF_COLORS.cardBorder,
      borderWidth: 0.8,
    });

    // Barra de Cabeçalho do Cartão
    this.page.drawRectangle({
      x: MARGIN,
      y: cardY + cardHeight - 18,
      width: this.contentWidth,
      height: 18,
      color: PDF_COLORS.cardBg,
    });

    // Tag de Horário
    const timeText = sanitizeText(`[${opts.time}]`);
    this.page.drawText(timeText, {
      x: MARGIN + 8,
      y: cardY + cardHeight - 12.5,
      size: 8,
      font: this.fontBold,
      color: PDF_COLORS.primaryNavy,
    });

    // Tag de Setor
    const sectorText = sanitizeText(`[${opts.sector}]`);
    this.page.drawText(sectorText, {
      x: MARGIN + 48,
      y: cardY + cardHeight - 12.5,
      size: 8,
      font: this.fontBold,
      color: PDF_COLORS.accentBlue,
    });

    // Vigilante
    if (opts.vigilante) {
      const vigText = sanitizeText(`Vigilante: ${opts.vigilante}`);
      this.page.drawText(vigText, {
        x: MARGIN + 160,
        y: cardY + cardHeight - 12.5,
        size: 7.5,
        font: this.font,
        color: PDF_COLORS.mutedLabel,
      });
    }

    // Severidade Badge à Direita
    if (opts.severity) {
      const isAlerta = opts.severity === 'ALERTA' || opts.severity === 'GRAVE';
      const sevColors = isAlerta ? PDF_COLORS.badgeAmberText : PDF_COLORS.badgeBlueText;
      const sevBg = isAlerta ? PDF_COLORS.badgeAmberBg : PDF_COLORS.badgeBlueBg;
      const sevText = sanitizeText(opts.severity);
      const sevWidth = this.fontBold.widthOfTextAtSize(sevText, 7) + 8;

      this.page.drawRectangle({
        x: MARGIN + this.contentWidth - sevWidth - 8,
        y: cardY + cardHeight - 14,
        width: sevWidth,
        height: 10,
        color: sevBg,
      });
      this.page.drawText(sevText, {
        x: MARGIN + this.contentWidth - sevWidth - 4,
        y: cardY + cardHeight - 11.5,
        size: 7,
        font: this.fontBold,
        color: sevColors,
      });
    }

    // Linhas de Descrição
    descLines.forEach((line, i) => {
      this.page.drawText(line, {
        x: MARGIN + 10,
        y: cardY + cardHeight - 28 - i * 11,
        size: 8.5,
        font: this.font,
        color: PDF_COLORS.darkText,
      });
    });

    this.y = cardY - 6;
  }

  /** Desenha Tabela de Dados Formatada com Cabeçalho e Linhas Alternadas */
  drawTable(headers: { label: string; width: number; align?: 'left' | 'center' | 'right' }[], rows: string[][]) {
    if (rows.length === 0) return;

    const rowHeight = 16;
    const headerHeight = 18;

    this.ensureSpace(headerHeight + rowHeight * 2);

    // Cabeçalho da Tabela
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - headerHeight,
      width: this.contentWidth,
      height: headerHeight,
      color: PDF_COLORS.tableHeaderBg,
    });

    let currentX = MARGIN;
    headers.forEach((h) => {
      const hText = sanitizeText(h.label);
      let textX = currentX + 6;
      if (h.align === 'center') {
        textX = currentX + (h.width - this.fontBold.widthOfTextAtSize(hText, 7.5)) / 2;
      } else if (h.align === 'right') {
        textX = currentX + h.width - this.fontBold.widthOfTextAtSize(hText, 7.5) - 6;
      }

      this.page.drawText(hText, {
        x: textX,
        y: this.y - 12,
        size: 7.5,
        font: this.fontBold,
        color: rgb(1, 1, 1),
      });
      currentX += h.width;
    });

    this.y -= headerHeight;

    // Linhas da Tabela
    rows.forEach((row, rowIndex) => {
      this.ensureSpace(rowHeight);

      const isAlt = rowIndex % 2 === 1;
      const rowY = this.y - rowHeight;

      if (isAlt) {
        this.page.drawRectangle({
          x: MARGIN,
          y: rowY,
          width: this.contentWidth,
          height: rowHeight,
          color: PDF_COLORS.tableRowAlt,
        });
      }

      // Linha separadora inferior
      this.page.drawLine({
        start: { x: MARGIN, y: rowY },
        end: { x: MARGIN + this.contentWidth, y: rowY },
        thickness: 0.5,
        color: PDF_COLORS.borderLight,
      });

      let cellX = MARGIN;
      headers.forEach((h, colIndex) => {
        const cellText = sanitizeText(row[colIndex] || '-');
        const textWidth = this.font.widthOfTextAtSize(cellText, 8);
        let textPosX = cellX + 6;

        if (h.align === 'center') {
          textPosX = cellX + (h.width - textWidth) / 2;
        } else if (h.align === 'right') {
          textPosX = cellX + h.width - textWidth - 6;
        }

        this.page.drawText(cellText, {
          x: textPosX,
          y: rowY + 4.5,
          size: 8,
          font: this.font,
          color: PDF_COLORS.darkText,
        });

        cellX += h.width;
      });

      this.y = rowY;
    });

    this.y -= 10;
  }

  /** Força início de uma nova página A4 */
  addNewPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  /** Desenha Tabela de Lista de Presença com Assinaturas Digitais Renderizadas */
  async drawAttendanceTableWithSignatures(
    participantes: {
      nome: string;
      cpf: string;
      empresa: string;
      funcao?: string;
      validade_dias?: number;
      assinatura_digital?: string | null;
    }[]
  ) {
    if (participantes.length === 0) return;

    const headerHeight = 18;
    const rowHeight = 32; // Espaço para a assinatura digital

    this.ensureSpace(headerHeight + rowHeight);

    // Cabeçalho
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - headerHeight,
      width: this.contentWidth,
      height: headerHeight,
      color: PDF_COLORS.tableHeaderBg,
    });

    const cols = [
      { label: 'NOME DO PARTICIPANTE / CPF', width: 165, align: 'left' as const },
      { label: 'EMPRESA', width: 105, align: 'left' as const },
      { label: 'FUNÇÃO / CARGO', width: 85, align: 'left' as const },
      { label: 'VALIDADE', width: 50, align: 'center' as const },
      { label: 'ASSINATURA DIGITAL', width: 110, align: 'center' as const },
    ];

    let curX = MARGIN;
    cols.forEach((c) => {
      const txt = sanitizeText(c.label);
      const w = this.fontBold.widthOfTextAtSize(txt, 7);
      let tx = curX + 6;
      if (c.align === 'center') tx = curX + (c.width - w) / 2;
      this.page.drawText(txt, {
        x: tx,
        y: this.y - 12,
        size: 7,
        font: this.fontBold,
        color: rgb(1, 1, 1),
      });
      curX += c.width;
    });

    this.y -= headerHeight;

    // Linhas
    for (let idx = 0; idx < participantes.length; idx++) {
      const p = participantes[idx];
      this.ensureSpace(rowHeight);

      const rowY = this.y - rowHeight;
      const isAlt = idx % 2 === 1;

      if (isAlt) {
        this.page.drawRectangle({
          x: MARGIN,
          y: rowY,
          width: this.contentWidth,
          height: rowHeight,
          color: PDF_COLORS.tableRowAlt,
        });
      }

      // Divisor inferior
      this.page.drawLine({
        start: { x: MARGIN, y: rowY },
        end: { x: MARGIN + this.contentWidth, y: rowY },
        thickness: 0.5,
        color: PDF_COLORS.borderLight,
      });

      // Nome / CPF
      this.page.drawText(sanitizeText(p.nome), {
        x: MARGIN + 6,
        y: rowY + 18,
        size: 8,
        font: this.fontBold,
        color: PDF_COLORS.darkText,
      });
      this.page.drawText(sanitizeText(`CPF: ${p.cpf}`), {
        x: MARGIN + 6,
        y: rowY + 8,
        size: 7,
        font: this.font,
        color: PDF_COLORS.mutedLabel,
      });

      // Empresa
      this.page.drawText(sanitizeText(p.empresa), {
        x: MARGIN + 165 + 6,
        y: rowY + 13,
        size: 7.5,
        font: this.font,
        color: PDF_COLORS.darkText,
      });

      // Função
      this.page.drawText(sanitizeText(p.funcao || 'VISITANTE'), {
        x: MARGIN + 270 + 6,
        y: rowY + 13,
        size: 7.5,
        font: this.font,
        color: PDF_COLORS.darkText,
      });

      // Validade
      this.page.drawText(sanitizeText(`${p.validade_dias || 90}d`), {
        x: MARGIN + 355 + 14,
        y: rowY + 13,
        size: 7.5,
        font: this.font,
        color: PDF_COLORS.darkText,
      });

      // Assinatura Digital
      const sigCellX = MARGIN + 405;
      const sigCellWidth = 110;

      if (p.assinatura_digital) {
        try {
          const sigImg = await this.embedPhoto(p.assinatura_digital);
          if (sigImg) {
            const maxSigW = 95;
            const maxSigH = 24;
            const scale = Math.min(1, maxSigW / sigImg.width, maxSigH / sigImg.height);
            const sw = sigImg.width * scale;
            const sh = sigImg.height * scale;
            const sx = sigCellX + (sigCellWidth - sw) / 2;
            const sy = rowY + (rowHeight - sh) / 2;

            this.page.drawImage(sigImg, {
              x: sx,
              y: sy,
              width: sw,
              height: sh,
            });
          }
        } catch {
          this.page.drawText('[ASSINADA]', {
            x: sigCellX + 25,
            y: rowY + 12,
            size: 7.5,
            font: this.fontBold,
            color: PDF_COLORS.badgeGreenText,
          });
        }
      } else {
        this.page.drawText('(Pendente de Assinatura)', {
          x: sigCellX + 10,
          y: rowY + 12,
          size: 7,
          font: this.font,
          color: PDF_COLORS.mutedLabel,
        });
      }

      this.y = rowY;
    }

    this.y -= 10;
  }

  /** Desenha Caixa de Chamada / Texto de Observações ou Termo */
  drawCallout(title: string, text: string, italic: boolean = false) {
    const lines = wrapText(sanitizeText(text), italic ? this.font : this.font, 8.5, this.contentWidth - 24);
    const boxHeight = 18 + lines.length * 11 + 6;

    this.ensureSpace(boxHeight + 8);

    const boxY = this.y - boxHeight;

    // Fundo
    this.page.drawRectangle({
      x: MARGIN,
      y: boxY,
      width: this.contentWidth,
      height: boxHeight,
      color: PDF_COLORS.cardBg,
      borderColor: PDF_COLORS.cardBorder,
      borderWidth: 1,
    });

    // Barra azul lateral
    this.page.drawRectangle({
      x: MARGIN,
      y: boxY,
      width: 3,
      height: boxHeight,
      color: PDF_COLORS.accentBlue,
    });

    // Título
    this.page.drawText(sanitizeText(title.toUpperCase()), {
      x: MARGIN + 10,
      y: boxY + boxHeight - 12,
      size: 7.5,
      font: this.fontBold,
      color: PDF_COLORS.primaryNavy,
    });

    // Linhas
    lines.forEach((l, i) => {
      this.page.drawText(l, {
        x: MARGIN + 10,
        y: boxY + boxHeight - 24 - i * 11,
        size: 8.5,
        font: this.font,
        color: PDF_COLORS.bodyText,
      });
    });

    this.y = boxY - 10;
  }

  /**
   * Renderiza Páginas de Anexos Fotográficos com Referência ao Preenchimento
   */
  async drawPhotoAttachments(photos: PhotoAttachmentItem[]) {
    if (!photos || photos.length === 0) return;

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      // Adiciona uma nova página A4 para o anexo fotográfico
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.y = PAGE_HEIGHT - MARGIN;

      // Cabeçalho da Página de Anexo
      this.drawSectionHeader(`EVIDÊNCIA FOTOGRÁFICA / ANEXO #${i + 1} DE ${photos.length}`, photo.title);

      // Card de Referência ao Lançamento / Preenchimento
      const gridItems: GridField[] = [
        { label: 'Referência do Registro', value: photo.title },
        { label: 'Detalhamento / Local', value: photo.reference },
      ];
      if (photo.timestamp) {
        gridItems.push({ label: 'Data / Horário do Registro', value: photo.timestamp });
      }
      this.drawInfoGrid(gridItems, 2);

      if (photo.description) {
        this.drawCallout('Descrição / Apontamento da Ocorrência', photo.description);
      }

      this.spacer(8);

      // Carrega e embute a imagem
      try {
        const img = await this.embedPhoto(photo.source);
        if (img) {
          const availableWidth = this.contentWidth;
          const availableHeight = Math.max(160, this.y - MARGIN - 40);

          const scale = Math.min(
            1,
            availableWidth / img.width,
            availableHeight / img.height
          );
          const drawWidth = img.width * scale;
          const drawHeight = img.height * scale;

          const posX = MARGIN + (availableWidth - drawWidth) / 2;
          const posY = this.y - drawHeight - 10;

          // Moldura decorativa em volta da foto
          this.page.drawRectangle({
            x: posX - 4,
            y: posY - 4,
            width: drawWidth + 8,
            height: drawHeight + 8,
            color: PDF_COLORS.cardBg,
            borderColor: PDF_COLORS.cardBorder,
            borderWidth: 1,
          });

          // Desenha a imagem
          this.page.drawImage(img, {
            x: posX,
            y: posY,
            width: drawWidth,
            height: drawHeight,
          });

          this.y = posY - 20;
        }
      } catch (e) {
        console.error('Falha ao renderizar imagem do anexo:', e);
        this.drawCallout('Aviso de Anexo', 'Não foi possível carregar ou decodificar a imagem deste anexo.');
      }
    }
  }

  /** Converte fonte de imagem (base64 ou url) em PDFImage */
  async embedPhoto(source: string): Promise<PDFImage | null> {
    if (!source) return null;

    try {
      let bytes: ArrayBuffer;
      let mimeType = 'image/jpeg';

      if (source.startsWith('data:')) {
        const parts = source.split(',');
        const header = parts[0];
        const base64 = parts[1];
        const match = header.match(/:(.*?);/);
        if (match) mimeType = match[1];

        const binary = atob(base64);
        const len = binary.length;
        const u8 = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          u8[i] = binary.charCodeAt(i);
        }
        bytes = u8.buffer;
      } else {
        const signedUrl = await localDb.getAttachmentUrl(source).catch(() => source);
        const res = await fetch(signedUrl || source);
        if (!res.ok) return null;
        bytes = await res.arrayBuffer();
        mimeType = res.headers.get('content-type') || 'image/jpeg';
      }

      if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
        try {
          return await this.doc.embedJpg(bytes);
        } catch {
          const pngBytes = await toEmbeddablePng(bytes, mimeType);
          return await this.doc.embedPng(pngBytes);
        }
      } else if (mimeType === 'image/png') {
        return await this.doc.embedPng(bytes);
      } else {
        const pngBytes = await toEmbeddablePng(bytes, mimeType);
        return await this.doc.embedPng(pngBytes);
      }
    } catch (err) {
      console.error('Erro ao embutir imagem no PDF:', err);
      return null;
    }
  }

  /** Desenha Bloco com Linhas de Assinatura */
  drawSignatures(signers: { role: string; name?: string }[]) {
    if (signers.length === 0) return;

    this.ensureSpace(55);

    const count = signers.length;
    const colWidth = this.contentWidth / count;
    const lineY = this.y - 30;

    signers.forEach((s, idx) => {
      const startX = MARGIN + idx * colWidth + 16;
      const endX = MARGIN + (idx + 1) * colWidth - 16;
      const midX = (startX + endX) / 2;

      // Linha de assinatura
      this.page.drawLine({
        start: { x: startX, y: lineY },
        end: { x: endX, y: lineY },
        thickness: 0.8,
        color: PDF_COLORS.darkText,
      });

      // Nome
      if (s.name) {
        const nameText = sanitizeText(s.name);
        const nameWidth = this.fontBold.widthOfTextAtSize(nameText, 8);
        this.page.drawText(nameText, {
          x: midX - nameWidth / 2,
          y: lineY - 10,
          size: 8,
          font: this.fontBold,
          color: PDF_COLORS.darkText,
        });
      }

      // Cargo / Papel
      const roleText = sanitizeText(s.role.toUpperCase());
      const roleWidth = this.font.widthOfTextAtSize(roleText, 7);
      this.page.drawText(roleText, {
        x: midX - roleWidth / 2,
        y: lineY - 19,
        size: 7,
        font: this.font,
        color: PDF_COLORS.mutedLabel,
      });
    });

    this.y = lineY - 26;
  }

  /** Aplica Numeração de Página e Rodapé Oficial em Todas as Páginas */
  finalizeDoc(formCode?: string) {
    const pages = this.doc.getPages();
    const totalPages = pages.length;
    const code = sanitizeText(formCode || this.currentFormCode || 'SISTEN');

    pages.forEach((page, index) => {
      const pageNum = index + 1;

      // Linha divisória de rodapé
      page.drawLine({
        start: { x: MARGIN, y: 30 },
        end: { x: PAGE_WIDTH - MARGIN, y: 30 },
        thickness: 0.5,
        color: PDF_COLORS.borderLight,
      });

      // Texto à esquerda
      page.drawText(`SISTEN · Torres Eólicas do Nordeste (TEN) · ${code}`, {
        x: MARGIN,
        y: 20,
        size: 7,
        font: this.font,
        color: PDF_COLORS.mutedLabel,
      });

      // Numeração à direita
      const pageText = `Página ${pageNum} de ${totalPages}`;
      const textWidth = this.font.widthOfTextAtSize(pageText, 7);
      page.drawText(pageText, {
        x: PAGE_WIDTH - MARGIN - textWidth,
        y: 20,
        size: 7,
        font: this.fontBold,
        color: PDF_COLORS.mutedLabel,
      });
    });
  }

  // Compatibilidade com chamadas antigas
  drawTitle(text: string) {
    this.ensureSpace(24);
    this.page.drawText(sanitizeText(text), {
      x: MARGIN,
      y: this.y,
      size: 16,
      font: this.fontBold,
      color: PDF_COLORS.primaryNavy,
    });
    this.y -= 22;
  }

  drawSubtitle(text: string) {
    this.drawSectionHeader(text);
  }

  drawField(label: string, value: string) {
    this.drawInfoGrid([{ label, value }], 2);
  }

  drawTableRow(text: string) {
    this.ensureSpace(14);
    const lines = wrapText(sanitizeText(text), this.font, 8.5, this.contentWidth);
    for (const line of lines) {
      this.ensureSpace(12);
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y,
        size: 8.5,
        font: this.font,
        color: PDF_COLORS.bodyText,
      });
      this.y -= 12;
    }
    this.y -= 2;
  }

  private getBadgeColors(statusColor: string): { bg: RGB; fg: RGB } {
    switch (statusColor) {
      case 'green':
        return { bg: PDF_COLORS.badgeGreenBg, fg: PDF_COLORS.badgeGreenText };
      case 'amber':
        return { bg: PDF_COLORS.badgeAmberBg, fg: PDF_COLORS.badgeAmberText };
      case 'red':
        return { bg: PDF_COLORS.badgeRedBg, fg: PDF_COLORS.badgeRedText };
      case 'purple':
        return { bg: PDF_COLORS.badgePurpleBg, fg: PDF_COLORS.badgePurpleText };
      case 'blue':
      default:
        return { bg: PDF_COLORS.badgeBlueBg, fg: PDF_COLORS.badgeBlueText };
    }
  }
}

export async function createDoc(
  logoPath = '/logo-adm.png'
): Promise<{ doc: PDFDocument; font: PDFFont; fontBold: PDFFont; logo: PDFImage | null }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = await getLogoBytes(logoPath);
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null;

  return { doc, font, fontBold, logo };
}

async function toEmbeddablePng(bytes: ArrayBuffer, mimeType: string | undefined): Promise<ArrayBuffer> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType || 'image/jpeg' }));
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível para converter imagem.');
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Falha ao reexportar imagem como PNG.');
    return await blob.arrayBuffer();
  } finally {
    bitmap.close();
  }
}

async function embedImageAttachment(doc: PDFDocument, bytes: ArrayBuffer, mimeType: string | undefined): Promise<void> {
  const image =
    mimeType === 'image/jpeg' || mimeType === 'image/jpg'
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
    height: h,
  });
}

async function mergePdfAttachment(doc: PDFDocument, bytes: ArrayBuffer): Promise<void> {
  const attachmentDoc = await PDFDocument.load(bytes);
  const pages = await doc.copyPages(attachmentDoc, attachmentDoc.getPageIndices());
  pages.forEach((p) => doc.addPage(p));
}

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
