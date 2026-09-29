/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportações oficiais do módulo de Treinamentos do RH:
 * Gera planilhas analíticas em Excel (com múltiplas abas) e
 * relatórios executivos sintetizados em PDF padrão corporativo TEN.
 */

import type { CronogramaRh, PlanoRh } from './rhPlanoTreinamentosApi';
import type {
  AreaConformidade,
  CustoTreinamentoItem,
  resumirIndicadoresMatriz,
  resumirIndicadoresTreinamentos,
  TreinamentoCritico,
} from './rhPlanoTreinamentosViewModel';
import { createDoc, downloadPdf, PdfTextWriter, PDF_COLORS } from './pdfExport/core';

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
  const hora = Number(partes[1]);
  const minuto = Number(partes[2]);
  return hora <= 23 && minuto <= 59 ? `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}` : texto;
}

const dataExcel = (valor?: string | null) => (valor ? new Date(`${valor}T12:00:00`) : '');
const duracao = (inicio?: string | null, termino?: string | null) =>
  inicio && termino
    ? Math.max(1, Math.floor((new Date(`${termino}T12:00:00`).getTime() - new Date(`${inicio}T12:00:00`).getTime()) / 86400000) + 1)
    : '';

export const rotuloCompetenciaExcel = (competencia: string) =>
  `${meses[Number(competencia.slice(5, 7)) - 1]}/${competencia.slice(2, 4)}`;

export function criarLinhasPlanoExcel(planos: PlanoRh[]): unknown[][] {
  return [
    [
      'Código',
      'Título do Treinamento',
      'Responsável',
      'Data de Início',
      'Data de Término',
      'Horário',
      'Carga Horária',
      'Nº de Participantes',
      'Local',
      'Tipo',
      'Modalidade',
      'Objetivo',
      'Custo Total',
      'Data Realizada',
      'Status',
      'Comentários',
      'Duração (dias)',
      'Custo por Aluno',
      'Plano Mês e Ano',
      'Categoria',
    ],
    ...planos.map((item) => [
      item.codigo,
      item.titulo,
      item.responsavel || '',
      dataExcel(item.data_inicio),
      dataExcel(item.data_termino),
      formatarHorarioTabela(item.horario),
      item.carga_horaria || '',
      item.participantes_planejados || '',
      item.local || '',
      item.tipo_informacao,
      item.modalidade || '',
      item.objetivo || '',
      Number(item.custo_total || 0),
      dataExcel(item.data_realizada),
      item.status,
      item.comentarios || '',
      duracao(item.data_inicio, item.data_termino),
      item.participantes_planejados ? Number(item.custo_total || 0) / item.participantes_planejados : '',
      item.data_inicio ? `${meses[Number(item.data_inicio.slice(5, 7)) - 1]}/${item.data_inicio.slice(0, 4)}` : '',
      item.categoria || '',
    ]),
  ];
}

export function criarLinhasCronogramaExcel(itens: CronogramaRh[], competencias: string[]): unknown[][] {
  return [
    ['Treinamento', 'Cotação', 'Unid./mês', 'Total', 'Custo previsto', ...competencias.map(rotuloCompetenciaExcel)],
    ...itens.map((item) => {
      const quantidade = item.meses.reduce((soma, mes) => soma + Number(mes.quantidade || 0), 0);
      return [
        item.descricao,
        Number(item.cotacao || 0),
        item.unidade_mes,
        quantidade,
        quantidade * Number(item.cotacao || 0),
        ...competencias.map((competencia) => item.meses.find((mes) => mes.competencia === competencia)?.quantidade || ''),
      ];
    }),
  ];
}

export function criarLinhasCustosExcel(custos: CustoTreinamentoItem[]): unknown[][] {
  return [
    ['Treinamento', 'Tipo', 'Cotação Unitária', 'Turmas Progr.', 'Turmas Realiz.', 'Participantes', 'Custo Previsto', 'Custo Realizado', 'Desvio (+/-)'],
    ...custos.map((item) => [
      item.titulo,
      item.tipo,
      item.cotacaoUnitario,
      item.turmasProgramadas,
      item.turmasRealizadas,
      item.participantesTotal,
      item.custoPrevisto,
      item.custoRealizado,
      item.desvio,
    ]),
  ];
}

export function criarLinhasConformidadeAreaExcel(areas: AreaConformidade[]): unknown[][] {
  return [
    ['Área / Setor', 'Total Colaboradores', 'Aptos', 'Vencidos', 'Pendentes', '% Conformidade'],
    ...areas.map((a) => [a.area, a.totalPessoas, a.aptos, a.vencidos, a.pendentes, `${a.taxaConformidade}%`]),
  ];
}

export function criarLinhasAlertasExcel(alertas: Array<{ colaborador: string; registro: string; treinamento: string; status_calculado: string; validade_em: string | null; dias_para_vencimento: number | null }>): unknown[][] {
  return [
    ['Colaborador', 'Registro', 'Treinamento Obrigatório', 'Situação', 'Data de Validade', 'Dias Restantes'],
    ...alertas.map((al) => [
      al.colaborador,
      al.registro,
      al.treinamento,
      al.status_calculado === 'vencido' ? 'VENCIDO' : 'PRÓXIMO A VENCER',
      dataExcel(al.validade_em),
      al.dias_para_vencimento ?? '',
    ]),
  ];
}

function colunaExcel(indice: number): string {
  let resultado = '';
  for (let atual = indice + 1; atual > 0; atual = Math.floor((atual - 1) / 26)) {
    resultado = String.fromCharCode(65 + ((atual - 1) % 26)) + resultado;
  }
  return resultado;
}

interface AbaExcelConfig {
  nome: string;
  linhas: unknown[][];
  larguras: number[];
  datas?: number[];
  moedas?: number[];
}

async function baixarWorkbookExcel(abas: AbaExcelConfig[], arquivo: string) {
  const XLSX = await import('xlsx-js-style');
  const workbook = XLSX.utils.book_new();

  for (const aba of abas) {
    const planilha: any = XLSX.utils.aoa_to_sheet(aba.linhas, { cellDates: true });
    const ultimaColuna = colunaExcel(Math.max(0, aba.larguras.length - 1));
    planilha['!cols'] = aba.larguras.map((wch) => ({ wch }));
    planilha['!autofilter'] = { ref: `A1:${ultimaColuna}${Math.max(1, aba.linhas.length)}` };
    planilha['!freeze'] = { ySplit: 1 };

    for (let coluna = 0; coluna < aba.larguras.length; coluna += 1) {
      const celula = planilha[`${colunaExcel(coluna)}1`];
      if (celula) {
        celula.s = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '1E3A5F' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        };
      }
    }

    const datas = aba.datas || [];
    const moedas = aba.moedas || [];

    aba.linhas.slice(1).forEach((_, indice) => {
      for (const coluna of datas) {
        const celula = planilha[`${colunaExcel(coluna)}${indice + 2}`];
        if (celula?.t === 'd') celula.z = 'dd/mm/yyyy';
      }
      for (const coluna of moedas) {
        const celula = planilha[`${colunaExcel(coluna)}${indice + 2}`];
        if (celula) celula.z = 'R$ #,##0.00';
      }
    });

    XLSX.utils.book_append_sheet(workbook, planilha, aba.nome);
  }

  XLSX.writeFile(workbook, arquivo);
}

export async function exportarPlanoTreinamentosExcel(planos: PlanoRh[]) {
  await baixarWorkbookExcel(
    [
      {
        nome: 'Plano de Treinamento',
        linhas: criarLinhasPlanoExcel(planos),
        larguras: [14, 42, 22, 14, 14, 11, 13, 16, 22, 14, 16, 42, 15, 14, 15, 42, 13, 16, 17, 22],
        datas: [3, 4, 13],
        moedas: [12, 17],
      },
    ],
    `PLANO_DE_TREINAMENTOS_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

export async function exportarCronogramaTreinamentosExcel(itens: CronogramaRh[], competencias: string[]) {
  await baixarWorkbookExcel(
    [
      {
        nome: 'Cronograma',
        linhas: criarLinhasCronogramaExcel(itens, competencias),
        larguras: [42, 15, 12, 12, 17, ...competencias.map(() => 11)],
        moedas: [1, 4],
      },
    ],
    `CRONOGRAMA_DE_TREINAMENTOS_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

export async function exportarRelatorioTreinamentosExcel(params: {
  planos: PlanoRh[];
  resumoPlano: ReturnType<typeof resumirIndicadoresTreinamentos>;
  resumoMatriz?: ReturnType<typeof resumirIndicadoresMatriz>;
  ano: string;
}) {
  const { planos, resumoPlano, resumoMatriz, ano } = params;

  const abas: AbaExcelConfig[] = [
    {
      nome: 'Execução Mensal',
      linhas: [
        ['Mês/Competência', 'Turmas Programadas', 'Turmas Realizadas', 'Participações', 'Custo Previsto', 'Custo Realizado', 'Horas Ministradas'],
        ...resumoPlano.porMes.map((m) => [
          m.mes,
          m.programados,
          m.realizados,
          m.participacoes,
          Math.round(m.custoPrevisto),
          Math.round(m.custoRealizado),
          Math.round(m.horasRealizadas),
        ]),
      ],
      larguras: [18, 20, 20, 16, 18, 18, 18],
      moedas: [4, 5],
    },
    {
      nome: 'Custos por Treinamento',
      linhas: criarLinhasCustosExcel(resumoPlano.custosPorTreinamento),
      larguras: [40, 15, 18, 16, 16, 16, 18, 18, 18],
      moedas: [2, 6, 7, 8],
    },
    {
      nome: 'Plano Detalhado',
      linhas: criarLinhasPlanoExcel(planos),
      larguras: [14, 40, 22, 14, 14, 11, 13, 16, 20, 14, 16, 36, 15, 14, 15, 36, 13, 16, 17, 20],
      datas: [3, 4, 13],
      moedas: [12, 17],
    },
  ];

  if (resumoMatriz) {
    abas.push({
      nome: 'Conformidade por Área',
      linhas: criarLinhasConformidadeAreaExcel(resumoMatriz.porArea),
      larguras: [30, 20, 15, 15, 15, 18],
    });

    abas.push({
      nome: 'Alertas de Vencimento',
      linhas: criarLinhasAlertasExcel(resumoMatriz.alertas),
      larguras: [35, 14, 35, 20, 16, 16],
      datas: [4],
    });
  }

  await baixarWorkbookExcel(abas, `RELATORIO_TREINAMENTOS_RH_${ano}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportarRelatorioTreinamentosPdf(params: {
  resumoPlano: ReturnType<typeof resumirIndicadoresTreinamentos>;
  resumoMatriz?: ReturnType<typeof resumirIndicadoresMatriz>;
  filtros: { ano: string; tipo: string; mes?: string; area?: string };
}) {
  const { resumoPlano, resumoMatriz, filtros } = params;
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  const filtroRotulo = `Ano: ${filtros.ano === 'todos' ? 'Todos' : filtros.ano} | Tipo: ${filtros.tipo === 'todos' ? 'Todos' : filtros.tipo.toUpperCase()}${
    filtros.mes && filtros.mes !== 'todos' ? ` | Mês: ${filtros.mes}` : ''
  }${filtros.area && filtros.area !== 'todos' ? ` | Área: ${filtros.area}` : ''}`;

  writer.drawDocumentHeader({
    title: 'Relatório Executivo de Treinamentos e Desenvolvimento',
    formCode: 'REL.RHU-0002',
    protocol: `TD-${new Date().toISOString().slice(2, 4)}${new Date().toISOString().slice(5, 7)}${new Date().toISOString().slice(8, 10)}`,
    statusBadge: 'CONSOLIDADO',
    statusColor: 'blue',
  });

  writer.drawSectionHeader('1. INDICADORES EXECUTIVOS (KPIS)');

  const kpis = [
    {
      label: 'Cumprimento do Plano',
      value: `${Math.round(resumoPlano.taxaRealizacao)}% (${resumoPlano.realizados} de ${resumoPlano.programados} turmas)`,
      highlight: true,
      statusBadge: `${Math.round(resumoPlano.taxaRealizacao)}% REALIZADO`,
      statusColor: resumoPlano.taxaRealizacao >= 80 ? ('green' as const) : ('amber' as const),
    },
    {
      label: 'Conformidade Regulamentar (Matriz RH)',
      value: resumoMatriz
        ? `${Math.round(resumoMatriz.taxaConformidadeGeral)}% (${resumoMatriz.totalAptos} de ${resumoMatriz.totalMonitorados} colaboradores aptos)`
        : 'Matriz não carregada',
      highlight: true,
      statusBadge: resumoMatriz ? `${Math.round(resumoMatriz.taxaConformidadeGeral)}% CONFORME` : undefined,
      statusColor: (resumoMatriz?.taxaConformidadeGeral || 0) >= 90 ? ('green' as const) : ('red' as const),
    },
    {
      label: 'Horas Totais e Homem-Hora (HHT)',
      value: `${Math.round(resumoPlano.hht).toLocaleString('pt-BR')} HHT capacitados (${Math.round(resumoPlano.horasTotais)}h ministradas)`,
    },
    {
      label: 'Participações e Ocupação de Vagas',
      value: `${resumoPlano.participacoes} participações (${Math.round(resumoPlano.taxaOcupacao)}% da capacidade planejada)`,
    },
    {
      label: 'Orçamento Previsto',
      value: `R$ ${Math.round(resumoPlano.custoPrevisto).toLocaleString('pt-BR')}`,
    },
    {
      label: 'Custo Realizado e Desvio Orçamentário',
      value: `R$ ${Math.round(resumoPlano.custoRealizado).toLocaleString('pt-BR')} (Desvio: ${
        resumoPlano.desvioOrcamentario >= 0 ? '+' : ''
      }R$ ${Math.round(resumoPlano.desvioOrcamentario).toLocaleString('pt-BR')})`,
      highlight: true,
    },
  ];

  writer.drawInfoGrid(kpis, 2);
  writer.spacer(6);

  writer.drawSectionHeader('2. EXECUÇÃO MENSAL E DESEMPENHO ORÇAMENTÁRIO');

  const headersMes = [
    { label: 'COMPETÊNCIA', width: 90, align: 'left' as const },
    { label: 'PROG.', width: 55, align: 'center' as const },
    { label: 'REAL.', width: 55, align: 'center' as const },
    { label: 'ALUNOS', width: 65, align: 'center' as const },
    { label: 'HORAS', width: 60, align: 'center' as const },
    { label: 'PREVISTO (R$)', width: 95, align: 'right' as const },
    { label: 'REALIZADO (R$)', width: 95, align: 'right' as const },
  ];

  const mesesAtivos = resumoPlano.porMes.filter(
    (m) => m.programados > 0 || m.quantidadePrevista > 0 || m.realizados > 0
  );

  const linhasMes = (mesesAtivos.length ? mesesAtivos : resumoPlano.porMes.slice(0, 6)).map((m) => [
    m.mes,
    String(m.programados),
    String(m.realizados),
    String(m.participacoes),
    `${Math.round(m.horasRealizadas)}h`,
    Math.round(m.custoPrevisto).toLocaleString('pt-BR'),
    Math.round(m.custoRealizado).toLocaleString('pt-BR'),
  ]);

  writer.drawTable(headersMes, linhasMes);
  writer.spacer(6);

  if (resumoMatriz && resumoMatriz.porArea.length > 0) {
    writer.ensureSpace(120);
    writer.drawSectionHeader('3. CONFORMIDADE POR ÁREA / SETOR (MATRIZ RH)', resumoMatriz.porArea.length);

    const headersArea = [
      { label: 'ÁREA / SETOR OPERACIONAL', width: 180, align: 'left' as const },
      { label: 'TOTAL', width: 60, align: 'center' as const },
      { label: 'APTOS', width: 65, align: 'center' as const },
      { label: 'VENCIDOS', width: 65, align: 'center' as const },
      { label: 'PENDENTES', width: 65, align: 'center' as const },
      { label: '% CONFORME', width: 80, align: 'center' as const },
    ];

    const linhasArea = resumoMatriz.porArea.slice(0, 7).map((a) => [
      a.area,
      String(a.totalPessoas),
      String(a.aptos),
      String(a.vencidos),
      String(a.pendentes),
      `${a.taxaConformidade}%`,
    ]);

    writer.drawTable(headersArea, linhasArea);
    writer.spacer(6);
  }

  if (resumoMatriz && resumoMatriz.topTreinamentosCriticos.length > 0) {
    writer.ensureSpace(100);
    writer.drawSectionHeader('4. TREINAMENTOS COM MAIOR CONCENTRAÇÃO DE PENDÊNCIAS', resumoMatriz.topTreinamentosCriticos.length);

    const headersCriticos = [
      { label: 'TREINAMENTO / CURSO OBRIGATÓRIO', width: 235, align: 'left' as const },
      { label: 'VENCIDOS', width: 90, align: 'center' as const },
      { label: 'A VENCER (30D)', width: 95, align: 'center' as const },
      { label: 'PENDENTES', width: 95, align: 'center' as const },
    ];

    const linhasCriticos = resumoMatriz.topTreinamentosCriticos.slice(0, 5).map((t) => [
      t.nome,
      String(t.totalVencidos),
      String(t.totalProximos),
      String(t.totalPendentes),
    ]);

    writer.drawTable(headersCriticos, linhasCriticos);
    writer.spacer(6);
  }

  const page = writer.getPage();
  page.drawText('SISTEN — Sistema Integrado TEN | Recursos Humanos — Relatório Executivo de Treinamentos', {
    x: 40,
    y: 24,
    size: 7,
    font: writer.getFont(),
    color: PDF_COLORS.mutedLabel,
  });

  await downloadPdf(doc, `RELATORIO_EXECUTIVO_TREINAMENTOS_${filtros.ano}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
