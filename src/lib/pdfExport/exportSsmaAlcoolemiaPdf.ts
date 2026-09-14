/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportação oficial em PDF do Termo de Execução de Teste de Alcoolemia
 * Formulário FRM.SOC-0042 (Rev. 00) — Módulo SSMA / Saúde Ocupacional da TEN.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createDoc, downloadPdf, PAGE_WIDTH, PAGE_HEIGHT, MARGIN, sanitizeText, wrapText, PDF_COLORS } from './core';
import type { PortAlcoolemiaTeste } from '../../types';

function formatDataBR(iso?: string | null): string {
  if (!iso) return '__/__/____';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export async function exportTermoAlcoolemiaPdf(
  teste: PortAlcoolemiaTeste,
  examinadorCustom?: string,
  localCustom?: string
): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  let y = PAGE_HEIGHT - MARGIN;

  // 1. Cabeçalho com Logo TEN à esquerda e Código FRM.SOC-0042 à direita
  if (logo) {
    const logoHeight = 40;
    const logoWidth = (logo.width / logo.height) * logoHeight;
    page.drawImage(logo, {
      x: MARGIN,
      y: y - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });
  }

  // Bloco Topo Direito
  const topoDireitoX = PAGE_WIDTH - MARGIN - 130;
  page.drawText('FRM.SOC-0042', {
    x: topoDireitoX,
    y: y - 10,
    size: 9,
    font: fontBold,
    color: PDF_COLORS.darkText,
  });
  page.drawText('Rev.: 00', {
    x: topoDireitoX,
    y: y - 22,
    size: 8,
    font,
    color: PDF_COLORS.bodyText,
  });
  page.drawText(`Data: ${formatDataBR(teste.data)}`, {
    x: topoDireitoX,
    y: y - 34,
    size: 8,
    font,
    color: PDF_COLORS.bodyText,
  });

  y -= 60;

  // Linha divisória sutil do cabeçalho
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.8,
    color: PDF_COLORS.borderLight,
  });

  y -= 22;

  // 2. Título Central Oficial
  const titulo = 'TERMO DE EXECUÇÃO DE TESTE DE ALCOOLEMIA E ORIENTAÇÃO PREVENTIVA SOBRE USO DE SUBSTÂNCIAS PSICOATIVAS';
  const tituloLines = wrapText(titulo, fontBold, 10.5, contentWidth);
  for (const line of tituloLines) {
    const lineWidth = fontBold.widthOfTextAtSize(line, 10.5);
    page.drawText(line, {
      x: MARGIN + (contentWidth - lineWidth) / 2,
      y,
      size: 10.5,
      font: fontBold,
      color: PDF_COLORS.primaryNavy,
    });
    y -= 14;
  }

  y -= 12;

  // 3. Texto de Identificação do Colaborador
  const nomeColab = teste.nome || '__________________________________';
  const matColab = teste.matricula || '________';
  const empColab = teste.empresa || 'TEN';
  const funcColab = teste.cargo_funcao || '____________________';

  const textoIdentificacao = `Eu, ${nomeColab}, matrícula ${matColab}, colaborador da empresa ${empColab}, Função: ${funcColab}, declaro estar ciente do Procedimento para controle de nível de Alcoolemia e Drogas ilícitas da TEN, e concordo com todos os procedimentos e medidas nele previstos.`;
  const linhasIdent = wrapText(textoIdentificacao, font, 9.5, contentWidth);
  for (const line of linhasIdent) {
    page.drawText(line, {
      x: MARGIN,
      y,
      size: 9.5,
      font,
      color: PDF_COLORS.darkText,
    });
    y -= 14;
  }

  y -= 12;

  // 4. AUTORIZAÇÃO DO TESTE DE ALCOOLEMIA
  page.drawText('AUTORIZAÇÃO DO TESTE DE ALCOOLEMIA;', {
    x: MARGIN,
    y,
    size: 9.5,
    font: fontBold,
    color: PDF_COLORS.darkText,
  });
  y -= 14;

  const textoAutorizacao = 'Certifico que li e entendi, declaro estar ciente do Procedimento para controle de nível de Alcoolemia e Drogas ilícitas da TEN, e concordo com todos os procedimentos e medidas nele previstos.\nObjetivo principal do controle a ser procedido: Controlar a exposição aos riscos dos trabalhadores e prevenir Acidentes.';
  const linhasAut = wrapText(textoAutorizacao, font, 9, contentWidth);
  for (const line of linhasAut) {
    page.drawText(line, {
      x: MARGIN,
      y,
      size: 9,
      font,
      color: PDF_COLORS.bodyText,
    });
    y -= 13;
  }

  y -= 14;

  // 5. RAZÃO PARA O TESTE
  page.drawText('RAZÃO PARA O TESTE (MARQUE UM (X)):', {
    x: MARGIN,
    y,
    size: 9,
    font: fontBold,
    color: PDF_COLORS.darkText,
  });
  y -= 18;

  const razao = teste.razao_teste || 'ALEATORIO';
  const checkPosAcidente = razao === 'POS_ACIDENTE' ? '[ X ]' : '[   ]';
  const checkMotivado = razao === 'MOTIVADO' ? '[ X ]' : '[   ]';
  const checkAleatorio = razao === 'ALEATORIO' ? '[ X ]' : '[   ]';

  page.drawText(`PÓS ACIDENTE  ${checkPosAcidente}          MOTIVADO  ${checkMotivado}          ALEATÓRIO  ${checkAleatorio}`, {
    x: MARGIN + 10,
    y,
    size: 9.5,
    font: fontBold,
    color: PDF_COLORS.darkText,
  });

  y -= 22;

  // 6. RESULTADO
  const isNegativo = teste.resultado === 'NEGATIVO';
  const isPositivo = teste.resultado === 'POSITIVO';
  const isRecusa = teste.resultado === 'RECUSA';
  const isPendente = teste.resultado === 'PENDENTE';

  let checkNegativo = isNegativo ? '[ X ]' : '[   ]';
  let checkPositivo = isPositivo ? '[ X ]' : '[   ]';

  let textoResultado = `RESULTADO:    NEGATIVO  ${checkNegativo}          POSITIVO  ${checkPositivo}`;
  if (isPositivo && teste.valor_medido > 0) {
    textoResultado += `    (Valor Medido: ${teste.valor_medido.toFixed(2)} mg/L)`;
  } else if (isRecusa) {
    textoResultado += `          RECUSA DO TESTE  [ X ]`;
  } else if (isPendente) {
    textoResultado += `          (AGUARDANDO AFERIÇÃO)`;
  }

  page.drawText(textoResultado, {
    x: MARGIN,
    y,
    size: 9.5,
    font: fontBold,
    color: isPositivo ? PDF_COLORS.badgeRedText : PDF_COLORS.darkText,
  });

  y -= 22;

  // 7. LOCAL, DATA E HORA
  const dataBr = formatDataBR(teste.data);
  const horaStr = teste.horario || '__:__';
  page.drawText(`Jacobina-BA, ${dataBr}                    Hora: ${horaStr}`, {
    x: MARGIN,
    y,
    size: 9.5,
    font,
    color: PDF_COLORS.darkText,
  });

  y -= 24;

  // Linha separadora antes das orientações
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.6,
    color: PDF_COLORS.borderLight,
  });

  y -= 16;

  // 8. ORIENTAÇÕES SOBRE USO DE SUBSTÂNCIAS PSICOATIVAS
  page.drawText('ORIENTAÇÕES SOBRE USO DE SUBSTÂNCIAS PSICOATIVAS', {
    x: MARGIN,
    y,
    size: 9.5,
    font: fontBold,
    color: PDF_COLORS.primaryNavy,
  });
  y -= 14;

  page.drawText('O colaborador declara estar ciente de que:', {
    x: MARGIN,
    y,
    size: 8.5,
    font,
    color: PDF_COLORS.darkText,
  });
  y -= 14;

  const orientacoes = [
    'O uso de substâncias ilícitas é proibido em qualquer circunstância no ambiente de trabalho, conforme legislação vigente e normas internas da empresa;',
    'O uso de substâncias lícitas, como bebidas alcoólicas e certos medicamentos, pode comprometer a capacidade laboral, atenção, reflexos e segurança;',
    'É proibido exercer atividades sob efeito de álcool ou drogas, independentemente de serem lícitas ou ilícitas;',
    'O uso indevido dessas substâncias aumenta significativamente o risco de acidentes de trabalho, podendo colocar em risco a própria integridade física e a de terceiros;',
    'Em caso de uso de medicação prescrita, o colaborador deve informar ao serviço de saúde ocupacional, quando houver possibilidade de interferência nas atividades laborais;',
    'O descumprimento dessas diretrizes poderá resultar em medidas disciplinares conforme normas da empresa.',
  ];

  for (const item of orientacoes) {
    const bulletText = `•  ${item}`;
    const wrapped = wrapText(bulletText, font, 8.5, contentWidth - 10);
    for (let i = 0; i < wrapped.length; i++) {
      page.drawText(wrapped[i], {
        x: MARGIN + (i === 0 ? 6 : 14),
        y,
        size: 8.5,
        font,
        color: PDF_COLORS.bodyText,
      });
      y -= 12;
    }
    y -= 2;
  }

  y -= 6;
  const declaracaoFinal = 'Declaro que recebi orientação quanto aos riscos e responsabilidades relacionadas ao uso de substâncias lícitas e ilícitas.';
  page.drawText(declaracaoFinal, {
    x: MARGIN + 6,
    y,
    size: 8.5,
    font: fontBold,
    color: PDF_COLORS.darkText,
  });

  y -= 38;

  // 9. ASSINATURA DO COLABORADOR
  const linhaAssinaturaLargura = 240;
  const assX = MARGIN + (contentWidth - linhaAssinaturaLargura) / 2;
  page.drawLine({
    start: { x: assX, y },
    end: { x: assX + linhaAssinaturaLargura, y },
    thickness: 1,
    color: PDF_COLORS.darkText,
  });
  y -= 12;

  const rotuloAss = 'Assinatura do Colaborador';
  const rotuloAssWidth = font.widthOfTextAtSize(rotuloAss, 8.5);
  page.drawText(rotuloAss, {
    x: assX + (linhaAssinaturaLargura - rotuloAssWidth) / 2,
    y,
    size: 8.5,
    font,
    color: PDF_COLORS.bodyText,
  });

  y -= 36;

  // 10. LOCAL DE REALIZAÇÃO E EXAMINADOR
  const localFinal = localCustom || teste.local_teste || 'Ambulatório TEN';
  const examinadorFinal = examinadorCustom || teste.examinador_nome || teste.vigilante || '';

  page.drawText(`Local da realização de teste e orientações:`, {
    x: MARGIN,
    y: y + 16,
    size: 8.5,
    font: fontBold,
    color: PDF_COLORS.darkText,
  });

  page.drawText(localFinal, {
    x: MARGIN + 195,
    y: y + 16,
    size: 8.5,
    font,
    color: PDF_COLORS.bodyText,
  });

  const examinadorBoxX = PAGE_WIDTH - MARGIN - 210;
  page.drawLine({
    start: { x: examinadorBoxX, y },
    end: { x: examinadorBoxX + 210, y },
    thickness: 1,
    color: PDF_COLORS.darkText,
  });

  y -= 12;

  const rotuloExam = 'Carimbo / Assinatura do Examinador';
  const rotuloExamWidth = font.widthOfTextAtSize(rotuloExam, 8.5);
  page.drawText(rotuloExam, {
    x: examinadorBoxX + (210 - rotuloExamWidth) / 2,
    y,
    size: 8.5,
    font,
    color: PDF_COLORS.bodyText,
  });

  if (examinadorFinal) {
    y -= 11;
    const examWidth = fontBold.widthOfTextAtSize(examinadorFinal, 8);
    page.drawText(examinadorFinal, {
      x: examinadorBoxX + (210 - examWidth) / 2,
      y,
      size: 8,
      font: fontBold,
      color: PDF_COLORS.primaryNavy,
    });
  }

  // Rodapé Oficial Discreto
  page.drawText(`TEN • SISTEN — Sistema Integrado TEN • Protocolo: ${teste.codigo_formulario}`, {
    x: MARGIN,
    y: 18,
    size: 7,
    font,
    color: PDF_COLORS.mutedLabel,
  });

  const nomeArquivo = `termo-alcoolemia-${teste.codigo_formulario}-${teste.nome.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`;
  await downloadPdf(doc, nomeArquivo);
}
