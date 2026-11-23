import { createDoc, docToPdfGerado, PdfTextWriter } from './core';
import { categoriasRonda, totalRonda, type RegistroRonda } from '../ssmaRondaApi';

export async function gerarRondasPdf(registros: RegistroRonda[], nome: string) {
  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc, font, fontBold, logo);
  const formulario = 'FRM.SEG-0041 · Rev. 00';
  for (const [i, r] of registros.entries()) {
    if (i) w.addNewPage();
    w.drawDocumentHeader({ title: 'Ronda de Segurança do Trabalho', formCode: formulario, protocol: r.codigo,
      emissionDate: new Date().toLocaleDateString('pt-BR') });
    w.drawSectionHeader('Identificação da ronda');
    w.drawInfoGrid([{ label: 'Data', value: r.data.split('-').reverse().join('/') }, { label: 'Hora', value: r.hora.slice(0, 5) }]);
    w.drawTableRow('Gerente da unidade: ' + r.gerente);
    w.drawTableRow('Frentes de trabalho: ' + r.frentes);
    w.drawSectionHeader('Irregularidades identificadas');
    w.drawTable([{ label: 'Categoria', width: w.getContentWidth() - 85 }, { label: 'Quantidade', width: 85 }],
      [...categoriasRonda.map(c => [c.nome, String(r[c.chave])]), ['Total de irregularidades', String(totalRonda(r))]]);
    for (const [titulo, texto] of [['Boas práticas', r.boas_praticas], ['Observações e sugestões', r.observacoes]]) {
      w.drawSectionHeader(titulo);
      w.spacer(6);
      for (const linha of (texto || '—').split(/\r?\n/)) w.drawTableRow(linha);
    }
    w.drawSectionHeader('Participantes e assinaturas');
    const pessoas = [{ nome: r.gerente, papel: 'Gerente da unidade', assinatura: r.assinatura_gerente },
      ...r.participantes.map(p => ({ ...p, papel: 'Participante' }))];
    await w.drawTableComAssinaturas([{ label: 'Papel', width: 108 }, { label: 'Nome', width: w.getContentWidth() - 235 },
      { label: 'Assinatura', width: 127 }], pessoas.map(p => [p.papel, p.nome, '']), pessoas.map(p => p.assinatura), 2);
  }
  w.finalizeDoc(formulario);
  return docToPdfGerado(doc, nome + '.pdf', 'Ronda de Segurança do Trabalho');
}
