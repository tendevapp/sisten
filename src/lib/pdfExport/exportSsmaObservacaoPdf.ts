import { createDoc, docToPdfGerado, PdfTextWriter } from './core';
import { agruparChecklist, desviosPorHora, type ItemObservacao, type RegistroObservacao } from '../ssmaObservacaoApi';

export async function gerarObservacoesPdf(registros: RegistroObservacao[], itens: ItemObservacao[], nome: string) {
  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc,font,fontBold,logo);
  const formulario = 'FRM.SEG-0042 · Rev. 04';
  for (const [i,r] of registros.entries()) {
    if (i) w.addNewPage();
    const cabecalho = {title: 'Observação Comportamental', formCode: formulario, protocol: r.codigo, emissionDate: new Date().toLocaleDateString('pt-BR')};
    w.drawDocumentHeader(cabecalho);
    w.drawSectionHeader('Identificação da observação');
    w.drawInfoGrid([{label:'Data', value:r.data.split('-').reverse().join('/')},{label:'Turno / letra', value:r.turno_letra},
      {label:'Duração',value:r.duracao_min + ' min'},{label:'Desvios por hora',value:desviosPorHora(r.desvios.length,r.duracao_min).toLocaleString('pt-BR',{maximumFractionDigits:2})},
      {label:'Pessoas contatadas',value:String(r.pessoas_contatadas)},{label:'Pessoas observadas',value:String(r.pessoas_observadas)}]);
    w.drawTableRow('Observador: ' + r.nome);
    w.drawTableRow('Local: ' + r.local);
    w.drawTableRow('Líder da área: ' + r.lider_area);
    w.drawTableRow('Referência do formulário: pelo menos 30 minutos por cartão e 6 desvios por hora.');
    w.drawSectionHeader('Práticas seguras observadas');
    w.spacer(5);
    w.drawTableRow(r.praticas_seguras || 'Sem relato.');
    w.drawSectionHeader('Práticas inseguras observadas', r.desvios.length);
    w.spacer(5);
    if (!r.desvios.length) w.drawTableRow('Nenhum desvio relatado.');
    r.desvios.forEach((d,n) => w.drawTableRow('Desvio ' + (n+1) + ': ' + d));
    w.addNewPage();
    w.drawDocumentHeader({...cabecalho,title:'Checklist de práticas e condições'});
    for (const [grupo,opcoes] of agruparChecklist(itens)) {
      w.ensureSpace(44);
      w.drawSectionHeader(grupo);
      w.spacer(5);
      for (const item of opcoes) w.drawTableRow((r.itens.includes(item.id) ? '[X]  ' : '[  ]  ') + item.descricao);
    }
  }
  w.finalizeDoc(formulario);
  return docToPdfGerado(doc, nome + '.pdf', 'Observação Comportamental');
}
