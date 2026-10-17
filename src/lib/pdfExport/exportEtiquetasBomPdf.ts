/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PDF das etiquetas de identificação dos itens da BOM do projeto, no desenho
 * da etiqueta de papel: título, descrição, localização, código do item,
 * código equivalente, imagem, QR code e a tabela de seções (S1..S5,
 * grupo da BOM e quantidade por torre).
 *
 * Mesma folha da etiqueta de item SAP (A4, 10 etiquetas de 90 × 54 mm) e
 * mesmas cores, para usar o mesmo papel na impressora.
 */

import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from 'pdf-lib';
import { sanitizeText } from './core';
import { ETIQUETA_ALTURA, ETIQUETA_LARGURA, posicaoDaEtiqueta, type CorEtiqueta } from '../etiquetaMaterial';
import { conteudoQrEtiquetaBom, type DadosEtiquetaBom } from '../etiquetaBom';
import { ajustarTexto, carregarFoto, celula, desenharQr, temaDaCor, type Fontes, type Tema } from './exportEtiquetasMaterialPdf';

const PRETO = rgb(0, 0, 0);
const CINZA_AVISO = rgb(0.4, 0.4, 0.4);

// Alturas das faixas, de cima para baixo (pt). O que sobra é imagem, QR e seções.
const H_TITULO = 14;
/** Duas linhas: nome em português (negrito) e em inglês (menor). */
const H_DESCRICAO = 23;
const H_CODIGO = 15;
const H_EQUIVALENTE = 22;
const H_CABECALHO = 11;
/** A grade de seções tem ao menos 5 linhas (S1..S5), como a etiqueta de papel. */
const LINHAS_MINIMAS = 5;

// Colunas, em fração da largura: localização/imagem | rótulos/QR | seção | grupo | quantidade.
const C1 = 0.24;
const C2 = 0.22;
const C3A = 0.11;
const C3B = 0.31;

const fmtQtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** Célula com texto em várias linhas centralizadas (rótulo "CÓDIGO EQUIVALENTE"). */
function celulaLinhas(page: PDFPage, fontes: Fontes, x: number, y: number, w: number, h: number, linhas: string[], tema: Tema, tamanho: number): void {
  page.drawRectangle({ x, y, width: w, height: h, color: tema.celula, borderColor: PRETO, borderWidth: 0.6 });
  const altLinha = tamanho * 1.1;
  const blocoAltura = altLinha * linhas.length;
  linhas.forEach((linha, i) => {
    const { texto, tamanho: t } = ajustarTexto(linha, fontes.negrito, tamanho, w - 4);
    const largura = fontes.negrito.widthOfTextAtSize(texto, t);
    page.drawText(texto, {
      x: x + (w - largura) / 2,
      y: y + h / 2 + blocoAltura / 2 - altLinha * (i + 1) + (altLinha - t * 0.72) / 2,
      size: t,
      font: fontes.negrito,
      color: tema.texto,
    });
  });
}

/** Faixa da descrição: português em negrito e, embaixo, inglês menor. Sem inglês, só o português centralizado. */
function desenharDescricao(page: PDFPage, fontes: Fontes, x: number, y: number, w: number, h: number, pt: string, en: string): void {
  if (!en) {
    celula(page, fontes, x, y, w, h, pt, { negrito: true, tamanho: 9 });
    return;
  }
  celula(page, fontes, x, y, w, h, '', { tamanho: 9 });
  const linhaPt = ajustarTexto(pt, fontes.negrito, 9, w - 6);
  const linhaEn = ajustarTexto(en, fontes.normal, 7, w - 6);
  const yPt = y + h / 2 + 1.5;
  const yEn = y + h / 2 - linhaEn.tamanho * 0.72 - 2.5;
  page.drawText(linhaPt.texto, {
    x: x + (w - fontes.negrito.widthOfTextAtSize(linhaPt.texto, linhaPt.tamanho)) / 2,
    y: yPt,
    size: linhaPt.tamanho,
    font: fontes.negrito,
    color: PRETO,
  });
  page.drawText(linhaEn.texto, {
    x: x + (w - fontes.normal.widthOfTextAtSize(linhaEn.texto, linhaEn.tamanho)) / 2,
    y: yEn,
    size: linhaEn.tamanho,
    font: fontes.normal,
    color: PRETO,
  });
}

function desenharEtiquetaBom(page: PDFPage, fontes: Fontes, tema: Tema, e: DadosEtiquetaBom, foto: PDFImage | null, x: number, y: number): void {
  const W = ETIQUETA_LARGURA;
  const w1 = W * C1;
  const w2 = W * C2;
  const w3a = W * C3A;
  const w3b = W * C3B;
  const w4 = W - w1 - w2 - w3a - w3b;
  const xValor = x + w1 + w2;
  const wValor = W - w1 - w2;
  const rotulo = { fundo: tema.celula, cor: tema.texto, negrito: true, tamanho: 6.5 };
  let topo = y + ETIQUETA_ALTURA;

  // Título e descrição
  topo -= H_TITULO;
  celula(page, fontes, x, topo, W, H_TITULO, 'ETIQUETA DE IDENTIFICAÇÃO DE MATERIAL', { fundo: tema.titulo, cor: tema.texto, negrito: true, tamanho: 8 });
  topo -= H_DESCRICAO;
  desenharDescricao(page, fontes, x, topo, W, H_DESCRICAO, e.descricao, e.descricaoEn);

  // Localização (rótulo) | Código item (rótulo) | código
  topo -= H_CODIGO;
  celula(page, fontes, x, topo, w1, H_CODIGO, 'LOCALIZAÇÃO', rotulo);
  celula(page, fontes, x + w1, topo, w2, H_CODIGO, 'CÓDIGO ITEM', rotulo);
  celula(page, fontes, xValor, topo, wValor, H_CODIGO, e.partNumber, { negrito: true, tamanho: 10 });

  // localização | Código equivalente (rótulo) | código equivalente
  topo -= H_EQUIVALENTE;
  celula(page, fontes, x, topo, w1, H_EQUIVALENTE, e.localizacao, { negrito: true, tamanho: 9 });
  celulaLinhas(page, fontes, x + w1, topo, w2, H_EQUIVALENTE, ['CÓDIGO', 'EQUIVALENTE'], tema, 6);
  celula(page, fontes, xValor, topo, wValor, H_EQUIVALENTE, e.qingdao, { negrito: true, tamanho: 10 });

  // Cabeçalho: Imagem | QR code | Seção | QDT
  topo -= H_CABECALHO;
  celula(page, fontes, x, topo, w1, H_CABECALHO, 'IMAGEM', rotulo);
  celula(page, fontes, x + w1, topo, w2, H_CABECALHO, 'QR CODE', rotulo);
  celula(page, fontes, xValor, topo, w3a + w3b, H_CABECALHO, 'SEÇÃO', rotulo);
  celula(page, fontes, xValor + w3a + w3b, topo, w4, H_CABECALHO, 'QDT', rotulo);

  const hArea = topo - y;

  // Imagem
  celula(page, fontes, x, y, w1, hArea, '', { tamanho: 8 });
  if (foto) {
    const escala = Math.min((w1 - 6) / foto.width, (hArea - 6) / foto.height);
    const fw = foto.width * escala;
    const fh = foto.height * escala;
    page.drawImage(foto, { x: x + (w1 - fw) / 2, y: y + (hArea - fh) / 2, width: fw, height: fh });
  } else {
    const aviso = sanitizeText('sem foto no cadastro');
    const t = 5.5;
    page.drawText(aviso, {
      x: x + (w1 - fontes.normal.widthOfTextAtSize(aviso, t)) / 2,
      y: y + hArea / 2 - t / 2,
      size: t,
      font: fontes.normal,
      color: CINZA_AVISO,
    });
  }

  // QR
  celula(page, fontes, x + w1, y, w2, hArea, '', { tamanho: 8 });
  const lado = Math.min(w2, hArea) - 2;
  desenharQr(page, conteudoQrEtiquetaBom(e.partNumber), x + w1 + (w2 - lado) / 2, y + (hArea - lado) / 2, lado);

  // Seções: S# | grupo | quantidade. Linhas vazias completam a grade.
  const n = Math.max(LINHAS_MINIMAS, e.secoes.length);
  const hLinha = hArea / n;
  const tamanho = Math.min(8, Math.max(5, hLinha * 0.55));
  for (let i = 0; i < n; i += 1) {
    const s = e.secoes[i];
    const yLinha = topo - (i + 1) * hLinha;
    celula(page, fontes, xValor, yLinha, w3a, hLinha, s ? s.secao ?? '—' : '', { negrito: true, tamanho });
    celula(page, fontes, xValor + w3a, yLinha, w3b, hLinha, s ? s.grupo || '—' : '', { tamanho });
    celula(page, fontes, xValor + w3a + w3b, yLinha, w4, hLinha, s ? fmtQtd(s.quantidade) : '', { negrito: true, tamanho });
  }
}

/** Monta o PDF com uma etiqueta por peça, na ordem recebida, na cor escolhida. */
export async function gerarPdfEtiquetasBom(etiquetas: DadosEtiquetaBom[], cor: CorEtiqueta = 'cinza'): Promise<PDFDocument> {
  const tema = temaDaCor(cor);
  const doc = await PDFDocument.create();
  doc.setTitle('Etiquetas de identificação de material — BOM');
  const fontes: Fontes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    negrito: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const paginas: PDFPage[] = [];

  for (let i = 0; i < etiquetas.length; i += 1) {
    const e = etiquetas[i];
    const pos = posicaoDaEtiqueta(i);
    while (paginas.length <= pos.pagina) paginas.push(doc.addPage([595.28, 841.89]));
    const foto = e.url_foto ? await carregarFoto(doc, e.url_foto) : null;
    desenharEtiquetaBom(paginas[pos.pagina], fontes, tema, e, foto, pos.x, pos.y);
  }
  return doc;
}
