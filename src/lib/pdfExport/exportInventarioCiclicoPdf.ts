/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportação em PDF do Inventário Cíclico (FRM.ALM-0015): cabeçalho,
 * resumo, tabela de resultado e os alertas de divergência, com as
 * assinaturas da ficha em papel (responsável e conferente).
 */

import { createDoc, downloadPdf, PDF_COLORS, PdfTextWriter } from './core';
import { formatQtd } from '../format';
import {
  FORM_CODIGO_INVENTARIO, linhasResultado, nomeArquivoInventario, resumirInventario,
  type StatusItemInventario,
} from '../inventarioCiclico';
import type { InventarioParaExportar } from '../inventarioCiclicoPlanilha';

const qtd = (v: number | null) => (v == null ? '-' : formatQtd(v));
const dataBR = (iso: string) => iso.split('-').reverse().join('/');

// A coluna de status é estreita: rótulos curtos para não truncar.
const STATUS_CURTO: Record<StatusItemInventario, string> = {
  pendente: 'A contar',
  aguardando_decisao: 'Recontar?',
  conferido: 'Conferido',
  divergente: 'Divergente',
};

export async function exportInventarioCiclicoPdf(inv: InventarioParaExportar & { status: string }): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc, font, fontBold, logo);
  const resumo = resumirInventario(inv.itens);
  const concluido = inv.status === 'concluido';

  w.drawDocumentHeader({
    title: 'Ficha de Inventário Cíclico',
    formCode: FORM_CODIGO_INVENTARIO,
    protocol: inv.codigo,
    statusBadge: concluido ? 'CONCLUÍDO' : 'EM ANDAMENTO',
    statusColor: concluido ? (resumo.divergentes > 0 ? 'amber' : 'green') : 'blue',
  });

  w.drawInfoGrid([
    { label: 'Data da conferência', value: dataBR(inv.data) },
    { label: 'Responsável', value: inv.criado_por_nome || '-' },
    { label: 'Conferente', value: inv.conferente_nome || '-' },
    { label: 'Critério de seleção', value: inv.criterio || '-' },
    { label: 'Itens', value: String(resumo.total) },
    {
      label: 'Resultado',
      value: `${resumo.conferidos} conferido(s) · ${resumo.divergentes} divergente(s) · ${resumo.pendentes + resumo.aguardando} em aberto`,
      highlight: resumo.divergentes > 0,
    },
    {
      label: 'Acuracidade',
      value: resumo.acuracidade == null ? '-' : `${resumo.acuracidade.toFixed(1).replace('.', ',')}%`,
    },
  ], 2);

  const linhas = linhasResultado(inv.itens);
  w.drawSectionHeader('Resultado da contagem', linhas.length);
  // Largura útil do A4 = 515pt. As colunas de quantidade ganham espaço para
  // valores como "-22.390,5"; a descrição cede (é truncada com "...").
  const COL_CONTAGEM = 5; // índice da 1ª contagem; 2ª e 3ª vêm em seguida
  const COL_SALDO = COL_CONTAGEM + 3;
  const COL_DIF = COL_SALDO + 1;
  const COL_STATUS = COL_DIF + 1;
  w.drawTable(
    [
      { label: 'Item', width: 22, align: 'center' },
      { label: 'Material', width: 48 },
      { label: 'Descrição', width: 104 },
      { label: 'Dep.', width: 28, align: 'center' },
      { label: 'UMB', width: 26, align: 'center' },
      { label: '1ª', width: 46, align: 'right' },
      { label: '2ª', width: 46, align: 'right' },
      { label: '3ª', width: 46, align: 'right' },
      { label: 'ZL0024', width: 50, align: 'right' },
      { label: 'Dif.', width: 46, align: 'right' },
      { label: 'Status', width: 53 },
    ],
    linhas.map((l) => [
      String(l.item), l.material, l.descricao, l.deposito, l.unidade,
      qtd(l.contagens[0]), qtd(l.contagens[1]), qtd(l.contagens[2]),
      qtd(l.saldo), qtd(l.diferenca), STATUS_CURTO[l.situacao],
    ]),
    (row, col) => {
      const l = linhas[row];
      if (col >= COL_CONTAGEM && col < COL_SALDO) {
        return l.contagensDivergentes[col - COL_CONTAGEM] ? PDF_COLORS.badgeRedText : undefined;
      }
      if (col === COL_DIF || col === COL_STATUS) {
        return l.divergente || (col === COL_STATUS && l.contagensDivergentes.some(Boolean)) ? PDF_COLORS.badgeRedText : undefined;
      }
      return undefined;
    },
  );

  const alertas = linhas.filter((l) => l.alerta);
  if (alertas.length > 0) {
    w.drawSectionHeader('Alertas de divergência', alertas.length);
    alertas.forEach((l) => w.drawCallout(`Item ${l.item} · ${l.material} · ${l.descricao}`, l.alerta));
  }

  w.drawSignatures([
    { role: 'Responsável', name: inv.criado_por_nome || undefined },
    { role: 'Conferente', name: inv.conferente_nome || undefined },
  ]);

  w.finalizeDoc(FORM_CODIGO_INVENTARIO);
  await downloadPdf(doc, nomeArquivoInventario(inv.codigo, 'pdf'));
}
