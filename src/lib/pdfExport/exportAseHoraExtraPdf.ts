/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportacao em PDF do formulario ASE - Hora Extra (FRM.RHU-0007)
 * com tabela estruturada e formatada para os colaboradores.
 */

import { rgb } from 'pdf-lib';
import type { AseHoraExtraCompleta, AseHoraExtraItem } from '../../types';
import { createDoc, PdfTextWriter, downloadPdf, sanitizeText, MARGIN, PAGE_HEIGHT, PAGE_WIDTH } from './core';
import { diaDaSemana } from '../rhApi';

function formatDataBR(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const STATUS_LABELS: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  ENVIADO: 'Enviado',
  CANCELADO: 'Cancelado',
};

interface ColumnDef {
  key: string;
  label: string;
  width: number;
  align: 'left' | 'center' | 'right';
}

const COLUMNS: ColumnDef[] = [
  { key: 'registro', label: 'MATRÍCULA', width: 56, align: 'center' },
  { key: 'colaborador', label: 'COLABORADOR / FUNÇÃO', width: 172, align: 'left' },
  { key: 'transporte', label: 'TRANSP.', width: 36, align: 'center' },
  { key: 'refeicao', label: 'REFEIÇÃO', width: 40, align: 'center' },
  { key: 'horario', label: 'HORÁRIO', width: 75, align: 'center' },
  { key: 'intervalo', label: 'INTERV.', width: 38, align: 'center' },
  { key: 'percentual', label: '% HE', width: 38, align: 'center' },
  { key: 'total', label: 'TOTAL', width: 44, align: 'right' },
];

const TOTAL_TABLE_WIDTH = COLUMNS.reduce((acc, col) => acc + col.width, 0); // 499 pt

function drawTableHeader(writer: PdfTextWriter) {
  const page = writer.getPage();
  const fontBold = writer.getFontBold();
  const currentY = writer.getY();
  const headerHeight = 18;

  // Background escuro para cabeçalho da tabela
  page.drawRectangle({
    x: MARGIN,
    y: currentY - headerHeight,
    width: TOTAL_TABLE_WIDTH,
    height: headerHeight,
    color: rgb(0.12, 0.20, 0.32),
  });

  let curX = MARGIN;
  const textY = currentY - headerHeight + 5.5;

  COLUMNS.forEach(col => {
    const text = sanitizeText(col.label);
    const fontSize = 7;
    const textWidth = fontBold.widthOfTextAtSize(text, fontSize);

    let textX = curX + 4;
    if (col.align === 'center') {
      textX = curX + (col.width - textWidth) / 2;
    } else if (col.align === 'right') {
      textX = curX + col.width - 4 - textWidth;
    }

    page.drawText(text, {
      x: textX,
      y: textY,
      size: fontSize,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    curX += col.width;
  });

  writer.setY(currentY - headerHeight);
}

function drawTableRow(writer: PdfTextWriter, item: AseHoraExtraItem, index: number) {
  const font = writer.getFont();
  const fontBold = writer.getFontBold();

  const hasObs = Boolean(item.observacao?.trim());
  const hasCargo = Boolean(item.cargo?.trim());

  // Calcula a altura da linha com base no conteúdo
  let rowHeight = 20;
  if (hasCargo && hasObs) {
    rowHeight = 34;
  } else if (hasCargo || hasObs) {
    rowHeight = 26;
  }

  // Verifica quebra de página
  if (writer.getY() - rowHeight < MARGIN + 25) {
    writer.ensureSpace(rowHeight + 35);
    drawTableHeader(writer);
  }

  const page = writer.getPage();
  const currentY = writer.getY();
  const rowY = currentY - rowHeight;

  // Fundo zebrado
  const bgColor = index % 2 === 0 ? rgb(0.97, 0.98, 0.99) : rgb(1, 1, 1);
  page.drawRectangle({
    x: MARGIN,
    y: rowY,
    width: TOTAL_TABLE_WIDTH,
    height: rowHeight,
    color: bgColor,
    borderColor: rgb(0.86, 0.89, 0.93),
    borderWidth: 0.5,
  });

  let curX = MARGIN;

  COLUMNS.forEach(col => {
    const pad = 4;
    const colRight = curX + col.width;

    if (col.key === 'registro') {
      const text = sanitizeText(item.registro);
      const textWidth = font.widthOfTextAtSize(text, 7.5);
      const textX = curX + (col.width - textWidth) / 2;
      page.drawText(text, {
        x: textX,
        y: rowY + (rowHeight / 2) - 3,
        size: 7.5,
        font,
        color: rgb(0.2, 0.25, 0.35),
      });
    } else if (col.key === 'colaborador') {
      const maxColabWidth = col.width - (pad * 2);
      let nomeStr = sanitizeText(item.nome);
      if (fontBold.widthOfTextAtSize(nomeStr, 7.5) > maxColabWidth) {
        while (nomeStr.length > 3 && fontBold.widthOfTextAtSize(nomeStr + '...', 7.5) > maxColabWidth) {
          nomeStr = nomeStr.slice(0, -1);
        }
        nomeStr += '...';
      }

      let startTextY = rowY + rowHeight - 9;
      if (!hasCargo && !hasObs) {
        startTextY = rowY + (rowHeight / 2) - 3;
      }

      page.drawText(nomeStr, {
        x: curX + pad,
        y: startTextY,
        size: 7.5,
        font: fontBold,
        color: rgb(0.1, 0.12, 0.18),
      });

      if (hasCargo) {
        let cargoStr = sanitizeText(item.cargo || '');
        if (font.widthOfTextAtSize(cargoStr, 6.5) > maxColabWidth) {
          while (cargoStr.length > 3 && font.widthOfTextAtSize(cargoStr + '...', 6.5) > maxColabWidth) {
            cargoStr = cargoStr.slice(0, -1);
          }
          cargoStr += '...';
        }
        page.drawText(cargoStr, {
          x: curX + pad,
          y: startTextY - 8.5,
          size: 6.5,
          font,
          color: rgb(0.42, 0.48, 0.55),
        });
      }

      if (hasObs) {
        const obsY = hasCargo ? startTextY - 16.5 : startTextY - 8.5;
        let obsStr = `Obs: ${sanitizeText(item.observacao || '')}`;
        if (font.widthOfTextAtSize(obsStr, 6) > maxColabWidth) {
          while (obsStr.length > 3 && font.widthOfTextAtSize(obsStr + '...', 6) > maxColabWidth) {
            obsStr = obsStr.slice(0, -1);
          }
          obsStr += '...';
        }
        page.drawText(obsStr, {
          x: curX + pad,
          y: obsY,
          size: 6,
          font,
          color: rgb(0.55, 0.4, 0.15),
        });
      }
    } else if (col.key === 'transporte') {
      const text = item.transporte ? 'X' : '-';
      const fontToUse = item.transporte ? fontBold : font;
      const textWidth = fontToUse.widthOfTextAtSize(text, 8);
      page.drawText(text, {
        x: curX + (col.width - textWidth) / 2,
        y: rowY + (rowHeight / 2) - 3,
        size: 8,
        font: fontToUse,
        color: item.transporte ? rgb(0.12, 0.20, 0.32) : rgb(0.65, 0.7, 0.75),
      });
    } else if (col.key === 'refeicao') {
      const text = item.refeicao ? 'X' : '-';
      const fontToUse = item.refeicao ? fontBold : font;
      const textWidth = fontToUse.widthOfTextAtSize(text, 8);
      page.drawText(text, {
        x: curX + (col.width - textWidth) / 2,
        y: rowY + (rowHeight / 2) - 3,
        size: 8,
        font: fontToUse,
        color: item.refeicao ? rgb(0.12, 0.20, 0.32) : rgb(0.65, 0.7, 0.75),
      });
    } else if (col.key === 'horario') {
      const text = (item.hora_entrada && item.hora_saida)
        ? `${item.hora_entrada} - ${item.hora_saida}`
        : '-';
      const textWidth = font.widthOfTextAtSize(text, 7);
      page.drawText(text, {
        x: curX + (col.width - textWidth) / 2,
        y: rowY + (rowHeight / 2) - 3,
        size: 7,
        font,
        color: rgb(0.15, 0.2, 0.28),
      });
    } else if (col.key === 'intervalo') {
      const text = item.intervalo_minutos ? `${item.intervalo_minutos}m` : '0m';
      const textWidth = font.widthOfTextAtSize(text, 7);
      page.drawText(text, {
        x: curX + (col.width - textWidth) / 2,
        y: rowY + (rowHeight / 2) - 3,
        size: 7,
        font,
        color: rgb(0.3, 0.35, 0.42),
      });
    } else if (col.key === 'percentual') {
      const text = item.percentual_he != null ? `${item.percentual_he}%` : '-';
      const textWidth = font.widthOfTextAtSize(text, 7.5);
      page.drawText(text, {
        x: curX + (col.width - textWidth) / 2,
        y: rowY + (rowHeight / 2) - 3,
        size: 7.5,
        font: item.percentual_he === 100 ? fontBold : font,
        color: item.percentual_he === 100 ? rgb(0.1, 0.35, 0.7) : rgb(0.2, 0.25, 0.3),
      });
    } else if (col.key === 'total') {
      const text = item.total_horas != null ? `${item.total_horas.toFixed(2)}h` : '0.00h';
      const textWidth = fontBold.widthOfTextAtSize(text, 7.5);
      page.drawText(text, {
        x: colRight - pad - textWidth,
        y: rowY + (rowHeight / 2) - 3,
        size: 7.5,
        font: fontBold,
        color: rgb(0.1, 0.15, 0.25),
      });
    }

    curX += col.width;
  });

  writer.setY(rowY);
}

function drawTableFooter(writer: PdfTextWriter, totalHoras: number, totalColaboradores: number) {
  if (writer.getY() - 22 < MARGIN) {
    writer.ensureSpace(30);
    drawTableHeader(writer);
  }

  const page = writer.getPage();
  const fontBold = writer.getFontBold();
  const currentY = writer.getY();
  const footerHeight = 22;
  const rowY = currentY - footerHeight;

  // Background do total
  page.drawRectangle({
    x: MARGIN,
    y: rowY,
    width: TOTAL_TABLE_WIDTH,
    height: footerHeight,
    color: rgb(0.92, 0.94, 0.97),
    borderColor: rgb(0.78, 0.82, 0.88),
    borderWidth: 0.75,
  });

  // Texto Total Geral
  const label = `TOTAL GERAL (${totalColaboradores} COLABORADOR${totalColaboradores !== 1 ? 'ES' : ''}):`;
  page.drawText(label, {
    x: MARGIN + 8,
    y: rowY + 7,
    size: 8,
    font: fontBold,
    color: rgb(0.15, 0.22, 0.35),
  });

  // Valor das horas totais
  const valorStr = `${totalHoras.toFixed(2)}h`;
  const valorWidth = fontBold.widthOfTextAtSize(valorStr, 9);
  page.drawText(valorStr, {
    x: MARGIN + TOTAL_TABLE_WIDTH - 8 - valorWidth,
    y: rowY + 6.5,
    size: 9,
    font: fontBold,
    color: rgb(0.08, 0.35, 0.2),
  });

  writer.setY(rowY - 14);
}

export async function exportAseHoraExtraPdf(solicitacao: AseHoraExtraCompleta): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc('/logo-adm.png');
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  // Título e identificador do formulário
  writer.drawTitle('ASE - Autorização para Serviços Extraordinários');
  writer.spacer(2);

  // Bloco de cabeçalho / Informações Gerais
  const statusFormatado = STATUS_LABELS[solicitacao.status] || solicitacao.status;
  const dataExtenso = `${formatDataBR(solicitacao.data_execucao)} (${diaDaSemana(solicitacao.data_execucao)})`;

  writer.drawField('Código do Formulário', solicitacao.codigo_formulario || 'FRM.RHU-0007 (Rev. 00)');
  writer.drawField('Protocolo', solicitacao.numero_protocolo);
  writer.drawField('Status', statusFormatado);
  writer.drawField('Setor', solicitacao.setor_nome || '-');
  writer.drawField('Turno', solicitacao.turno_nome || '-');
  writer.drawField('Data de Execução', dataExtenso);
  writer.drawField('Solicitante', solicitacao.solicitante_nome || '-');

  if (solicitacao.justificativa?.trim()) {
    writer.drawField('Justificativa', solicitacao.justificativa);
  }

  writer.spacer(8);
  writer.drawSubtitle(`Colaboradores Autorizados (${solicitacao.itens.length})`);
  writer.spacer(4);

  if (solicitacao.itens.length === 0) {
    writer.drawTableRow('Nenhum colaborador adicionado a esta solicitação.');
  } else {
    // Desenha tabela formatada
    drawTableHeader(writer);
    solicitacao.itens.forEach((item, index) => {
      drawTableRow(writer, item, index);
    });

    const totalHoras = solicitacao.itens.reduce((acc, it) => acc + (it.total_horas || 0), 0);
    drawTableFooter(writer, totalHoras, solicitacao.itens.length);
  }

  await downloadPdf(doc, `ase-hora-extra-${solicitacao.numero_protocolo}.pdf`);
}

// =====================================================================
// EXPORTAÇÃO CONSOLIDADA DO DIA (PDF E EXCEL)
// =====================================================================

import * as XLSX from 'xlsx';

interface ColabConsolidadoItem extends AseHoraExtraItem {
  protocolo_ase: string;
  setor_nome: string;
  turno_nome: string;
  solicitante_nome: string;
  status_ase: string;
}

export async function exportAseConsolidadoDiaPdf(solicitacoes: AseHoraExtraCompleta[], dataExecucao: string): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc('/logo-adm.png');
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  // Consolidação de dados
  const todosColaboradores: ColabConsolidadoItem[] = solicitacoes.flatMap(s =>
    s.itens.map(it => ({
      ...it,
      protocolo_ase: s.numero_protocolo,
      setor_nome: s.setor_nome || '-',
      turno_nome: s.turno_nome || '-',
      solicitante_nome: s.solicitante_nome || '-',
      status_ase: STATUS_LABELS[s.status] || s.status,
    }))
  );

  const colabsTransporte = todosColaboradores.filter(it => it.transporte);
  const colabsRefeicao = todosColaboradores.filter(it => it.refeicao);
  const totalHoras = todosColaboradores.reduce((acc, it) => acc + (it.total_horas || 0), 0);
  const totalColabs = todosColaboradores.length;
  const totalAses = solicitacoes.length;

  const dataFormatada = formatDataBR(dataExecucao);
  const diaSem = diaDaSemana(dataExecucao);

  // 1. Cabeçalho Principal
  writer.drawTitle('ASE - Relatório Consolidado do Dia');
  writer.spacer(2);
  writer.drawField('Data de Execução', `${dataFormatada} (${diaSem})`);
  writer.drawField('Resumo do Dia', `${totalAses} ASE(s) · ${totalColabs} Colaborador(es) · ${totalHoras.toFixed(2)}h Extras Totais · ${colabsTransporte.length} Transporte(s) · ${colabsRefeicao.length} Refeição(ões)`);
  writer.spacer(6);

  // 2. Tabela 1: Resumo das Solicitações (ASEs)
  writer.drawSubtitle(`1. Solicitações de ASE do Dia (${totalAses})`);
  writer.spacer(4);

  const COLS_ASES: ColumnDef[] = [
    { key: 'protocolo', label: 'PROTOCOLO', width: 78, align: 'center' },
    { key: 'setor', label: 'SETOR', width: 105, align: 'left' },
    { key: 'turno', label: 'TURNO', width: 52, align: 'center' },
    { key: 'solicitante', label: 'SOLICITANTE', width: 104, align: 'left' },
    { key: 'colabs', label: 'COLAB.', width: 36, align: 'center' },
    { key: 'horas', label: 'HORAS', width: 46, align: 'right' },
    { key: 'status', label: 'STATUS', width: 78, align: 'center' },
  ];

  const drawAsesHeader = () => {
    const page = writer.getPage();
    const currentY = writer.getY();
    const headerHeight = 16;
    page.drawRectangle({
      x: MARGIN,
      y: currentY - headerHeight,
      width: TOTAL_TABLE_WIDTH,
      height: headerHeight,
      color: rgb(0.12, 0.20, 0.32),
    });

    let curX = MARGIN;
    const textY = currentY - headerHeight + 5;
    COLS_ASES.forEach(col => {
      const text = sanitizeText(col.label);
      const textWidth = fontBold.widthOfTextAtSize(text, 7);
      let textX = curX + 4;
      if (col.align === 'center') textX = Math.max(curX + 2, curX + (col.width - textWidth) / 2);
      else if (col.align === 'right') textX = Math.max(curX + 2, curX + col.width - 4 - textWidth);

      page.drawText(text, { x: textX, y: textY, size: 7, font: fontBold, color: rgb(1, 1, 1) });
      curX += col.width;
    });
    writer.setY(currentY - headerHeight);
  };

  drawAsesHeader();

  solicitacoes.forEach((s, idx) => {
    const rowHeight = 18;
    if (writer.getY() - rowHeight < MARGIN + 25) {
      writer.ensureSpace(rowHeight + 35);
      drawAsesHeader();
    }

    const page = writer.getPage();
    const currentY = writer.getY();
    const rowY = currentY - rowHeight;
    const bgColor = idx % 2 === 0 ? rgb(0.97, 0.98, 0.99) : rgb(1, 1, 1);

    page.drawRectangle({
      x: MARGIN,
      y: rowY,
      width: TOTAL_TABLE_WIDTH,
      height: rowHeight,
      color: bgColor,
      borderColor: rgb(0.86, 0.89, 0.93),
      borderWidth: 0.5,
    });

    const sHoras = s.itens.reduce((acc, it) => acc + (it.total_horas || 0), 0);
    let curX = MARGIN;

    COLS_ASES.forEach(col => {
      let text = '';
      let fontToUse = font;
      let textColor = rgb(0.15, 0.2, 0.28);

      if (col.key === 'protocolo') {
        text = s.numero_protocolo;
        fontToUse = fontBold;
        textColor = rgb(0.1, 0.15, 0.25);
      } else if (col.key === 'setor') {
        text = s.setor_nome || '-';
      } else if (col.key === 'turno') {
        text = s.turno_nome || '-';
      } else if (col.key === 'solicitante') {
        text = s.solicitante_nome || '-';
      } else if (col.key === 'colabs') {
        text = String(s.itens.length);
        fontToUse = fontBold;
      } else if (col.key === 'horas') {
        text = `${sHoras.toFixed(2)}h`;
        fontToUse = fontBold;
        textColor = rgb(0.08, 0.35, 0.2);
      } else if (col.key === 'status') {
        text = STATUS_LABELS[s.status] || s.status;
        if (s.status === 'ENVIADO') textColor = rgb(0.08, 0.45, 0.2);
        else if (s.status === 'RASCUNHO') textColor = rgb(0.65, 0.4, 0.05);
      }

      text = sanitizeText(text);
      const maxW = col.width - 6;
      let textWidth = fontToUse.widthOfTextAtSize(text, 7.5);
      if (textWidth > maxW) {
        while (text.length > 3 && fontToUse.widthOfTextAtSize(text + '...', 7.5) > maxW) {
          text = text.slice(0, -1);
        }
        text += '...';
        textWidth = fontToUse.widthOfTextAtSize(text, 7.5);
      }

      let textX = curX + 3;
      if (col.align === 'center') textX = Math.max(curX + 2, curX + (col.width - textWidth) / 2);
      else if (col.align === 'right') textX = Math.max(curX + 2, curX + col.width - 3 - textWidth);

      page.drawText(text, {
        x: textX,
        y: rowY + (rowHeight / 2) - 3,
        size: 7.5,
        font: fontToUse,
        color: textColor,
      });

      curX += col.width;
    });

    writer.setY(rowY);
  });

  writer.spacer(14);

  // Definição padronizada de colunas para Transporte e Refeição (50 + 150 + 86 + 50 + 81 + 82 = 499 pt)
  const COLS_SPEC: ColumnDef[] = [
    { key: 'registro', label: 'MATRÍCULA', width: 50, align: 'center' },
    { key: 'colaborador', label: 'COLABORADOR / FUNÇÃO', width: 150, align: 'left' },
    { key: 'setor', label: 'SETOR', width: 86, align: 'left' },
    { key: 'turno', label: 'TURNO', width: 50, align: 'center' },
    { key: 'horario', label: 'HORÁRIO HE', width: 81, align: 'center' },
    { key: 'protocolo', label: 'ASE', width: 82, align: 'center' },
  ];

  // 3. Tabela 2: Programação de Transporte do Dia (Apenas quem marcou transporte)
  writer.ensureSpace(50);
  writer.drawSubtitle(`2. Programação de Transporte (${colabsTransporte.length} passageiro${colabsTransporte.length !== 1 ? 's' : ''})`);
  writer.spacer(4);

  if (colabsTransporte.length === 0) {
    writer.drawTableRow('Nenhum colaborador com solicitação de transporte para esta data.');
    writer.spacer(8);
  } else {
    const drawSpecHeader = (titleBgColor = rgb(0.12, 0.32, 0.42)) => {
      const page = writer.getPage();
      const currentY = writer.getY();
      const headerHeight = 16;
      page.drawRectangle({
        x: MARGIN,
        y: currentY - headerHeight,
        width: TOTAL_TABLE_WIDTH,
        height: headerHeight,
        color: titleBgColor,
      });

      let curX = MARGIN;
      const textY = currentY - headerHeight + 5;
      COLS_SPEC.forEach(col => {
        const text = sanitizeText(col.label);
        const textWidth = fontBold.widthOfTextAtSize(text, 7);
        let textX = curX + 3;
        if (col.align === 'center') textX = Math.max(curX + 2, curX + (col.width - textWidth) / 2);
        else if (col.align === 'right') textX = Math.max(curX + 2, curX + col.width - 3 - textWidth);

        page.drawText(text, { x: textX, y: textY, size: 7, font: fontBold, color: rgb(1, 1, 1) });
        curX += col.width;
      });
      writer.setY(currentY - headerHeight);
    };

    drawSpecHeader(rgb(0.12, 0.32, 0.42));

    colabsTransporte.forEach((it, idx) => {
      const hasCargo = Boolean(it.cargo?.trim());
      const rowHeight = hasCargo ? 24 : 18;

      if (writer.getY() - rowHeight < MARGIN + 25) {
        writer.ensureSpace(rowHeight + 35);
        drawSpecHeader(rgb(0.12, 0.32, 0.42));
      }

      const page = writer.getPage();
      const currentY = writer.getY();
      const rowY = currentY - rowHeight;
      const bgColor = idx % 2 === 0 ? rgb(0.97, 0.98, 0.99) : rgb(1, 1, 1);

      page.drawRectangle({
        x: MARGIN,
        y: rowY,
        width: TOTAL_TABLE_WIDTH,
        height: rowHeight,
        color: bgColor,
        borderColor: rgb(0.86, 0.89, 0.93),
        borderWidth: 0.5,
      });

      let curX = MARGIN;
      COLS_SPEC.forEach(col => {
        if (col.key === 'registro') {
          const text = sanitizeText(it.registro);
          const textWidth = font.widthOfTextAtSize(text, 7.5);
          page.drawText(text, {
            x: Math.max(curX + 2, curX + (col.width - textWidth) / 2),
            y: rowY + (rowHeight / 2) - 3,
            size: 7.5,
            font,
            color: rgb(0.2, 0.25, 0.35),
          });
        } else if (col.key === 'colaborador') {
          let nomeStr = sanitizeText(it.nome);
          const maxW = col.width - 6;
          if (fontBold.widthOfTextAtSize(nomeStr, 7.5) > maxW) {
            while (nomeStr.length > 3 && fontBold.widthOfTextAtSize(nomeStr + '...', 7.5) > maxW) {
              nomeStr = nomeStr.slice(0, -1);
            }
            nomeStr += '...';
          }
          const startY = hasCargo ? rowY + rowHeight - 9 : rowY + (rowHeight / 2) - 3;
          page.drawText(nomeStr, {
            x: curX + 3,
            y: startY,
            size: 7.5,
            font: fontBold,
            color: rgb(0.1, 0.12, 0.18),
          });
          if (hasCargo) {
            let cargoStr = sanitizeText(it.cargo || '');
            if (font.widthOfTextAtSize(cargoStr, 6.5) > maxW) {
              while (cargoStr.length > 3 && font.widthOfTextAtSize(cargoStr + '...', 6.5) > maxW) {
                cargoStr = cargoStr.slice(0, -1);
              }
              cargoStr += '...';
            }
            page.drawText(cargoStr, {
              x: curX + 3,
              y: startY - 8.5,
              size: 6.5,
              font,
              color: rgb(0.42, 0.48, 0.55),
            });
          }
        } else if (col.key === 'setor') {
          let text = sanitizeText(it.setor_nome);
          const maxW = col.width - 6;
          if (font.widthOfTextAtSize(text, 7.5) > maxW) {
            while (text.length > 3 && font.widthOfTextAtSize(text + '...', 7.5) > maxW) {
              text = text.slice(0, -1);
            }
            text += '...';
          }
          page.drawText(text, {
            x: curX + 3,
            y: rowY + (rowHeight / 2) - 3,
            size: 7.5,
            font,
            color: rgb(0.2, 0.25, 0.35),
          });
        } else if (col.key === 'turno') {
          const text = sanitizeText(it.turno_nome);
          const textWidth = font.widthOfTextAtSize(text, 7.5);
          page.drawText(text, {
            x: Math.max(curX + 2, curX + (col.width - textWidth) / 2),
            y: rowY + (rowHeight / 2) - 3,
            size: 7.5,
            font,
            color: rgb(0.2, 0.25, 0.35),
          });
        } else if (col.key === 'horario') {
          const text = (it.hora_entrada && it.hora_saida) ? `${it.hora_entrada} - ${it.hora_saida}` : '-';
          const textWidth = font.widthOfTextAtSize(text, 7.5);
          page.drawText(text, {
            x: Math.max(curX + 2, curX + (col.width - textWidth) / 2),
            y: rowY + (rowHeight / 2) - 3,
            size: 7.5,
            font,
            color: rgb(0.15, 0.2, 0.28),
          });
        } else if (col.key === 'protocolo') {
          let protoStr = sanitizeText(it.protocolo_ase);
          const maxW = col.width - 6;
          if (fontBold.widthOfTextAtSize(protoStr, 7) > maxW) {
            while (protoStr.length > 3 && fontBold.widthOfTextAtSize(protoStr + '...', 7) > maxW) {
              protoStr = protoStr.slice(0, -1);
            }
            protoStr += '...';
          }
          const textWidth = fontBold.widthOfTextAtSize(protoStr, 7);
          page.drawText(protoStr, {
            x: Math.max(curX + 2, curX + (col.width - textWidth) / 2),
            y: rowY + (rowHeight / 2) - 3,
            size: 7,
            font: fontBold,
            color: rgb(0.1, 0.2, 0.4),
          });
        }
        curX += col.width;
      });

      writer.setY(rowY);
    });

    // Rodapé de transporte
    const footerHeight = 18;
    const page = writer.getPage();
    const currentY = writer.getY();
    const rowY = currentY - footerHeight;
    page.drawRectangle({
      x: MARGIN,
      y: rowY,
      width: TOTAL_TABLE_WIDTH,
      height: footerHeight,
      color: rgb(0.92, 0.95, 0.98),
      borderColor: rgb(0.78, 0.84, 0.9),
      borderWidth: 0.5,
    });
    page.drawText(`TOTAL DE PASSAGEIROS / TRANSPORTES SOLICITADOS: ${colabsTransporte.length}`, {
      x: MARGIN + 8,
      y: rowY + 5.5,
      size: 7.5,
      font: fontBold,
      color: rgb(0.12, 0.25, 0.38),
    });
    writer.setY(rowY - 14);
  }

  // 4. Tabela 3: Programação de Refeição do Dia (Apenas quem marcou refeição)
  writer.ensureSpace(50);
  writer.drawSubtitle(`3. Programação de Refeição (${colabsRefeicao.length} solicitada${colabsRefeicao.length !== 1 ? 's' : ''})`);
  writer.spacer(4);

  if (colabsRefeicao.length === 0) {
    writer.drawTableRow('Nenhum colaborador com solicitação de refeição para esta data.');
    writer.spacer(8);
  } else {
    const drawSpecRefeicaoHeader = () => {
      const page = writer.getPage();
      const currentY = writer.getY();
      const headerHeight = 16;
      page.drawRectangle({
        x: MARGIN,
        y: currentY - headerHeight,
        width: TOTAL_TABLE_WIDTH,
        height: headerHeight,
        color: rgb(0.2, 0.35, 0.25),
      });

      let curX = MARGIN;
      const textY = currentY - headerHeight + 5;
      COLS_SPEC.forEach(col => {
        const text = sanitizeText(col.label);
        const textWidth = fontBold.widthOfTextAtSize(text, 7);
        let textX = curX + 3;
        if (col.align === 'center') textX = Math.max(curX + 2, curX + (col.width - textWidth) / 2);
        else if (col.align === 'right') textX = Math.max(curX + 2, curX + col.width - 3 - textWidth);

        page.drawText(text, { x: textX, y: textY, size: 7, font: fontBold, color: rgb(1, 1, 1) });
        curX += col.width;
      });
      writer.setY(currentY - headerHeight);
    };

    drawSpecRefeicaoHeader();

    colabsRefeicao.forEach((it, idx) => {
      const hasCargo = Boolean(it.cargo?.trim());
      const rowHeight = hasCargo ? 24 : 18;

      if (writer.getY() - rowHeight < MARGIN + 25) {
        writer.ensureSpace(rowHeight + 35);
        drawSpecRefeicaoHeader();
      }

      const page = writer.getPage();
      const currentY = writer.getY();
      const rowY = currentY - rowHeight;
      const bgColor = idx % 2 === 0 ? rgb(0.97, 0.99, 0.97) : rgb(1, 1, 1);

      page.drawRectangle({
        x: MARGIN,
        y: rowY,
        width: TOTAL_TABLE_WIDTH,
        height: rowHeight,
        color: bgColor,
        borderColor: rgb(0.86, 0.91, 0.88),
        borderWidth: 0.5,
      });

      let curX = MARGIN;
      COLS_SPEC.forEach(col => {
        if (col.key === 'registro') {
          const text = sanitizeText(it.registro);
          const textWidth = font.widthOfTextAtSize(text, 7.5);
          page.drawText(text, {
            x: Math.max(curX + 2, curX + (col.width - textWidth) / 2),
            y: rowY + (rowHeight / 2) - 3,
            size: 7.5,
            font,
            color: rgb(0.2, 0.25, 0.35),
          });
        } else if (col.key === 'colaborador') {
          let nomeStr = sanitizeText(it.nome);
          const maxW = col.width - 6;
          if (fontBold.widthOfTextAtSize(nomeStr, 7.5) > maxW) {
            while (nomeStr.length > 3 && fontBold.widthOfTextAtSize(nomeStr + '...', 7.5) > maxW) {
              nomeStr = nomeStr.slice(0, -1);
            }
            nomeStr += '...';
          }
          const startY = hasCargo ? rowY + rowHeight - 9 : rowY + (rowHeight / 2) - 3;
          page.drawText(nomeStr, {
            x: curX + 3,
            y: startY,
            size: 7.5,
            font: fontBold,
            color: rgb(0.1, 0.12, 0.18),
          });
          if (hasCargo) {
            let cargoStr = sanitizeText(it.cargo || '');
            if (font.widthOfTextAtSize(cargoStr, 6.5) > maxW) {
              while (cargoStr.length > 3 && font.widthOfTextAtSize(cargoStr + '...', 6.5) > maxW) {
                cargoStr = cargoStr.slice(0, -1);
              }
              cargoStr += '...';
            }
            page.drawText(cargoStr, {
              x: curX + 3,
              y: startY - 8.5,
              size: 6.5,
              font,
              color: rgb(0.42, 0.48, 0.55),
            });
          }
        } else if (col.key === 'setor') {
          let text = sanitizeText(it.setor_nome);
          const maxW = col.width - 6;
          if (font.widthOfTextAtSize(text, 7.5) > maxW) {
            while (text.length > 3 && font.widthOfTextAtSize(text + '...', 7.5) > maxW) {
              text = text.slice(0, -1);
            }
            text += '...';
          }
          page.drawText(text, {
            x: curX + 3,
            y: rowY + (rowHeight / 2) - 3,
            size: 7.5,
            font,
            color: rgb(0.2, 0.25, 0.35),
          });
        } else if (col.key === 'turno') {
          const text = sanitizeText(it.turno_nome);
          const textWidth = font.widthOfTextAtSize(text, 7.5);
          page.drawText(text, {
            x: Math.max(curX + 2, curX + (col.width - textWidth) / 2),
            y: rowY + (rowHeight / 2) - 3,
            size: 7.5,
            font,
            color: rgb(0.2, 0.25, 0.35),
          });
        } else if (col.key === 'horario') {
          const text = (it.hora_entrada && it.hora_saida) ? `${it.hora_entrada} - ${it.hora_saida}` : '-';
          const textWidth = font.widthOfTextAtSize(text, 7.5);
          page.drawText(text, {
            x: Math.max(curX + 2, curX + (col.width - textWidth) / 2),
            y: rowY + (rowHeight / 2) - 3,
            size: 7.5,
            font,
            color: rgb(0.15, 0.2, 0.28),
          });
        } else if (col.key === 'protocolo') {
          let protoStr = sanitizeText(it.protocolo_ase);
          const maxW = col.width - 6;
          if (fontBold.widthOfTextAtSize(protoStr, 7) > maxW) {
            while (protoStr.length > 3 && fontBold.widthOfTextAtSize(protoStr + '...', 7) > maxW) {
              protoStr = protoStr.slice(0, -1);
            }
            protoStr += '...';
          }
          const textWidth = fontBold.widthOfTextAtSize(protoStr, 7);
          page.drawText(protoStr, {
            x: Math.max(curX + 2, curX + (col.width - textWidth) / 2),
            y: rowY + (rowHeight / 2) - 3,
            size: 7,
            font: fontBold,
            color: rgb(0.1, 0.2, 0.4),
          });
        }
        curX += col.width;
      });

      writer.setY(rowY);
    });

    // Rodapé de refeição
    const footerHeight = 18;
    const page = writer.getPage();
    const currentY = writer.getY();
    const rowY = currentY - footerHeight;
    page.drawRectangle({
      x: MARGIN,
      y: rowY,
      width: TOTAL_TABLE_WIDTH,
      height: footerHeight,
      color: rgb(0.93, 0.97, 0.94),
      borderColor: rgb(0.86, 0.91, 0.88),
      borderWidth: 0.5,
    });
    page.drawText(`TOTAL DE REFEIÇÕES SOLICITADAS: ${colabsRefeicao.length}`, {
      x: MARGIN + 8,
      y: rowY + 5.5,
      size: 7.5,
      font: fontBold,
      color: rgb(0.1, 0.35, 0.18),
    });
    writer.setY(rowY - 14);
  }

  // 5. Tabela 4: Relação Completa de Todos os Colaboradores
  // Larguras: 46 + 118 + 76 + 22 + 22 + 60 + 29 + 44 + 82 = 499 pt
  writer.ensureSpace(50);
  writer.drawSubtitle(`4. Relação Geral de Colaboradores (${totalColabs})`);
  writer.spacer(4);

  const COLS_ALL: ColumnDef[] = [
    { key: 'registro', label: 'MATRÍCULA', width: 46, align: 'center' },
    { key: 'colaborador', label: 'COLABORADOR / CARGO', width: 118, align: 'left' },
    { key: 'setor_turno', label: 'SETOR / TURNO', width: 76, align: 'left' },
    { key: 'transporte', label: 'TR.', width: 22, align: 'center' },
    { key: 'refeicao', label: 'REF.', width: 22, align: 'center' },
    { key: 'horario', label: 'HORÁRIO', width: 60, align: 'center' },
    { key: 'percentual', label: '% HE', width: 29, align: 'center' },
    { key: 'total', label: 'TOTAL', width: 44, align: 'right' },
    { key: 'protocolo', label: 'ASE', width: 82, align: 'center' },
  ];

  const drawAllHeader = () => {
    const page = writer.getPage();
    const currentY = writer.getY();
    const headerHeight = 16;
    page.drawRectangle({
      x: MARGIN,
      y: currentY - headerHeight,
      width: TOTAL_TABLE_WIDTH,
      height: headerHeight,
      color: rgb(0.12, 0.20, 0.32),
    });

    let curX = MARGIN;
    const textY = currentY - headerHeight + 5;
    COLS_ALL.forEach(col => {
      const text = sanitizeText(col.label);
      const textWidth = fontBold.widthOfTextAtSize(text, 6.5);
      let textX = curX + 2;
      if (col.align === 'center') textX = Math.max(curX + 2, curX + (col.width - textWidth) / 2);
      else if (col.align === 'right') textX = Math.max(curX + 2, curX + col.width - 2 - textWidth);

      page.drawText(text, { x: textX, y: textY, size: 6.5, font: fontBold, color: rgb(1, 1, 1) });
      curX += col.width;
    });
    writer.setY(currentY - headerHeight);
  };

  drawAllHeader();

  todosColaboradores.forEach((it, idx) => {
    const hasCargo = Boolean(it.cargo?.trim());
    const rowHeight = hasCargo ? 22 : 17;

    if (writer.getY() - rowHeight < MARGIN + 25) {
      writer.ensureSpace(rowHeight + 35);
      drawAllHeader();
    }

    const page = writer.getPage();
    const currentY = writer.getY();
    const rowY = currentY - rowHeight;
    const bgColor = idx % 2 === 0 ? rgb(0.97, 0.98, 0.99) : rgb(1, 1, 1);

    page.drawRectangle({
      x: MARGIN,
      y: rowY,
      width: TOTAL_TABLE_WIDTH,
      height: rowHeight,
      color: bgColor,
      borderColor: rgb(0.86, 0.89, 0.93),
      borderWidth: 0.5,
    });

    let curX = MARGIN;
    COLS_ALL.forEach(col => {
      const pad = 2;
      if (col.key === 'registro') {
        const text = sanitizeText(it.registro);
        const textWidth = font.widthOfTextAtSize(text, 7);
        page.drawText(text, {
          x: Math.max(curX + 1, curX + (col.width - textWidth) / 2),
          y: rowY + (rowHeight / 2) - 2.5,
          size: 7,
          font,
          color: rgb(0.2, 0.25, 0.35),
        });
      } else if (col.key === 'colaborador') {
        let nomeStr = sanitizeText(it.nome);
        const maxW = col.width - 4;
        if (fontBold.widthOfTextAtSize(nomeStr, 7) > maxW) {
          while (nomeStr.length > 3 && fontBold.widthOfTextAtSize(nomeStr + '...', 7) > maxW) {
            nomeStr = nomeStr.slice(0, -1);
          }
          nomeStr += '...';
        }
        const startY = hasCargo ? rowY + rowHeight - 8.5 : rowY + (rowHeight / 2) - 2.5;
        page.drawText(nomeStr, {
          x: curX + pad,
          y: startY,
          size: 7,
          font: fontBold,
          color: rgb(0.1, 0.12, 0.18),
        });
        if (hasCargo) {
          let cargoStr = sanitizeText(it.cargo || '');
          if (font.widthOfTextAtSize(cargoStr, 6) > maxW) {
            while (cargoStr.length > 3 && font.widthOfTextAtSize(cargoStr + '...', 6) > maxW) {
              cargoStr = cargoStr.slice(0, -1);
            }
            cargoStr += '...';
          }
          page.drawText(cargoStr, {
            x: curX + pad,
            y: startY - 7.5,
            size: 6,
            font,
            color: rgb(0.42, 0.48, 0.55),
          });
        }
      } else if (col.key === 'setor_turno') {
        const text = sanitizeText(`${it.setor_nome} / ${it.turno_nome}`);
        const maxW = col.width - 4;
        let finalStr = text;
        if (font.widthOfTextAtSize(finalStr, 6.5) > maxW) {
          while (finalStr.length > 3 && font.widthOfTextAtSize(finalStr + '...', 6.5) > maxW) {
            finalStr = finalStr.slice(0, -1);
          }
          finalStr += '...';
        }
        page.drawText(finalStr, {
          x: curX + pad,
          y: rowY + (rowHeight / 2) - 2.5,
          size: 6.5,
          font,
          color: rgb(0.2, 0.25, 0.35),
        });
      } else if (col.key === 'transporte') {
        const text = it.transporte ? 'X' : '-';
        const fontToUse = it.transporte ? fontBold : font;
        const textWidth = fontToUse.widthOfTextAtSize(text, 7.5);
        page.drawText(text, {
          x: Math.max(curX + 1, curX + (col.width - textWidth) / 2),
          y: rowY + (rowHeight / 2) - 2.5,
          size: 7.5,
          font: fontToUse,
          color: it.transporte ? rgb(0.12, 0.20, 0.32) : rgb(0.65, 0.7, 0.75),
        });
      } else if (col.key === 'refeicao') {
        const text = it.refeicao ? 'X' : '-';
        const fontToUse = it.refeicao ? fontBold : font;
        const textWidth = fontToUse.widthOfTextAtSize(text, 7.5);
        page.drawText(text, {
          x: Math.max(curX + 1, curX + (col.width - textWidth) / 2),
          y: rowY + (rowHeight / 2) - 2.5,
          size: 7.5,
          font: fontToUse,
          color: it.refeicao ? rgb(0.12, 0.20, 0.32) : rgb(0.65, 0.7, 0.75),
        });
      } else if (col.key === 'horario') {
        const text = (it.hora_entrada && it.hora_saida) ? `${it.hora_entrada} - ${it.hora_saida}` : '-';
        const textWidth = font.widthOfTextAtSize(text, 6.5);
        page.drawText(text, {
          x: Math.max(curX + 1, curX + (col.width - textWidth) / 2),
          y: rowY + (rowHeight / 2) - 2.5,
          size: 6.5,
          font,
          color: rgb(0.15, 0.2, 0.28),
        });
      } else if (col.key === 'percentual') {
        const text = it.percentual_he != null ? `${it.percentual_he}%` : '-';
        const textWidth = font.widthOfTextAtSize(text, 7);
        page.drawText(text, {
          x: Math.max(curX + 1, curX + (col.width - textWidth) / 2),
          y: rowY + (rowHeight / 2) - 2.5,
          size: 7,
          font,
          color: it.percentual_he === 100 ? rgb(0.1, 0.35, 0.7) : rgb(0.2, 0.25, 0.3),
        });
      } else if (col.key === 'total') {
        const text = it.total_horas != null ? `${it.total_horas.toFixed(2)}h` : '0.00h';
        const textWidth = fontBold.widthOfTextAtSize(text, 7);
        page.drawText(text, {
          x: Math.max(curX + 1, curX + col.width - 4 - textWidth),
          y: rowY + (rowHeight / 2) - 2.5,
          size: 7,
          font: fontBold,
          color: rgb(0.1, 0.15, 0.25),
        });
      } else if (col.key === 'protocolo') {
        let protoStr = sanitizeText(it.protocolo_ase);
        const maxW = col.width - 4;
        if (fontBold.widthOfTextAtSize(protoStr, 6.5) > maxW) {
          while (protoStr.length > 3 && fontBold.widthOfTextAtSize(protoStr + '...', 6.5) > maxW) {
            protoStr = protoStr.slice(0, -1);
          }
          protoStr += '...';
        }
        const textWidth = fontBold.widthOfTextAtSize(protoStr, 6.5);
        page.drawText(protoStr, {
          x: Math.max(curX + 1, curX + (col.width - textWidth) / 2),
          y: rowY + (rowHeight / 2) - 2.5,
          size: 6.5,
          font: fontBold,
          color: rgb(0.1, 0.2, 0.4),
        });
      }
      curX += col.width;
    });

    writer.setY(rowY);
  });

  // Rodapé Geral
  const footerHeight = 22;
  const page = writer.getPage();
  const currentY = writer.getY();
  const rowY = currentY - footerHeight;
  page.drawRectangle({
    x: MARGIN,
    y: rowY,
    width: TOTAL_TABLE_WIDTH,
    height: footerHeight,
    color: rgb(0.92, 0.94, 0.97),
    borderColor: rgb(0.78, 0.82, 0.88),
    borderWidth: 0.75,
  });
  page.drawText(`TOTAL GERAL DO DIA (${totalColabs} COLABORADOR${totalColabs !== 1 ? 'ES' : ''}):`, {
    x: MARGIN + 8,
    y: rowY + 7,
    size: 8,
    font: fontBold,
    color: rgb(0.15, 0.22, 0.35),
  });
  const valorStr = `${totalHoras.toFixed(2)}h`;
  const valorWidth = fontBold.widthOfTextAtSize(valorStr, 9);
  page.drawText(valorStr, {
    x: MARGIN + TOTAL_TABLE_WIDTH - 8 - valorWidth,
    y: rowY + 6.5,
    size: 9,
    font: fontBold,
    color: rgb(0.08, 0.35, 0.2),
  });

  await downloadPdf(doc, `ase-consolidado-${dataExecucao}.pdf`);
}

export function exportAseConsolidadoDiaExcel(solicitacoes: AseHoraExtraCompleta[], dataExecucao: string): void {
  const dataFormatada = formatDataBR(dataExecucao);
  const diaSem = diaDaSemana(dataExecucao);

  const todosColaboradores: ColabConsolidadoItem[] = solicitacoes.flatMap(s =>
    s.itens.map(it => ({
      ...it,
      protocolo_ase: s.numero_protocolo,
      setor_nome: s.setor_nome || '-',
      turno_nome: s.turno_nome || '-',
      solicitante_nome: s.solicitante_nome || '-',
      status_ase: STATUS_LABELS[s.status] || s.status,
    }))
  );

  const colabsTransporte = todosColaboradores.filter(it => it.transporte);
  const colabsRefeicao = todosColaboradores.filter(it => it.refeicao);
  const totalHorasGeral = todosColaboradores.reduce((acc, it) => acc + (it.total_horas || 0), 0);

  const wb = XLSX.utils.book_new();

  // Aba 1: Resumo Geral das ASEs do Dia
  const resumoRows = [
    ['RELATÓRIO CONSOLIDADO DE ASE - HORA EXTRA (FRM.RHU-0007)'],
    [`DATA DE EXECUÇÃO: ${dataFormatada} (${diaSem})`],
    [`TOTAL DE ASES: ${solicitacoes.length} | TOTAL DE COLABORADORES: ${todosColaboradores.length} | TOTAL HORAS EXTRAS: ${totalHorasGeral.toFixed(2)}h | TRANSPORTES: ${colabsTransporte.length} | REFEIÇÕES: ${colabsRefeicao.length}`],
    [],
    ['Protocolo', 'Setor', 'Turno', 'Solicitante', 'Qtd Colaboradores', 'Total Horas (h)', 'Transportes', 'Refeições', 'Status', 'Justificativa'],
    ...solicitacoes.map(s => {
      const sHoras = s.itens.reduce((acc, it) => acc + (it.total_horas || 0), 0);
      const sTransp = s.itens.filter(it => it.transporte).length;
      const sRef = s.itens.filter(it => it.refeicao).length;
      return [
        s.numero_protocolo,
        s.setor_nome || '-',
        s.turno_nome || '-',
        s.solicitante_nome || '-',
        s.itens.length,
        Number(sHoras.toFixed(2)),
        sTransp,
        sRef,
        STATUS_LABELS[s.status] || s.status,
        s.justificativa || '',
      ];
    }),
    [],
    [
      'TOTAL GERAL',
      '',
      '',
      '',
      todosColaboradores.length,
      Number(totalHorasGeral.toFixed(2)),
      colabsTransporte.length,
      colabsRefeicao.length,
      '',
      '',
    ],
  ];

  const wsResumo = XLSX.utils.aoa_to_sheet(resumoRows);
  wsResumo['!cols'] = [
    { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 24 }, { wch: 18 },
    { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 35 }
  ];
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo do Dia');

  // Aba 2: Colaboradores Geral
  const colabHeaders = [
    'Protocolo ASE', 'Setor', 'Turno', 'Solicitante', 'Matrícula', 'Colaborador', 'Cargo / Função',
    'Hora Entrada', 'Hora Saída', 'Intervalo (min)', '% Hora Extra', 'Total Horas (h)', 'Transporte', 'Refeição', 'Observação'
  ];
  const colabRows = [
    [`RELAÇÃO GERAL DE COLABORADORES - ${dataFormatada} (${diaSem})`],
    [],
    colabHeaders,
    ...todosColaboradores.map(it => [
      it.protocolo_ase,
      it.setor_nome,
      it.turno_nome,
      it.solicitante_nome,
      it.registro,
      it.nome,
      it.cargo || '',
      it.hora_entrada || '',
      it.hora_saida || '',
      it.intervalo_minutos ?? 0,
      it.percentual_he ? `${it.percentual_he}%` : '',
      it.total_horas != null ? Number(it.total_horas.toFixed(2)) : 0,
      it.transporte ? 'SIM' : 'NÃO',
      it.refeicao ? 'SIM' : 'NÃO',
      it.observacao || '',
    ]),
    [],
    [
      'TOTAL GERAL', '', '', '', '', `${todosColaboradores.length} Colaboradores`, '',
      '', '', '', '', Number(totalHorasGeral.toFixed(2)), `${colabsTransporte.length} Transp.`, `${colabsRefeicao.length} Ref.`, ''
    ]
  ];

  const wsColabs = XLSX.utils.aoa_to_sheet(colabRows);
  wsColabs['!cols'] = [
    { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 22 }, { wch: 14 },
    { wch: 30 }, { wch: 24 }, { wch: 13 }, { wch: 13 }, { wch: 15 },
    { wch: 14 }, { wch: 15 }, { wch: 13 }, { wch: 13 }, { wch: 30 }
  ];
  XLSX.utils.book_append_sheet(wb, wsColabs, 'Colaboradores Geral');

  // Aba 3: Programação de Transporte
  const transpRows = [
    [`PROGRAMAÇÃO DE TRANSPORTE - ${dataFormatada} (${diaSem})`],
    [`TOTAL DE PASSAGEIROS / TRANSPORTES: ${colabsTransporte.length}`],
    [],
    ['Matrícula', 'Colaborador', 'Cargo / Função', 'Setor', 'Turno', 'Horário HE', 'Protocolo ASE', 'Solicitante', 'Observação'],
    ...colabsTransporte.map(it => [
      it.registro,
      it.nome,
      it.cargo || '',
      it.setor_nome,
      it.turno_nome,
      (it.hora_entrada && it.hora_saida) ? `${it.hora_entrada} - ${it.hora_saida}` : '',
      it.protocolo_ase,
      it.solicitante_nome,
      it.observacao || '',
    ]),
    [],
    ['TOTAL', `${colabsTransporte.length} passageiro(s)`, '', '', '', '', '', '', '']
  ];

  const wsTransp = XLSX.utils.aoa_to_sheet(transpRows);
  wsTransp['!cols'] = [
    { wch: 14 }, { wch: 30 }, { wch: 24 }, { wch: 20 }, { wch: 15 },
    { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 30 }
  ];
  XLSX.utils.book_append_sheet(wb, wsTransp, 'Transporte');

  // Aba 4: Programação de Refeição
  const refeicaoRows = [
    [`PROGRAMAÇÃO DE REFEIÇÃO - ${dataFormatada} (${diaSem})`],
    [`TOTAL DE REFEIÇÕES: ${colabsRefeicao.length}`],
    [],
    ['Matrícula', 'Colaborador', 'Cargo / Função', 'Setor', 'Turno', 'Horário HE', 'Protocolo ASE', 'Solicitante', 'Observação'],
    ...colabsRefeicao.map(it => [
      it.registro,
      it.nome,
      it.cargo || '',
      it.setor_nome,
      it.turno_nome,
      (it.hora_entrada && it.hora_saida) ? `${it.hora_entrada} - ${it.hora_saida}` : '',
      it.protocolo_ase,
      it.solicitante_nome,
      it.observacao || '',
    ]),
    [],
    ['TOTAL', `${colabsRefeicao.length} refeição(ões)`, '', '', '', '', '', '', '']
  ];

  const wsRefeicao = XLSX.utils.aoa_to_sheet(refeicaoRows);
  wsRefeicao['!cols'] = [
    { wch: 14 }, { wch: 30 }, { wch: 24 }, { wch: 20 }, { wch: 15 },
    { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 30 }
  ];
  XLSX.utils.book_append_sheet(wb, wsRefeicao, 'Refeição');

  XLSX.writeFile(wb, `ase-consolidado-${dataExecucao}.xlsx`);
}
