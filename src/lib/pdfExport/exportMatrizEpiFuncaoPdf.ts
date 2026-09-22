/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportação em PDF em Paisagem da Matriz de Especificação EPI x Função da TEN.
 * Reproduz com fidelidade absoluta a matriz de exigências de EPIs por cargo/função
 * (54 funções, 31 EPIs, cabeçalho executivo, linhas coloridas, legenda e headcount).
 */

import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { downloadPdf } from './core';
import {
  listarFuncoesEpi,
  listarEpisPorFuncao,
  type SsmaEpiFuncao,
  type SsmaEpiPorFuncao,
} from '../ssmaEpiPorFuncaoApi';
import { listarBookEpis, type SsmaBookEpi } from '../ssmaBookEpisApi';

export interface ExportMatrizEpiFuncaoOptions {
  funcoes?: SsmaEpiFuncao[];
  requisitos?: SsmaEpiPorFuncao[];
  book?: SsmaBookEpi[];
  headcounts?: Record<string, number | string>;
  nomeArquivo?: string;
}

// Headcounts conhecidos da planilha original para cada cargo
export const HEADCOUNTS_PADRAO_TEN: Record<string, number> = {
  'FUN-001': 1, // ALMOXARIFE
  'FUN-002': 3, // ALMOXARIFE FERRAMENTAS
  'FUN-003': 2, // ANALISTA ADMINISTRATIVO
  'FUN-004': 2, // ANALISTA DE CONTROLADORIA I E II
  'FUN-005': 1, // ANALISTA DE ENGENHARIA
  'FUN-006': 1, // ANALISTA DE MANUTENCAO ELETRICA I
  'FUN-007': 1, // ANALISTA DE PLANEJAMENTO I
  'FUN-008': 1, // ANALISTA DE RECURSOS HUMANOS I E II
  'FUN-009': 1, // ANALISTA DE SUPRIMENTOS I E III
};

export function sanitizePdfText(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•·]/g, '-')
    .replace(/[→➔➜➡]/g, '->')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
}

/**
 * Monta e exporta em PDF paisagem (A4) a Matriz de Especificação EPI x Função da TEN.
 */
export async function exportMatrizEpiFuncaoPdf(options: ExportMatrizEpiFuncaoOptions = {}): Promise<void> {
  // Carrega dados se não foram passados pela tela
  const [funcoesCarregadas, requisitosCarregados, bookCarregados] = await Promise.all([
    options.funcoes ?? listarFuncoesEpi(false),
    options.requisitos ?? listarEpisPorFuncao(undefined, false),
    options.book ?? listarBookEpis(false),
  ]);

  // Garante ordenação consistente de funções
  const funcoes = [...funcoesCarregadas].sort((a, b) => {
    const codeA = a.codigo_origem || '';
    const codeB = b.codigo_origem || '';
    return codeA.localeCompare(codeB);
  });

  // Mapeia catálogo do Book de EPIs por ID
  const bookPorId = new Map(bookCarregados.map(b => [b.id, b]));

  // Agrupa e extrai os 31 EPIs distintos presentes nos requisitos
  const episMap = new Map<string, { codigo: string; nome: string; ca: string }>();
  const matrix = new Map<string, { classificacao: string; condicaoUso: string | null }>();

  for (const r of requisitosCarregados) {
    const codEpi = r.codigo_epi_origem;
    if (!episMap.has(codEpi)) {
      const bookItem = r.epi_book_id ? bookPorId.get(r.epi_book_id) : (r.epi_book || null);
      const ca = bookItem?.numero_ca || r.ca_origem || '';
      episMap.set(codEpi, {
        codigo: codEpi,
        nome: r.descricao_epi_origem,
        ca: ca || '',
      });
    }

    // Chave da matriz: funcaoId|codigoEpi ou codigoOrigem|codigoEpi
    matrix.set(`${r.funcao_id}|${codEpi}`, {
      classificacao: r.classificacao,
      condicaoUso: r.condicao_uso,
    });
  }

  // Ordena os EPIs por código sequencial (EPI-001 ... EPI-031) ou alfabeticamente
  const epis = Array.from(episMap.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));

  // Mapa consolidado de headcount por código de função
  const headcounts = new Map<string, number | string>();
  for (const [k, v] of Object.entries(HEADCOUNTS_PADRAO_TEN)) {
    headcounts.set(k, v);
  }
  if (options.headcounts) {
    for (const [k, v] of Object.entries(options.headcounts)) {
      headcounts.set(k, v);
    }
  }

  // Cria documento PDF
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Carrega Logo oficial TEN se disponível no ambiente
  let logoImg = null;
  try {
    const response = await fetch('/logo-ten.png');
    if (response.ok) {
      const logoBytes = await response.arrayBuffer();
      logoImg = await doc.embedPng(logoBytes);
    }
  } catch {
    // Ambiente sem servidor HTTP (ex: testes locais isolados) segue normalmente
  }

  // Formato: A4 Paisagem (841.89 x 595.28 pt)
  const PAGE_WIDTH = 841.89;
  const PAGE_HEIGHT = 595.28;
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const MARGIN_LEFT = 14;
  const MARGIN_RIGHT = 14;
  const MARGIN_TOP = 14;

  const printableWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // ~813.89

  // Top header (Logo + Título)
  let currentY = PAGE_HEIGHT - MARGIN_TOP;

  if (logoImg) {
    const logoH = 26;
    const logoW = (logoImg.width / logoImg.height) * logoH;
    page.drawImage(logoImg, {
      x: MARGIN_LEFT,
      y: currentY - logoH,
      width: logoW,
      height: logoH,
    });
  }

  // Título à direita: "MATRIZ DE ESPECIFICAÇÃO EPI X FUNÇÃO"
  const titleText = 'MATRIZ DE ESPECIFICAÇÃO EPI X FUNÇÃO';
  const titleSize = 13;
  const titleW = fontBold.widthOfTextAtSize(titleText, titleSize);
  page.drawText(titleText, {
    x: PAGE_WIDTH - MARGIN_RIGHT - titleW,
    y: currentY - 18,
    size: titleSize,
    font: fontBold,
    color: rgb(0.08, 0.12, 0.18),
  });

  currentY -= 32; // Início da tabela da matriz

  // Dimensões de colunas
  const COL_EPI_WIDTH = 152;
  const COL_CA_WIDTH = 34;
  const numFuncoes = Math.max(funcoes.length, 1);
  const availableForFuncoes = printableWidth - COL_EPI_WIDTH - COL_CA_WIDTH;
  const COL_FUNCAO_WIDTH = availableForFuncoes / numFuncoes; // ~11.62 pt para 54 funções

  const HEADER_FUNCAO_HEIGHT = 94; // Altura para títulos rotacionados
  const ROW_HEIGHT = 9.8; // 31 linhas * 9.8 = ~303.8 pt

  const tableTopY = currentY;
  const tableHeaderBottomY = tableTopY - HEADER_FUNCAO_HEIGHT;

  // Cores oficiais da matriz
  const COLOR_HEADER_EPI = rgb(0.97, 0.98, 0.99);
  const COLOR_HEADER_CA = rgb(0.66, 0.82, 0.55); // #A9D18E (verde suave)
  const COLOR_HEADER_FUNCAO = rgb(0.97, 0.79, 0.68); // #F8CBAD (pêssego suave)
  const COLOR_BORDER = rgb(0.75, 0.75, 0.75); // Cinza suave para grades
  const COLOR_BORDER_DARK = rgb(0.4, 0.4, 0.4);

  const COLOR_BASICO = rgb(1.0, 0.75, 0.0); // #FFC000 (Ouro / Amarelo)
  const COLOR_ESPECIFICO = rgb(0.88, 0.30, 0.12); // #E14D1F (Laranja / Ferrugem)
  const COLOR_TEXT_RED = rgb(0.80, 0.05, 0.05);

  // 1. Vértice: Cabeçalho da coluna de EPIs com divisão diagonal
  page.drawRectangle({
    x: MARGIN_LEFT,
    y: tableHeaderBottomY,
    width: COL_EPI_WIDTH,
    height: HEADER_FUNCAO_HEIGHT,
    color: COLOR_HEADER_EPI,
    borderColor: COLOR_BORDER,
    borderWidth: 0.5,
  });

  // Linha diagonal no canto superior esquerdo
  page.drawLine({
    start: { x: MARGIN_LEFT, y: tableTopY },
    end: { x: MARGIN_LEFT + COL_EPI_WIDTH, y: tableHeaderBottomY },
    thickness: 0.5,
    color: COLOR_BORDER_DARK,
  });

  // "FUNÇÃO" no canto superior direito
  page.drawText('FUNÇÃO', {
    x: MARGIN_LEFT + COL_EPI_WIDTH - 48,
    y: tableTopY - 14,
    size: 7.5,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  // "EQUIPAMENTO DE PROTEÇÃO INDIVIDUAL" no canto inferior esquerdo
  page.drawText('EQUIPAMENTO DE', {
    x: MARGIN_LEFT + 6,
    y: tableHeaderBottomY + 28,
    size: 6.5,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText('PROTEÇÃO', {
    x: MARGIN_LEFT + 6,
    y: tableHeaderBottomY + 18,
    size: 6.5,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText('INDIVIDUAL', {
    x: MARGIN_LEFT + 6,
    y: tableHeaderBottomY + 8,
    size: 6.5,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  // 2. Coluna "C.A DO EPI"
  const colCaX = MARGIN_LEFT + COL_EPI_WIDTH;
  page.drawRectangle({
    x: colCaX,
    y: tableHeaderBottomY,
    width: COL_CA_WIDTH,
    height: HEADER_FUNCAO_HEIGHT,
    color: COLOR_HEADER_CA,
    borderColor: COLOR_BORDER,
    borderWidth: 0.5,
  });

  // Texto vertical "C.A DO EPI"
  const caHeaderText = 'C.A DO EPI';
  const caHeaderTextSize = 6.5;
  const caHeaderW = fontBold.widthOfTextAtSize(caHeaderText, caHeaderTextSize);
  page.drawText(caHeaderText, {
    x: colCaX + (COL_CA_WIDTH + caHeaderTextSize * 0.8) / 2,
    y: tableHeaderBottomY + (HEADER_FUNCAO_HEIGHT - caHeaderW) / 2,
    size: caHeaderTextSize,
    font: fontBold,
    color: rgb(0.1, 0.2, 0.1),
    rotate: degrees(90),
  });

  // 3. Colunas de cada Função / Cargo (Texto rotacionado 90°)
  funcoes.forEach((funcao, idx) => {
    const colX = colCaX + COL_CA_WIDTH + idx * COL_FUNCAO_WIDTH;
    page.drawRectangle({
      x: colX,
      y: tableHeaderBottomY,
      width: COL_FUNCAO_WIDTH,
      height: HEADER_FUNCAO_HEIGHT,
      color: COLOR_HEADER_FUNCAO,
      borderColor: COLOR_BORDER,
      borderWidth: 0.5,
    });

    const nomeSanitizado = sanitizePdfText(funcao.nome.trim().toUpperCase());
    let fSize = 4.0;
    while (fontBold.widthOfTextAtSize(nomeSanitizado, fSize) > (HEADER_FUNCAO_HEIGHT - 8) && fSize > 3.0) {
      fSize -= 0.2;
    }

    page.drawText(nomeSanitizado, {
      x: colX + (COL_FUNCAO_WIDTH + fSize * 0.7) / 2,
      y: tableHeaderBottomY + 4,
      size: fSize,
      font: fontBold,
      color: rgb(0.12, 0.12, 0.12),
      rotate: degrees(90),
    });
  });

  // 4. Linhas da Matriz para cada EPI
  let rowY = tableHeaderBottomY;

  epis.forEach(epi => {
    rowY -= ROW_HEIGHT;

    // Col 0: Descrição do EPI
    page.drawRectangle({
      x: MARGIN_LEFT,
      y: rowY,
      width: COL_EPI_WIDTH,
      height: ROW_HEIGHT,
      color: rgb(1, 1, 1),
      borderColor: COLOR_BORDER,
      borderWidth: 0.5,
    });

    const epiNome = sanitizePdfText(epi.nome.trim().toUpperCase());
    let epiFontSize = 4.8;
    while (fontBold.widthOfTextAtSize(epiNome, epiFontSize) > (COL_EPI_WIDTH - 6) && epiFontSize > 3.6) {
      epiFontSize -= 0.2;
    }

    page.drawText(epiNome, {
      x: MARGIN_LEFT + 3,
      y: rowY + (ROW_HEIGHT - epiFontSize) / 2 + 1,
      size: epiFontSize,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });

    // Col 1: C.A do EPI
    page.drawRectangle({
      x: colCaX,
      y: rowY,
      width: COL_CA_WIDTH,
      height: ROW_HEIGHT,
      color: rgb(1, 1, 1),
      borderColor: COLOR_BORDER,
      borderWidth: 0.5,
    });

    if (epi.ca) {
      const caText = sanitizePdfText(epi.ca);
      const caSize = 4.5;
      const caW = fontRegular.widthOfTextAtSize(caText, caSize);
      page.drawText(caText, {
        x: colCaX + (COL_CA_WIDTH - caW) / 2,
        y: rowY + (ROW_HEIGHT - caSize) / 2 + 1,
        size: caSize,
        font: fontRegular,
        color: rgb(0.1, 0.1, 0.1),
      });
    }

    // Células de cruzamento com as funções
    funcoes.forEach((funcao, fIdx) => {
      const colX = colCaX + COL_CA_WIDTH + fIdx * COL_FUNCAO_WIDTH;
      // Procura por funcao_id ou por codigo_origem
      const vinculo = matrix.get(`${funcao.id}|${epi.codigo}`) || matrix.get(`${funcao.codigo_origem}|${epi.codigo}`);

      let cellColor = rgb(1, 1, 1);
      if (vinculo?.classificacao === 'BASICO_OBRIGATORIO') {
        cellColor = COLOR_BASICO;
      } else if (vinculo?.classificacao === 'ESPECIFICO_OBRIGATORIO') {
        cellColor = COLOR_ESPECIFICO;
      }

      page.drawRectangle({
        x: colX,
        y: rowY,
        width: COL_FUNCAO_WIDTH,
        height: ROW_HEIGHT,
        color: cellColor,
        borderColor: COLOR_BORDER,
        borderWidth: 0.5,
      });
    });

    // Tarja condicional especial para o ABAFADOR CONCHA
    if (epiNome.includes('ABAFADOR CONCHA')) {
      const noteText = 'Fornecido para atividade onde o nível de tolerância esteja acima do previsto';
      const noteSanitizada = sanitizePdfText(noteText);
      const noteSize = 4.5;
      page.drawText(noteSanitizada, {
        x: colCaX + COL_CA_WIDTH + 14 * COL_FUNCAO_WIDTH,
        y: rowY + 2.5,
        size: noteSize,
        font: fontBold,
        color: COLOR_TEXT_RED,
      });
    }
  });

  // 5. Legenda Oficial no Rodapé da Tabela
  const legendY = rowY - 18;
  const boxW = 12;
  const boxH = 7;
  let legX = MARGIN_LEFT + 2;

  // Bloco 1: Básico Obrigatório
  page.drawRectangle({
    x: legX,
    y: legendY,
    width: boxW,
    height: boxH,
    color: COLOR_BASICO,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.5,
  });
  legX += boxW + 4;

  // Seta vetorial para a direita
  desenharSetaDireita(page, legX, legendY + boxH / 2);
  legX += 12;

  const textBasico = 'EPIs básicos de uso obrigatório de todos os trabalhadores';
  page.drawText(textBasico, {
    x: legX,
    y: legendY + 1.5,
    size: 5.5,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  legX += fontBold.widthOfTextAtSize(textBasico, 5.5) + 24;

  // Bloco 2: Específico Obrigatório
  page.drawRectangle({
    x: legX,
    y: legendY,
    width: boxW,
    height: boxH,
    color: COLOR_ESPECIFICO,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.5,
  });
  legX += boxW + 4;

  // Seta vetorial para a direita
  desenharSetaDireita(page, legX, legendY + boxH / 2);
  legX += 12;

  const textEspec = 'EPI específico de uso obrigatório por função';
  page.drawText(textEspec, {
    x: legX,
    y: legendY + 1.5,
    size: 5.5,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  // 6. Linha "N° DE FUNCIONÁRIOS"
  const countRowY = legendY - 16;

  page.drawRectangle({
    x: MARGIN_LEFT,
    y: countRowY,
    width: COL_EPI_WIDTH + COL_CA_WIDTH,
    height: 10,
    color: rgb(0.96, 0.96, 0.96),
    borderColor: COLOR_BORDER,
    borderWidth: 0.5,
  });

  page.drawText('N° DE FUNCIONÁRIOS', {
    x: MARGIN_LEFT + 3,
    y: countRowY + 2.5,
    size: 5.0,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  funcoes.forEach((funcao, fIdx) => {
    const colX = colCaX + COL_CA_WIDTH + fIdx * COL_FUNCAO_WIDTH;
    page.drawRectangle({
      x: colX,
      y: countRowY,
      width: COL_FUNCAO_WIDTH,
      height: 10,
      color: rgb(1, 1, 1),
      borderColor: COLOR_BORDER,
      borderWidth: 0.5,
    });

    const qtd = headcounts.get(funcao.codigo_origem) || headcounts.get(funcao.id);
    if (qtd !== undefined && qtd !== null) {
      const qStr = String(qtd);
      const qSize = 4.5;
      page.drawText(qStr, {
        x: colX + (COL_FUNCAO_WIDTH + qSize * 0.7) / 2,
        y: countRowY + 2.5,
        size: qSize,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2),
        rotate: degrees(90),
      });
    }
  });

  // Faz o download do PDF
  const nomeFinal = options.nomeArquivo || 'matriz-epi-x-funcao-ten.pdf';
  await downloadPdf(doc, nomeFinal);
}

/**
 * Desenha uma seta vetorial elegante apontando para a direita no PDF.
 */
function desenharSetaDireita(page: any, x: number, y: number): void {
  const comp = 8;
  const ponta = 2.5;

  // Haste
  page.drawLine({
    start: { x, y },
    end: { x: x + comp, y },
    thickness: 1.2,
    color: rgb(0, 0, 0),
  });

  // Ponta superior
  page.drawLine({
    start: { x: x + comp - ponta, y: y + ponta },
    end: { x: x + comp, y },
    thickness: 1.2,
    color: rgb(0, 0, 0),
  });

  // Ponta inferior
  page.drawLine({
    start: { x: x + comp - ponta, y: y - ponta },
    end: { x: x + comp, y },
    thickness: 1.2,
    color: rgb(0, 0, 0),
  });
}
