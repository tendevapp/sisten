/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Linhas no layout da aba TRAMOS da planilha "PROD — Avanço de Produção":
 * mesmas colunas e cálculos (Semana, Mês, Dias, Dias em Processo, Início × Fim).
 * Serve a tabela da tela e o XLSX para quem ainda lê a planilha.
 */

import * as XLSX from 'xlsx';
import { semanaISO } from './producaoApontamentos';
import { ETAPAS_TRAMO, chaveMes, dataCurta, diasEntre, nomeMes, type MarcoTramo, type TramoAtual } from './producaoTramos';

export interface LinhaPlanilhaTramo {
  item: number;
  tramo: TramoAtual;
  setor: string;
  atividade: string;
  dias: { nav02Jato: number | null; jatoPatio: number | null; processo: number | null; patioExpedido: number | null; inicioFim: number | null };
}

const entre = (t: TramoAtual, de: MarcoTramo, ate: MarcoTramo): number | null =>
  t.marcos[de] && t.marcos[ate] ? diasEntre(t.marcos[de]!, t.marcos[ate]!) : null;

/** Ordem da planilha: mais adiantados primeiro; dentro da etapa, quem entrou antes. */
export function linhasPlanilhaTramos(tramos: TramoAtual[]): LinhaPlanilhaTramo[] {
  const ordemEtapa = (t: TramoAtual) => ETAPAS_TRAMO.length - ETAPAS_TRAMO.indexOf(t.etapa);
  const ultimaData = (t: TramoAtual) => t.marcos.expedido ?? t.marcos.liberado_patio ?? t.marcos.liberado_jato ?? t.marcos.liberado_nav02 ?? t.marcos.inicio ?? '9999';
  return tramos
    .filter(t => t.eventos > 0)
    .sort((a, b) => ordemEtapa(a) - ordemEtapa(b) || ultimaData(a).localeCompare(ultimaData(b)) || a.serie - b.serie)
    .map((tramo, i) => ({
      item: i + 1,
      tramo,
      setor: tramo.setorAtual ?? '',
      atividade: tramo.atividadeAtual ?? '',
      dias: {
        nav02Jato: entre(tramo, 'liberado_nav02', 'liberado_jato'),
        jatoPatio: entre(tramo, 'liberado_jato', 'liberado_patio'),
        processo: entre(tramo, 'liberado_nav02', 'liberado_patio'),
        patioExpedido: entre(tramo, 'liberado_patio', 'expedido'),
        inicioFim: entre(tramo, 'inicio', 'expedido'),
      },
    }));
}

const semana = (d?: string) => (d ? `W${String(semanaISO(d).semana).padStart(2, '0')}` : '');
const mes = (d?: string) => (d ? nomeMes(chaveMes(d)) : '');
const data = (d?: string) => (d ? dataCurta(d) : '');

export function exportarPlanilhaTramos(tramos: TramoAtual[], arquivo: string): void {
  const cabecalho = [
    'Item', 'Setor', 'Tramo', 'Sequencial', 'Torre', 'Atividade', 'Reparo de Solda', 'Início',
    'Liberado P/ NAV02', 'Semana', 'Mês NAV01',
    'Liberado P/ Jato', 'Semana', 'Mês Jato', 'Dias',
    'Liberado P/ Pátio', 'Semana', 'Mês Pátio', 'Dias', 'Dias em Processo',
    'Expedido', 'Semana', 'Mês Expedido', 'Dias', 'Início X Fim',
  ];
  const linhas = linhasPlanilhaTramos(tramos).map(({ item, tramo: t, setor, atividade, dias }) => [
    item, setor, t.tramo, t.serie, t.torreNumero, atividade, t.reparosSolda, data(t.marcos.inicio),
    data(t.marcos.liberado_nav02), semana(t.marcos.liberado_nav02), mes(t.marcos.liberado_nav02),
    data(t.marcos.liberado_jato), semana(t.marcos.liberado_jato), mes(t.marcos.liberado_jato), dias.nav02Jato ?? '',
    data(t.marcos.liberado_patio), semana(t.marcos.liberado_patio), mes(t.marcos.liberado_patio), dias.jatoPatio ?? '', dias.processo ?? '',
    data(t.marcos.expedido), semana(t.marcos.expedido), mes(t.marcos.expedido), dias.patioExpedido ?? '', dias.inicioFim ?? '',
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([cabecalho, ...linhas]);
  sheet['!cols'] = cabecalho.map((c, i) => ({ wch: i === 5 ? 34 : Math.max(8, c.length + 2) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'TRAMOS');
  XLSX.writeFile(workbook, arquivo);
}
