/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PDF do catálogo de itens da BOM (Almox > Cadastro de Itens > Itens BOM).
 *
 * Primeira página: resumo do projeto e sumário por seção. Depois, um capítulo
 * por seção, com a árvore da BOM: nível, recuo, foto, descrição, part number,
 * código SAP e equivalente Qingdao, grupo, localização e quantidade por torre.
 * Cabeçalho e rodapé vêm do core, como nos demais PDFs executivos do SISTEN.
 */

import { rgb, type PDFDocument, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import {
  createDoc, PdfTextWriter, docToPdfGerado, MARGIN, PAGE_WIDTH, PDF_COLORS, sanitizeText, type PdfGerado,
} from './core';
import { rotuloSecao, type CapituloCatalogo, type CatalogoBom, type LinhaCatalogo } from '../catalogoBom';
import { embutirFotoPdf, LADO_FOTO } from './fotosPdf';

export type { PdfGerado };

export interface MetaCatalogoBom {
  /** Nome do projeto como aparece na tela, ex.: "GW JACOBINA". */
  projeto: string;
  /** Nome de quem emitiu o catálogo. */
  emitidoPor: string;
}

const LARGURA_CONTEUDO = PAGE_WIDTH - MARGIN * 2;
const H_LINHA = 24;
const H_CABECALHO = 16;
const LADO_CAIXA_FOTO = 20;
const RECUO_POR_NIVEL = 8;
const DOWNLOADS_SIMULTANEOS = 6;

type Alinhamento = 'left' | 'center' | 'right';

const COLUNAS: { rotulo: string; largura: number; alinhamento: Alinhamento }[] = [
  { rotulo: 'Nível', largura: 30, alinhamento: 'center' },
  { rotulo: 'Foto', largura: 30, alinhamento: 'center' },
  { rotulo: 'Descrição', largura: 170, alinhamento: 'left' },
  { rotulo: 'Part number', largura: 116, alinhamento: 'left' },
  { rotulo: 'Grupo', largura: 74, alinhamento: 'left' },
  { rotulo: 'Localização', largura: 48, alinhamento: 'center' },
  { rotulo: 'Qtd/torre', largura: 47, alinhamento: 'right' },
];

/** X inicial de cada coluna, a partir da margem. */
const POSICOES_X = COLUNAS.reduce<number[]>((xs, c, i) => {
  xs.push(i === 0 ? MARGIN : xs[i - 1] + COLUNAS[i - 1].largura);
  return xs;
}, []);

const TEXTO_LEITURA = [
  'Cada capítulo é uma seção da BOM: S1 a S5 são os cinco tramos da torre; Junção S1-S2 são os flanges entre dois tramos;',
  'Torre reúne os itens gerais. Dentro do capítulo, a indentação segue os níveis da BOM: a peça recuada pertence ao conjunto',
  'acima dela. A coluna Nível traz o nível original (L1 = conjunto principal). Qtd/torre é a quantidade por torre, já',
  'multiplicada pelos níveis acima. Uma mesma peça pode aparecer em mais de um conjunto. Conjuntos aparecem em destaque.',
].join(' ');

interface Fontes {
  normal: PDFFont;
  negrito: PDFFont;
}

/** Corta o texto com reticências até caber na largura. */
function encaixar(texto: string, fonte: PDFFont, tamanho: number, larguraMax: number): string {
  const limpo = sanitizeText(texto);
  if (fonte.widthOfTextAtSize(limpo, tamanho) <= larguraMax) return limpo;
  let corte = limpo;
  while (corte.length > 0 && fonte.widthOfTextAtSize(`${corte}...`, tamanho) > larguraMax) {
    corte = corte.slice(0, -1);
  }
  return corte ? `${corte.trimEnd()}...` : '';
}

interface OpcoesTexto {
  x: number;
  /** Linha de base do texto. */
  y: number;
  largura: number;
  tamanho: number;
  cor: RGB;
  alinhamento?: Alinhamento;
  fonte: PDFFont;
}

/** Escreve um texto dentro de uma célula; as margens internas valem só para alinhamento à esquerda e à direita. */
function escrever(page: PDFPage, texto: string, opcoes: OpcoesTexto): void {
  const { x, y, largura, tamanho, cor, fonte } = opcoes;
  const alinhamento = opcoes.alinhamento ?? 'left';
  const padding = alinhamento === 'center' ? 0 : 4;
  const t = encaixar(texto, fonte, tamanho, largura - padding * 2);
  const w = fonte.widthOfTextAtSize(t, tamanho);
  let px = x + padding;
  if (alinhamento === 'center') px = x + (largura - w) / 2;
  if (alinhamento === 'right') px = x + largura - padding - w;
  if (t) page.drawText(t, { x: px, y, size: tamanho, font: fonte, color: cor });
}

const BRANCO = rgb(1, 1, 1);

function cabecalhoColunas(writer: PdfTextWriter, fontes: Fontes): void {
  const page = writer.getPage();
  const base = writer.getY() - H_CABECALHO;
  page.drawRectangle({ x: MARGIN, y: base, width: LARGURA_CONTEUDO, height: H_CABECALHO, color: PDF_COLORS.tableHeaderBg });
  COLUNAS.forEach((c, i) => {
    escrever(page, c.rotulo, {
      x: POSICOES_X[i], y: base + 5.2, largura: c.largura, tamanho: 6.8,
      cor: BRANCO, alinhamento: c.alinhamento, fonte: fontes.negrito,
    });
  });
  writer.setY(base);
}

function desenharFoto(page: PDFPage, x: number, base: number, imagem: PDFImage | null, temUrl: boolean, fonte: PDFFont): void {
  const caixaX = x + (COLUNAS[1].largura - LADO_CAIXA_FOTO) / 2;
  const caixaY = base + (H_LINHA - LADO_CAIXA_FOTO) / 2;
  if (imagem) {
    const escala = Math.min(LADO_CAIXA_FOTO / imagem.width, LADO_CAIXA_FOTO / imagem.height);
    const w = imagem.width * escala;
    const h = imagem.height * escala;
    page.drawImage(imagem, { x: caixaX + (LADO_CAIXA_FOTO - w) / 2, y: caixaY + (LADO_CAIXA_FOTO - h) / 2, width: w, height: h });
    return;
  }
  page.drawRectangle({
    x: caixaX, y: caixaY, width: LADO_CAIXA_FOTO, height: LADO_CAIXA_FOTO,
    borderColor: PDF_COLORS.cardBorder, borderWidth: 0.5,
  });
  const aviso = temUrl ? 'falhou' : 'sem foto';
  escrever(page, aviso, {
    x, y: caixaY + LADO_CAIXA_FOTO / 2 - 1.5, largura: COLUNAS[1].largura, tamanho: 4.5,
    cor: PDF_COLORS.mutedLabel, alinhamento: 'center', fonte,
  });
}

function desenharLinha(writer: PdfTextWriter, fontes: Fontes, linha: LinhaCatalogo, zebra: boolean, imagem: PDFImage | null): void {
  const page = writer.getPage();
  const topo = writer.getY();
  const base = topo - H_LINHA;
  const meio = base + H_LINHA / 2;

  if (linha.conjunto) {
    page.drawRectangle({ x: MARGIN, y: base, width: LARGURA_CONTEUDO, height: H_LINHA, color: PDF_COLORS.cardBg });
  } else if (zebra) {
    page.drawRectangle({ x: MARGIN, y: base, width: LARGURA_CONTEUDO, height: H_LINHA, color: PDF_COLORS.tableRowAlt });
  }
  page.drawLine({
    start: { x: MARGIN, y: base }, end: { x: PAGE_WIDTH - MARGIN, y: base },
    thickness: 0.4, color: PDF_COLORS.borderLight,
  });

  const negrito = linha.conjunto ? fontes.negrito : fontes.normal;
  escrever(page, String(linha.nivel), {
    x: POSICOES_X[0], y: meio - 2.6, largura: COLUNAS[0].largura, tamanho: 7.4,
    cor: PDF_COLORS.darkText, alinhamento: 'center', fonte: fontes.negrito,
  });
  desenharFoto(page, POSICOES_X[1], base, imagem, Boolean(linha.urlFoto), fontes.normal);

  // Descrição, recuada pelo nível dentro do capítulo; o inglês vai na segunda linha.
  const recuo = linha.recuo * RECUO_POR_NIVEL;
  const xDesc = POSICOES_X[2] + recuo;
  const larguraDesc = COLUNAS[2].largura - recuo;
  if (linha.descricaoEn) {
    escrever(page, linha.descricao, { x: xDesc, y: topo - 9.6, largura: larguraDesc, tamanho: 7.2, cor: PDF_COLORS.darkText, fonte: negrito });
    escrever(page, linha.descricaoEn, { x: xDesc, y: topo - 18.6, largura: larguraDesc, tamanho: 5.8, cor: PDF_COLORS.mutedLabel, fonte: fontes.normal });
  } else {
    escrever(page, linha.descricao, { x: xDesc, y: meio - 2.6, largura: larguraDesc, tamanho: 7.2, cor: PDF_COLORS.darkText, fonte: negrito });
  }

  // Part number, com SAP e equivalente Qingdao na segunda linha.
  const complementos = [
    linha.codSap ? `SAP ${linha.codSap}` : '',
    linha.qingdao ? `Qingdao ${linha.qingdao}` : '',
  ].filter(Boolean).join('  ·  ');
  if (complementos) {
    escrever(page, linha.partNumber, { x: POSICOES_X[3], y: topo - 9.6, largura: COLUNAS[3].largura, tamanho: 7.2, cor: PDF_COLORS.darkText, fonte: fontes.negrito });
    escrever(page, complementos, { x: POSICOES_X[3], y: topo - 18.6, largura: COLUNAS[3].largura, tamanho: 5.8, cor: PDF_COLORS.mutedLabel, fonte: fontes.normal });
  } else {
    escrever(page, linha.partNumber, { x: POSICOES_X[3], y: meio - 2.6, largura: COLUNAS[3].largura, tamanho: 7.2, cor: PDF_COLORS.darkText, fonte: fontes.negrito });
  }

  escrever(page, linha.grupo || '—', { x: POSICOES_X[4], y: meio - 2.2, largura: COLUNAS[4].largura, tamanho: 6.2, cor: PDF_COLORS.bodyText, fonte: fontes.normal });
  escrever(page, linha.localizacao || '—', { x: POSICOES_X[5], y: meio - 2.6, largura: COLUNAS[5].largura, tamanho: 7, cor: PDF_COLORS.darkText, alinhamento: 'center', fonte: fontes.negrito });
  const qtd = linha.qtdPorTorre === null ? '—' : linha.qtdPorTorre.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  escrever(page, qtd, { x: POSICOES_X[6], y: meio - 2.6, largura: COLUNAS[6].largura, tamanho: 7.4, cor: PDF_COLORS.darkText, alinhamento: 'right', fonte: fontes.negrito });

  writer.setY(base);
}

function desenharCapitulo(writer: PdfTextWriter, fontes: Fontes, capitulo: CapituloCatalogo, fotos: Map<string, PDFImage | null>): void {
  writer.ensureSpace(90);
  writer.drawSectionHeader(rotuloSecao(capitulo.secao), `${capitulo.totais.linhas} linhas · ${capitulo.totais.pecas} peças`);
  cabecalhoColunas(writer, fontes);

  capitulo.linhas.forEach((linha, i) => {
    const paginaAntes = writer.getPage();
    // Reserva o cabeçalho também: se a página virar, ele é redesenhado antes da linha.
    writer.ensureSpace(H_LINHA + H_CABECALHO);
    if (writer.getPage() !== paginaAntes) cabecalhoColunas(writer, fontes);
    const imagem = linha.urlFoto ? fotos.get(linha.urlFoto) ?? null : null;
    desenharLinha(writer, fontes, linha, i % 2 === 1, imagem);
  });
  writer.spacer(12);
}

/**
 * Miniatura de cada foto (ver `fotosPdf.ts`: reduzida e guardada no aparelho,
 * então exportar de novo só baixa as fotos novas), em poucos downloads simultâneos.
 */
async function carregarFotos(doc: PDFDocument, urls: string[]): Promise<Map<string, PDFImage | null>> {
  const mapa = new Map<string, PDFImage | null>();
  const fila = [...new Set(urls)];
  const trabalhador = async () => {
    let url = fila.shift();
    while (url !== undefined) {
      mapa.set(url, await embutirFotoPdf(doc, url, LADO_FOTO.MINIATURA));
      url = fila.shift();
    }
  };
  await Promise.all(Array.from({ length: DOWNLOADS_SIMULTANEOS }, trabalhador));
  return mapa;
}

const fmtInt = (v: number) => v.toLocaleString('pt-BR');

/** Monta o PDF do catálogo. Fotos que não carregam saem como caixa "falhou", sem derrubar o documento. */
export async function gerarPdfCatalogoBom(catalogo: CatalogoBom, meta: MetaCatalogoBom): Promise<PdfGerado> {
  const { doc, font, fontBold, logo } = await createDoc();
  doc.setTitle(`Catálogo de itens da BOM — ${meta.projeto}`);
  const writer = new PdfTextWriter(doc, font, fontBold, logo);
  const fontes: Fontes = { normal: font, negrito: fontBold };

  const urls = catalogo.capitulos.flatMap((c) => c.linhas.map((l) => l.urlFoto)).filter((u): u is string => Boolean(u));
  const fotos = await carregarFotos(doc, urls);

  const { totais } = catalogo;
  writer.drawDocumentHeader({
    title: 'Catálogo de Itens da BOM',
    formCode: 'CATÁLOGO BOM',
    emissionDate: new Date().toLocaleDateString('pt-BR'),
  });
  writer.drawInfoGrid([
    { label: 'Projeto', value: meta.projeto },
    { label: 'Emitido por', value: meta.emitidoPor || '—' },
    { label: 'Linhas da BOM', value: `${fmtInt(totais.linhas)} (uma por uso da peça)` },
    { label: 'Peças distintas', value: fmtInt(totais.pecas) },
    { label: 'Linhas de conjunto', value: fmtInt(totais.conjuntos) },
    { label: 'Seções', value: catalogo.capitulos.map((c) => c.secao).join(', ') || '—' },
    { label: 'Com foto', value: `${fmtInt(totais.comFoto)} de ${fmtInt(totais.pecas)} peças` },
    { label: 'Com localização', value: `${fmtInt(totais.comLocalizacao)} de ${fmtInt(totais.pecas)} peças` },
  ], 2);

  writer.drawSectionHeader('Sumário por seção');
  writer.drawTable(
    [
      { label: 'Seção', width: 170 },
      { label: 'Linhas', width: 70, align: 'right' },
      { label: 'Peças', width: 70, align: 'right' },
      { label: 'Com foto', width: 80, align: 'right' },
      { label: 'Com localização', width: 125, align: 'right' },
    ],
    [
      ...catalogo.capitulos.map((c) => [
        rotuloSecao(c.secao),
        fmtInt(c.totais.linhas),
        fmtInt(c.totais.pecas),
        fmtInt(c.totais.comFoto),
        fmtInt(c.totais.comLocalizacao),
      ]),
      ['Total da BOM', fmtInt(totais.linhas), fmtInt(totais.pecas), fmtInt(totais.comFoto), fmtInt(totais.comLocalizacao)],
    ],
  );
  writer.spacer(10);
  writer.drawCallout('Como ler este catálogo', TEXTO_LEITURA);

  for (const capitulo of catalogo.capitulos) {
    writer.addNewPage();
    desenharCapitulo(writer, fontes, capitulo, fotos);
  }

  writer.finalizeDoc('CATÁLOGO BOM');
  const nomeArquivo = `catalogo-bom-${meta.projeto.trim().toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;
  return docToPdfGerado(doc, nomeArquivo, `Catálogo de itens da BOM — ${meta.projeto}`);
}
