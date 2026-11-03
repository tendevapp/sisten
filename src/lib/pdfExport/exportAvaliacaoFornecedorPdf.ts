/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PDFs da Ava. Fornecedor:
 *  - `gerarPdfAvaliacaoFrm`: FRM.SUP-0005 preenchido, na ordem do papel
 *    (cabeçalho, avaliação final, perguntas com as opções marcadas) + quadro
 *    de pesos da planilha.
 *  - `gerarPdfRelatorioFornecedor`: o relatório para enviar ao fornecedor —
 *    X pedidos/itens comprados × Y ocorrências no período, por categoria e
 *    lista. Não leva recado interno nem nome de comprador.
 */

import { rgb } from 'pdf-lib';
import {
  createDoc, docToPdfGerado, MARGIN, PAGE_WIDTH, PDF_COLORS, PdfTextWriter, sanitizeText, wrapText, type PdfGerado,
} from './core';
import {
  CATEGORIA_POR_ID, DECISOES_FRM, DETECCOES, FRM_SUP_0005, GRAVIDADES, faixaDaNota, otd,
  rotuloClassificacao, rotuloTipo, taxaPedidosComOcorrencia,
  type CategoriaOcorrencia, type LinhaPainel,
} from '../avaliacaoFornecedores';
import type { AvaliacaoFrm, RegistroOcorrencia } from '../avaliacaoFornecedoresApi';

export type { PdfGerado };

const FORM_CODE = 'FRM.SUP-0005';
const LARGURA = PAGE_WIDTH - MARGIN * 2;
const BRANCO = rgb(1, 1, 1);

const fmtData = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '-');
const pct = (n: number | null | undefined) => (n == null ? '-' : `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const moeda = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cnpjFmt = (c?: string | null) => {
  const d = (c || '').replace(/\D/g, '');
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : (c || '-');
};

function corClassificacao(nota: number): 'green' | 'amber' | 'red' {
  const c = faixaDaNota(nota).classificacao;
  return c === 'POSITIVA' ? 'green' : c === 'REGULAR' ? 'amber' : 'red';
}

/** Pergunta do FRM com as opções desenhadas como no papel (círculo cheio = marcada). */
function desenharQuestao(
  w: PdfTextWriter,
  q: (typeof FRM_SUP_0005)[number]['questoes'][number],
  resposta: number | undefined,
  justificativa: string | undefined,
) {
  const font = w.getFont();
  const bold = w.getFontBold();
  const linhas = wrapText(sanitizeText(`${q.id}  ${q.texto}`), font, 8.5, LARGURA - 90);
  const just = justificativa?.trim() ? wrapText(sanitizeText(`Justificativa: ${justificativa.trim()}`), font, 8, LARGURA - 20) : [];
  const altura = 10 + linhas.length * 11 + 18 + just.length * 10 + 6;
  w.ensureSpace(altura + 6);
  const page = w.getPage();
  const topo = w.getY();

  page.drawRectangle({
    x: MARGIN, y: topo - altura, width: LARGURA, height: altura,
    color: BRANCO, borderColor: PDF_COLORS.cardBorder, borderWidth: 0.8,
  });

  linhas.forEach((l, i) => {
    page.drawText(l, { x: MARGIN + 10, y: topo - 14 - i * 11, size: 8.5, font, color: PDF_COLORS.darkText });
  });

  const opcao = q.opcoes.find(o => o.valor === resposta);
  const notaTxt = opcao ? `Nota ${pct(opcao.nota)}` : 'Sem resposta';
  page.drawText(sanitizeText(notaTxt), {
    x: MARGIN + LARGURA - 10 - bold.widthOfTextAtSize(notaTxt, 8.5), y: topo - 14, size: 8.5, font: bold,
    color: opcao ? (opcao.nota >= 1 ? rgb(0.05, 0.55, 0.25) : opcao.nota > 0 ? rgb(0.75, 0.45, 0.02) : rgb(0.8, 0.1, 0.1)) : PDF_COLORS.mutedLabel,
  });

  const yOpcoes = topo - 14 - linhas.length * 11 - 6;
  let x = MARGIN + 14;
  for (const o of q.opcoes) {
    const marcada = o.valor === resposta;
    page.drawCircle({
      x: x + 4, y: yOpcoes + 3, size: 4,
      borderColor: marcada ? PDF_COLORS.primaryNavy : PDF_COLORS.mutedLabel, borderWidth: 0.9,
      color: marcada ? PDF_COLORS.primaryNavy : BRANCO,
    });
    const rot = sanitizeText(o.rotulo);
    page.drawText(rot, { x: x + 12, y: yOpcoes, size: 8.5, font: marcada ? bold : font, color: marcada ? PDF_COLORS.primaryNavy : PDF_COLORS.mutedLabel });
    x += 12 + (marcada ? bold : font).widthOfTextAtSize(rot, 8.5) + 26;
  }

  just.forEach((l, i) => {
    page.drawText(l, { x: MARGIN + 10, y: yOpcoes - 14 - i * 10, size: 8, font, color: PDF_COLORS.mutedLabel });
  });

  w.setY(topo - altura - 6);
}

export async function gerarPdfAvaliacaoFrm(av: AvaliacaoFrm): Promise<PdfGerado> {
  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc, font, fontBold, logo);
  const codigo = av.codigo || 'Pendente de sincronização';
  const classif = rotuloClassificacao(av.classificacao);
  const decisao = DECISOES_FRM.find(d => d.valor === av.decisao)?.rotulo || av.decisao;
  const r = av.resumo_periodo || {};

  w.drawDocumentHeader({
    title: 'Questionário para avaliação de desempenho de fornecedores — Materiais',
    formCode: FORM_CODE,
    protocol: codigo,
    emissionDate: new Date().toLocaleDateString('pt-BR'),
    statusBadge: classif.toUpperCase(),
    statusColor: corClassificacao(av.nota_final),
  });

  w.drawSectionHeader('Identificação');
  w.drawInfoGrid([
    { label: 'Empresa', value: av.fornecedor_nome, fullWidth: true },
    { label: 'CNPJ', value: cnpjFmt(av.fornecedor_cnpj) },
    { label: 'Código SAP', value: av.fornecedor_codigo || '-' },
    { label: 'Período', value: `${av.periodo_meses} meses${r.inicio ? ` (${fmtData(r.inicio)} a ${fmtData(r.fim)})` : ''}` },
    { label: 'Data', value: fmtData(av.data_avaliacao) },
    { label: 'Resp. avaliação', value: av.resp_avaliacao || av.criado_por_nome || '-' },
    { label: 'Nota final', value: pct(av.nota_final), highlight: true },
    { label: 'Avaliação final', value: classif, statusBadge: classif.toUpperCase(), statusColor: corClassificacao(av.nota_final) },
    { label: 'Decisão', value: decisao },
  ], 3);

  if (av.justificativa_final?.trim()) {
    w.drawCallout('Justificativa para avaliação final', av.justificativa_final.trim());
  }

  if (r.pedidos != null || r.ocorrencias != null) {
    w.drawSectionHeader('Base do período');
    w.drawInfoGrid([
      { label: 'Pedidos', value: String(r.pedidos ?? 0) },
      { label: 'Itens', value: String(r.itens ?? 0) },
      { label: 'Valor', value: moeda(Number(r.valor || 0)) },
      { label: 'OTD (SAP)', value: pct(r.otd ?? null) },
      { label: 'Registros de ocorrência', value: String(r.registros ?? 0) },
      { label: 'Ocorrências', value: String(r.ocorrencias ?? 0) },
    ], 3);
  }

  for (const c of FRM_SUP_0005) {
    w.drawSectionHeader(`${c.titulo} — ${pct(av.notas_criterio?.[c.id] ?? 0)} de ${pct(c.peso)}`);
    for (const q of c.questoes) desenharQuestao(w, q, av.respostas?.[q.id], av.justificativas?.[q.id]);
  }

  w.drawSectionHeader('Composição da nota');
  w.drawTable(
    [
      { label: 'Critério', width: 220 },
      { label: 'Peso', width: 90, align: 'right' },
      { label: 'Nota obtida', width: 105, align: 'right' },
      { label: 'Aproveitamento', width: 100, align: 'right' },
    ],
    [
      ...FRM_SUP_0005.map(c => {
        const n = av.notas_criterio?.[c.id] ?? 0;
        return [c.titulo, pct(c.peso), pct(n), pct(c.peso ? n / c.peso : 0)];
      }),
      ['Nota final', '100%', pct(av.nota_final), pct(av.nota_final)],
    ],
    (row, col) => (row === FRM_SUP_0005.length && col === 2 ? PDF_COLORS.primaryNavy : undefined),
  );

  w.drawSignatures([{ role: 'Responsável pela avaliação', name: av.resp_avaliacao || av.criado_por_nome || undefined }]);
  w.finalizeDoc(FORM_CODE);
  const nome = (av.codigo || `avaliacao-${av.id.slice(0, 8)}`).toLowerCase();
  return docToPdfGerado(doc, `${nome}.pdf`, `Avaliação ${codigo}`);
}

// ---------------------------------------------------------------------------
// Relatório para o fornecedor
// ---------------------------------------------------------------------------

export interface DadosRelatorioFornecedor {
  linha: LinhaPainel;
  registros: RegistroOcorrencia[];
  inicio: string;
  fim: string;
}

export async function gerarPdfRelatorioFornecedor({ linha, registros, inicio, fim }: DadosRelatorioFornecedor): Promise<PdfGerado> {
  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc, font, fontBold, logo);
  const ocorrencias = registros.flatMap(r => (r.ocorrencias || []).map(o => ({ r, o })));
  const total = ocorrencias.length;
  const taxa = taxaPedidosComOcorrencia(linha);

  w.drawDocumentHeader({
    title: 'Relatório de desempenho do fornecedor',
    formCode: 'SISTEN · SUPRIMENTOS',
    protocol: `${fmtData(inicio)} a ${fmtData(fim)}`,
    emissionDate: new Date().toLocaleDateString('pt-BR'),
    statusBadge: total === 0 ? 'SEM OCORRÊNCIAS' : `${total} OCORRÊNCIA(S)`,
    statusColor: total === 0 ? 'green' : 'amber',
  });

  w.drawSectionHeader('Fornecedor');
  w.drawInfoGrid([
    { label: 'Razão social', value: linha.fornecedor_nome, fullWidth: true },
    { label: 'CNPJ', value: cnpjFmt(linha.cnpj) },
    { label: 'Código SAP', value: linha.fornecedor_codigo || '-' },
    { label: 'Período', value: `${fmtData(inicio)} a ${fmtData(fim)}` },
  ], 3);

  w.drawSectionHeader('Resumo do período');
  w.drawInfoGrid([
    { label: 'Pedidos emitidos', value: String(linha.pedidos), highlight: true },
    { label: 'Itens comprados', value: String(linha.itens), highlight: true },
    { label: 'Valor dos pedidos', value: moeda(linha.valor) },
    { label: 'Entregas no prazo (OTD)', value: pct(otd(linha)) },
    { label: 'Ocorrências registradas', value: String(total), highlight: true },
    { label: 'Pedidos com ocorrência', value: `${linha.pedidos_com_ocorrencia}${taxa != null ? ` (${pct(taxa)})` : ''}` },
  ], 3);

  if (total > 0) {
    const porCat = new Map<string, number>();
    for (const { o } of ocorrencias) porCat.set(o.categoria, (porCat.get(o.categoria) || 0) + 1);
    w.drawSectionHeader('Ocorrências por categoria');
    w.drawTable(
      [
        { label: 'Categoria', width: 260 },
        { label: 'Quantidade', width: 120, align: 'right' },
        { label: '% do total', width: 135, align: 'right' },
      ],
      [...porCat.entries()].sort((a, b) => b[1] - a[1]).map(([cat, n]) => [
        CATEGORIA_POR_ID[cat as CategoriaOcorrencia]?.rotulo || cat, String(n), pct(n / total),
      ]),
    );

    w.drawSectionHeader('Detalhamento', total);
    w.drawTable(
      [
        { label: 'Data', width: 52 },
        { label: 'Registro', width: 70 },
        { label: 'PO', width: 62 },
        { label: 'NF', width: 45 },
        { label: 'Ocorrência', width: 150 },
        { label: 'Gravidade', width: 52 },
        { label: 'Detalhe', width: 84 },
      ],
      ocorrencias.map(({ r, o }) => [
        fmtData(r.data_registro),
        r.codigo || '-',
        r.nro_pedido || '-',
        r.nota_fiscal || '-',
        rotuloTipo(o.tipo),
        GRAVIDADES.find(g => g.valor === o.gravidade)?.rotulo || '-',
        o.descricao || DETECCOES.find(d => d.valor === o.deteccao)?.rotulo || '-',
      ]),
      (row, col) => (col === 5 && ocorrencias[row].o.gravidade === 3 ? rgb(0.8, 0.1, 0.1) : undefined),
    );
  }

  w.drawCallout(
    'Sobre este relatório',
    total === 0
      ? 'Nenhuma ocorrência foi registrada no período. Agradecemos a parceria e o desempenho nos fornecimentos.'
      : 'As ocorrências acima foram registradas pela equipe de Suprimentos no recebimento e no processamento dos pedidos. '
        + 'Pedimos a análise das causas e o retorno com as ações para evitar a repetição nos próximos fornecimentos.',
  );

  w.finalizeDoc('SISTEN · SUP');
  const slug = linha.fornecedor_nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  return docToPdfGerado(doc, `relatorio-fornecedor-${slug}.pdf`, `Relatório — ${linha.fornecedor_nome}`);
}
