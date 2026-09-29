import type { CronogramaRh, PlanoRh } from './rhPlanoTreinamentosApi';

const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function formatarHorarioTabela(valor?: string | null): string {
  const texto = String(valor || '').trim();
  if (!texto) return '';
  const numerico = Number(texto.replace(',', '.'));
  if (/^\d+(?:[,.]\d+)?$/.test(texto) && Number.isFinite(numerico)) {
    if (numerico >= 0 && numerico < 1) {
      const minutos = Math.round(numerico * 24 * 60);
      return `${String(Math.floor(minutos / 60) % 24).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
    }
    if (Number.isInteger(numerico) && numerico >= 0 && numerico <= 23) return `${String(numerico).padStart(2, '0')}:00`;
  }
  const partes = texto.match(/^(\d{1,2})\s*[:h]\s*(\d{1,2})(?::\d{1,2})?$/i);
  if (!partes) return texto;
  const hora = Number(partes[1]); const minuto = Number(partes[2]);
  return hora <= 23 && minuto <= 59 ? `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}` : texto;
}

const dataExcel = (valor?: string | null) => valor ? new Date(`${valor}T12:00:00`) : '';
const duracao = (inicio?: string | null, termino?: string | null) => inicio && termino ? Math.max(1, Math.floor((new Date(`${termino}T12:00:00`).getTime() - new Date(`${inicio}T12:00:00`).getTime()) / 86400000) + 1) : '';
export const rotuloCompetenciaExcel = (competencia: string) => `${meses[Number(competencia.slice(5, 7)) - 1]}/${competencia.slice(2, 4)}`;

export function criarLinhasPlanoExcel(planos: PlanoRh[]): unknown[][] {
  return [
    ['Código', 'Título do Treinamento', 'Responsável', 'Data de Início', 'Data de Término', 'Horário', 'Carga Horária', 'Nº de Participantes', 'Local', 'Tipo', 'Modalidade', 'Objetivo', 'Custo Total', 'Data Realizada', 'Status', 'Comentários', 'Duração (dias)', 'Custo por Aluno', 'Plano Mês e Ano', 'Categoria'],
    ...planos.map(item => [item.codigo, item.titulo, item.responsavel || '', dataExcel(item.data_inicio), dataExcel(item.data_termino), formatarHorarioTabela(item.horario), item.carga_horaria || '', item.participantes_planejados || '', item.local || '', item.tipo_informacao, item.modalidade || '', item.objetivo || '', Number(item.custo_total || 0), dataExcel(item.data_realizada), item.status, item.comentarios || '', duracao(item.data_inicio, item.data_termino), item.participantes_planejados ? Number(item.custo_total || 0) / item.participantes_planejados : '', item.data_inicio ? `${meses[Number(item.data_inicio.slice(5, 7)) - 1]}/${item.data_inicio.slice(0, 4)}` : '', item.categoria || '']),
  ];
}

export function criarLinhasCronogramaExcel(itens: CronogramaRh[], competencias: string[]): unknown[][] {
  return [
    ['Treinamento', 'Cotação', 'Unid./mês', 'Total', 'Custo previsto', ...competencias.map(rotuloCompetenciaExcel)],
    ...itens.map(item => {
      const quantidade = item.meses.reduce((soma, mes) => soma + Number(mes.quantidade || 0), 0);
      return [item.descricao, Number(item.cotacao || 0), item.unidade_mes, quantidade, quantidade * Number(item.cotacao || 0), ...competencias.map(competencia => item.meses.find(mes => mes.competencia === competencia)?.quantidade || '')];
    }),
  ];
}

function colunaExcel(indice: number): string {
  let resultado = '';
  for (let atual = indice + 1; atual > 0; atual = Math.floor((atual - 1) / 26)) resultado = String.fromCharCode(65 + ((atual - 1) % 26)) + resultado;
  return resultado;
}

async function baixarExcel(linhas: unknown[][], aba: string, arquivo: string, larguras: number[], datas: number[], moedas: number[]) {
  const XLSX = await import('xlsx-js-style');
  const planilha: any = XLSX.utils.aoa_to_sheet(linhas, { cellDates: true });
  const ultimaColuna = colunaExcel(Math.max(0, larguras.length - 1));
  planilha['!cols'] = larguras.map(wch => ({ wch }));
  planilha['!autofilter'] = { ref: `A1:${ultimaColuna}${Math.max(1, linhas.length)}` };
  planilha['!freeze'] = { ySplit: 1 };
  for (let coluna = 0; coluna < larguras.length; coluna += 1) {
    const celula = planilha[`${colunaExcel(coluna)}1`];
    if (celula) celula.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E3A5F' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
  }
  linhas.slice(1).forEach((_, indice) => {
    for (const coluna of datas) {
      const celula = planilha[`${colunaExcel(coluna)}${indice + 2}`];
      if (celula?.t === 'd') celula.z = 'dd/mm/yyyy';
    }
    for (const coluna of moedas) {
      const celula = planilha[`${colunaExcel(coluna)}${indice + 2}`];
      if (celula) celula.z = 'R$ #,##0.00';
    }
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, aba);
  XLSX.writeFile(workbook, arquivo);
}

export async function exportarPlanoTreinamentosExcel(planos: PlanoRh[]) {
  await baixarExcel(criarLinhasPlanoExcel(planos), 'Plano de Treinamento', `PLANO_DE_TREINAMENTOS_${new Date().toISOString().slice(0, 10)}.xlsx`, [14, 42, 22, 14, 14, 11, 13, 16, 22, 14, 16, 42, 15, 14, 15, 42, 13, 16, 17, 22], [3, 4, 13], [12, 17]);
}

export async function exportarCronogramaTreinamentosExcel(itens: CronogramaRh[], competencias: string[]) {
  await baixarExcel(criarLinhasCronogramaExcel(itens, competencias), 'Cronograma', `CRONOGRAMA_DE_TREINAMENTOS_${new Date().toISOString().slice(0, 10)}.xlsx`, [42, 15, 12, 12, 17, ...competencias.map(() => 11)], [], [1, 4]);
}
