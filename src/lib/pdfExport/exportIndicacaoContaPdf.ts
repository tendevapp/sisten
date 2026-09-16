/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportação em PDF da carta de "Indicação de Conta para Pagamento" — modelo
 * padrão da Andrade Gutierrez, preenchido com os dados do fornecedor já
 * cadastrados na solicitação de Cadastro SAP. Dados bancários (banco, agência,
 * conta) não existem no cadastro do fornecedor — são informados na hora da
 * exportação, só para montar esta carta (não ficam salvos no chamado).
 */

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { Request } from '../../types';
import { PAGE_WIDTH, PAGE_HEIGHT, MARGIN, sanitizeText, downloadPdf } from './core';
import { parseNomeEspecificacoes } from './exportCadastroSapPdf';

export interface IndicacaoContaDados {
  cidade: string;
  banco: string;
  agencia: string;
  contaCorrente: string;
}

interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

const dataPorExtenso = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

function fontFor(fonts: Fonts, run: TextRun): PDFFont {
  if (run.bold && run.italic) return fonts.boldItalic;
  if (run.bold) return fonts.bold;
  if (run.italic) return fonts.italic;
  return fonts.regular;
}

/** Desenha um parágrafo com quebra de linha, misturando trechos normais/negrito/itálico. */
function drawParagraph(page: PDFPage, fonts: Fonts, runs: TextRun[], startY: number, opts: { size?: number; lineHeight?: number; maxWidth?: number; startX?: number } = {}): number {
  const size = opts.size ?? 10;
  const lineHeight = opts.lineHeight ?? 15;
  const startX = opts.startX ?? MARGIN;
  const maxWidth = opts.maxWidth ?? (PAGE_WIDTH - MARGIN * 2);

  type Token = { word: string; run: TextRun };
  const tokens: Token[] = [];
  runs.forEach((run) => {
    const words = sanitizeText(run.text).split(' ');
    words.forEach((word) => tokens.push({ word, run }));
  });

  let y = startY;
  let x = startX;
  let firstOnLine = true;

  tokens.forEach(({ word, run }) => {
    const font = fontFor(fonts, run);
    const spacer = firstOnLine ? '' : ' ';
    const piece = spacer + word;
    const pieceWidth = font.widthOfTextAtSize(piece, size);

    if (!firstOnLine && x + pieceWidth > startX + maxWidth) {
      y -= lineHeight;
      x = startX;
      firstOnLine = true;
    }

    const drawSpacer = firstOnLine ? '' : ' ';
    const drawText = drawSpacer + word;
    page.drawText(drawText, { x, y, size, font, color: rgb(0.09, 0.12, 0.17) });
    x += font.widthOfTextAtSize(drawText, size);
    firstOnLine = false;
  });

  return y - lineHeight;
}

export async function exportIndicacaoContaPdf(request: Request, dados: IndicacaoContaDados): Promise<void> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  };

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  let y = PAGE_HEIGHT - MARGIN;

  const { nome } = parseNomeEspecificacoes(request);
  const nomeUpper = sanitizeText(nome).toUpperCase();
  const cnpj = sanitizeText(request.brand || '-');

  // Data e cidade, alinhadas à direita
  const dataLinha = `${sanitizeText(dados.cidade).toUpperCase()}, ${dataPorExtenso.format(new Date())}`;
  const dataWidth = fonts.regular.widthOfTextAtSize(dataLinha, 10);
  page.drawText(dataLinha, { x: PAGE_WIDTH - MARGIN - dataWidth, y, size: 10, font: fonts.regular, color: rgb(0.09, 0.12, 0.17) });
  y -= 40;

  // Destinatário
  page.drawText('À', { x: MARGIN, y, size: 10, font: fonts.regular, color: rgb(0.09, 0.12, 0.17) });
  y -= 26;

  const destinatario = ['Andrade Gutierrez Engenharia S.A.', 'Avenida do Contorno, 8279', 'Belo Horizonte - MG'];
  destinatario.forEach((linha) => {
    page.drawText(linha, { x: MARGIN, y, size: 10, font: fonts.regular, color: rgb(0.09, 0.12, 0.17) });
    y -= 14;
  });
  y -= 26;

  // Referência (sublinhada)
  const ref = 'Ref.: Indicação de conta para pagamento';
  page.drawText(ref, { x: MARGIN, y, size: 10, font: fonts.bold, color: rgb(0.09, 0.12, 0.17) });
  const refWidth = fonts.bold.widthOfTextAtSize(ref, 10);
  page.drawLine({ start: { x: MARGIN, y: y - 2 }, end: { x: MARGIN + refWidth, y: y - 2 }, thickness: 0.6, color: rgb(0.09, 0.12, 0.17) });
  y -= 36;

  // Parágrafo principal — dados do fornecedor e da conta indicada
  y = drawParagraph(page, fonts, [
    { text: `${nomeUpper}`, bold: true },
    { text: ', inscrita no ' },
    { text: `CNPJ sob o n.º ${cnpj}`, bold: true },
    { text: ', é titular' },
    { text: ` da Conta Corrente n.º ${sanitizeText(dados.contaCorrente)}`, bold: true },
    { text: `, da Agência n.º ${sanitizeText(dados.agencia)}`, bold: true },
    { text: `, do ${sanitizeText(dados.banco)}`, bold: true },
    { text: ', para fins de recebimento por serviços e/ou fornecimentos e/ou locação.' },
  ], y, { size: 10.5, lineHeight: 16, maxWidth: contentWidth });
  y -= 14;

  // Observação (itálico)
  y = drawParagraph(page, fonts, [
    { text: 'Obs.:', bold: true, italic: true },
    { text: ' A Andrade Gutierrez não faz pagamentos na conta de titularidade das pessoas físicas. O pagamento é realizado na conta pertencente ao CNPJ da empresa.', italic: true },
  ], y, { size: 10, lineHeight: 15, maxWidth: contentWidth });
  y -= 26;

  // Declarações
  y = drawParagraph(page, fonts, [{ text: 'Declaramos, ainda, que:' }], y, { size: 10, lineHeight: 15, maxWidth: contentWidth });
  y -= 8;

  const declaracoes: TextRun[][] = [
    [{ text: 'A presente correspondência não constitui cobrança e/ou constituição em mora;' }],
    [{ text: 'A presente correspondência não supre a necessidade de apresentação de documentos complementares que sejam exigidos para a liberação de pagamentos; e,' }],
    [{ text: 'Caso haja alteração de conta corrente, esta será comunicada com antecedência mínima de 60 (sessenta) dias.' }],
  ];
  const letras = ['a)', 'b)', 'c)'];
  const indent = 22;
  declaracoes.forEach((runs, idx) => {
    page.drawText(letras[idx], { x: MARGIN + 6, y, size: 10, font: fonts.regular, color: rgb(0.09, 0.12, 0.17) });
    y = drawParagraph(page, fonts, runs, y, { size: 10, lineHeight: 14, startX: MARGIN + indent, maxWidth: contentWidth - indent }) + 4;
  });

  y -= 60;

  // Bloco de assinatura, centralizado
  const linhaLarg = 260;
  const linhaX = (PAGE_WIDTH - linhaLarg) / 2;
  page.drawLine({ start: { x: linhaX, y }, end: { x: linhaX + linhaLarg, y }, thickness: 0.8, color: rgb(0.09, 0.12, 0.17) });
  y -= 16;

  const assinaturaLinhas = [
    'REPRESENTANTE LEGAL DA CONTRATADA ou',
    'CHEFE ADMINISTRATIVO DA OBRA ou',
    'GERENTE DA ÁREA SOLICITANTE ou',
    'GERENTE DE SUPRIMENTOS',
  ];
  assinaturaLinhas.forEach((linha) => {
    const w = fonts.bold.widthOfTextAtSize(linha, 9);
    page.drawText(linha, { x: (PAGE_WIDTH - w) / 2, y, size: 9, font: fonts.bold, color: rgb(0.09, 0.12, 0.17) });
    y -= 13;
  });
  const obsAssinatura = '(assinatura e carimbo)';
  const wObs = fonts.italic.widthOfTextAtSize(obsAssinatura, 8.5);
  page.drawText(obsAssinatura, { x: (PAGE_WIDTH - wObs) / 2, y: y - 2, size: 8.5, font: fonts.italic, color: rgb(0.30, 0.34, 0.40) });

  const filename = `indicacao-conta-pagamento-${request.number}.pdf`;
  await downloadPdf(doc, filename);
}
