/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Geradores de PDF oficiais dos 5 formulários do módulo Portaria da TEN:
 * 1. FRM.SGP-0011 (Equipamentos e Ferramentas de Terceiros)
 * 2. FRM.SGP-0009 (Registro de Chegada de Transportes)
 * 3. FRM.SGP-0020 (Controle de Chegada e Saída de Carretas de Chapas)
 * 4. FRM.SGP-0010 (Relatório de Portaria e Ocorrências)
 * 5. FRM.SGP-0013 (Lista de Presença - Briefing de Segurança)
 */

import { createDoc, PdfTextWriter, downloadPdf } from './core';
import type {
  PortControleEquipamento,
  PortRegistroTransporte,
  PortControleCarreta,
  PortRelatorioPortaria,
  PortBriefingSessao,
} from '../../types';

function formatDataBR(iso?: string | null): string {
  if (!iso) return '-';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// 1. FRM.SGP-0011: Equipamentos e Ferramentas de Terceiros
export async function exportEquipamentoPdf(item: PortControleEquipamento): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  writer.drawTitle('Controle de Entrada de Equipamento e Ferramentas de Terceiros');
  writer.drawField('Código do Formulário', item.codigo_formulario || 'FRM.SGP-0011');
  writer.drawField('Protocolo', item.numero_protocolo);
  writer.drawField('Empresa Terceira', item.nome_empresa);
  writer.drawField('Funcionário Responsável', item.funcionario);
  writer.drawField('Data de Entrada', `${formatDataBR(item.data_entrada)} às ${item.hora_entrada || '-'}`);
  writer.drawField('Data de Saída', item.data_saida ? `${formatDataBR(item.data_saida)} às ${item.hora_saida || '-'}` : 'Em Aberto (No Pátio)');
  writer.drawField('Vigilante de Entrada', item.vigilante_entrada);
  if (item.vigilante_saida) writer.drawField('Vigilante de Saída', item.vigilante_saida);
  if (item.responsavel) writer.drawField('Responsável / Acompanhante', item.responsavel);
  writer.drawField('Status', item.status);

  writer.spacer(6);
  writer.drawSubtitle('Descrição dos Materiais e Ferramentas');
  const linhas = item.descricao_materiais.split('\n');
  linhas.forEach((l) => writer.drawTableRow(l));

  if (item.observacoes) {
    writer.spacer(6);
    writer.drawSubtitle('Observações');
    writer.drawTableRow(item.observacoes);
  }

  await downloadPdf(doc, `portaria-equipamentos-${item.numero_protocolo}.pdf`);
}

// 2. FRM.SGP-0009: Registro de Chegada de Transportes
export async function exportTransportesPdf(
  data: string,
  turno: string,
  transportes: PortRegistroTransporte[]
): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  writer.drawTitle('Registro de Chegada de Transportes');
  writer.drawField('Código do Formulário', 'FRM.SGP-0009 (Rev. 00)');
  writer.drawField('Data do Registro', formatDataBR(data));
  writer.drawField('Turno', turno);
  writer.drawField('Total de Transportes', String(transportes.length));

  writer.spacer(6);
  writer.drawSubtitle(`Movimentações (${transportes.length})`);
  transportes.forEach((t, i) => {
    writer.drawTableRow(`${i + 1}. [${t.veiculo}] Placa: ${t.placa} — ${t.empresa}`);
    writer.drawTableRow(`   Motorista: ${t.motorista} · Ocupação/Função: ${t.ocupacao || '-'}`);
    writer.drawTableRow(`   Chegada: ${t.hora_chegada} · Saída: ${t.hora_saida || 'No Pátio'} · Vigilante: ${t.vigilante}`);
    if (t.observacoes) writer.drawTableRow(`   Obs: ${t.observacoes}`);
  });

  await downloadPdf(doc, `portaria-transportes-${data}-${turno}.pdf`);
}

// 3. FRM.SGP-0020: Controle de Carretas de Chapas
export async function exportCarretasPdf(carretas: PortControleCarreta[], periodoStr?: string): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  writer.drawTitle('Controle de Chegada e Saída de Carretas de Chapas');
  writer.drawField('Código do Formulário', 'FRM.SGP-0020 (Rev. 00)');
  if (periodoStr) writer.drawField('Período / Referência', periodoStr);
  writer.drawField('Total de Carretas Registradas', String(carretas.length));

  writer.spacer(6);
  writer.drawSubtitle(`Carretas Recebidas (${carretas.length})`);
  carretas.forEach((c, i) => {
    writer.drawTableRow(`${i + 1}. ${c.empresa} — Cavalo: ${c.placa_cavalo} / Carreta: ${c.placa_carreta}`);
    writer.drawTableRow(`   Motorista: ${c.nome_motorista}${c.cpf_motorista ? ` (CPF: ${c.cpf_motorista})` : ''}`);
    writer.drawTableRow(
      `   Entrada: ${formatDataBR(c.data_entrada)} ${c.hora_entrada} · ` +
      `Saída: ${c.data_saida ? `${formatDataBR(c.data_saida)} ${c.hora_saida}` : 'No Pátio'} · ` +
      `Status: ${c.status}`
    );
    if (c.numero_nf || c.peso_bruto) {
      writer.drawTableRow(`   NF: ${c.numero_nf || '-'} · Peso: ${c.peso_bruto ? `${c.peso_bruto} kg` : '-'}`);
    }
    if (c.observacoes) writer.drawTableRow(`   Obs: ${c.observacoes}`);
  });

  await downloadPdf(doc, `portaria-carretas-chapas.pdf`);
}

// 4. FRM.SGP-0010: Relatório de Portaria & Ocorrências
export async function exportRelatorioPortariaPdf(relatorio: PortRelatorioPortaria): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  writer.drawTitle('Relatório de Portaria & Ocorrências');
  writer.drawField('Código do Formulário', relatorio.codigo_formulario || 'FRM.SGP-0010');
  writer.drawField('Protocolo', relatorio.numero_protocolo);
  writer.drawField('Data do Plantão', formatDataBR(relatorio.data));
  writer.drawField('Turno / Horário', `${relatorio.turno} (${relatorio.horario_inicio} às ${relatorio.horario_fim})`);
  writer.drawField('Vigilante Portaria', relatorio.vigilante_principal);
  if (relatorio.vigilante_ronda01) writer.drawField('Vigilante Ronda 01', relatorio.vigilante_ronda01);
  if (relatorio.vigilante_ronda02) writer.drawField('Vigilante Ronda 02', relatorio.vigilante_ronda02);
  writer.drawField('Status', relatorio.status);

  const ocorrencias = relatorio.ocorrencias || [];
  writer.spacer(6);
  writer.drawSubtitle(`Ocorrências e Rondas Registradas (${ocorrencias.length})`);
  if (ocorrencias.length === 0) {
    writer.drawTableRow('Nenhuma alteração ou ocorrência registrada durante o plantão.');
  } else {
    ocorrencias.forEach((oc, i) => {
      writer.drawTableRow(`${i + 1}. [${oc.horario}] [${oc.local_setor}] (${oc.severidade}) — Vigilante: ${oc.vigilante}`);
      writer.drawTableRow(`   ${oc.descricao}`);
    });
  }

  if (relatorio.observacoes_gerais) {
    writer.spacer(6);
    writer.drawSubtitle('Observações Gerais do Plantão');
    writer.drawTableRow(relatorio.observacoes_gerais);
  }

  await downloadPdf(doc, `relatorio-portaria-${relatorio.numero_protocolo}.pdf`);
}

// 5. FRM.SGP-0013: Lista de Presença - Briefing de Segurança
export async function exportBriefingPdf(sessao: PortBriefingSessao): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  writer.drawTitle('Lista de Presença — Briefing de Segurança');
  writer.drawField('Código do Formulário', sessao.codigo_formulario || 'FRM.SGP-0013 (Rev. 01)');
  writer.drawField('Protocolo', sessao.numero_protocolo);
  writer.drawField('Tema do Treinamento', sessao.tema_treinamento);
  writer.drawField('Tipo', sessao.tipo);
  writer.drawField('Data da Sessão', formatDataBR(sessao.data));
  writer.drawField('Instrutor Responsável', sessao.instrutor_responsavel);

  writer.spacer(6);
  writer.drawSubtitle('Conteúdo Programático');
  sessao.conteudo_programatico.split('\n').forEach((l) => writer.drawTableRow(l));

  writer.spacer(6);
  writer.drawSubtitle('Termo de Responsabilidade');
  writer.drawTableRow(sessao.termo_responsabilidade);

  const participantes = sessao.participantes || [];
  writer.spacer(6);
  writer.drawSubtitle(`Participantes Presentes (${participantes.length})`);
  participantes.forEach((p, i) => {
    writer.drawTableRow(`${i + 1}. ${p.nome} — CPF: ${p.cpf} — ${p.empresa} (${p.funcao})`);
    writer.drawTableRow(`   Data: ${formatDataBR(p.data)} · Validade: ${p.validade_dias} dias · Assinatura Digital Registrada: ${p.assinatura_digital ? 'SIM (Digital)' : 'SIM'}`);
  });

  await downloadPdf(doc, `briefing-seguranca-${sessao.numero_protocolo}.pdf`);
}
