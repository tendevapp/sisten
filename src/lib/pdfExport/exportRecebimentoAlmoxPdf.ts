/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Recebimento — PDF de cada registro (FRM.ALM-0001):
 * ficha cega de volumes, recebimento e contagem, e não conformidade (NCR).
 * Mesmo conteúdo do detalhamento em tela, mais as fotos (URL assinada do
 * bucket `alm-recebimento`) em grade de 2 colunas.
 */

import { PDFDocument, type PDFImage } from 'pdf-lib';
import {
  createDoc, downloadPdf, docToPdfGerado, baixarPdfGerado, type PdfGerado, MARGIN, PDF_COLORS, PdfTextWriter, sanitizeText, type GridField,
} from './core';
export type { PdfGerado };
import { formatDateTimeBR, formatQtd } from '../format';
import {
  ROTULO_DIVERGENCIA, ROTULO_NAO_CONFORMIDADE, separarNotasFiscais,
  type AnexoRecebimento, type FontePedido, type TipoDivergencia,
} from '../recebimentoAlmox';
import {
  assinarEvidencias,
  type CargaRow, type ConferenciaItemRow, type ConferenciaRow, type NaoConformidadeRow,
} from '../recebimentoAlmoxApi';

export const FORM_CODIGO_RECEBIMENTO = 'FRM.ALM-0001';

const dataBR = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const vazio = (v: unknown) => (v === null || v === undefined || v === '' ? '-' : String(v));

const ROTULO_FONTE: Record<FontePedido, string> = {
  cache_sap: 'Cache SAP (ZL0132)',
  supabase: 'Banco (ZL0132)',
  manual: 'Digitada à mão',
  sem_pedido: 'Sem pedido',
};

// ---------------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------------

interface FotoPdf { path: string; legenda: string }

/** Só imagens entram no PDF; PDF anexado no registro fica de fora. */
const fotosDe = (anexos: AnexoRecebimento[] | null | undefined, legenda: string): FotoPdf[] =>
  (anexos ?? []).filter((a) => !a.tipo || a.tipo.startsWith('image/')).map((a) => ({ path: a.path, legenda }));

async function embutirImagem(doc: PDFDocument, url: string): Promise<PDFImage | null> {
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) return null;
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    try {
      return await doc.embedJpg(bytes);
    } catch {
      return await doc.embedPng(bytes);
    }
  } catch {
    return null;
  }
}

const FOTO_ALTURA = 150;
const FOTO_GAP = 10;
const LEGENDA_ALTURA = 11;

/** Seção de fotos: 2 por linha, mantendo a proporção; legenda embaixo de cada uma. */
async function desenharFotos(w: PdfTextWriter, titulo: string, fotos: FotoPdf[]): Promise<void> {
  if (!fotos.length) return;

  const urls = await assinarEvidencias(fotos.map((f) => f.path)).catch(() => ({} as Record<string, string>));
  const doc = w.getDoc();
  const font = w.getFont();
  const largura = (w.getContentWidth() - FOTO_GAP) / 2;

  w.drawSectionHeader(titulo, fotos.length);

  for (let i = 0; i < fotos.length; i += 2) {
    w.ensureSpace(FOTO_ALTURA + LEGENDA_ALTURA + 12);
    const topo = w.getY();
    const page = w.getPage();

    for (let j = 0; j < 2 && i + j < fotos.length; j++) {
      const foto = fotos[i + j];
      const x = MARGIN + j * (largura + FOTO_GAP);
      const fundoY = topo - FOTO_ALTURA;

      page.drawRectangle({
        x, y: fundoY, width: largura, height: FOTO_ALTURA,
        color: PDF_COLORS.cardBg, borderColor: PDF_COLORS.cardBorder, borderWidth: 0.8,
      });

      const url = urls[foto.path];
      const img = url ? await embutirImagem(doc, url) : null;
      if (img) {
        const escala = Math.min((largura - 6) / img.width, (FOTO_ALTURA - 6) / img.height);
        const iw = img.width * escala;
        const ih = img.height * escala;
        page.drawImage(img, { x: x + (largura - iw) / 2, y: fundoY + (FOTO_ALTURA - ih) / 2, width: iw, height: ih });
      } else {
        page.drawText('Foto indisponível', { x: x + 8, y: fundoY + FOTO_ALTURA / 2, size: 8, font, color: PDF_COLORS.mutedLabel });
      }

      page.drawText(sanitizeText(`${i + j + 1}. ${foto.legenda}`).slice(0, 90), {
        x, y: fundoY - 9, size: 7, font, color: PDF_COLORS.mutedLabel,
      });
    }
    w.setY(topo - FOTO_ALTURA - LEGENDA_ALTURA - 8);
  }
}

// ---------------------------------------------------------------------------
// Ficha cega de volumes
// ---------------------------------------------------------------------------

export async function gerarFichaCegaPdf(c: CargaRow): Promise<PdfGerado> {
  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc, font, fontBold, logo);

  w.drawDocumentHeader({
    title: 'Ficha Cega de Volumes',
    formCode: FORM_CODIGO_RECEBIMENTO,
    protocol: c.codigo,
    statusBadge: c.divergencia ? 'DIVERGENTE' : c.status.replace('_', ' ').toUpperCase(),
    statusColor: c.divergencia ? 'red' : c.status === 'conferida' ? 'green' : 'blue',
  });

  const notas = separarNotasFiscais(c.nota_fiscal);
  const campos: GridField[] = [
    { label: 'Data', value: dataBR(c.data) },
    { label: 'Transportadora', value: vazio(c.transportadora) },
    { label: 'Placa', value: vazio(c.veiculo_placa) },
    { label: 'Motorista', value: vazio(c.motorista) },
    { label: 'CT-e / canhoto', value: vazio(c.doc_transporte) },
    { label: 'PO', value: vazio(c.nro_pedido) },
    { label: 'Volumes contados', value: String(c.qtd_volumes_contada) },
    { label: 'Volumes declarados', value: vazio(c.qtd_volumes_declarada) },
    { label: 'Embalagem', value: vazio(c.tipo_embalagem) },
    { label: 'Lacre íntegro', value: c.lacre_integro == null ? '-' : c.lacre_integro ? 'Sim' : 'Não' },
    { label: 'Peso declarado', value: vazio(c.peso_declarado) },
    { label: 'Destino previsto', value: vazio(c.destino_previsto) },
    { label: 'Notas fiscais', value: notas.length ? notas.join(' · ') : '-', fullWidth: true },
    { label: 'Criado por', value: vazio(c.criado_por_nome) },
    { label: 'Registrado em', value: vazio(formatDateTimeBR(c.created_at)) },
  ];
  w.drawInfoGrid(campos, 2);

  if (c.avaria_aparente) w.drawCallout('Avaria aparente', c.avaria_descricao || 'Sim, sem descrição.');
  if (c.observacao) w.drawCallout('Observação', c.observacao);

  await desenharFotos(w, 'Fotos da carga', fotosDe(c.evidencias, c.codigo));

  w.drawSignatures([
    { role: 'Conferente (Almoxarifado)', name: c.criado_por_nome || undefined },
    { role: 'Motorista', name: c.motorista || undefined },
  ]);

  w.finalizeDoc(FORM_CODIGO_RECEBIMENTO);
  return docToPdfGerado(doc, `${c.codigo}.pdf`, `Ficha Cega ${c.codigo}`);
}

export async function exportFichaCegaPdf(c: CargaRow): Promise<void> {
  const pdf = await gerarFichaCegaPdf(c);
  if (pdf.doc) await downloadPdf(pdf.doc, pdf.nomeArquivo);
  else baixarPdfGerado(pdf);
}

// ---------------------------------------------------------------------------
// Recebimento e contagem
// ---------------------------------------------------------------------------

function situacaoItem(it: ConferenciaItemRow): { texto: string; divergente: boolean; parcial: boolean } {
  if (it.divergencia) {
    const t = it.tipo_divergencia as TipoDivergencia | null | undefined;
    return { texto: (t && ROTULO_DIVERGENCIA[t]) || 'Divergente', divergente: true, parcial: false };
  }
  if (it.parcial) return { texto: 'Parcial', divergente: false, parcial: true };
  return { texto: it.conferido ? 'Conferido' : 'Não conferido', divergente: false, parcial: false };
}

export async function gerarConferenciaPdf(c: ConferenciaRow, opcoes: { cargaCodigo?: string | null } = {}): Promise<PdfGerado> {
  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc, font, fontBold, logo);

  const divergente = c.itens_divergentes > 0;
  w.drawDocumentHeader({
    title: 'Recebimento e Contagem de Material',
    formCode: FORM_CODIGO_RECEBIMENTO,
    protocol: c.codigo,
    statusBadge: divergente ? 'COM DIVERGÊNCIA' : 'CONFERIDO',
    statusColor: divergente ? 'red' : 'green',
  });

  const pos = c.pedidos?.length ? c.pedidos : c.nro_pedido ? [c.nro_pedido] : [];
  const parciais = c.itens.filter((i) => i.parcial).length;
  w.drawInfoGrid([
    { label: 'Data', value: dataBR(c.data) },
    { label: 'Fornecedor', value: vazio(c.fornecedor) },
    { label: 'RM', value: vazio(c.rm) },
    { label: 'Depósito / localizador', value: vazio(c.deposito) },
    { label: 'Tipo de item', value: vazio(c.tipo_item) },
    { label: 'Ficha cega', value: vazio(opcoes.cargaCodigo) },
    { label: 'Origem da lista', value: ROTULO_FONTE[c.fonte_pedido] ?? c.fonte_pedido },
    {
      label: 'Resumo',
      value: `${c.total_itens} itens · ${c.itens_ok} ok${parciais ? ` · ${parciais} parcial` : ''} · ${c.itens_divergentes} divergente(s)`,
      highlight: divergente,
    },
    { label: 'Pedidos (PO)', value: pos.length ? pos.join(' · ') : '-', fullWidth: true },
    { label: 'Criado por', value: vazio(c.criado_por_nome) },
    { label: 'Registrado em', value: vazio(formatDateTimeBR(c.created_at)) },
  ], 2);

  if (c.observacao) w.drawCallout('Observação', c.observacao);

  w.drawSectionHeader('Itens conferidos', c.itens.length);
  const situacoes = c.itens.map(situacaoItem);
  w.drawTable(
    [
      { label: '#', width: 22, align: 'center' },
      { label: 'Material', width: 54 },
      { label: 'Descrição', width: 195 },
      { label: 'PO', width: 58 },
      { label: 'Pedido', width: 45, align: 'right' },
      { label: 'Recebido', width: 48, align: 'right' },
      { label: 'Situação', width: 93 },
    ],
    c.itens.map((it, i) => [
      String(i + 1),
      vazio(it.material_code),
      vazio(it.descricao),
      vazio(it.nro_pedido),
      it.qtd_pedido == null ? '-' : formatQtd(it.qtd_pedido),
      `${formatQtd(it.qtd_recebida)}${it.unidade ? ` ${it.unidade}` : ''}`,
      situacoes[i].texto,
    ]),
    (row, col) => {
      if (col < 5) return undefined;
      if (situacoes[row].divergente) return PDF_COLORS.badgeRedText;
      if (situacoes[row].parcial && col === 6) return PDF_COLORS.badgeAmberText;
      return undefined;
    },
  );

  const comNota = c.itens
    .map((it, i) => ({ it, n: i + 1 }))
    .filter(({ it }) => it.observacao || (it.qtd_ja_fornecida && it.qtd_pedido != null));
  if (comNota.length) {
    w.drawSectionHeader('Observações por item', comNota.length);
    for (const { it, n } of comNota) {
      const partes: string[] = [];
      if (it.qtd_ja_fornecida && it.qtd_pedido != null) {
        partes.push(`Entrega parcial no PO: já recebido ${formatQtd(it.qtd_ja_fornecida)} de ${formatQtd(it.qtd_pedido)}.`);
      }
      if (it.observacao) partes.push(it.observacao);
      w.drawCallout(`Item ${n} · ${vazio(it.material_code)} · ${vazio(it.descricao)}`, partes.join(' '));
    }
  }

  if (c.nc?.length) {
    w.drawSectionHeader('Não conformidades abertas', c.nc.length);
    for (const n of c.nc) {
      const tipo = ROTULO_NAO_CONFORMIDADE[n.tipo as keyof typeof ROTULO_NAO_CONFORMIDADE] ?? n.tipo;
      w.drawCallout(`${n.codigo} · ${tipo} · ${n.status.replace('_', ' ')}`, n.descricao || 'Sem descrição.');
    }
  }

  const fotos: FotoPdf[] = [
    ...fotosDe(c.evidencias, `Geral — ${c.codigo}`),
    ...c.itens.flatMap((it) => fotosDe(it.evidencias, `${vazio(it.material_code)} ${it.descricao ?? ''}`.trim())),
  ];
  await desenharFotos(w, 'Fotos do recebimento', fotos);

  w.drawSignatures([
    { role: 'Conferente (Almoxarifado)', name: c.criado_por_nome || undefined },
    { role: 'Responsável do Almoxarifado' },
  ]);

  w.finalizeDoc(FORM_CODIGO_RECEBIMENTO);
  return docToPdfGerado(doc, `${c.codigo}.pdf`, `Conferência ${c.codigo}`);
}

export async function exportConferenciaPdf(c: ConferenciaRow, opcoes: { cargaCodigo?: string | null } = {}): Promise<void> {
  const pdf = await gerarConferenciaPdf(c, opcoes);
  if (pdf.doc) await downloadPdf(pdf.doc, pdf.nomeArquivo);
  else baixarPdfGerado(pdf);
}

// ---------------------------------------------------------------------------
// Não conformidade (NCR)
// ---------------------------------------------------------------------------

const COR_STATUS_NC = { aberta: 'red', em_tratativa: 'amber', resolvida: 'green' } as const;

export async function gerarNaoConformidadePdf(n: NaoConformidadeRow): Promise<PdfGerado> {
  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc, font, fontBold, logo);

  w.drawDocumentHeader({
    title: 'Não Conformidade de Recebimento',
    formCode: FORM_CODIGO_RECEBIMENTO,
    protocol: n.codigo,
    statusBadge: n.status.replace('_', ' ').toUpperCase(),
    statusColor: COR_STATUS_NC[n.status] ?? 'blue',
  });

  w.drawInfoGrid([
    { label: 'Tipo', value: ROTULO_NAO_CONFORMIDADE[n.tipo as keyof typeof ROTULO_NAO_CONFORMIDADE] ?? n.tipo },
    { label: 'Severidade', value: n.severidade.toUpperCase(), highlight: n.severidade === 'alta' },
    { label: 'Fornecedor', value: vazio(n.fornecedor) },
    { label: 'PO', value: vazio(n.nro_pedido) },
    { label: 'Responsável pela tratativa', value: vazio(n.responsavel) },
    { label: 'Aberta em', value: vazio(formatDateTimeBR(n.created_at)) },
    { label: 'Resolvida em', value: n.resolvida_em ? formatDateTimeBR(n.resolvida_em) : '-' },
  ], 2);

  w.drawCallout('Descrição', n.descricao || 'Sem descrição.');
  if (n.resolucao) w.drawCallout('Resolução', n.resolucao);

  const itens = Array.isArray(n.itens_resumo) ? n.itens_resumo : [];
  if (itens.length) {
    w.drawSectionHeader('Itens divergentes', itens.length);
    w.drawTable(
      [
        { label: 'Material', width: 60 },
        { label: 'Descrição', width: 235 },
        { label: 'Situação', width: 90 },
        { label: 'No pedido', width: 60, align: 'right' },
        { label: 'Verificado', width: 70, align: 'right' },
      ],
      itens.map((it: any) => [
        vazio(it.material_code),
        vazio(it.descricao),
        it.tipo_divergencia
          ? ROTULO_DIVERGENCIA[it.tipo_divergencia as TipoDivergencia] ?? it.tipo_divergencia
          : ROTULO_NAO_CONFORMIDADE[n.tipo as keyof typeof ROTULO_NAO_CONFORMIDADE] ?? n.tipo,
        it.qtd_pedido == null ? '-' : formatQtd(it.qtd_pedido),
        (it.qtd_verificada ?? it.qtd_recebida) == null ? '-' : formatQtd(it.qtd_verificada ?? it.qtd_recebida),
      ]),
      (_row, col) => (col === 2 ? PDF_COLORS.badgeRedText : undefined),
    );
  }

  if (n.acoes?.length) {
    w.drawSectionHeader('Ações da tratativa', n.acoes.length);
    for (const a of n.acoes) {
      w.drawCallout(`${formatDateTimeBR(a.em)} · ${a.por_nome || '-'}`, a.texto || 'Ação registrada só com fotos.');
    }
  }

  const fotos: FotoPdf[] = [
    ...fotosDe(n.evidencias, `Geral — ${n.codigo}`),
    ...(n.acoes ?? []).flatMap((a) => fotosDe(a.evidencias, `Ação ${formatDateTimeBR(a.em)}`)),
  ];
  await desenharFotos(w, 'Fotos da NCR', fotos);

  w.drawSignatures([
    { role: 'Responsável pela tratativa', name: n.responsavel || undefined },
    { role: 'Almoxarifado' },
  ]);

  w.finalizeDoc(FORM_CODIGO_RECEBIMENTO);
  return docToPdfGerado(doc, `${n.codigo}.pdf`, `Não Conformidade ${n.codigo}`);
}

export async function exportNaoConformidadePdf(n: NaoConformidadeRow): Promise<void> {
  const pdf = await gerarNaoConformidadePdf(n);
  if (pdf.doc) await downloadPdf(pdf.doc, pdf.nomeArquivo);
  else baixarPdfGerado(pdf);
}
