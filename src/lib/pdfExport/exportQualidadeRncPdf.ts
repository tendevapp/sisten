/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Gerador de PDF do módulo Qualidade — RNC (Relatório de Não Conformidade):
 * 1. Relatório individual (abertura de uma RNC).
 * 2. Relatório consolidado de várias RNCs, no formato do "Apanhado Geral de
 *    Não Conformidades" (contadores no topo + um cartão por RNC), com os
 *    campos que o usuário escolher incluir.
 */

import { createDoc, PdfTextWriter, downloadPdf } from './core';
import type { QuaRnc, QuaRelatorioCampos } from '../../types';
import { renovarUrlsAnexos } from '../qualidadeApi';

function formatDataBR(iso?: string | null): string {
  if (!iso) return '-';
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const STATUS_LABEL: Record<QuaRnc['status'], string> = {
  ABERTA: 'ABERTA',
  EM_TRATAMENTO: 'EM TRATAMENTO',
  CONCLUIDA: 'CONCLUÍDA',
  CANCELADA: 'CANCELADA',
};

const STATUS_COLOR: Record<QuaRnc['status'], 'green' | 'amber' | 'blue' | 'red'> = {
  ABERTA: 'amber',
  EM_TRATAMENTO: 'blue',
  CONCLUIDA: 'green',
  CANCELADA: 'red',
};

function drawIdentificacao(writer: PdfTextWriter, rnc: QuaRnc) {
  writer.drawInfoGrid(
    [
      { label: 'Emissor', value: rnc.emissor_nome },
      { label: 'Responsável', value: rnc.responsavel_nome || '-' },
      { label: 'Data de Emissão', value: formatDataBR(rnc.data_emissao) },
      { label: 'Data da Ocorrência', value: formatDataBR(rnc.data_ocorrencia) },
      { label: 'Origem da NC', value: rnc.origem_nc === 'FORNECEDOR' ? 'Fornecedor' : 'Processo' },
      { label: 'Documento de Origem', value: rnc.documento_origem || '-' },
      { label: 'Área Geradora', value: rnc.area_geradora || '-' },
      { label: 'Tipo de Não Conformidade', value: rnc.tipo_nc || '-' },
      { label: 'Fornecedor', value: rnc.fornecedor || '-' },
      { label: 'Nº Pedido de Compra', value: rnc.numero_pedido_compra || '-' },
      { label: 'Cliente', value: rnc.cliente || '-' },
      { label: 'Projeto', value: rnc.projeto || '-' },
      { label: 'Tramo / Sequencial', value: rnc.tramo_sequencial || '-' },
    ],
    3
  );
}

function drawPlanoAcao(writer: PdfTextWriter, rnc: QuaRnc) {
  const atividades = rnc.plano_acao || [];
  writer.drawSectionHeader('Plano de Ação', atividades.length);

  if (atividades.length === 0) {
    writer.drawCallout('Sem Plano de Ação', 'Nenhuma atividade de plano de ação cadastrada até o momento.');
    return;
  }

  const headers = [
    { label: 'SEQ', width: 30, align: 'center' as const },
    { label: 'O QUE', width: 165, align: 'left' as const },
    { label: 'QUEM', width: 90, align: 'left' as const },
    { label: 'QUANDO (PLANEJADO)', width: 100, align: 'center' as const },
    { label: 'INÍCIO / TÉRMINO REAL', width: 100, align: 'center' as const },
    { label: 'STATUS', width: 30, align: 'center' as const },
  ];

  const rows = atividades.map((a) => [
    String(a.sequencial),
    a.o_que,
    a.quem_nome || '-',
    `${formatDataBR(a.quando_inicio)} a\n${formatDataBR(a.quando_fim)}`,
    `${formatDataBR(a.inicio_real)} a\n${formatDataBR(a.termino_real)}`,
    a.status === 'CONCLUIDA' ? 'OK' : a.status === 'EM_ANDAMENTO' ? 'EM AND.' : 'PEND.',
  ]);

  writer.drawTable(headers, rows);
}

// =====================================================================
// 1. Relatório individual de uma RNC
// =====================================================================
export async function exportRncPdf(rnc: QuaRnc): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  writer.drawDocumentHeader({
    title: 'Relatório de Não Conformidade (RNC)',
    formCode: 'FRM.QUA-0026',
    protocol: rnc.numero_rnc_externo || rnc.numero_registro,
    statusBadge: STATUS_LABEL[rnc.status],
    statusColor: STATUS_COLOR[rnc.status],
  });

  writer.drawSectionHeader('Identificação');
  drawIdentificacao(writer, rnc);

  writer.drawSectionHeader('Descrição');
  writer.drawCallout('Descrição da Não Conformidade', rnc.descricao);

  drawPlanoAcao(writer, rnc);

  writer.drawSignatures([
    { role: 'Emissor', name: rnc.emissor_nome },
    { role: 'Responsável pela Disposição', name: rnc.responsavel_nome || undefined },
    { role: 'Controle da Qualidade' },
  ]);

  const anexos = rnc.anexos.filter((a) => a.mime_type.startsWith('image/'));
  if (anexos.length > 0) {
    const renovados = await renovarUrlsAnexos(anexos);
    await writer.drawPhotoAttachments(
      renovados
        .filter((a) => a.preview_url)
        .map((a, idx) => ({
          title: `Evidência #${idx + 1} — ${rnc.numero_registro}`,
          reference: a.name,
          description: undefined,
          timestamp: formatDataBR(rnc.data_ocorrencia || rnc.data_emissao),
          source: a.preview_url as string,
        }))
    );
  }

  writer.finalizeDoc('FRM.QUA-0026');
  await downloadPdf(doc, `rnc-${rnc.numero_registro}.pdf`);
}

// =====================================================================
// 2. Relatório consolidado de múltiplas RNCs (formato "Apanhado Geral")
// =====================================================================
export const CAMPOS_RELATORIO_PADRAO: QuaRelatorioCampos = {
  identificacao: true,
  descricao: true,
  planoAcao: true,
  fotos: true,
};

export async function exportRncConsolidadoPdf(
  rncs: QuaRnc[],
  campos: QuaRelatorioCampos = CAMPOS_RELATORIO_PADRAO
): Promise<void> {
  if (rncs.length === 0) return;
  if (rncs.length === 1 && campos.identificacao && campos.descricao && campos.planoAcao && campos.fotos) {
    return exportRncPdf(rncs[0]);
  }

  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  const totalFotos = campos.fotos
    ? rncs.reduce((soma, r) => soma + r.anexos.filter((a) => a.mime_type.startsWith('image/')).length, 0)
    : 0;
  const fornecedores = Array.from(new Set(rncs.map((r) => r.fornecedor).filter(Boolean))) as string[];

  writer.drawDocumentHeader({
    title: 'Apanhado Geral de Não Conformidades',
    formCode: 'FRM.QUA-0026',
    protocol: `CSL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
  });

  writer.drawInfoGrid(
    [
      { label: 'Total de RNCs Consolidadas', value: `${rncs.length}` },
      { label: 'Evidências Fotográficas', value: campos.fotos ? `${totalFotos}` : 'Não incluídas' },
      { label: 'Fornecedor(es)', value: fornecedores.join(', ') || 'Diversos / Não informado' },
    ],
    3
  );

  for (let i = 0; i < rncs.length; i++) {
    const rnc = rncs[i];
    writer.drawSectionHeader(
      `NC ${String(i + 1).padStart(2, '0')} — ${rnc.numero_rnc_externo || rnc.numero_registro}`,
      STATUS_LABEL[rnc.status]
    );

    if (campos.identificacao) {
      drawIdentificacao(writer, rnc);
    }

    if (campos.descricao) {
      writer.drawCallout('Descrição da Não Conformidade', rnc.descricao);
    }

    if (campos.planoAcao) {
      drawPlanoAcao(writer, rnc);
    }
  }

  writer.drawSignatures([{ role: 'Controle da Qualidade' }, { role: 'Coordenação de Qualidade' }]);

  if (campos.fotos) {
    for (const rnc of rncs) {
      const anexos = rnc.anexos.filter((a) => a.mime_type.startsWith('image/'));
      if (anexos.length === 0) continue;
      const renovados = await renovarUrlsAnexos(anexos);
      await writer.drawPhotoAttachments(
        renovados
          .filter((a) => a.preview_url)
          .map((a, idx) => ({
            title: `${rnc.numero_registro} — Evidência #${idx + 1}`,
            reference: a.name,
            timestamp: formatDataBR(rnc.data_ocorrencia || rnc.data_emissao),
            source: a.preview_url as string,
          }))
      );
    }
  }

  writer.finalizeDoc('FRM.QUA-0026');
  await downloadPdf(doc, `rnc-consolidado-${rncs.length}-registros.pdf`);
}
