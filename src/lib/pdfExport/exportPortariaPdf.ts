/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Geradores de PDF oficiais dos formulários operacionais do módulo Portaria da TEN:
 * 1. FRM.SGP-0011 (Equipamentos e Ferramentas de Terceiros)
 * 2. FRM.SGP-0009 (Registro de Chegada de Transportes)
 * 3. FRM.SGP-0020 (Controle de Chegada e Saída de Carretas de Chapas)
 * 4. FRM.SGP-0010 (Relatório de Portaria e Ocorrências)
 * 5. FRM.SGP-0013 (Lista de Presença - Briefing de Segurança)
 * 6. FRM.SGP-0010 (Passagem de Plantão da Portaria)
 */

import { createDoc, PdfTextWriter, downloadPdf } from './core';
import type {
  PortControleEquipamento,
  PortRegistroTransporte,
  PortControleCarreta,
  PortRelatorioPortaria,
  PortPassagemPlantao,
  PortBriefingSessao,
} from '../../types';

function formatDataBR(iso?: string | null): string {
  if (!iso) return '-';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// =====================================================================
// 1. FRM.SGP-0011: Equipamentos e Ferramentas de Terceiros
// =====================================================================
export async function exportEquipamentoPdf(item: PortControleEquipamento): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  const isBaixado = item.status === 'DEVOLVIDO_SAIU' || !!item.data_saida;

  writer.drawDocumentHeader({
    title: 'Controle de Entrada de Equipamentos de Terceiros',
    formCode: item.codigo_formulario || 'FRM.SGP-0011',
    protocol: item.numero_protocolo,
    statusBadge: isBaixado ? 'SAÍDA CONCLUÍDA' : 'NO PÁTIO',
    statusColor: isBaixado ? 'green' : 'amber',
  });

  writer.drawInfoGrid([
    { label: 'Empresa Terceirizada', value: item.nome_empresa },
    { label: 'Funcionário Responsável', value: item.funcionario },
    { label: 'Entrada Registrada', value: `${formatDataBR(item.data_entrada)} às ${item.hora_entrada || '-'}` },
    {
      label: 'Saída Registrada',
      value: item.data_saida ? `${formatDataBR(item.data_saida)} às ${item.hora_saida || '-'}` : 'Em Aberto (Permanecendo no Pátio)',
    },
    { label: 'Vigilante de Entrada', value: item.vigilante_entrada },
    { label: 'Vigilante de Saída', value: item.vigilante_saida || '-' },
    { label: 'Acompanhante / Responsável TEN', value: item.responsavel || '-' },
    {
      label: 'Status Operacional',
      value: item.status,
      statusBadge: isBaixado ? 'CONCLUÍDO' : 'EM ABERTO',
      statusColor: isBaixado ? 'green' : 'amber',
    },
  ], 2);

  writer.drawSectionHeader('Descrição dos Materiais e Ferramentas');
  writer.drawCallout('Relação de Equipamentos Declarados', item.descricao_materiais);

  if (item.observacoes) {
    writer.drawSectionHeader('Observações e Apontamentos');
    writer.drawCallout('Observações Gerais da Portaria', item.observacoes);
  }

  writer.drawSignatures([
    { role: 'Vigilante da Portaria', name: item.vigilante_entrada },
    { role: 'Responsável / Terceiro', name: item.funcionario },
  ]);

  writer.finalizeDoc(item.codigo_formulario || 'FRM.SGP-0011');
  await downloadPdf(doc, `portaria-equipamentos-${item.numero_protocolo}.pdf`);
}

// =====================================================================
// 2. FRM.SGP-0009: Registro de Chegada de Transportes
// =====================================================================
export async function exportTransportesPdf(
  data: string,
  turno: string,
  transportes: PortRegistroTransporte[]
): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  writer.drawDocumentHeader({
    title: 'Registro de Chegada de Transportes',
    formCode: 'FRM.SGP-0009 (Rev. 00)',
    protocol: `TRP-${data.replace(/-/g, '')}-${turno}`,
  });

  writer.drawInfoGrid([
    { label: 'Data do Registro', value: formatDataBR(data) },
    { label: 'Turno Operacional', value: turno },
    { label: 'Total de Veículos Registrados', value: `${transportes.length} transporte(s)` },
  ], 3);

  writer.drawSectionHeader('Movimentações de Transporte Registradas', transportes.length);

  const tableHeaders = [
    { label: 'HORÁRIO', width: 85, align: 'center' as const },
    { label: 'VEÍCULO / PLACA', width: 95, align: 'left' as const },
    { label: 'EMPRESA', width: 110, align: 'left' as const },
    { label: 'MOTORISTA / FUNÇÃO', width: 125, align: 'left' as const },
    { label: 'VIGILANTE', width: 100, align: 'left' as const },
  ];

  const tableRows = transportes.map((t) => [
    `${t.hora_chegada} às ${t.hora_saida || 'No Pátio'}`,
    `[${t.veiculo}] ${t.placa}`,
    t.empresa,
    `${t.motorista}${t.ocupacao ? ` (${t.ocupacao})` : ''}`,
    t.vigilante,
  ]);

  writer.drawTable(tableHeaders, tableRows);

  writer.drawSignatures([
    { role: 'Vigilante Responsável pelo Plantão' },
    { role: 'Supervisor de Segurança Patrimonial' },
  ]);

  writer.finalizeDoc('FRM.SGP-0009');
  await downloadPdf(doc, `portaria-transportes-${data}-${turno}.pdf`);
}

// =====================================================================
// 3. FRM.SGP-0020: Controle de Carretas de Chapas
// =====================================================================
export async function exportCarretasPdf(carretas: PortControleCarreta[], periodoStr?: string): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  writer.drawDocumentHeader({
    title: 'Controle de Chegada e Saída de Carretas de Chapas',
    formCode: 'FRM.SGP-0020 (Rev. 00)',
    protocol: `CRT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
  });

  writer.drawInfoGrid([
    { label: 'Período / Referência', value: periodoStr || 'Todos os Registros' },
    { label: 'Total de Carretas', value: `${carretas.length} carreta(s)` },
  ], 2);

  writer.drawSectionHeader('Relação de Carretas de Chapas', carretas.length);

  const tableHeaders = [
    { label: 'ENTRADA / SAÍDA', width: 95, align: 'center' as const },
    { label: 'EMPRESA / MOTORISTA', width: 130, align: 'left' as const },
    { label: 'CAVALO / CARRETA', width: 100, align: 'left' as const },
    { label: 'NF / PESO', width: 95, align: 'left' as const },
    { label: 'STATUS', width: 95, align: 'center' as const },
  ];

  const tableRows = carretas.map((c) => [
    `${formatDataBR(c.data_entrada)} ${c.hora_entrada}\n${c.data_saida ? `${formatDataBR(c.data_saida)} ${c.hora_saida}` : 'No Pátio'}`,
    `${c.empresa}\n${c.nome_motorista}${c.cpf_motorista ? ` (${c.cpf_motorista})` : ''}`,
    `Cav: ${c.placa_cavalo}\nCar: ${c.placa_carreta}`,
    `NF: ${c.numero_nf || '-'}\n${c.peso_bruto ? `${c.peso_bruto} kg` : '-'}`,
    c.status === 'DESCARREGADO_SAIU' ? 'LIBERADO' : 'NO PÁTIO',
  ]);

  writer.drawTable(tableHeaders, tableRows);

  writer.drawSignatures([
    { role: 'Vigilante Portaria TEN' },
    { role: 'Inspetor de Logística / Recebimento' },
  ]);

  writer.finalizeDoc('FRM.SGP-0020');
  await downloadPdf(doc, 'portaria-carretas-chapas.pdf');
}

// =====================================================================
// 4. FRM.SGP-0010: Relatório de Ocorrências da Portaria (Executivo)
// =====================================================================
export async function exportRelatorioPortariaPdf(relatorio: PortRelatorioPortaria): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  const statusLabel = relatorio.status === 'CONCLUIDO' ? 'CONCLUÍDO' : 'EM ANDAMENTO';
  const statusColor = relatorio.status === 'CONCLUIDO' ? 'green' : 'blue';

  // Cabeçalho Executivo
  writer.drawDocumentHeader({
    title: 'Relatório de Ocorrências da Portaria',
    formCode: relatorio.codigo_formulario || 'FRM.SGP-0010',
    protocol: relatorio.numero_protocolo,
    statusBadge: statusLabel,
    statusColor: statusColor,
  });

  // Grid de Informações do Plantão
  writer.drawInfoGrid([
    { label: 'Data do Plantão', value: formatDataBR(relatorio.data) },
    { label: 'Turno / Horário', value: `${relatorio.turno} (${relatorio.horario_inicio} às ${relatorio.horario_fim})` },
    { label: 'Vigilante Portaria', value: relatorio.vigilante_principal },
    { label: 'Vigilante Ronda 01', value: relatorio.vigilante_ronda01 || 'Não escalado' },
    { label: 'Vigilante Ronda 02', value: relatorio.vigilante_ronda02 || 'Não escalado' },
    {
      label: 'Status do Livro',
      value: relatorio.status,
      statusBadge: statusLabel,
      statusColor: statusColor,
    },
  ], 3);

  // Lista de Ocorrências em Cartões Estruturados
  const ocorrencias = relatorio.ocorrencias || [];
  writer.drawSectionHeader('Ocorrências, Entradas, Saídas e Rondas Registradas', ocorrencias.length);

  if (ocorrencias.length === 0) {
    writer.drawCallout('Sem Alterações', 'Nenhuma alteração ou ocorrência registrada durante o plantão.');
  } else {
    ocorrencias.forEach((oc, i) => {
      writer.drawOccurrenceCard({
        index: i + 1,
        time: oc.horario,
        sector: oc.local_setor,
        severity: oc.severidade,
        vigilante: oc.vigilante,
        description: oc.descricao,
      });
    });
  }

  // Observações Gerais
  if (relatorio.observacoes_gerais) {
    writer.drawSectionHeader('Observações Gerais do Plantão');
    writer.drawCallout('Anotações do Vigilante', relatorio.observacoes_gerais);
  }

  // Assinaturas Oficiais
  writer.drawSignatures([
    { role: 'Vigilante da Portaria', name: relatorio.vigilante_principal },
    { role: 'Vigilante de Ronda', name: relatorio.vigilante_ronda01 || relatorio.vigilante_ronda02 || '' },
    { role: 'Supervisor de Segurança Patrimonial' },
  ]);

  // Páginas de Anexos Fotográficos com Referência ao Lançamento
  const fotosAnexas = ocorrencias
    .filter((oc) => !!oc.foto_url)
    .map((oc, idx) => ({
      title: `Ocorrência #${idx + 1} — [${oc.horario}] [${oc.local_setor}]`,
      reference: `Vigilante: ${oc.vigilante} · Severidade: ${oc.severidade || 'INFO'}`,
      description: oc.descricao,
      timestamp: `${formatDataBR(relatorio.data)} às ${oc.horario}`,
      source: oc.foto_url as string,
    }));

  if (fotosAnexas.length > 0) {
    await writer.drawPhotoAttachments(fotosAnexas);
  }

  writer.finalizeDoc(relatorio.codigo_formulario || 'FRM.SGP-0010');
  await downloadPdf(doc, `relatorio-portaria-${relatorio.numero_protocolo}.pdf`);
}

// =====================================================================
// 5. FRM.SGP-0013: Lista de Presença - Briefing de Segurança (Individual)
// =====================================================================
export async function exportBriefingPdf(sessao: PortBriefingSessao): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  await renderSessaoBriefing(writer, sessao);

  writer.finalizeDoc(sessao.codigo_formulario || 'FRM.SGP-0013');
  await downloadPdf(doc, `briefing-seguranca-${sessao.numero_protocolo}.pdf`);
}

// 5.1 FRM.SGP-0013: Relatório Consolidado de Múltiplas Sessões de Briefing
export async function exportBriefingConsolidadoPdf(sessoes: PortBriefingSessao[]): Promise<void> {
  if (sessoes.length === 0) return;
  if (sessoes.length === 1) {
    return exportBriefingPdf(sessoes[0]);
  }

  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  for (let i = 0; i < sessoes.length; i++) {
    if (i > 0) {
      writer.addNewPage();
    }
    await renderSessaoBriefing(writer, sessoes[i]);
  }

  writer.finalizeDoc('FRM.SGP-0013');
  await downloadPdf(doc, `briefing-seguranca-consolidado-${sessoes.length}-sessoes.pdf`);
}

async function renderSessaoBriefing(writer: PdfTextWriter, sessao: PortBriefingSessao): Promise<void> {
  const participantes = sessao.participantes || [];
  const ass = participantes.filter((p) => !!p.assinatura_digital).length;
  const concl = participantes.length > 0 && ass === participantes.length;

  writer.drawDocumentHeader({
    title: 'Lista de Presença — Briefing de Segurança',
    formCode: sessao.codigo_formulario || 'FRM.SGP-0013 (Rev. 01)',
    protocol: sessao.numero_protocolo,
    statusBadge: concl ? 'FINALIZADA (100% ASSINADA)' : 'PENDENTE',
    statusColor: concl ? 'green' : 'blue',
  });

  writer.drawInfoGrid([
    { label: 'Tema do Treinamento', value: sessao.tema_treinamento },
    { label: 'Tipo de Público', value: sessao.tipo === 'EXTERNO' ? 'Externo (Visitantes/Terceiros)' : 'Interno (Colaboradores)' },
    { label: 'Data da Sessão', value: formatDataBR(sessao.data) },
    { label: 'Instrutor / Responsável', value: sessao.instrutor_responsavel },
  ], 2);

  writer.drawSectionHeader('Conteúdo Programático & Diretrizes');
  writer.drawCallout('Conteúdo Ministrado', sessao.conteudo_programatico);

  writer.drawSectionHeader('Termo de Responsabilidade e Ciência');
  writer.drawCallout('Declaração do Participante', sessao.termo_responsabilidade, true);

  writer.drawSectionHeader('Relação de Participantes e Assinaturas Digitais', participantes.length);
  await writer.drawAttendanceTableWithSignatures(participantes);

  writer.drawSignatures([
    { role: 'Instrutor / Responsável', name: sessao.instrutor_responsavel },
    { role: 'Técnico em Segurança do Trabalho (SESMT)' },
  ]);
}

// =====================================================================
// 6. FRM.SGP-0010: Passagem de Plantão da Portaria
// =====================================================================
export async function exportPassagemPlantaoPdf(plantao: PortPassagemPlantao): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  const isConcluido = plantao.status === 'CONCLUIDO';

  writer.drawDocumentHeader({
    title: 'Passagem de Plantão da Portaria',
    formCode: plantao.codigo_formulario || 'FRM.SGP-0010 (Rev. 00)',
    protocol: plantao.numero_protocolo,
    statusBadge: isConcluido ? 'CONCLUÍDO' : 'EM ANDAMENTO',
    statusColor: isConcluido ? 'green' : 'blue',
  });

  writer.drawInfoGrid([
    { label: 'Data do Plantão', value: formatDataBR(plantao.data) },
    { label: 'Turno / Horário', value: `${plantao.turno} (${plantao.horario_inicio} às ${plantao.horario_fim})` },
    { label: 'Vigilante Portaria', value: plantao.vigilante_portaria },
    { label: 'Vigilante Ronda 01', value: plantao.vigilante_ronda01 || 'Não escalado' },
    { label: 'Vigilante Ronda 02', value: plantao.vigilante_ronda02 || 'Não escalado' },
    { label: 'Preenchido por', value: plantao.vigilante_preenchedor || plantao.vigilante_portaria },
  ], 3);

  if (plantao.texto_declaracao) {
    writer.drawSectionHeader('Termo Declaratório de Recebimento do Posto');
    writer.drawCallout('Declaração do Plantão', plantao.texto_declaracao, true);
  }

  const itens = plantao.itens_conferidos || [];
  writer.drawSectionHeader('Conferência de Materiais de Segurança Patrimonial', itens.length);

  const tableHeaders = [
    { label: 'MATERIAL / EQUIPAMENTO', width: 220, align: 'left' as const },
    { label: 'QUANTIDADE', width: 90, align: 'center' as const },
    { label: 'CONFERÊNCIA', width: 85, align: 'center' as const },
    { label: 'OBSERVAÇÃO', width: 120, align: 'left' as const },
  ];

  const tableRows = itens.map((it) => [
    it.nome,
    `${it.quantidade_conferida ?? it.quantidade_esperada} / ${it.quantidade_esperada} ${it.unidade || 'UN'}`,
    it.conferido ? 'CONFORME [OK]' : 'DIVERGENTE',
    it.observacao || '-',
  ]);

  writer.drawTable(tableHeaders, tableRows);

  if (plantao.observacoes) {
    writer.drawSectionHeader('Observações e Ocorrências do Plantão');
    writer.drawCallout('Observações Gerais', plantao.observacoes);
  }

  writer.drawSignatures([
    { role: 'Vigilante Entregador (Plantão Anterior)', name: plantao.vigilante_anterior_01 || '' },
    { role: 'Vigilante Recebedor (Plantão Atual)', name: plantao.vigilante_portaria },
  ]);

  writer.finalizeDoc(plantao.codigo_formulario || 'FRM.SGP-0010');
  await downloadPdf(doc, `passagem-plantao-${plantao.numero_protocolo}.pdf`);
}

// =====================================================================
// 7. Relatório Consolidado de Múltiplos Plantões (FRM.SGP-0010)
// =====================================================================
export async function exportPassagensPlantaoConsolidadoPdf(plantoes: PortPassagemPlantao[]): Promise<void> {
  if (plantoes.length === 0) return;
  if (plantoes.length === 1) {
    return exportPassagemPlantaoPdf(plantoes[0]);
  }

  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  const datas = plantoes.map((p) => p.data).sort();
  const menorData = formatDataBR(datas[0]);
  const maiorData = formatDataBR(datas[datas.length - 1]);

  writer.drawDocumentHeader({
    title: 'Relatório Consolidado de Passagem de Plantão',
    formCode: 'FRM.SGP-0010 (Rev. 00)',
    protocol: `CSL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
  });

  writer.drawInfoGrid([
    { label: 'Total de Plantões Consolidados', value: `${plantoes.length} plantões` },
    { label: 'Período Abrangido', value: menorData === maiorData ? menorData : `${menorData} até ${maiorData}` },
  ], 2);

  plantoes.forEach((plantao, index) => {
    writer.drawSectionHeader(`Plantão ${index + 1}: ${formatDataBR(plantao.data)} — Turno ${plantao.turno} (${plantao.numero_protocolo})`);

    writer.drawInfoGrid([
      { label: 'Vigilante Portaria', value: plantao.vigilante_portaria },
      { label: 'Vigilante Ronda 01', value: plantao.vigilante_ronda01 || '-' },
      { label: 'Vigilante Ronda 02', value: plantao.vigilante_ronda02 || '-' },
      { label: 'Entregue por', value: plantao.vigilante_anterior_01 || '-' },
    ], 2);

    const itens = plantao.itens_conferidos || [];
    if (itens.length > 0) {
      const tableHeaders = [
        { label: 'MATERIAL', width: 250, align: 'left' as const },
        { label: 'QUANTIDADE', width: 110, align: 'center' as const },
        { label: 'STATUS', width: 155, align: 'center' as const },
      ];
      const tableRows = itens.map((it) => [
        it.nome,
        `${it.quantidade_conferida ?? it.quantidade_esperada} / ${it.quantidade_esperada} ${it.unidade || 'UN'}`,
        it.conferido ? 'CONFORME' : 'DIVERGENTE',
      ]);
      writer.drawTable(tableHeaders, tableRows);
    }

    if (plantao.observacoes) {
      writer.drawCallout('Observações do Turno', plantao.observacoes);
    }
  });

  writer.drawSignatures([
    { role: 'Vigilante Responsável' },
    { role: 'Supervisor de Segurança Patrimonial' },
  ]);

  writer.finalizeDoc('FRM.SGP-0010');
  await downloadPdf(doc, `consolidado-passagens-plantao-${datas[0]}-${datas[datas.length - 1]}.pdf`);
}
