/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PDF do Termo de Responsabilidade de EPI (FRM.SEG-0008 Rev. 02) no mesmo
 * desenho da ficha em papel: cabeçalho em grade, dados do funcionário, termo,
 * assinatura e a tabela RETIRADA/DEVOLUÇÃO, que continua nas páginas
 * seguintes com as linhas em branco para completar à mão.
 *
 * `mostrarAssinatura` desligado gera a ficha para assinar no papel: os
 * campos de assinatura saem vazios.
 */

import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from 'pdf-lib';
import { createDoc, PAGE_HEIGHT, PAGE_WIDTH, sanitizeText } from './core';
import {
  FICHA_EPI_FORMULARIO,
  MOTIVOS_MED,
  TERMO_FICHA_EPI,
  formatarDataBR,
  linhasGradeFichaEpi,
  type TrechoTermo,
} from '../fichaEpi';
import type { SsmaFichaEpi } from '../ssmaFichaEpiApi';

const M = 28;
const W = PAGE_WIDTH - M * 2;
const PRETO = rgb(0, 0, 0);
const AZUL = rgb(0.12, 0.2, 0.55);
const CINZA = rgb(0.45, 0.45, 0.45);
const VERMELHO = rgb(0.75, 0.1, 0.1);
const TRACO = 0.8;

const ALTURA_LINHA = 22;
const ALTURA_CABECALHO_TABELA = 30;
const ALTURA_LEGENDA = 40;

// Larguras relativas das colunas, medidas no formulário em papel.
const PESOS = [95, 74, 336, 85, 226, 74, 85, 234];
const LARGURAS = PESOS.map(p => (p / PESOS.reduce((a, b) => a + b, 0)) * W);
const XS = LARGURAS.reduce<number[]>((acc, w, i) => [...acc, acc[i] + w], [M]);

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  assinaturas: Map<string, PDFImage>;
}

/**
 * Texto de uma linha só, codificável em WinAnsi. Campos do Book chegam com
 * quebra de linha (ex.: dois CAs na mesma célula) e a quebra derruba a
 * medição de largura do pdf-lib ("WinAnsi cannot encode").
 */
export function textoPdf(t: string | null | undefined, separadorLinhas = ' '): string {
  return sanitizeText(
    String(t ?? '')
      .split(/\s*[\r\n]+\s*/)
      .filter(Boolean)
      .join(separadorLinhas)
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim(),
  );
}

function texto(page: PDFPage, t: string, x: number, y: number, size: number, font: PDFFont, color = PRETO) {
  page.drawText(textoPdf(t), { x, y, size, font, color });
}

function centralizado(page: PDFPage, t: string, x: number, largura: number, y: number, size: number, font: PDFFont, color = PRETO) {
  const limpo = textoPdf(t);
  texto(page, limpo, x + (largura - font.widthOfTextAtSize(limpo, size)) / 2, y, size, font, color);
}

function caixa(page: PDFPage, x: number, yTopo: number, largura: number, altura: number) {
  page.drawRectangle({ x, y: yTopo - altura, width: largura, height: altura, borderColor: PRETO, borderWidth: TRACO });
}

function ajustar(t: string, font: PDFFont, size: number, largura: number): string {
  let s = textoPdf(t);
  if (font.widthOfTextAtSize(s, size) <= largura) return s;
  while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, size) > largura) s = s.slice(0, -1);
  return `${s}...`;
}

function quebrar(t: string, font: PDFFont, size: number, largura: number, maxLinhas: number): string[] {
  const palavras = textoPdf(t).split(' ');
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (font.widthOfTextAtSize(tentativa, size) <= largura) atual = tentativa;
    else {
      if (atual) linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  if (linhas.length <= maxLinhas) return linhas;
  const cortadas = linhas.slice(0, maxLinhas);
  cortadas[maxLinhas - 1] = ajustar(`${cortadas[maxLinhas - 1]} ${linhas[maxLinhas]}`, font, size, largura);
  return cortadas;
}

/** Parágrafo com trechos em negrito, quebrado por palavra. Devolve o novo y. */
function paragrafo(page: PDFPage, ctx: Ctx, trechos: TrechoTermo[], x: number, y: number, largura: number, size: number, entrelinha: number): number {
  // Uma palavra leva espaço antes quando o texto original tinha espaço ali —
  // assim "NORDESTE" em negrito fica colado à vírgula do trecho seguinte.
  const palavras: { p: string; negrito: boolean; espacoAntes: boolean }[] = [];
  let espacoPendente = false;
  for (const trecho of trechos) {
    for (const parte of sanitizeText(trecho.texto).split(/(\s+)/)) {
      if (!parte) continue;
      if (/^\s+$/.test(parte)) {
        espacoPendente = true;
        continue;
      }
      palavras.push({ p: parte, negrito: !!trecho.negrito, espacoAntes: espacoPendente && palavras.length > 0 });
      espacoPendente = false;
    }
  }

  const larguraEspaco = ctx.font.widthOfTextAtSize(' ', size);
  let cursor = x;
  for (const { p, negrito, espacoAntes } of palavras) {
    const font = negrito ? ctx.bold : ctx.font;
    const w = font.widthOfTextAtSize(p, size);
    const espaco = espacoAntes && cursor > x ? larguraEspaco : 0;
    if (cursor > x && cursor + espaco + w > x + largura) {
      y -= entrelinha;
      cursor = x;
    } else {
      cursor += espaco;
    }
    page.drawText(p, { x: cursor, y, size, font, color: PRETO });
    cursor += w;
  }
  return y - entrelinha;
}

function assinaturaNoRetangulo(page: PDFPage, img: PDFImage, x: number, yBase: number, largura: number, altura: number) {
  const escala = Math.min(largura / img.width, altura / img.height);
  const w = img.width * escala;
  const h = img.height * escala;
  page.drawImage(img, { x: x + (largura - w) / 2, y: yBase + (altura - h) / 2, width: w, height: h });
}

function cabecalhoFormulario(page: PDFPage, ctx: Ctx, logo: PDFImage | null, yTopo: number): number {
  const altura = 58;
  const wLogo = W * 0.18;
  const wCodigo = W * 0.2;
  const wTitulo = W - wLogo - wCodigo;
  caixa(page, M, yTopo, wLogo, altura);
  caixa(page, M + wLogo, yTopo, wTitulo, altura);
  caixa(page, M + wLogo + wTitulo, yTopo, wCodigo, altura);

  if (logo) {
    const escala = Math.min((wLogo - 10) / logo.width, (altura - 10) / logo.height);
    const w = logo.width * escala;
    const h = logo.height * escala;
    page.drawImage(logo, { x: M + (wLogo - w) / 2, y: yTopo - altura + (altura - h) / 2, width: w, height: h });
  }
  centralizado(page, FICHA_EPI_FORMULARIO.titulo, M + wLogo, wTitulo, yTopo - 24, 11, ctx.font);
  centralizado(page, FICHA_EPI_FORMULARIO.subtitulo, M + wLogo, wTitulo, yTopo - 40, 11, ctx.font);
  const xc = M + wLogo + wTitulo;
  centralizado(page, FICHA_EPI_FORMULARIO.codigo, xc, wCodigo, yTopo - 17, 9, ctx.font);
  centralizado(page, `Rev.: ${FICHA_EPI_FORMULARIO.revisao}`, xc, wCodigo, yTopo - 31, 9, ctx.font);
  centralizado(page, `Data: ${FICHA_EPI_FORMULARIO.data}`, xc, wCodigo, yTopo - 45, 9, ctx.font);
  return yTopo - altura - 4;
}

function campo(page: PDFPage, ctx: Ctx, rotulo: string, valor: string, x: number, yTopo: number, largura: number, altura: number) {
  caixa(page, x, yTopo, largura, altura);
  const yTexto = yTopo - altura + 6;
  texto(page, rotulo, x + 3, yTexto, 9.5, ctx.bold);
  const wRotulo = ctx.bold.widthOfTextAtSize(sanitizeText(rotulo), 9.5);
  texto(page, ajustar(valor, ctx.font, 9.5, largura - wRotulo - 10), x + wRotulo + 7, yTexto, 9.5, ctx.font, AZUL);
}

function cabecalhoTabela(page: PDFPage, ctx: Ctx, yTopo: number): number {
  const meia = ALTURA_CABECALHO_TABELA / 2;
  // Linha de grupos
  caixa(page, M, yTopo, XS[3] - M, meia);
  caixa(page, XS[3], yTopo, XS[6] - XS[3], meia);
  caixa(page, XS[6], yTopo, XS[8] - XS[6], meia);
  centralizado(page, 'RETIRADA DO FUNCIONÁRIO', XS[3], XS[6] - XS[3], yTopo - meia + 4.5, 8.5, ctx.bold);
  centralizado(page, 'DEVOLUÇÃO', XS[6], XS[8] - XS[6], yTopo - meia + 4.5, 8.5, ctx.bold);
  const titulos = ['C.A.', 'QTD.', 'DESCRIÇÃO', 'DATA', 'ASS. DO FUNCIONÁRIO', 'M.E.D', 'DATA', 'ASS. DO TST'];
  titulos.forEach((t, i) => {
    caixa(page, XS[i], yTopo - meia, LARGURAS[i], meia);
    centralizado(page, t, XS[i], LARGURAS[i], yTopo - ALTURA_CABECALHO_TABELA + 4.5, 7, ctx.bold);
  });
  return yTopo - ALTURA_CABECALHO_TABELA;
}

function legenda(page: PDFPage, ctx: Ctx, yTopo: number) {
  caixa(page, M, yTopo, W, ALTURA_LEGENDA);
  texto(page, 'Legenda M.E.D.: Motivos para a entrega e devolução', M + 3, yTopo - 11, 7.5, ctx.bold);
  texto(page, `1. ${MOTIVOS_MED[1]}`, M + 3, yTopo - 22, 7, ctx.font);
  texto(page, `2. ${MOTIVOS_MED[2]}`, M + 3, yTopo - 33, 7, ctx.font);
  texto(page, `3. ${MOTIVOS_MED[3]}`, XS[3], yTopo - 22, 7, ctx.font);
  texto(page, `4. ${MOTIVOS_MED[4]}`, XS[3], yTopo - 33, 7, ctx.font);
}

function rodape(page: PDFPage, ctx: Ctx, rotulo: string, pagina: number, total: number) {
  texto(page, `SISTEN - ${rotulo}`, M, 14, 6.5, ctx.font, CINZA);
  const pag = `Página ${pagina} de ${total}`;
  texto(page, pag, PAGE_WIDTH - M - ctx.font.widthOfTextAtSize(pag, 6.5), 14, 6.5, ctx.font, CINZA);
}

export interface PdfGerado {
  bytes: Uint8Array;
  nomeArquivo: string;
  titulo: string;
}

/** Gera o PDF sem baixar — a tela mostra a pré-visualização antes. */
export async function gerarFichaEpiPdf(params: {
  /** Uma ficha (a entrega) ou todas as do colaborador (a ficha consolidada). */
  fichas: SsmaFichaEpi[];
  mostrarAssinatura: boolean;
}): Promise<PdfGerado> {
  const ativas = params.fichas.filter(f => f.status === 'ATIVA');
  const base = ativas.length ? ativas : params.fichas;
  if (!base.length) throw new Error('Nenhuma ficha para exportar.');
  const recentes = [...base].sort((a, b) => b.data_entrega.localeCompare(a.data_entrega) || b.created_at.localeCompare(a.created_at));
  const atual = recentes[0];
  const unica = params.fichas.length === 1;
  const cancelada = unica && params.fichas[0].status === 'CANCELADA';

  const { doc, font, fontBold, logo } = await createDoc();
  const ctx: Ctx = { doc, font, bold: fontBold, assinaturas: new Map() };
  if (params.mostrarAssinatura) {
    for (const ficha of params.fichas) {
      if (!ficha.assinatura_colaborador) continue;
      try {
        ctx.assinaturas.set(ficha.id, await doc.embedPng(ficha.assinatura_colaborador));
      } catch (e) {
        console.error(`Assinatura da ficha ${ficha.codigo} ilegível no PDF:`, e);
      }
    }
  }

  // Linhas: a ficha cancelada exportada sozinha ainda mostra seus itens.
  const linhas = linhasGradeFichaEpi(cancelada ? params.fichas.map(f => ({ ...f, status: 'ATIVA' })) : params.fichas);
  const primeiroValor = <K extends keyof SsmaFichaEpi>(campoFicha: K) => recentes.find(f => f[campoFicha])?.[campoFicha] as string | undefined;

  // ---------- Página 1 ----------
  const paginas: PDFPage[] = [];
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  paginas.push(page);
  let y = cabecalhoFormulario(page, ctx, logo, PAGE_HEIGHT - M);

  const hCampo = 20;
  const meio = W * 0.49;
  campo(page, ctx, 'Nome do Funcionário:', atual.nome, M, y, W, hCampo);
  y -= hCampo;
  campo(page, ctx, 'Cargo:', atual.funcao_nome, M, y, W, hCampo);
  y -= hCampo;
  campo(page, ctx, 'Matrícula:', atual.registro, M, y, meio, hCampo);
  campo(page, ctx, 'Setor', atual.setor || '', M + meio, y, W - meio, hCampo);
  y -= hCampo;
  campo(page, ctx, 'Data de Admissão:', formatarDataBR(primeiroValor('data_admissao')), M, y, meio, hCampo);
  campo(page, ctx, 'Data de Demissão:', formatarDataBR(primeiroValor('data_demissao')), M + meio, y, W - meio, hCampo);
  y -= hCampo + 4;

  // Termo
  const yTermoTopo = y;
  const tamanho = 8.6;
  const entrelinha = 11;
  y -= 11;
  TERMO_FICHA_EPI.paragrafos.forEach((trechos, i) => {
    y -= TERMO_FICHA_EPI.espacoAntes[i] * 6;
    y = paragrafo(page, ctx, trechos, M + 3, y, W - 6, tamanho, entrelinha);
  });

  // Assinatura do termo: a da ficha mais recente
  y -= 30;
  const wLinha = W * 0.67;
  const xLinha = M + (W - wLinha) / 2;
  const imgTermo = ctx.assinaturas.get(atual.id);
  if (imgTermo) assinaturaNoRetangulo(page, imgTermo, xLinha, y + 1, wLinha, 34);
  page.drawLine({ start: { x: xLinha, y }, end: { x: xLinha + wLinha, y }, thickness: TRACO, color: PRETO });
  centralizado(page, 'Assinatura do Funcionário', xLinha, wLinha, y - 12, 9, font);
  if (imgTermo) centralizado(page, `Assinado digitalmente em ${formatarDataBR(atual.assinado_em.slice(0, 10))}`, xLinha, wLinha, y - 22, 6.5, font, CINZA);
  y -= 30;
  caixa(page, M, yTermoTopo, W, yTermoTopo - y);
  y -= 4;

  if (cancelada) {
    texto(page, `FICHA CANCELADA: ${params.fichas[0].cancelamento_motivo || ''}`, M, PAGE_HEIGHT - M + 6, 8, fontBold, VERMELHO);
  }

  // ---------- Tabela, com continuação ----------
  let indice = 0;
  const desenharLinhas = (yInicio: number, capacidade: number) => {
    let yl = yInicio;
    for (let n = 0; n < capacidade; n++) {
      const linha = linhas[indice];
      LARGURAS.forEach((w, i) => caixa(page, XS[i], yl, w, ALTURA_LINHA));
      if (linha) {
        const yTexto = yl - ALTURA_LINHA / 2 - 2.5;
        centralizado(page, ajustar(textoPdf(linha.ca, ' / '), font, 7, LARGURAS[0] - 4), XS[0], LARGURAS[0], yTexto, 7, font);
        centralizado(page, linha.quantidade, XS[1], LARGURAS[1], yTexto, 7.5, font);
        const desc = quebrar(linha.descricao, font, 6.5, LARGURAS[2] - 6, 2);
        desc.forEach((l, i) => texto(page, l, XS[2] + 3, yl - (desc.length === 1 ? ALTURA_LINHA / 2 + 2.5 : 9 + i * 8), 6.5, font));
        centralizado(page, formatarDataBR(linha.dataEntrega), XS[3], LARGURAS[3], yTexto, 6.5, font);
        const img = ctx.assinaturas.get(linha.fichaId);
        if (img) assinaturaNoRetangulo(page, img, XS[4] + 2, yl - ALTURA_LINHA + 1, LARGURAS[4] - 4, ALTURA_LINHA - 2);
        centralizado(page, String(linha.motivo), XS[5], LARGURAS[5], yTexto, 7.5, font);
        if (linha.dataDevolucao) {
          centralizado(page, formatarDataBR(linha.dataDevolucao), XS[6], LARGURAS[6], yTexto, 6.5, font);
          if (linha.devolucaoPor) {
            centralizado(page, ajustar(linha.devolucaoPor, font, 6, LARGURAS[7] - 4), XS[7], LARGURAS[7], yTexto + 3, 6, font);
            centralizado(page, 'registro digital', XS[7], LARGURAS[7], yTexto - 5, 5, font, CINZA);
          }
        }
      }
      indice++;
      yl -= ALTURA_LINHA;
    }
    return yl;
  };

  const capacidade = (yTopo: number) => Math.max(0, Math.floor((yTopo - ALTURA_CABECALHO_TABELA - ALTURA_LEGENDA - M) / ALTURA_LINHA));

  y = cabecalhoTabela(page, ctx, y);
  y = desenharLinhas(y, capacidade(y + ALTURA_CABECALHO_TABELA));
  legenda(page, ctx, y);

  while (indice < linhas.length) {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    paginas.push(page);
    y = cabecalhoTabela(page, ctx, PAGE_HEIGHT - M);
    y = desenharLinhas(y, capacidade(PAGE_HEIGHT - M));
    legenda(page, ctx, y);
  }

  const rotulo = unica
    ? `Ficha ${params.fichas[0].codigo} - entrega de ${formatarDataBR(params.fichas[0].data_entrega)}`
    : `Ficha consolidada de ${atual.nome} (${ativas.length} entrega${ativas.length === 1 ? '' : 's'})`;
  paginas.forEach((p, i) => rodape(p, ctx, rotulo, i + 1, paginas.length));

  const slug = atual.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_');
  const nome = unica ? `ficha-epi-${params.fichas[0].codigo}-${slug}.pdf` : `ficha-epi-consolidada-${atual.registro}-${slug}.pdf`;
  return { bytes: await doc.save(), nomeArquivo: nome, titulo: rotulo };
}
