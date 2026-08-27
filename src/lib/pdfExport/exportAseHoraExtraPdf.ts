/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportação em PDF do formulário ASE - Hora Extra (FRM.RHU-0007), no mesmo
 * padrão de `exportCompraPdf.ts` (layout corrido em `PdfTextWriter`, não uma
 * réplica pixel-a-pixel do impresso).
 */

import type { AseHoraExtraCompleta } from '../../types';
import { createDoc, PdfTextWriter, downloadPdf } from './core';
import { diaDaSemana } from '../rhApi';

function formatDataBR(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const STATUS_LABELS: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  ENVIADO: 'Enviado',
  CANCELADO: 'Cancelado',
};

export async function exportAseHoraExtraPdf(solicitacao: AseHoraExtraCompleta): Promise<void> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);

  writer.drawTitle('ASE - Autorização para Serviços Extraordinários');
  writer.drawField('Código do Formulário', solicitacao.codigo_formulario);
  writer.drawField('Protocolo', solicitacao.numero_protocolo);
  writer.drawField('Status', STATUS_LABELS[solicitacao.status] || solicitacao.status);
  writer.drawField('Setor', solicitacao.setor_nome || '-');
  writer.drawField('Turno', solicitacao.turno_nome || '-');
  writer.drawField('Data', `${formatDataBR(solicitacao.data_execucao)} (${diaDaSemana(solicitacao.data_execucao)})`);
  writer.drawField('Quantidade de Colaboradores', String(solicitacao.itens.length));
  writer.drawField('Solicitante', solicitacao.solicitante_nome || '-');
  if (solicitacao.justificativa) writer.drawField('Justificativa', solicitacao.justificativa);

  writer.spacer(6);
  writer.drawSubtitle(`Colaboradores (${solicitacao.itens.length})`);
  solicitacao.itens.forEach((it, idx) => {
    writer.drawTableRow(`${idx + 1}. ${it.registro} — ${it.nome}${it.cargo ? ` (${it.cargo})` : ''}`);
    writer.drawTableRow(
      `   Transporte: ${it.transporte ? 'Sim' : 'Não'} · Refeição: ${it.refeicao ? 'Sim' : 'Não'} · `
      + `Horário: ${it.hora_entrada}–${it.hora_saida} (intervalo ${it.intervalo_minutos}min) · `
      + `%HE: ${it.percentual_he ?? '-'} · Total: ${it.total_horas ?? '-'}h`,
    );
    if (it.observacao) writer.drawTableRow(`   Obs: ${it.observacao}`);
  });

  const totalHoras = solicitacao.itens.reduce((acc, it) => acc + (it.total_horas || 0), 0);
  writer.spacer(6);
  writer.drawField('Total Geral de Horas', `${totalHoras.toFixed(2)}h`);

  await downloadPdf(doc, `ase-hora-extra-${solicitacao.numero_protocolo}.pdf`);
}
