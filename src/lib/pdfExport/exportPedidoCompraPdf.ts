/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportação em PDF do pedido de compra de um fornecedor — um documento por
 * PDF, porque o pedido em si é por fornecedor (ver `pedidoCompra.ts`).
 */

import { createDoc, PdfTextWriter, downloadPdf } from './core';
import { formatarCnpj } from '../cotacoes';
import type { PedidoFornecedor } from '../pedidoCompra';

const brl = (v: number | null | undefined) =>
  v == null ? '-' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const FRETE_LABEL: Record<string, string> = { CIF: 'CIF (por conta do fornecedor)', FOB: 'FOB (por conta do comprador)', OUTRO: 'A combinar' };

export async function exportPedidoCompraPdf(pedido: PedidoFornecedor, numeroProcesso: string): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  writer.drawDocumentHeader({
    title: `Pedido de Compra — ${pedido.fornecedorRazaoSocial}`,
    formCode: 'FRM.SUP-0007 (Rev. 00)',
    protocol: numeroProcesso,
  });

  writer.drawInfoGrid([
    { label: 'Fornecedor', value: pedido.fornecedorRazaoSocial, fullWidth: true },
    { label: 'CNPJ', value: pedido.fornecedorCnpj ? formatarCnpj(pedido.fornecedorCnpj) : 'Não identificado' },
    { label: 'Cidade/UF', value: [pedido.fornecedorCidade, pedido.fornecedorUf].filter(Boolean).join('/') || '-' },
    { label: 'Telefone', value: pedido.fornecedorTelefone || '-' },
    { label: 'Nº da proposta', value: pedido.numeroProposta || '-' },
    { label: 'Vendedor', value: pedido.vendedorNome || '-' },
    { label: 'Contato do vendedor', value: [pedido.vendedorEmail, pedido.vendedorTelefone].filter(Boolean).join(' · ') || '-' },
    { label: 'Condição de pagamento', value: pedido.condicaoPagamento || '-' },
    { label: 'Forma de pagamento', value: pedido.formaPagamento || '-' },
    { label: 'Prazo de entrega', value: pedido.prazoEntregaTexto || (pedido.prazoEntregaDias != null ? `${pedido.prazoEntregaDias} dias` : '-') },
    { label: 'Frete', value: pedido.freteModalidade ? (FRETE_LABEL[pedido.freteModalidade] || pedido.freteModalidade) : '-' },
    { label: 'Faturamento mínimo', value: pedido.faturamentoMinimo ? brl(pedido.faturamentoMinimo) : 'Sem mínimo' },
  ], 3);

  if (pedido.dadosBancariosPix) {
    writer.drawCallout('Dados bancários / PIX', pedido.dadosBancariosPix);
  }
  if (pedido.observacoesGerais) {
    writer.drawCallout('Observações da proposta', pedido.observacoesGerais);
  }

  writer.drawSectionHeader('Itens do pedido', pedido.itens.length);

  const tableHeaders = [
    { label: 'ITEM / DESCRIÇÃO', width: 235, align: 'left' as const },
    { label: 'RI', width: 55, align: 'left' as const },
    { label: 'MARCA', width: 70, align: 'left' as const },
    { label: 'QTD / UND', width: 65, align: 'center' as const },
    { label: 'UNIT.', width: 65, align: 'right' as const },
    { label: 'TOTAL', width: 65, align: 'right' as const },
  ];

  const tableRows = pedido.itens.map(it => [
    `${it.descricaoProduto}${it.foraDoEscopo ? ' [fora do escopo da RM]' : ''}`,
    it.ri || '-',
    it.marcaFabricante || '-',
    `${it.quantidade ?? '-'} ${it.unidadeMedida || ''}`.trim(),
    brl(it.precoUnitario),
    brl(it.precoTotal),
  ]);

  writer.drawTable(tableHeaders, tableRows);

  writer.drawCallout(
    'Totais',
    `Subtotal dos itens: ${brl(pedido.subtotal)}${pedido.valorFrete ? ` · Frete: ${brl(pedido.valorFrete)}` : ''} · Total do pedido: ${brl(pedido.total)}`,
  );

  writer.drawSignatures([
    { role: 'Comprador Responsável' },
    { role: 'Aprovação de Compras' },
  ]);

  writer.finalizeDoc('FRM.SUP-0007');

  const nomeArquivo = pedido.fornecedorRazaoSocial.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40);
  await downloadPdf(doc, `pedido-${numeroProcesso}-${nomeArquivo}.pdf`);
}
