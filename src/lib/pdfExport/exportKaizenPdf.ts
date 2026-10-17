/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PDF de um Kaizen — Aqui TEN Melhoria! (FRM.ENG-0017), na ordem do
 * formulário em papel: identificação, impactos, os quatro blocos (cada um
 * com as suas fotos logo abaixo do texto), o rodapé do Responsável pelo
 * Setor e as assinaturas. Fotos reduzidas à grade (ver `fotosPdf.ts`).
 */

import { rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import {
  createDoc, docToPdfGerado, MARGIN, PAGE_WIDTH, PDF_COLORS, PdfTextWriter, sanitizeText, wrapText, type PdfGerado,
} from './core';
import { embutirFotoPdf, LADO_FOTO } from './fotosPdf';
import {
  assinarFotosKaizen, KAIZEN_IMPACTOS, KAIZEN_STATUS_ROTULO,
  type Kaizen, type KaizenFotoTipo,
} from '../planKaizenApi';

export type { PdfGerado };

const FORM_CODE = 'FRM.ENG-0017';
const LARGURA = PAGE_WIDTH - MARGIN * 2;
const BRANCO = rgb(1, 1, 1);

const fmtData = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '-');
const moeda = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const COR_STATUS: Record<Kaizen['status'], 'green' | 'amber' | 'red'> = {
  REGISTRADO: 'amber',
  IMPLANTADO: 'green',
  CANCELADO: 'red',
};

/** Caixa de marcação com o "check" desenhado em traços (Helvetica não tem o glifo). */
function caixa(page: PDFPage, x: number, yTopo: number, lado: number, marcado: boolean, cor = PDF_COLORS.primaryNavy) {
  page.drawRectangle({
    x, y: yTopo - lado, width: lado, height: lado,
    borderColor: marcado ? cor : PDF_COLORS.mutedLabel, borderWidth: 0.9,
    color: marcado ? cor : BRANCO,
  });
  if (!marcado) return;
  page.drawLine({ start: { x: x + lado * 0.2, y: yTopo - lado * 0.55 }, end: { x: x + lado * 0.42, y: yTopo - lado * 0.78 }, thickness: 1.4, color: BRANCO });
  page.drawLine({ start: { x: x + lado * 0.42, y: yTopo - lado * 0.78 }, end: { x: x + lado * 0.82, y: yTopo - lado * 0.24 }, thickness: 1.4, color: BRANCO });
}

function desenharImpactos(w: PdfTextWriter, k: Kaizen) {
  w.drawSectionHeader('Classifique os impactos da melhoria');
  const altura = 30;
  w.ensureSpace(altura + 10);
  const page = w.getPage();
  const topo = w.getY();
  page.drawRectangle({
    x: MARGIN, y: topo - altura, width: LARGURA, height: altura,
    color: PDF_COLORS.cardBg, borderColor: PDF_COLORS.cardBorder, borderWidth: 1,
  });

  const fonte = w.getFont();
  const negrito = w.getFontBold();
  const colW = LARGURA / KAIZEN_IMPACTOS.length;
  KAIZEN_IMPACTOS.forEach((imp, i) => {
    const marcado = k.impactos?.includes(imp.valor) ?? false;
    const x = MARGIN + i * colW + 12;
    caixa(page, x, topo - 9, 12, marcado);
    page.drawText(sanitizeText(imp.rotulo), {
      x: x + 18, y: topo - 19, size: 9,
      font: marcado ? negrito : fonte,
      color: marcado ? PDF_COLORS.primaryNavy : PDF_COLORS.mutedLabel,
    });
  });
  w.setY(topo - altura - 12);
}

/** Faixa de título de um bloco: círculo com o número + pergunta do formulário. */
function cabecalhoBloco(w: PdfTextWriter, numero: number, titulo: string, subtitulo?: string) {
  const altura = subtitulo ? 32 : 22;
  w.ensureSpace(altura + 40);
  const page = w.getPage();
  const topo = w.getY();
  page.drawRectangle({ x: MARGIN, y: topo - altura, width: LARGURA, height: altura, color: PDF_COLORS.badgeBlueBg });
  page.drawRectangle({ x: MARGIN, y: topo - altura, width: 3.5, height: altura, color: PDF_COLORS.accentBlue });
  const cy = topo - 11;
  page.drawCircle({ x: MARGIN + 18, y: cy, size: 8, color: PDF_COLORS.primaryNavy });
  const n = String(numero);
  const negrito = w.getFontBold();
  page.drawText(n, { x: MARGIN + 18 - negrito.widthOfTextAtSize(n, 9) / 2, y: cy - 3.2, size: 9, font: negrito, color: BRANCO });
  page.drawText(sanitizeText(titulo.toUpperCase()), { x: MARGIN + 32, y: topo - 14.5, size: 9.5, font: negrito, color: PDF_COLORS.primaryNavy });
  if (subtitulo) {
    page.drawText(sanitizeText(subtitulo), { x: MARGIN + 32, y: topo - 26, size: 8, font: w.getFont(), color: PDF_COLORS.bodyText });
  }
  w.setY(topo - altura - 4);
}

/** Texto do bloco linha a linha (quebra de página no meio, se precisar), com fio à esquerda. */
function textoBloco(w: PdfTextWriter, valor: string | null) {
  const fonte: PDFFont = w.getFont();
  const tamanho = 9.5;
  const altLinha = 13;
  const linhas = wrapText(sanitizeText(valor?.trim() || 'Não informado.'), fonte, tamanho, LARGURA - 24);
  w.setY(w.getY() - 4);
  for (const l of linhas) {
    w.ensureSpace(altLinha);
    const page = w.getPage();
    const y = w.getY();
    page.drawRectangle({ x: MARGIN, y: y - altLinha + 3, width: 1, height: altLinha, color: PDF_COLORS.cardBorder });
    page.drawText(l, { x: MARGIN + 12, y: y - 9, size: tamanho, font: fonte, color: valor?.trim() ? PDF_COLORS.darkText : PDF_COLORS.mutedLabel });
    w.setY(y - altLinha);
  }
  w.setY(w.getY() - 6);
}

/** Fotos do bloco em linhas de até 3, cada uma emoldurada e centrada na célula. */
async function fotosBloco(w: PdfTextWriter, fotos: { url: string }[]) {
  if (fotos.length === 0) return;
  const imagens: PDFImage[] = [];
  for (const f of fotos) {
    const img = await embutirFotoPdf(w.getDoc(), f.url, LADO_FOTO.GRADE).catch(() => null);
    if (img) imagens.push(img);
  }
  if (imagens.length === 0) return;

  const porLinha = imagens.length === 1 ? 1 : imagens.length === 2 ? 2 : 3;
  const gap = 8;
  const celW = (LARGURA - 12 - gap * (porLinha - 1)) / porLinha;
  const celH = porLinha === 1 ? 230 : porLinha === 2 ? 160 : 120;

  for (let i = 0; i < imagens.length; i += porLinha) {
    w.ensureSpace(celH + 10);
    const page = w.getPage();
    const topo = w.getY();
    imagens.slice(i, i + porLinha).forEach((img, j) => {
      const x = MARGIN + 12 + j * (celW + gap);
      page.drawRectangle({
        x, y: topo - celH, width: celW, height: celH,
        color: PDF_COLORS.cardBg, borderColor: PDF_COLORS.cardBorder, borderWidth: 1,
      });
      const escala = Math.min((celW - 8) / img.width, (celH - 8) / img.height);
      const dw = img.width * escala;
      const dh = img.height * escala;
      page.drawImage(img, { x: x + (celW - dw) / 2, y: topo - celH + (celH - dh) / 2, width: dw, height: dh });
    });
    w.setY(topo - celH - gap);
  }
  w.setY(w.getY() - 4);
}

function destaqueGanho(w: PdfTextWriter, valor: number) {
  const altura = 34;
  w.ensureSpace(altura + 10);
  const page = w.getPage();
  const topo = w.getY();
  page.drawRectangle({ x: MARGIN, y: topo - altura, width: LARGURA, height: altura, color: PDF_COLORS.badgeGreenBg });
  page.drawRectangle({ x: MARGIN, y: topo - altura, width: 3.5, height: altura, color: PDF_COLORS.badgeGreenText });
  page.drawText('GANHO ESTIMADO', { x: MARGIN + 14, y: topo - 21, size: 8, font: w.getFontBold(), color: PDF_COLORS.badgeGreenText });
  const txt = sanitizeText(moeda(valor));
  const negrito = w.getFontBold();
  page.drawText(txt, { x: MARGIN + LARGURA - 14 - negrito.widthOfTextAtSize(txt, 16), y: topo - 23, size: 16, font: negrito, color: PDF_COLORS.badgeGreenText });
  w.setY(topo - altura - 14);
}

function desenharValidacao(w: PdfTextWriter, k: Kaizen) {
  const implantado = k.status === 'IMPLANTADO';
  const fonte = w.getFont();
  const negrito = w.getFontBold();
  const obs = k.validacao_obs ? wrapText(sanitizeText(k.validacao_obs), fonte, 8.5, LARGURA - 28) : [];
  const altura = 62 + obs.length * 11;
  // Título e quadro juntos: o título não fica sozinho no pé da página.
  w.ensureSpace(altura + 34);
  w.drawSectionHeader('Responsável pelo setor — Kaizen implantado');
  const page = w.getPage();
  const topo = w.getY();
  const fundo = implantado ? PDF_COLORS.badgeGreenBg : PDF_COLORS.badgeAmberBg;
  const texto = implantado ? PDF_COLORS.badgeGreenText : PDF_COLORS.badgeAmberText;

  page.drawRectangle({ x: MARGIN, y: topo - altura, width: LARGURA, height: altura, color: fundo, borderColor: texto, borderWidth: 0.6 });
  page.drawText(implantado ? 'MELHORIA IMPLANTADA E VALIDADA' : 'AGUARDANDO VALIDAÇÃO DO RESPONSÁVEL PELO SETOR', {
    x: MARGIN + 14, y: topo - 16, size: 9, font: negrito, color: texto,
  });

  page.drawText('Esta melhoria pode ser aplicada em outros setores?', { x: MARGIN + 14, y: topo - 34, size: 9, font: fonte, color: PDF_COLORS.darkText });
  const xSim = MARGIN + 270;
  caixa(page, xSim, topo - 25, 11, k.aplicavel_outros_setores === true, texto);
  page.drawText('Sim', { x: xSim + 16, y: topo - 34, size: 9, font: negrito, color: PDF_COLORS.darkText });
  caixa(page, xSim + 55, topo - 25, 11, k.aplicavel_outros_setores === false, texto);
  page.drawText('Não', { x: xSim + 71, y: topo - 34, size: 9, font: negrito, color: PDF_COLORS.darkText });

  const quem = implantado
    ? `Validado por ${k.validado_por_nome || '-'}${k.validado_em ? ` em ${new Date(k.validado_em).toLocaleDateString('pt-BR')}` : ''}`
    : 'Preenchimento do responsável somente quando o Kaizen estiver implantado.';
  page.drawText(sanitizeText(quem), { x: MARGIN + 14, y: topo - 50, size: 8.5, font: fonte, color: PDF_COLORS.bodyText });
  obs.forEach((l, i) => {
    page.drawText(l, { x: MARGIN + 14, y: topo - 62 - i * 11, size: 8.5, font: fonte, color: PDF_COLORS.bodyText });
  });
  w.setY(topo - altura - 14);
}

export async function gerarKaizenPdf(kaizen: Kaizen): Promise<PdfGerado> {
  const [k] = await assinarFotosKaizen([kaizen]);
  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc, font, fontBold, logo);
  const codigo = k.codigo || 'Pendente de sincronização';

  w.drawDocumentHeader({
    title: 'Aqui TEN Melhoria! — Kaizen',
    formCode: FORM_CODE,
    protocol: codigo,
    emissionDate: new Date().toLocaleDateString('pt-BR'),
    statusBadge: KAIZEN_STATUS_ROTULO[k.status].toUpperCase(),
    statusColor: COR_STATUS[k.status],
  });

  w.drawSectionHeader('Identificação');
  w.drawInfoGrid(
    [
      { label: 'Nome do profissional', value: k.nome_profissional },
      { label: 'Matrícula', value: k.matricula || '-' },
      { label: 'Data', value: fmtData(k.data_registro) },
      { label: 'Setor', value: k.setor },
      { label: 'Responsável pelo setor', value: k.responsavel_setor || '-' },
      { label: 'Situação', value: KAIZEN_STATUS_ROTULO[k.status], statusBadge: KAIZEN_STATUS_ROTULO[k.status].toUpperCase(), statusColor: COR_STATUS[k.status] },
    ],
    3,
  );

  desenharImpactos(w, k);

  const fotosDo = (tipo: KaizenFotoTipo) =>
    (k.fotos || []).filter(f => f.tipo === tipo && f.preview_url).map(f => ({ url: f.preview_url! }));

  cabecalhoBloco(w, 1, 'Escreva ou desenhe o desperdício / problema');
  textoBloco(w, k.problema);
  await fotosBloco(w, fotosDo('problema'));

  cabecalhoBloco(w, 2, 'Por que este desperdício ou problema está acontecendo?', 'Qual é a causa deste problema?');
  textoBloco(w, k.causa);

  cabecalhoBloco(w, 3, 'Escreva ou desenhe a melhoria / solução');
  textoBloco(w, k.solucao);
  await fotosBloco(w, fotosDo('solucao'));

  cabecalhoBloco(w, 4, 'Qual foi o resultado obtido?');
  textoBloco(w, k.resultado);
  if (k.ganho_estimado != null) destaqueGanho(w, Number(k.ganho_estimado));
  await fotosBloco(w, fotosDo('resultado'));

  desenharValidacao(w, k);

  w.drawSignatures([
    { role: 'Profissional', name: k.nome_profissional },
    { role: 'Responsável pelo setor', name: k.validado_por_nome || k.responsavel_setor || undefined },
  ]);

  w.finalizeDoc(FORM_CODE);
  const nome = (k.codigo || `kaizen-${k.id.slice(0, 8)}`).toLowerCase();
  return docToPdfGerado(doc, `${nome}.pdf`, `Kaizen ${codigo}`);
}
