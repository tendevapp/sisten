/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos › Recebimento — itens pendentes de entrega, exportação XLSX.
 *
 * Uma linha por item, na ordem da tela (respeita filtro e busca). A conversão
 * mora aqui, sem React e sem Supabase, porque é ela que precisa de teste.
 */

import * as XLSX from 'xlsx';
import type { ProjEntregaPendente, StatusEntregaPendente } from './projetosApi';

export const ENTREGAS_PENDENTES_COLUNAS = [
  'NF',
  'Data NF',
  'Dias em aberto',
  'PO',
  'Part number',
  'Cód. SAP',
  'Descrição',
  'Qtd esperada',
  'Unidade',
  'Número kit',
  'Aplicação',
  'Obs.',
  'Situação',
  'Resolvido em',
  'Resolvido por',
  'NF da chegada',
  'Entrada (ENP)',
  'Observação da baixa',
  'Registrado por',
  'Linha na planilha',
] as const;

export type LinhaPlanilhaEntregaPendente = Record<(typeof ENTREGAS_PENDENTES_COLUNAS)[number], string | number>;

const ROTULO_STATUS: Record<StatusEntregaPendente, string> = {
  PENDENTE: 'Aguardando entrega',
  ENTREGUE: 'Chegou',
  NAO_VIRA: 'Não virá',
};

/** `2026-08-05` → `05/08/2026` sem passar por `new Date` (evita o dia anterior em UTC-3). */
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

/** Dias corridos entre a data da NF e `hojeISO` (só para pendentes). */
export function diasEmAberto(dataNf: string | null, hojeISO: string): number | null {
  if (!dataNf) return null;
  const [a, m, d] = dataNf.slice(0, 10).split('-').map(Number);
  const [ha, hm, hd] = hojeISO.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d || !ha || !hm || !hd) return null;
  return Math.max(0, Math.round((Date.UTC(ha, hm - 1, hd) - Date.UTC(a, m - 1, d)) / 86_400_000));
}

export function montarLinhasEntregasPendentes(lista: ProjEntregaPendente[], hojeISO: string): LinhaPlanilhaEntregaPendente[] {
  return lista.map((p) => {
    const dias = p.status === 'PENDENTE' ? diasEmAberto(p.data_nf, hojeISO) : null;
    return {
      'NF': p.numero_nf,
      'Data NF': dataBR(p.data_nf),
      'Dias em aberto': dias ?? '',
      'PO': p.pedido ?? '',
      'Part number': p.part_number,
      'Cód. SAP': p.cod_sap ?? '',
      'Descrição': p.descricao ?? '',
      'Qtd esperada': p.quantidade_esperada != null ? Number(p.quantidade_esperada) : '',
      'Unidade': p.uom ?? '',
      'Número kit': p.numero_kit ?? '',
      'Aplicação': p.aplicacao ?? '',
      'Obs.': p.observacao ?? '',
      'Situação': ROTULO_STATUS[p.status],
      'Resolvido em': dataHoraBR(p.resolvido_em),
      'Resolvido por': p.resolvido_por_nome ?? '',
      'NF da chegada': p.resolucao_nf ?? '',
      'Entrada (ENP)': p.resolucao_nota_codigo ?? '',
      'Observação da baixa': p.resolucao_obs ?? '',
      'Registrado por': p.criado_por_nome ?? '',
      'Linha na planilha': p.linha_planilha ?? '',
    };
  });
}

/** `itens_pendentes_entrega_20261026_1530.xlsx` — data e hora para não sobrescrever o anterior. */
export function nomeArquivoEntregasPendentes(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `itens_pendentes_entrega_${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}_${p(agora.getHours())}${p(agora.getMinutes())}.xlsx`;
}

/** Gera e baixa o XLSX. Devolve o nome do arquivo. */
export function exportarPlanilhaEntregasPendentes(lista: ProjEntregaPendente[], hojeISO: string): string {
  const linhas = montarLinhasEntregasPendentes(lista, hojeISO);
  // `header` explícito: garante a ordem das colunas mesmo com célula vazia.
  const ws = XLSX.utils.json_to_sheet(linhas, { header: [...ENTREGAS_PENDENTES_COLUNAS] });
  ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(ENTREGAS_PENDENTES_COLUNAS.length - 1)}${Math.max(linhas.length + 1, 1)}` };
  ws['!cols'] = [
    { wch: 9 }, { wch: 11 }, { wch: 9 }, { wch: 13 }, { wch: 16 }, { wch: 10 }, { wch: 40 }, { wch: 10 }, { wch: 8 },
    { wch: 9 }, { wch: 22 }, { wch: 24 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 15 }, { wch: 30 },
    { wch: 22 }, { wch: 9 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pendentes de entrega');
  const arquivo = nomeArquivoEntregasPendentes();
  XLSX.writeFile(wb, arquivo);
  return arquivo;
}
