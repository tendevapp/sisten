import { createDoc, PdfTextWriter, downloadPdf, docToPdfGerado, baixarPdfGerado, type PdfGerado } from './core';
export type { PdfGerado };
import type { LancamentoProducao } from '../producaoApi';

/** Data book enxuto do lançamento, com código e status oficiais do módulo. */
export async function gerarProducaoLancamentoPdf(lancamento: LancamentoProducao, etapaNome: string): Promise<PdfGerado> {
  const { doc, font, fontBold, logo } = await createDoc();
  const writer = new PdfTextWriter(doc, font, fontBold, logo);
  writer.drawDocumentHeader({
    title: `Registro de Produção — ${etapaNome}`,
    formCode: lancamento.codigo,
    protocol: lancamento.codigo,
  });
  writer.drawInfoGrid([
    { label: 'Peça', value: `Torre ${lancamento.torre_numero} · ${lancamento.tramo} · ${lancamento.virola}` },
    { label: 'Status', value: lancamento.status.toUpperCase() },
    { label: 'Data', value: lancamento.data_liberacao },
    { label: 'Turno', value: lancamento.turno || '-' },
    { label: 'Executante', value: lancamento.executante_nome || '-' },
    { label: 'Inspetor', value: lancamento.inspetor_nome || '-' },
    { label: 'Rastreabilidade', value: lancamento.rastreabilidade || '-' },
    { label: 'Observação', value: lancamento.observacao || '-' },
  ], 2);
  writer.drawSectionHeader('Auditoria');
  writer.drawTable(
    [{ label: 'CAMPO', width: 170 }, { label: 'VALOR', width: 340 }],
    [['Código', lancamento.codigo], ['Tentativa', String(lancamento.tentativa)], ['Criado por', lancamento.criado_por_nome || '-'], ['Registro', lancamento.created_at]],
  );
  writer.finalizeDoc(lancamento.codigo);
  return docToPdfGerado(doc, `${lancamento.codigo}.pdf`, `Registro de Produção — ${lancamento.codigo}`);
}

export async function exportProducaoLancamentoPdf(lancamento: LancamentoProducao, etapaNome: string): Promise<void> {
  baixarPdfGerado(await gerarProducaoLancamentoPdf(lancamento, etapaNome));
}
