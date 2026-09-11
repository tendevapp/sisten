/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Pré-montagem — exportação do romaneio (Excel e PDF).
 *
 * Glue sobre `projetosRomaneioRelatorio.ts`. Duas visões, cada uma um
 * arquivo próprio, nas duas extensões:
 *
 *  - `bom` — "Romaneio por BOM": os níveis pai/filho como a estrutura
 *    indenta. Para conferir composição de conjunto/subconjunto.
 *  - `part-number` — "Por part number": uma linha por peça, as duplicatas
 *    somadas, para quem separa pegar tudo de uma vez.
 *
 * Serve tanto uma ordem já gravada quanto o rascunho da tela de abertura —
 * qualquer coisa que preencha `RomaneioFonte`. Sem teste próprio, no mesmo
 * padrão de `src/lib/pdfExport/*`: a lógica que importa já está testada no
 * módulo de origem.
 */

import * as XLSX from 'xlsx';
import { createDoc, downloadPdf, PdfTextWriter } from './pdfExport/core';
import { rotuloTramoComZona, zonaPorId } from './projetosZonas';
import {
  montarLinhasConsolidadas,
  montarLinhasPorNivel,
  type RomaneioItemFonte,
} from './projetosRomaneioRelatorio';
import { formatDateBR } from './format';
import type { ArvoreBom } from './projetosBom';
import type { Tramo } from './projetos';
import type { ProjItem, ProjOrdemPremontagem } from '../types';

export type RomaneioVisao = 'bom' | 'part-number';
export type RomaneioFormato = 'excel' | 'pdf';

/** Mínimo que as exportações precisam — uma ordem gravada ou um rascunho da tela. */
export interface RomaneioFonte {
  /** Código da ordem; num rascunho, algo como `RASCUNHO`. Vira nome do arquivo. */
  codigo: string;
  tramo: string;
  zona: string | null;
  quantidade_kits: number;
  criado_por_nome: string | null;
  itens: RomaneioItemFonte[];
}

/** Aceita a ordem inteira (`ProjOrdemPremontagem`) direto, sem montar a fonte à mão. */
export function fonteDaOrdem(ordem: ProjOrdemPremontagem): RomaneioFonte {
  return {
    codigo: ordem.codigo,
    tramo: ordem.tramo,
    zona: ordem.zona,
    quantidade_kits: ordem.quantidade_kits,
    criado_por_nome: ordem.criado_por_nome,
    itens: ordem.itens ?? [],
  };
}

function nomeArquivo(fonte: RomaneioFonte, visao: RomaneioVisao, alvo: string, extensao: string): string {
  const alvoSlug = alvo.replace(/[^a-zA-Z0-9]+/g, '-');
  const visaoSlug = visao === 'bom' ? 'por-bom' : 'por-part-number';
  return `romaneio-${fonte.codigo}-${visaoSlug}-${alvoSlug}.${extensao}`;
}

/**
 * Ponto único de saída: escolhe visão (`bom` / `part-number`) e formato
 * (`excel` / `pdf`). Chamado pelos 4 botões da tela.
 */
export async function exportarRomaneio(
  fonte: RomaneioFonte,
  arvore: ArvoreBom,
  itemPorId: Map<string, ProjItem>,
  visao: RomaneioVisao,
  formato: RomaneioFormato,
): Promise<void> {
  if (formato === 'excel') {
    if (visao === 'bom') exportarBomExcel(fonte, arvore, itemPorId);
    else exportarPartNumberExcel(fonte, itemPorId);
    return;
  }
  if (visao === 'bom') await exportarBomPdf(fonte, arvore, itemPorId);
  else await exportarPartNumberPdf(fonte, itemPorId);
}

function exportarBomExcel(fonte: RomaneioFonte, arvore: ArvoreBom, itemPorId: Map<string, ProjItem>): void {
  const zona = zonaPorId(fonte.tramo as Tramo, fonte.zona);
  const alvo = rotuloTramoComZona(fonte.tramo as Tramo, zona);
  const linhas = montarLinhasPorNivel(arvore, fonte, itemPorId);

  const aba = linhas.map((l) => ({
    'Nível': l.nivel,
    'Recuo': '  '.repeat(l.profundidade),
    'Part Number': l.partNumber,
    'Descrição': l.descricao,
    'Tipo': l.folha ? 'Item' : 'Conjunto',
    'Quantidade': l.quantidade ?? '',
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aba), 'Romaneio por BOM');
  XLSX.writeFile(wb, nomeArquivo(fonte, 'bom', alvo, 'xlsx'));
}

function exportarPartNumberExcel(fonte: RomaneioFonte, itemPorId: Map<string, ProjItem>): void {
  const zona = zonaPorId(fonte.tramo as Tramo, fonte.zona);
  const alvo = rotuloTramoComZona(fonte.tramo as Tramo, zona);
  const linhas = montarLinhasConsolidadas(fonte.itens, itemPorId);

  const aba = linhas.map((l) => ({
    'Part Number': l.partNumber,
    'Cod.Sap': l.codSap ?? '',
    'Descrição': l.descricao,
    'Subconjunto': l.subconjunto ?? '',
    'Localizador': l.localizador ?? '',
    'Quantidade': l.quantidade,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aba), 'Por part number');
  XLSX.writeFile(wb, nomeArquivo(fonte, 'part-number', alvo, 'xlsx'));
}

async function cabecalho(fonte: RomaneioFonte, alvo: string) {
  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc, font, fontBold, logo);

  // Título curto de propósito — o texto da visão vive no cabeçalho da seção,
  // que já distingue "por níveis" de "por part number". Prefixo comprido aqui
  // estoura a largura da página com rótulos de zona longos ("Plataforma
  // Superior e Média").
  w.drawDocumentHeader({
    title: `Romaneio de pré-montagem — ${alvo}`,
    formCode: fonte.codigo,
    emissionDate: formatDateBR(new Date().toISOString()),
  });

  w.drawInfoGrid(
    [
      { label: 'Ordem', value: fonte.codigo },
      { label: 'Alvo', value: alvo },
      { label: 'Kits', value: String(fonte.quantidade_kits) },
      { label: 'Aberta por', value: fonte.criado_por_nome || '—' },
    ],
    2,
  );

  return { doc, w };
}

async function exportarBomPdf(fonte: RomaneioFonte, arvore: ArvoreBom, itemPorId: Map<string, ProjItem>): Promise<void> {
  const zona = zonaPorId(fonte.tramo as Tramo, fonte.zona);
  const alvo = rotuloTramoComZona(fonte.tramo as Tramo, zona);
  const linhas = montarLinhasPorNivel(arvore, fonte, itemPorId);

  const { doc, w } = await cabecalho(fonte, alvo);

  w.drawSectionHeader('Visão por níveis (composição pai/filho)', linhas.length);
  w.drawTable(
    [
      { label: 'Nível', width: 40, align: 'center' },
      { label: 'Part Number', width: 140 },
      { label: 'Descrição', width: 220 },
      { label: 'Qtd', width: 60, align: 'right' },
    ],
    linhas.map((l) => [
      String(l.nivel),
      `${'  '.repeat(l.profundidade)}${l.partNumber}`,
      l.descricao,
      l.quantidade === null ? '' : String(l.quantidade),
    ]),
  );

  w.finalizeDoc(fonte.codigo);
  await downloadPdf(doc, nomeArquivo(fonte, 'bom', alvo, 'pdf'));
}

async function exportarPartNumberPdf(fonte: RomaneioFonte, itemPorId: Map<string, ProjItem>): Promise<void> {
  const zona = zonaPorId(fonte.tramo as Tramo, fonte.zona);
  const alvo = rotuloTramoComZona(fonte.tramo as Tramo, zona);
  const linhas = montarLinhasConsolidadas(fonte.itens, itemPorId);

  const { doc, w } = await cabecalho(fonte, alvo);

  w.drawSectionHeader('Consolidado por part number (separação física)', linhas.length);
  w.drawTable(
    [
      { label: 'Part Number', width: 130 },
      { label: 'Cod.Sap', width: 100 },
      { label: 'Descrição', width: 150 },
      { label: 'Localizador', width: 80 },
      { label: 'Qtd', width: 60, align: 'right' },
    ],
    linhas.map((l) => [l.partNumber, l.codSap ?? '—', l.descricao, l.localizador ?? '—', String(l.quantidade)]),
  );

  w.finalizeDoc(fonte.codigo);
  await downloadPdf(doc, nomeArquivo(fonte, 'part-number', alvo, 'pdf'));
}
