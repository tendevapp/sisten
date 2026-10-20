/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Solicitação Extraordinária de Materiais (FRM.ALM-0013) — exportação XLSX.
 *
 * Uma linha por material, repetindo os dados da solicitação: é o formato que
 * dá para filtrar por material pendente na hora de lançar a baixa no SAP.
 * A conversão mora aqui, sem React e sem Supabase (como a planilha da
 * Requisição no Balcão), porque é ela que precisa de teste.
 */

import * as XLSX from 'xlsx';
import { STATUS_SOL_EXTRA_ROTULO, rotuloMotivo } from './solicitacaoExtra';
import type { SolExtra } from './solicitacaoExtraApi';

export const SOL_EXTRA_COLUNAS = [
  'Código',
  'Data',
  'Hora',
  'Turno',
  'Projeto',
  'Nº tramo',
  'Item',
  'Código SAP',
  'Descrição',
  'Quantidade',
  'Unidade',
  'Motivo',
  'Detalhe do motivo',
  'Área reparada (m²)',
  'Rugosidade (µm)',
  'Observação',
  'Situação',
  'Doc. SAP',
  'Regularizado por',
  'Regularizado em',
  'Registrado por',
] as const;

export type ColunaSolExtra = (typeof SOL_EXTRA_COLUNAS)[number];
export type LinhaPlanilhaSolExtra = Record<ColunaSolExtra, string | number>;

/** `2026-10-20` → `20/10/2026` sem passar por `new Date` (evita o dia anterior em UTC-3). */
function dataBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/** Instante (timestamptz) no fuso de quem exporta, `DD/MM/AAAA HH:MM`. */
function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

export function montarLinhasSolExtra(registros: SolExtra[]): LinhaPlanilhaSolExtra[] {
  return registros.flatMap(r =>
    r.itens.map((it, i) => ({
      'Código': r.codigo ?? '',
      'Data': dataBR(r.data),
      'Hora': r.hora?.slice(0, 5) ?? '',
      'Turno': r.turno ? `${r.turno}º` : '',
      'Projeto': r.projeto ?? '',
      'Nº tramo': r.tramo ?? '',
      'Item': i + 1,
      'Código SAP': it.material,
      'Descrição': it.descricao ?? '',
      'Quantidade': Number(it.quantidade),
      'Unidade': it.unidade ?? '',
      'Motivo': rotuloMotivo(r.motivo),
      'Detalhe do motivo': r.motivo_detalhe ?? '',
      'Área reparada (m²)': r.area_reparada_m2 != null ? Number(r.area_reparada_m2) : '',
      'Rugosidade (µm)': r.rugosidade_um != null ? Number(r.rugosidade_um) : '',
      'Observação': r.observacao ?? '',
      'Situação': STATUS_SOL_EXTRA_ROTULO[r.status],
      'Doc. SAP': r.doc_sap ?? '',
      'Regularizado por': r.regularizado_por_nome ?? '',
      'Regularizado em': dataHoraBR(r.regularizado_em),
      'Registrado por': r.criado_por_nome ?? '',
    })),
  );
}

/** `solicitacao_extraordinaria_20261020_1432.xlsx` — data e hora para não sobrescrever o anterior. */
export function nomeArquivoSolExtra(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `solicitacao_extraordinaria_${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}_${p(agora.getHours())}${p(agora.getMinutes())}.xlsx`;
}

/** Gera e baixa o XLSX. Devolve o nome do arquivo e quantas linhas saíram. */
export function exportarPlanilhaSolExtra(registros: SolExtra[]): { arquivo: string; linhas: number } {
  const linhas = montarLinhasSolExtra(registros);
  // `header` explícito: garante a ordem das colunas mesmo com célula vazia.
  const ws = XLSX.utils.json_to_sheet(linhas, { header: [...SOL_EXTRA_COLUNAS] });
  ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(SOL_EXTRA_COLUNAS.length - 1)}${Math.max(linhas.length + 1, 1)}` };
  ws['!cols'] = [
    { wch: 15 }, { wch: 11 }, { wch: 7 }, { wch: 7 }, { wch: 16 }, { wch: 12 },
    { wch: 6 }, { wch: 20 }, { wch: 40 }, { wch: 11 }, { wch: 8 },
    { wch: 34 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 30 },
    { wch: 24 }, { wch: 14 }, { wch: 22 }, { wch: 17 }, { wch: 22 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Solicitacoes');
  const arquivo = nomeArquivoSolExtra();
  XLSX.writeFile(wb, arquivo);
  return { arquivo, linhas: linhas.length };
}
