/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PDF da Retirada de Material sem Saldo (Solicitação Extraordinária, tipo
 * Sem Saldo — código RSS) para imprimir e colher as assinaturas: quem
 * retirou, o almoxarifado e o gestor que autoriza.
 *
 * Aprovada no sistema, o quadro de autorização traz o nome do gestor e a
 * data/hora da aprovação. Antes disso o documento sai marcado "AGUARDANDO
 * APROVAÇÃO" — a tela avisa e pede confirmação antes de gerar.
 *
 * A assinatura coletada na tela entra sobre a linha "Quem retirou". As fotos
 * dos itens são opcionais (a tela pergunta): vão no fim, em grade, reduzidas
 * por `embutirFotoPdf` (ver `fotosPdf.ts`).
 */

import type { PDFImage } from 'pdf-lib';
import {
  createDoc, docToPdfGerado, MARGIN, PAGE_WIDTH, PDF_COLORS, PdfTextWriter, type PdfGerado,
} from './core';
import { embutirFotoPdf, LADO_FOTO } from './fotosPdf';
import { assinarFotosSolExtra } from '../solicitacaoExtraApi';
import { formatQtd } from '../format';
import { formatarDataBR } from '../fichaEpi';
import { APROVACAO_SOL_EXTRA_ROTULO, CODIGO_FRM_SOL_EXTRA, rotuloStatusSolExtra } from '../solicitacaoExtra';
import type { SolExtra } from '../solicitacaoExtraApi';

export type { PdfGerado };

const COR_APROVACAO = { PENDENTE: 'amber', APROVADA: 'green', REPROVADA: 'red' } as const;

const LARGURA = PAGE_WIDTH - MARGIN * 2;

/** Fotos em grade de 3 por linha, cada uma centrada na sua célula. */
async function desenharFotos(w: PdfTextWriter, urls: string[]) {
  const imagens: PDFImage[] = [];
  for (const url of urls) {
    const img = await embutirFotoPdf(w.getDoc(), url, LADO_FOTO.GRADE).catch(() => null);
    if (img) imagens.push(img);
  }
  if (!imagens.length) return;
  w.drawSectionHeader('Fotos dos itens', imagens.length);
  const porLinha = Math.min(3, imagens.length);
  const gap = 8;
  const celW = (LARGURA - gap * (porLinha - 1)) / porLinha;
  const celH = porLinha === 1 ? 260 : porLinha === 2 ? 180 : 130;
  for (let i = 0; i < imagens.length; i += porLinha) {
    w.ensureSpace(celH + gap);
    const page = w.getPage();
    const topo = w.getY();
    imagens.slice(i, i + porLinha).forEach((img, j) => {
      const x = MARGIN + j * (celW + gap);
      page.drawRectangle({ x, y: topo - celH, width: celW, height: celH, color: PDF_COLORS.cardBg, borderColor: PDF_COLORS.cardBorder, borderWidth: 1 });
      const escala = Math.min((celW - 8) / img.width, (celH - 8) / img.height);
      const dw = img.width * escala;
      const dh = img.height * escala;
      page.drawImage(img, { x: x + (celW - dw) / 2, y: topo - celH + (celH - dh) / 2, width: dw, height: dh });
    });
    w.setY(topo - celH - gap);
  }
}

/** PNG da assinatura (data URL) pronto para o PDF; inválido vira null e a linha fica em branco. */
async function embutirAssinatura(w: PdfTextWriter, dataUrl: string | null): Promise<PDFImage | null> {
  if (!dataUrl?.startsWith('data:image/png;base64,')) return null;
  try {
    const bytes = await (await fetch(dataUrl)).arrayBuffer();
    return await w.getDoc().embedPng(bytes);
  } catch {
    return null;
  }
}

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-');

export async function gerarRetiradaSemSaldoPdf(r: SolExtra, opcoes: { incluirFotos?: boolean } = {}): Promise<PdfGerado> {
  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc, font, fontBold, logo);
  const codigo = r.codigo || 'Pendente de sincronização';
  const aprovacao = r.aprovacao_status ?? 'PENDENTE';
  const rotuloAprovacao = APROVACAO_SOL_EXTRA_ROTULO[aprovacao];

  w.drawDocumentHeader({
    title: 'Retirada de Material sem Saldo',
    formCode: CODIGO_FRM_SOL_EXTRA,
    protocol: codigo,
    emissionDate: new Date().toLocaleDateString('pt-BR'),
    statusBadge: rotuloAprovacao.toUpperCase(),
    statusColor: COR_APROVACAO[aprovacao],
  });

  w.drawSectionHeader('Identificação');
  w.drawInfoGrid(
    [
      { label: 'Quem retirou', value: r.retirante_nome || '-' },
      { label: 'Matrícula', value: r.retirante_matricula || '-' },
      { label: 'Setor solicitante', value: r.setor_solicitante_nome || '-' },
      { label: 'Data', value: formatarDataBR(r.data) },
      { label: 'Hora', value: r.hora?.slice(0, 5) || '-' },
      { label: 'Registrado por', value: r.criado_por_nome || '-' },
    ],
    3,
  );

  w.drawSectionHeader('Materiais', r.itens.length);
  w.drawTable(
    [
      { label: 'Item', width: 30, align: 'center' },
      { label: 'Código SAP', width: 80 },
      { label: 'Descrição', width: 300 },
      { label: 'Quant.', width: 60, align: 'right' },
      { label: 'Un.', width: 45, align: 'center' },
    ],
    r.itens.map((it, i) => [String(i + 1), it.material, it.descricao || '-', formatQtd(it.quantidade), it.unidade || 'UN']),
  );

  if (r.observacao) w.drawCallout('Observação', r.observacao);

  w.drawSectionHeader('Autorização do gestor');
  if (aprovacao === 'APROVADA') {
    w.drawCallout(
      'Aprovada no SISTEN',
      `Retirada aprovada por ${r.aprovado_por_nome || '-'} em ${dataHora(r.aprovado_em)}.${r.aprovacao_obs ? ` Parecer: ${r.aprovacao_obs}` : ''}`,
    );
  } else if (aprovacao === 'REPROVADA') {
    w.drawCallout(
      'Reprovada no SISTEN',
      `Retirada reprovada por ${r.aprovado_por_nome || '-'} em ${dataHora(r.aprovado_em)}. Motivo: ${r.aprovacao_obs || '-'}`,
    );
  } else {
    w.drawCallout(
      'Documento ainda não aprovado',
      `Gerado em ${dataHora(new Date().toISOString())}, antes da aprovação do gestor do setor solicitante no SISTEN. Vale somente com a assinatura de autorização abaixo.`,
    );
  }

  w.drawSectionHeader('Baixa no almoxarifado');
  w.drawInfoGrid(
    [
      { label: 'Situação', value: rotuloStatusSolExtra(r.status, 'SEM_SALDO') },
      { label: 'Requisição no balcão', value: r.requisicao_balcao_codigo || '-' },
      { label: 'Baixada por', value: r.regularizado_por_nome ? `${r.regularizado_por_nome} em ${dataHora(r.regularizado_em)}` : '-' },
    ],
    3,
  );

  // Assinatura desenhada entra sobre a linha "Quem retirou" (1ª das 3 colunas).
  const assinatura = await embutirAssinatura(w, r.assinatura_retirante);
  w.ensureSpace(110);
  const topoAssinaturas = w.getY();
  w.spacer(assinatura ? 48 : 18);
  if (assinatura) {
    const colW = LARGURA / 3;
    const linhaY = w.getY() - 30;
    const altura = 44;
    const largura = colW - 32;
    const escala = Math.min(largura / assinatura.width, altura / assinatura.height);
    const dw = assinatura.width * escala;
    const dh = assinatura.height * escala;
    w.getPage().drawImage(assinatura, { x: MARGIN + (colW - dw) / 2, y: linhaY + 2, width: dw, height: dh });
    if (r.assinatura_retirante_em) {
      w.getPage().drawText(`Assinado em ${dataHora(r.assinatura_retirante_em)}`, {
        x: MARGIN + 16, y: Math.min(topoAssinaturas - 4, linhaY + 2 + dh + 4), size: 6.5, font: w.getFont(), color: PDF_COLORS.mutedLabel,
      });
    }
  }
  w.drawSignatures([
    { role: 'Quem retirou', name: r.retirante_nome || undefined },
    { role: 'Almoxarifado', name: r.criado_por_nome || undefined },
    { role: 'Gestor — autorização', name: aprovacao === 'APROVADA' ? r.aprovado_por_nome || undefined : undefined },
  ]);

  if (opcoes.incluirFotos && r.fotos?.length) {
    const urls = await assinarFotosSolExtra(r.fotos.map(f => f.path)).catch(() => ({} as Record<string, string>));
    w.spacer(14);
    await desenharFotos(w, r.fotos.map(f => urls[f.path]).filter(Boolean));
  }

  w.finalizeDoc(CODIGO_FRM_SOL_EXTRA);
  const nome = (r.codigo || `retirada-sem-saldo-${r.id.slice(0, 8)}`).toLowerCase();
  return docToPdfGerado(doc, `${nome}.pdf`, `Retirada sem saldo ${codigo}`);
}
