/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Pré-montagem — exportação do romaneio (Excel e PDF).
 *
 * Glue sobre `projetosRomaneioRelatorio.ts`: monta as duas visões (por
 * níveis / consolidado) e escreve nos formatos que saem da tela — Excel
 * para quem faz o pagamento, PDF para entregar impresso a quem separa.
 * Sem teste próprio, no mesmo padrão de `src/lib/pdfExport/*` — é código
 * de I/O fino, a lógica que importa já está testada no módulo de origem.
 */

import * as XLSX from 'xlsx';
import { createDoc, downloadPdf, PdfTextWriter } from './pdfExport/core';
import { rotuloTramoComZona, zonaPorId } from './projetosZonas';
import { montarLinhasConsolidadas, montarLinhasPorNivel } from './projetosRomaneioRelatorio';
import { formatDateBR } from './format';
import type { ArvoreBom } from './projetosBom';
import type { Tramo } from './projetos';
import type { ProjItem, ProjOrdemPremontagem } from '../types';

function nomeArquivo(ordem: ProjOrdemPremontagem, sufixo: string, extensao: string): string {
  return `romaneio-${ordem.codigo}-${sufixo}.${extensao}`;
}

export function exportarRomaneioExcel(ordem: ProjOrdemPremontagem, arvore: ArvoreBom, itemPorId: Map<string, ProjItem>): void {
  const zona = zonaPorId(ordem.tramo as Tramo, ordem.zona);
  const porNivel = montarLinhasPorNivel(arvore, ordem, itemPorId);
  const consolidado = montarLinhasConsolidadas(ordem.itens ?? [], itemPorId);

  const wb = XLSX.utils.book_new();

  const abaNiveis = porNivel.map((l) => ({
    'Nível': l.nivel,
    'Recuo': '  '.repeat(l.profundidade),
    'Part Number': l.partNumber,
    'Descrição': l.descricao,
    'Tipo': l.folha ? 'Item' : 'Conjunto',
    'Quantidade': l.quantidade ?? '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(abaNiveis), 'Por níveis');

  const abaConsolidado = consolidado.map((l) => ({
    'Part Number': l.partNumber,
    'Cod.Sap': l.codSap ?? '',
    'Descrição': l.descricao,
    'Subconjunto': l.subconjunto ?? '',
    'Localizador': l.localizador ?? '',
    'Quantidade': l.quantidade,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(abaConsolidado), 'Consolidado');

  XLSX.writeFile(wb, nomeArquivo(ordem, `${rotuloTramoComZona(ordem.tramo as Tramo, zona).replace(/[^a-zA-Z0-9]+/g, '-')}`, 'xlsx'));
}

export async function exportarRomaneioPdf(ordem: ProjOrdemPremontagem, arvore: ArvoreBom, itemPorId: Map<string, ProjItem>): Promise<void> {
  const zona = zonaPorId(ordem.tramo as Tramo, ordem.zona);
  const rotulo = rotuloTramoComZona(ordem.tramo as Tramo, zona);
  const porNivel = montarLinhasPorNivel(arvore, ordem, itemPorId);
  const consolidado = montarLinhasConsolidadas(ordem.itens ?? [], itemPorId);

  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc, font, fontBold, logo);

  w.drawDocumentHeader({
    title: `Romaneio de pré-montagem — ${rotulo}`,
    formCode: ordem.codigo,
    emissionDate: formatDateBR(new Date().toISOString()),
  });

  w.drawInfoGrid(
    [
      { label: 'Ordem', value: ordem.codigo },
      { label: 'Alvo', value: rotulo },
      { label: 'Kits', value: String(ordem.quantidade_kits) },
      { label: 'Aberta por', value: ordem.criado_por_nome || '—' },
    ],
    2,
  );

  w.drawSectionHeader('Visão por níveis (composição)', porNivel.length);
  w.drawTable(
    [
      { label: 'Nível', width: 40, align: 'center' },
      { label: 'Part Number', width: 140 },
      { label: 'Descrição', width: 220 },
      { label: 'Qtd', width: 60, align: 'right' },
    ],
    porNivel.map((l) => [
      String(l.nivel),
      `${'  '.repeat(l.profundidade)}${l.partNumber}`,
      l.descricao,
      l.quantidade === null ? '' : String(l.quantidade),
    ]),
  );

  w.spacer(16);
  w.drawSectionHeader('Consolidado por part number (separação física)', consolidado.length);
  w.drawTable(
    [
      { label: 'Part Number', width: 130 },
      { label: 'Cod.Sap', width: 100 },
      { label: 'Descrição', width: 150 },
      { label: 'Localizador', width: 80 },
      { label: 'Qtd', width: 60, align: 'right' },
    ],
    consolidado.map((l) => [l.partNumber, l.codSap ?? '—', l.descricao, l.localizador ?? '—', String(l.quantidade)]),
  );

  w.finalizeDoc(ordem.codigo);
  await downloadPdf(doc, nomeArquivo(ordem, rotulo.replace(/[^a-zA-Z0-9]+/g, '-'), 'pdf'));
}
