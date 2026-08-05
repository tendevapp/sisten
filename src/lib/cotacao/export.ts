/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Export do mapa de cotação — Excel (xlsx, mesmo idioma do resto do repo:
 * json_to_sheet → writeFile com timestamp ISO) e PDF (pdf-lib via
 * src/lib/pdfExport/core.ts, que já resolve A4/quebra de página/logo).
 * Deliberadamente não usa `exceljs` nem `jspdf` — `exceljs` está no
 * package.json sem nenhum consumidor e não deve ganhar o primeiro aqui.
 */

import * as XLSX from 'xlsx';
import { PdfTextWriter, createDoc, downloadPdf } from '../pdfExport/core';
import { formatBRL, formatDateBR, EMPTY } from '../format';
import type { CotacaoLote } from '../../types';

export interface MapaExportFornecedor {
  propostaId: string;
  nome: string;
  totalComFrete: number | null;
  freteValor: number | null;
  pagamentoLabel: string;
  validadeLabel: string;
  faturamentoMinimoLabel: string;
  vencedorPorTotal: boolean;
  validacaoStatus: string;
}

export interface MapaExportCelula {
  custoTotal: number | null;
  precoEfetivo: number | null;
  naoCotado: boolean;
  divergente: boolean;
  divergenciaDetalhe: string | null;
  vencedor: boolean;
  deltaPercentual: number | null;
}

export interface MapaExportLinha {
  descricao: string;
  referencia: string;
  ri: string;
  quantidade: number | null;
  unidade: string;
  porFornecedor: Record<string, MapaExportCelula>;
}

export interface MapaExportDetalheFiscal {
  fornecedor: string;
  item: string;
  numeroOriginal: string;
  ncm: string;
  cst: string;
  cfop: string;
  ipiPercentual: number | null;
  icmsPercentual: number | null;
  icmsReducaoPercentual: number | null;
  stPercentual: number | null;
  pisPercentual: number | null;
  cofinsPercentual: number | null;
  precoEfetivo: number | null;
  custoTotal: number | null;
}

export interface MapaExportData {
  lote: CotacaoLote;
  fornecedores: MapaExportFornecedor[];
  linhas: MapaExportLinha[];
  detalheFiscal: MapaExportDetalheFiscal[];
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function exportarExcel(dados: MapaExportData): void {
  const linhasMapa = dados.linhas.map(linha => {
    const linhaPlana: Record<string, unknown> = {
      'Item': linha.descricao,
      'Referência': linha.referencia || EMPTY,
      'RM/RI': linha.ri || EMPTY,
      'Qtd.': linha.quantidade ?? EMPTY,
      'Unid.': linha.unidade || EMPTY,
    };
    for (const f of dados.fornecedores) {
      const celula = linha.porFornecedor[f.propostaId];
      linhaPlana[f.nome] = celula?.naoCotado
        ? 'Não cotado'
        : celula?.custoTotal != null
          ? (celula.divergente ? `${celula.custoTotal.toFixed(2)} (divergente: ${celula.divergenciaDetalhe ?? ''})` : celula.custoTotal.toFixed(2))
          : EMPTY;
    }
    return linhaPlana;
  });

  const linhaTotais: Record<string, unknown> = { 'Item': 'TOTAL DA PROPOSTA (com frete)', 'Referência': '', 'RM/RI': '', 'Qtd.': '', 'Unid.': '' };
  const linhaFrete: Record<string, unknown> = { 'Item': 'Frete', 'Referência': '', 'RM/RI': '', 'Qtd.': '', 'Unid.': '' };
  const linhaPagamento: Record<string, unknown> = { 'Item': 'Pagamento', 'Referência': '', 'RM/RI': '', 'Qtd.': '', 'Unid.': '' };
  const linhaValidade: Record<string, unknown> = { 'Item': 'Validade', 'Referência': '', 'RM/RI': '', 'Qtd.': '', 'Unid.': '' };
  for (const f of dados.fornecedores) {
    linhaTotais[f.nome] = f.totalComFrete != null ? f.totalComFrete.toFixed(2) : EMPTY;
    linhaFrete[f.nome] = f.freteValor != null ? f.freteValor.toFixed(2) : '0,00';
    linhaPagamento[f.nome] = f.pagamentoLabel;
    linhaValidade[f.nome] = f.validadeLabel;
  }

  const wsMapa = XLSX.utils.json_to_sheet([...linhasMapa, {}, linhaTotais, linhaFrete, linhaPagamento, linhaValidade]);
  const wsFiscal = XLSX.utils.json_to_sheet(dados.detalheFiscal.map(d => ({
    'Fornecedor': d.fornecedor,
    'Item': d.item,
    'Nº original': d.numeroOriginal,
    'NCM': d.ncm,
    'CST': d.cst,
    'CFOP': d.cfop,
    '%IPI': d.ipiPercentual ?? EMPTY,
    '%ICMS': d.icmsPercentual ?? EMPTY,
    '%Red': d.icmsReducaoPercentual ?? EMPTY,
    '%ST': d.stPercentual ?? EMPTY,
    '%PIS': d.pisPercentual ?? EMPTY,
    '%COFINS': d.cofinsPercentual ?? EMPTY,
    'Preço líquido': d.precoEfetivo ?? EMPTY,
    'Custo total unit.': d.custoTotal ?? EMPTY,
  })));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsMapa, 'Mapa');
  XLSX.utils.book_append_sheet(wb, wsFiscal, 'Detalhe fiscal');
  XLSX.writeFile(wb, `mapa_cotacao_${dados.lote.numero ?? dados.lote.id}_${timestamp()}.xlsx`);
}

export async function exportarPdf(dados: MapaExportData): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  writer.drawTitle(`Mapa de Cotação — ${dados.lote.numero ?? ''}`);
  writer.drawSubtitle(dados.lote.titulo);
  writer.drawField('Gerado em', formatDateBR(new Date().toISOString()));
  writer.spacer(6);

  for (const linha of dados.linhas) {
    writer.drawSubtitle(`${linha.descricao}${linha.referencia ? ` (${linha.referencia})` : ''}`);
    for (const f of dados.fornecedores) {
      const celula = linha.porFornecedor[f.propostaId];
      const valor = celula?.naoCotado
        ? 'Não cotado'
        : celula?.custoTotal != null
          ? `${formatBRL(celula.custoTotal)}${celula.vencedor ? ' — MELHOR PREÇO' : ''}${celula.divergente ? ` — DIVERGENTE: ${celula.divergenciaDetalhe ?? ''}` : ''}`
          : EMPTY;
      writer.drawTableRow(`${f.nome}: ${valor}`);
    }
    writer.spacer(4);
  }

  writer.drawSubtitle('Total por proposta (com frete)');
  for (const f of dados.fornecedores) {
    writer.drawTableRow(
      `${f.nome}${f.vencedorPorTotal ? ' ✓' : ''}: ${formatBRL(f.totalComFrete)} · Frete ${formatBRL(f.freteValor)} · Pagamento ${f.pagamentoLabel} · Validade ${f.validadeLabel} · Fat. mínimo ${f.faturamentoMinimoLabel}`,
    );
  }

  await downloadPdf(doc, `mapa_cotacao_${dados.lote.numero ?? dados.lote.id}_${timestamp()}.pdf`);
}
