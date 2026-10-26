/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PDF da Retirada de Material sem Saldo (Solicitação Extraordinária, tipo
 * Sem Saldo — código RSS) para imprimir e colher as assinaturas: quem
 * retirou, o almoxarifado e o gestor que autoriza.
 *
 * Aprovada no sistema, o quadro de autorização traz o nome do gestor e a
 * data/hora da aprovação. Antes disso o documento sai marcado "AGUARDANDO
 * APROVAÇÃO" — a tela avisa e pede confirmação antes de gerar.
 */

import {
  createDoc, docToPdfGerado, PdfTextWriter, type PdfGerado,
} from './core';
import { formatQtd } from '../format';
import { formatarDataBR } from '../fichaEpi';
import { APROVACAO_SOL_EXTRA_ROTULO, CODIGO_FRM_SOL_EXTRA, rotuloStatusSolExtra } from '../solicitacaoExtra';
import type { SolExtra } from '../solicitacaoExtraApi';

export type { PdfGerado };

const COR_APROVACAO = { PENDENTE: 'amber', APROVADA: 'green', REPROVADA: 'red' } as const;

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-');

export async function gerarRetiradaSemSaldoPdf(r: SolExtra): Promise<PdfGerado> {
  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc, font, fontBold, logo);
  const codigo = r.codigo || 'Pendente de sincronização';
  const aprovacao = r.aprovacao_status ?? 'PENDENTE';
  const rotuloAprovacao = APROVACAO_SOL_EXTRA_ROTULO[aprovacao];

  w.drawDocumentHeader({
    title: 'Retirada de Material sem Saldo',
    formCode: CODIGO_FRM_SOL_EXTRA,
    protocol: codigo,
    emissionDate: new Date().toLocaleDateString('pt-BR'),
    statusBadge: rotuloAprovacao.toUpperCase(),
    statusColor: COR_APROVACAO[aprovacao],
  });

  w.drawSectionHeader('Identificação');
  w.drawInfoGrid(
    [
      { label: 'Quem retirou', value: r.retirante_nome || '-' },
      { label: 'Matrícula', value: r.retirante_matricula || '-' },
      { label: 'Setor solicitante', value: r.setor_solicitante_nome || '-' },
      { label: 'Data', value: formatarDataBR(r.data) },
      { label: 'Hora', value: r.hora?.slice(0, 5) || '-' },
      { label: 'Registrado por', value: r.criado_por_nome || '-' },
    ],
    3,
  );

  w.drawSectionHeader('Materiais', r.itens.length);
  w.drawTable(
    [
      { label: 'Item', width: 30, align: 'center' },
      { label: 'Código SAP', width: 80 },
      { label: 'Descrição', width: 300 },
      { label: 'Quant.', width: 60, align: 'right' },
      { label: 'Un.', width: 45, align: 'center' },
    ],
    r.itens.map((it, i) => [String(i + 1), it.material, it.descricao || '-', formatQtd(it.quantidade), it.unidade || 'UN']),
  );

  if (r.observacao) w.drawCallout('Observação', r.observacao);

  w.drawSectionHeader('Autorização do gestor');
  if (aprovacao === 'APROVADA') {
    w.drawCallout(
      'Aprovada no SISTEN',
      `Retirada aprovada por ${r.aprovado_por_nome || '-'} em ${dataHora(r.aprovado_em)}.${r.aprovacao_obs ? ` Parecer: ${r.aprovacao_obs}` : ''}`,
    );
  } else if (aprovacao === 'REPROVADA') {
    w.drawCallout(
      'Reprovada no SISTEN',
      `Retirada reprovada por ${r.aprovado_por_nome || '-'} em ${dataHora(r.aprovado_em)}. Motivo: ${r.aprovacao_obs || '-'}`,
    );
  } else {
    w.drawCallout(
      'Documento ainda não aprovado',
      `Gerado em ${dataHora(new Date().toISOString())}, antes da aprovação do gestor do setor solicitante no SISTEN. Vale somente com a assinatura de autorização abaixo.`,
    );
  }

  w.drawSectionHeader('Baixa no almoxarifado');
  w.drawInfoGrid(
    [
      { label: 'Situação', value: rotuloStatusSolExtra(r.status, 'SEM_SALDO') },
      { label: 'Requisição no balcão', value: r.requisicao_balcao_codigo || '-' },
      { label: 'Baixada por', value: r.regularizado_por_nome ? `${r.regularizado_por_nome} em ${dataHora(r.regularizado_em)}` : '-' },
    ],
    3,
  );

  w.spacer(18);
  w.drawSignatures([
    { role: 'Quem retirou', name: r.retirante_nome || undefined },
    { role: 'Almoxarifado', name: r.criado_por_nome || undefined },
    { role: 'Gestor — autorização', name: aprovacao === 'APROVADA' ? r.aprovado_por_nome || undefined : undefined },
  ]);

  w.finalizeDoc(CODIGO_FRM_SOL_EXTRA);
  const nome = (r.codigo || `retirada-sem-saldo-${r.id.slice(0, 8)}`).toLowerCase();
  return docToPdfGerado(doc, `${nome}.pdf`, `Retirada sem saldo ${codigo}`);
}
