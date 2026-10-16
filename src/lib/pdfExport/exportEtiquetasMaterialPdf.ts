/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PDF das etiquetas de identificação de material (prateleira do almoxarifado),
 * no mesmo desenho da etiqueta de papel: título, descrição, localização e
 * código, aplicação e mínimo, foto e QR code. Folha A4 com 10 etiquetas de
 * 90 × 54 mm, na cor escolhida na impressão (faixas de título e rótulo).
 *
 * O QR é desenhado em vetor (quadradinhos), não como imagem — sai nítido em
 * qualquer impressora e não depende de canvas.
 *
 * As peças de desenho (célula, QR, foto) também servem à etiqueta da BOM
 * (`exportEtiquetasBomPdf.ts`).
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import QRCode from 'qrcode';
import { sanitizeText, toEmbeddablePng } from './core';
import {
  CORES_ETIQUETA,
  ETIQUETA_ALTURA,
  ETIQUETA_LARGURA,
  hexParaRgb01,
  type CorEtiqueta,
  posicaoDaEtiqueta,
  conteudoQrEtiqueta,
  type DadosEtiqueta,
} from '../etiquetaMaterial';

const PRETO = rgb(0, 0, 0);
const BRANCO = rgb(1, 1, 1);
const CINZA_AVISO = rgb(0.4, 0.4, 0.4);

export interface Tema {
  titulo: RGB;
  celula: RGB;
  texto: RGB;
}

export function temaDaCor(cor: CorEtiqueta): Tema {
  const t = CORES_ETIQUETA[cor] ?? CORES_ETIQUETA.cinza;
  return { titulo: rgb(...hexParaRgb01(t.titulo)), celula: rgb(...hexParaRgb01(t.celula)), texto: rgb(...hexParaRgb01(t.texto)) };
}

// Alturas das faixas, de cima para baixo (pt). O que sobra é foto + QR.
const H_TITULO = 14;
const H_DESCRICAO = 17;
const H_ROTULO = 11;
const H_VALOR = 17;
const H_APLICACAO = 15;

export interface Fontes {
  normal: PDFFont;
  negrito: PDFFont;
}

/** Texto que cabe na largura: diminui a fonte até o mínimo e, se ainda não couber, corta com reticências. */
export function ajustarTexto(texto: string, fonte: PDFFont, tamanhoMax: number, larguraMax: number, tamanhoMin = 5): { texto: string; tamanho: number } {
  const limpo = sanitizeText(texto);
  let tamanho = tamanhoMax;
  while (tamanho > tamanhoMin && fonte.widthOfTextAtSize(limpo, tamanho) > larguraMax) tamanho -= 0.5;
  if (fonte.widthOfTextAtSize(limpo, tamanho) <= larguraMax) return { texto: limpo, tamanho };
  let corte = limpo;
  while (corte.length > 1 && fonte.widthOfTextAtSize(`${corte}...`, tamanho) > larguraMax) corte = corte.slice(0, -1);
  return { texto: `${corte}...`, tamanho };
}

export function celula(
  page: PDFPage,
  fontes: Fontes,
  x: number, y: number, w: number, h: number,
  texto: string,
  opcoes: { fundo?: typeof PRETO; cor?: typeof PRETO; negrito?: boolean; tamanho: number },
): void {
  page.drawRectangle({ x, y, width: w, height: h, color: opcoes.fundo ?? BRANCO, borderColor: PRETO, borderWidth: 0.6 });
  if (!texto) return;
  const fonte = opcoes.negrito ? fontes.negrito : fontes.normal;
  const { texto: t, tamanho } = ajustarTexto(texto, fonte, opcoes.tamanho, w - 4);
  const largura = fonte.widthOfTextAtSize(t, tamanho);
  page.drawText(t, {
    x: x + (w - largura) / 2,
    y: y + (h - tamanho * 0.72) / 2,
    size: tamanho,
    font: fonte,
    color: opcoes.cor ?? PRETO,
  });
}

/** QR em vetor: um retângulo por trecho contínuo de módulos pretos em cada linha. */
export function desenharQr(page: PDFPage, conteudo: string, x: number, y: number, lado: number): void {
  const qr = QRCode.create(conteudo, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const margem = 2; // módulos de borda branca (zona de silêncio dentro da célula)
  const modulo = lado / (n + margem * 2);
  page.drawRectangle({ x, y, width: lado, height: lado, color: BRANCO });
  for (let linha = 0; linha < n; linha += 1) {
    let inicio = -1;
    for (let col = 0; col <= n; col += 1) {
      const preto = col < n && qr.modules.get(linha, col);
      if (preto && inicio < 0) inicio = col;
      if (!preto && inicio >= 0) {
        page.drawRectangle({
          x: x + (margem + inicio) * modulo,
          y: y + lado - (margem + linha + 1) * modulo,
          width: (col - inicio) * modulo,
          height: modulo,
          color: PRETO,
        });
        inicio = -1;
      }
    }
  }
}

export async function carregarFoto(doc: PDFDocument, url: string, cache: Map<string, PDFImage | null>): Promise<PDFImage | null> {
  if (cache.has(url)) return cache.get(url)!;
  let imagem: PDFImage | null = null;
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      const bytes = await resp.arrayBuffer();
      const mime = (resp.headers.get('content-type') || '').toLowerCase();
      if (mime.includes('jpeg') || mime.includes('jpg')) {
        try { imagem = await doc.embedJpg(bytes); } catch { imagem = await doc.embedPng(await toEmbeddablePng(bytes, mime)); }
      } else if (mime.includes('png')) {
        imagem = await doc.embedPng(bytes);
      } else {
        imagem = await doc.embedPng(await toEmbeddablePng(bytes, mime));
      }
    }
  } catch (err) {
    console.warn('[etiquetas] Foto não entrou na etiqueta:', err);
  }
  cache.set(url, imagem);
  return imagem;
}

function desenharEtiqueta(page: PDFPage, fontes: Fontes, tema: Tema, e: DadosEtiqueta, foto: PDFImage | null, x: number, y: number): void {
  const W = ETIQUETA_LARGURA;
  const rotulo = { fundo: tema.celula, cor: tema.texto, negrito: true, tamanho: 6.5 };
  let topo = y + ETIQUETA_ALTURA;

  // Título
  topo -= H_TITULO;
  celula(page, fontes, x, topo, W, H_TITULO, 'ETIQUETA DE IDENTIFICAÇÃO DE MATERIAL', { fundo: tema.titulo, cor: tema.texto, negrito: true, tamanho: 8 });

  // Descrição
  topo -= H_DESCRICAO;
  celula(page, fontes, x, topo, W, H_DESCRICAO, e.descricao.toUpperCase(), { negrito: true, tamanho: 9 });

  // Localização | Código item
  const wLoc = W * 0.4;
  topo -= H_ROTULO;
  celula(page, fontes, x, topo, wLoc, H_ROTULO, 'LOCALIZAÇÃO', rotulo);
  celula(page, fontes, x + wLoc, topo, W - wLoc, H_ROTULO, 'CÓDIGO ITEM', rotulo);
  topo -= H_VALOR;
  celula(page, fontes, x, topo, wLoc, H_VALOR, e.localizacao, { negrito: true, tamanho: 10 });
  celula(page, fontes, x + wLoc, topo, W - wLoc, H_VALOR, e.codigo_sap, { negrito: true, tamanho: 11 });

  // Aplicação | valor | Mínimo | valor (vazio = à mão)
  topo -= H_APLICACAO;
  const wRotApl = W * 0.24;
  const wApl = W * 0.36;
  const wRotMin = W * 0.2;
  celula(page, fontes, x, topo, wRotApl, H_APLICACAO, 'APLICAÇÃO', rotulo);
  celula(page, fontes, x + wRotApl, topo, wApl, H_APLICACAO, e.aplicacao.toUpperCase(), { negrito: true, tamanho: 8.5 });
  celula(page, fontes, x + wRotApl + wApl, topo, wRotMin, H_APLICACAO, 'MÍNIMO', rotulo);
  const minimo = e.minimo === null ? '' : e.minimo.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  celula(page, fontes, x + wRotApl + wApl + wRotMin, topo, W - wRotApl - wApl - wRotMin, H_APLICACAO, minimo, { negrito: true, tamanho: 9 });

  // Imagem | QR code
  const wMeio = W / 2;
  topo -= H_ROTULO;
  celula(page, fontes, x, topo, wMeio, H_ROTULO, 'IMAGEM', rotulo);
  celula(page, fontes, x + wMeio, topo, wMeio, H_ROTULO, 'QR CODE', rotulo);

  const hArea = topo - y;
  celula(page, fontes, x, y, wMeio, hArea, '', { tamanho: 8 });
  celula(page, fontes, x + wMeio, y, wMeio, hArea, '', { tamanho: 8 });

  if (foto) {
    const escala = Math.min((wMeio - 6) / foto.width, (hArea - 6) / foto.height);
    const fw = foto.width * escala;
    const fh = foto.height * escala;
    page.drawImage(foto, { x: x + (wMeio - fw) / 2, y: y + (hArea - fh) / 2, width: fw, height: fh });
  } else {
    const aviso = 'sem foto no cadastro';
    const t = 6;
    page.drawText(aviso, {
      x: x + (wMeio - fontes.normal.widthOfTextAtSize(aviso, t)) / 2,
      y: y + hArea / 2 - t / 2,
      size: t,
      font: fontes.normal,
      color: CINZA_AVISO,
    });
  }

  const lado = Math.min(wMeio, hArea) - 2;
  desenharQr(page, conteudoQrEtiqueta(e.codigo_sap), x + wMeio + (wMeio - lado) / 2, y + (hArea - lado) / 2, lado);
}

/** Monta o PDF com uma etiqueta por item, na ordem recebida, na cor escolhida. */
export async function gerarPdfEtiquetasMaterial(etiquetas: DadosEtiqueta[], cor: CorEtiqueta = 'cinza'): Promise<PDFDocument> {
  const tema = temaDaCor(cor);
  const doc = await PDFDocument.create();
  doc.setTitle('Etiquetas de identificação de material');
  const fontes: Fontes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    negrito: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const cacheFotos = new Map<string, PDFImage | null>();
  const paginas: PDFPage[] = [];

  for (let i = 0; i < etiquetas.length; i += 1) {
    const e = etiquetas[i];
    const pos = posicaoDaEtiqueta(i);
    while (paginas.length <= pos.pagina) paginas.push(doc.addPage([595.28, 841.89]));
    const foto = e.url_foto ? await carregarFoto(doc, e.url_foto, cacheFotos) : null;
    desenharEtiqueta(paginas[pos.pagina], fontes, tema, e, foto, pos.x, pos.y);
  }
  return doc;
}
