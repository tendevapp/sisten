/**
 * Planilha do Plano de Expedição GW: exporta exatamente as linhas que a tela mostra
 * (semana/torres do Relatório ou filtros da aba Dados), na ordem da tela.
 */

import * as XLSX from 'xlsx';
import type { StatusPlanoExpedicao } from './producao';
import type { PlanoExpedicaoProducao } from './producaoApi';

const STATUS_PLANILHA: Record<StatusPlanoExpedicao, string> = {
  a_faturar: 'A faturar',
  faturado: 'Faturado',
  expedido: 'Expedido',
};

export const CABECALHO_PLANO_EXPEDICAO = [
  'Semana', 'Torre', 'Tramo', 'ID', 'NF Fat.', 'NF-GW', 'NF Exp.',
  'Carregamento', 'Expedição', 'Status', 'Observação',
] as const;

/** DD/MM/AAAA fatiando a string ISO — `new Date('2026-11-04')` volta 03/11 em UTC-3. */
const dataPlanilha = (data: string | null) => {
  if (!data || !/^\d{4}-\d{2}-\d{2}/.test(data)) return '';
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
};

const simNao = (valor: boolean) => (valor ? 'Sim' : 'Não');

/** Recorte de período escolhido no diálogo de exportação ('tela' é resolvido pela própria tela). */
export type PeriodoExportacao =
  | { tipo: 'semanas'; de: number; ate: number }
  | { tipo: 'datas'; de: string; ate: string; campo: 'data_expedicao' | 'data_carregamento' }
  | { tipo: 'tudo' };

/**
 * Filtra pelo período (limites inclusivos; de/até invertidos são aceitos) e, opcionalmente, pela torre.
 * No recorte por datas, tramo sem a data escolhida fica de fora — não há como saber se cai no período.
 * As datas são comparadas como texto AAAA-MM-DD, sem `new Date`, para não deslocar o dia em UTC-3.
 */
export function filtrarPlanoPorPeriodo(
  linhas: PlanoExpedicaoProducao[],
  periodo: PeriodoExportacao,
  torre: number | null = null,
): PlanoExpedicaoProducao[] {
  const daTorre = (linha: PlanoExpedicaoProducao) => torre == null || linha.torre_numero === torre;
  if (periodo.tipo === 'tudo') return linhas.filter(daTorre);
  if (periodo.tipo === 'semanas') {
    const [min, max] = [Math.min(periodo.de, periodo.ate), Math.max(periodo.de, periodo.ate)];
    return linhas.filter(linha => daTorre(linha) && linha.semana >= min && linha.semana <= max);
  }
  const [min, max] = [periodo.de, periodo.ate].map(d => d.slice(0, 10)).sort();
  return linhas.filter(linha => {
    const data = linha[periodo.campo];
    if (!daTorre(linha) || !data || !/^\d{4}-\d{2}-\d{2}/.test(data)) return false;
    const dia = data.slice(0, 10);
    return dia >= min && dia <= max;
  });
}

/** Trecho do nome do arquivo que identifica o período exportado. */
export function rotuloArquivoPeriodo(periodo: PeriodoExportacao, torre: number | null = null): string {
  const ddmmyy = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(2, 4)}`;
  const base = periodo.tipo === 'tudo'
    ? 'Completo'
    : periodo.tipo === 'semanas'
      ? (Math.min(periodo.de, periodo.ate) === Math.max(periodo.de, periodo.ate)
        ? `W${periodo.de}`
        : `W${Math.min(periodo.de, periodo.ate)}-W${Math.max(periodo.de, periodo.ate)}`)
      : (() => {
        const [min, max] = [periodo.de, periodo.ate].sort();
        return `${periodo.campo === 'data_expedicao' ? 'Exp' : 'Carreg'}_${ddmmyy(min)}-${ddmmyy(max)}`;
      })();
  return torre == null ? base : `${base}_Torre_${torre}`;
}

export function linhasPlanilhaPlanoExpedicao(linhas: PlanoExpedicaoProducao[]): Array<Array<string | number>> {
  return linhas.map(linha => [
    `W${String(linha.semana).padStart(2, '0')}`,
    linha.torre_numero,
    linha.tramo,
    linha.identificador ?? '',
    simNao(linha.nf_faturamento_emitida),
    simNao(linha.nf_gw_emitida),
    simNao(linha.nf_expedicao_emitida),
    dataPlanilha(linha.data_carregamento),
    dataPlanilha(linha.data_expedicao),
    STATUS_PLANILHA[linha.status] ?? linha.status,
    linha.observacao ?? '',
  ]);
}

export function exportarPlanilhaPlanoExpedicao(linhas: PlanoExpedicaoProducao[], arquivo: string): void {
  const cabecalho = [...CABECALHO_PLANO_EXPEDICAO];
  const sheet = XLSX.utils.aoa_to_sheet([cabecalho, ...linhasPlanilhaPlanoExpedicao(linhas)]);
  sheet['!cols'] = cabecalho.map(c => ({ wch: c === 'Observação' ? 40 : Math.max(9, c.length + 3) }));
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: linhas.length, c: cabecalho.length - 1 } }) };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Plano de Expedição');
  XLSX.writeFile(workbook, arquivo);
}
