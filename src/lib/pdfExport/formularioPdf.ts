/**
 * Primitivas dos PDFs de formulário da Qualidade (A4 retrato, bordas pretas,
 * português em negrito e inglês em itálico sem negrito). Coordenadas em
 * "topo" (distância do alto da página), convertidas para o pdf-lib aqui.
 */

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, degrees, rgb, type RGB } from 'pdf-lib';
import { sanitizeText } from './core';

export const PW = 595.28;
export const PH = 841.89;

export const BLACK = rgb(0.1, 0.1, 0.12);
export const LINE = rgb(0.2, 0.2, 0.22);
export const MUTED = rgb(0.4, 0.43, 0.48);
export const GREEN = rgb(0.05, 0.6, 0.25);
export const RED = rgb(0.82, 0.08, 0.08);
export const HEAD_BG = rgb(0.95, 0.96, 0.97);

export const CHECK = '✔';

export interface Fontes { regular: PDFFont; bold: PDFFont; italic: PDFFont; zapf: PDFFont }
export interface Bloco { text: string; font: PDFFont; size: number; color?: RGB; gap?: number }
export interface PdfGerado { bytes: Uint8Array; nomeArquivo: string; titulo: string }

export async function carregarFontes(doc: PDFDocument): Promise<Fontes> {
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    zapf: await doc.embedFont(StandardFonts.ZapfDingbats),
  };
}

export const fmtData = (valor?: string | null) => valor ? valor.slice(0, 10).split('-').reverse().join('/') : '';

/** dd/mm/aaaa hh:mm no fuso do navegador (timestamps com hora). */
export function fmtDataHora(valor?: string | null): string {
  if (!valor) return '';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '';
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()} ${dois(data.getHours())}:${dois(data.getMinutes())}`;
}

export function baixarPdf(pdf: PdfGerado): void {
  const url = URL.createObjectURL(new Blob([pdf.bytes as BlobPart], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = pdf.nomeArquivo;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function medir(texto: string, font: PDFFont, size: number): number {
  return font.widthOfTextAtSize(sanitizeText(texto.split(CHECK).join('O')), size);
}

export function quebrar(texto: string, font: PDFFont, size: number, largura: number): string[] {
  const resultado: string[] = [];
  for (const paragrafo of (texto || '').split('\n')) {
    let linha = '';
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const proxima = linha ? `${linha} ${palavra}` : palavra;
      if (linha && medir(proxima, font, size) > largura) {
        resultado.push(linha);
        linha = palavra;
      } else linha = proxima;
    }
    if (linha) resultado.push(linha);
  }
  return resultado;
}

/** Texto com ✔ desenhado na fonte ZapfDingbats (Helvetica não tem o glifo). */
export function texto(page: PDFPage, valor: string, x: number, topo: number, font: PDFFont, size: number, color: RGB, f: Fontes) {
  let cursor = x;
  valor.split(CHECK).forEach((parte, indice) => {
    if (indice > 0) {
      page.drawText('✔', { x: cursor, y: PH - topo, font: f.zapf, size: size * 0.95, color });
      cursor += f.zapf.widthOfTextAtSize('✔', size * 0.95);
    }
    const limpo = sanitizeText(parte);
    if (!limpo) return;
    page.drawText(limpo, { x: cursor, y: PH - topo, font, size, color });
    cursor += font.widthOfTextAtSize(limpo, size);
  });
}

export function retangulo(page: PDFPage, x: number, topo: number, largura: number, altura: number, fundo?: RGB, espessura = 0.6) {
  page.drawRectangle({ x, y: PH - topo - altura, width: largura, height: altura, borderColor: LINE, borderWidth: espessura, color: fundo });
}

export function linha(page: PDFPage, x1: number, topo1: number, x2: number, topo2: number, espessura = 0.5, color = LINE) {
  page.drawLine({ start: { x: x1, y: PH - topo1 }, end: { x: x2, y: PH - topo2 }, thickness: espessura, color });
}

export function alturaBlocos(blocos: Bloco[], largura: number): number {
  return blocos.reduce((soma, bloco) => {
    const linhas = bloco.text ? quebrar(bloco.text, bloco.font, bloco.size, largura).length : 0;
    return soma + (linhas ? (bloco.gap || 0) + linhas * bloco.size * 1.2 : 0);
  }, 0);
}

export function celula(
  page: PDFPage, f: Fontes, blocos: Bloco[], x: number, topo: number, largura: number, altura: number,
  opcoes: { align?: 'center' | 'left'; valign?: 'middle' | 'top'; pad?: number } = {},
) {
  const pad = opcoes.pad ?? 3;
  const util = largura - pad * 2;
  const total = alturaBlocos(blocos, util);
  let cursor = opcoes.valign === 'top' ? topo + pad : topo + Math.max(pad, (altura - total) / 2);
  for (const bloco of blocos) {
    if (!bloco.text) continue;
    cursor += bloco.gap || 0;
    for (const trecho of quebrar(bloco.text, bloco.font, bloco.size, util)) {
      const lh = bloco.size * 1.2;
      const xLinha = opcoes.align === 'left' ? x + pad : x + (largura - medir(trecho, bloco.font, bloco.size)) / 2;
      texto(page, trecho, xLinha, cursor + bloco.size * 0.95, bloco.font, bloco.size, bloco.color || BLACK, f);
      cursor += lh;
    }
  }
}

export function bilingue(pt: string, en: string, f: Fontes, size: number, color: RGB = BLACK): Bloco[] {
  return [{ text: pt, font: f.bold, size, color }, { text: en, font: f.italic, size: size * 0.95, color, gap: 0.5 }];
}

/** Uma linha com trechos em fontes diferentes, centrada na largura. */
export function textoMisto(page: PDFPage, f: Fontes, trechos: [string, PDFFont][], x: number, largura: number, topo: number, size: number) {
  const total = trechos.reduce((soma, [valor, font]) => soma + medir(valor, font, size), 0);
  let cursor = x + (largura - total) / 2;
  for (const [valor, font] of trechos) {
    texto(page, valor, cursor, topo, font, size, BLACK, f);
    cursor += medir(valor, font, size);
  }
}

/** Texto vertical (de baixo para cima), centrado no retângulo. */
export function textoVertical(page: PDFPage, f: Fontes, pt: string, en: string, x: number, topo: number, largura: number, altura: number) {
  const disponivel = altura - 6;
  for (let size = 7; size >= 3.8; size -= 0.3) {
    const linhasPt = quebrar(pt, f.bold, size, disponivel);
    const linhasEn = en ? quebrar(en, f.italic, size, disponivel) : [];
    const lh = size * 1.18;
    const todas = [...linhasPt.map(t => ({ t, font: f.bold })), ...linhasEn.map(t => ({ t, font: f.italic }))];
    if (todas.length * lh > largura - 3 && size > 3.9) continue;
    const inicio = x + (largura - todas.length * lh) / 2;
    todas.forEach((item, indice) => {
      const valor = sanitizeText(item.t);
      const w = item.font.widthOfTextAtSize(valor, size);
      page.drawText(valor, {
        x: inicio + indice * lh + size * 0.9,
        y: PH - topo - altura + (altura - w) / 2,
        font: item.font, size, color: BLACK, rotate: degrees(90),
      });
    });
    return;
  }
}

export function criarCarregadorImagens(doc: PDFDocument) {
  const cache = new Map<string, Promise<PDFImage | null>>();
  return (url?: string | null): Promise<PDFImage | null> => {
    if (!url) return Promise.resolve(null);
    if (!cache.has(url)) {
      cache.set(url, (async () => {
        try {
          const resposta = await fetch(url);
          if (!resposta.ok) return null;
          const bytes = new Uint8Array(await resposta.arrayBuffer());
          const png = bytes[0] === 0x89 && bytes[1] === 0x50;
          return png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        } catch {
          return null;
        }
      })());
    }
    return cache.get(url)!;
  };
}

export async function embedAssinatura(doc: PDFDocument, url?: string, tipo?: 'DESENHO' | 'SELFIE'): Promise<PDFImage | null> {
  if (!url) return null;
  if (tipo !== 'DESENHO') return criarCarregadorImagens(doc)(url);
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) return null;
    const bitmap = await createImageBitmap(await resposta.blob());
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let indice = 0; indice < pixels.data.length; indice += 4) {
        if (pixels.data[indice] < 10 && pixels.data[indice + 1] < 10 && pixels.data[indice + 2] < 10) {
          pixels.data[indice] = 255;
          pixels.data[indice + 1] = 255;
          pixels.data[indice + 2] = 255;
        }
      }
      context.putImageData(pixels, 0, 0);
      const bytes = await (await fetch(canvas.toDataURL('image/png'))).arrayBuffer();
      return doc.embedPng(bytes);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

export function imagem(page: PDFPage, img: PDFImage | null, x: number, topo: number, largura: number, altura: number) {
  if (!img) return;
  const escala = Math.min(largura / img.width, altura / img.height);
  const w = img.width * escala;
  const h = img.height * escala;
  page.drawImage(img, { x: x + (largura - w) / 2, y: PH - topo - altura + (altura - h) / 2, width: w, height: h });
}

export function caixaMarcacao(page: PDFPage, x: number, topo: number, lado: number, marcado: boolean, f: Fontes, tipo: 'X' | 'CHECK' = 'X') {
  retangulo(page, x, topo, lado, lado * 0.8, undefined, 0.9);
  if (!marcado) return;
  if (tipo === 'CHECK') {
    page.drawText('✔', { x: x + lado * 0.14, y: PH - topo - lado * 0.66, font: f.zapf, size: lado * 0.78, color: GREEN });
    return;
  }
  const h = lado * 0.8;
  linha(page, x + 3, topo + 3, x + lado - 3, topo + h - 3, 1.2, BLACK);
  linha(page, x + lado - 3, topo + 3, x + 3, topo + h - 3, 1.2, BLACK);
}

/** 1 imagem ocupa a célula; 2 lado a lado; 3-4 em grade 2x2. */
export function mosaico(page: PDFPage, imagens: PDFImage[], x: number, topo: number, largura: number, altura: number) {
  const lista = imagens.slice(0, 4);
  if (lista.length <= 1) {
    imagem(page, lista[0] || null, x, topo, largura, altura);
    return;
  }
  const gap = 1.5;
  const linhas = lista.length > 2 ? 2 : 1;
  const w = (largura - gap) / 2;
  const h = (altura - gap * (linhas - 1)) / linhas;
  lista.forEach((img, indice) => imagem(page, img, x + (indice % 2) * (w + gap), topo + Math.floor(indice / 2) * (h + gap), w, h));
}
