import { createDoc, docToPdfGerado, MARGIN, PdfTextWriter } from './core';
import { assinarFotosIsp, dataIspBR, GRUPOS_ISP, totalIsp, type ItemIsp, type RegistroIsp } from '../ssmaIspApi';

export async function gerarIspPdf(registros: RegistroIsp[], itens: ItemIsp[], nome: string) {
  const { doc, font, fontBold, logo } = await createDoc();
  const w = new PdfTextWriter(doc,font,fontBold,logo);
  const formulario = 'FRM.SEG-0036 · Rev. 01';
  for (const [indice,r] of registros.entries()) {
    if (indice) w.addNewPage();
    w.drawDocumentHeader({ title: 'Inspeção de Segurança do Trabalho', formCode: formulario, protocol: r.codigo,
      emissionDate: new Date().toLocaleDateString('pt-BR') });
    w.drawSectionHeader('ISP · Índice de Segurança Praticada');
    w.drawInfoGrid([
      { label:'Área',value:r.area },{ label:'Data da inspeção',value:dataIspBR(r.data) },
      { label:'Responsável pela área',value:r.responsavel_area },{ label:'Responsável pela inspeção',value:r.inspetor },
      { label:'TST da área',value:r.tst },{ label:'Início',value:r.inicio.slice(0,5) },
      { label:'Tempo de inspeção',value:r.duracao_min + ' min' },{ label:'Inspecionados',value:String(r.inspecionados) },
      { label:'HHI',value:r.hhi?.toLocaleString('pt-BR') ?? '—' },{ label:'Total de irregularidades',value:String(totalIsp(r.respostas)) },
    ]);
    w.drawSectionHeader('Comentários sobre a inspeção');
    w.spacer(5);
    w.drawTableRow(r.comentarios || 'Sem comentários.');
    w.drawSectionHeader('Ações de correção', r.acoes.length);
    w.spacer(5);
    if (!r.acoes.length) w.drawTableRow('Nenhuma ação registrada.');
    for (const a of r.acoes) {
      w.ensureSpace(48);
      w.drawTableRow(a.item + '   |   Quantidade ' + a.quantidade + '   |   Prazo ' + dataIspBR(a.prazo));
      w.drawTableRow(a.descricao);
      w.drawTableRow('Responsável: ' + a.responsavel + (a.rnc ? '   |   RNC: ' + a.rnc : ''));
      w.spacer(4);
    }
    w.drawSignatures([{ role:'Responsável pela área',name:r.responsavel_area },{ role:'TST da área',name:r.tst },{ role:'Responsável pela inspeção',name:r.inspetor }]);
    w.addNewPage();
    w.drawSectionHeader('Itens de verificação', r.codigo);
    for (const grupo of GRUPOS_ISP) {
      w.ensureSpace(68);
      w.drawSectionHeader('Grupo ' + grupo, totalIsp(r.respostas,grupo) + ' irregularidades');
      w.spacer(5);
      for (const item of itens.filter(i => i.codigo.startsWith(grupo))) {
        w.drawTableRow(item.codigo + '  |  ' + r.respostas[item.codigo] + '  |  ' + item.descricao);
      }
    }
    const urls = await assinarFotosIsp(r.fotos);
    for (const [i,url] of urls.entries()) {
      const foto = await w.embedPhoto(url);
      if (!foto) throw new Error('Foto ' + (i+1) + ' de ' + r.codigo + ' indisponível para o PDF.');
      w.addNewPage();
      w.drawSectionHeader('Registro fotográfico', r.codigo);
      w.spacer(5);
      w.drawTableRow(r.area + ' · ' + dataIspBR(r.data) + ' · Foto ' + (i+1) + ' de ' + urls.length);
      const tamanho = foto.scaleToFit(w.getContentWidth(), w.getY() - MARGIN - 28);
      w.getPage().drawImage(foto, { ...tamanho, x: MARGIN + (w.getContentWidth() - tamanho.width)/2, y: w.getY() - tamanho.height - 8 });
    }
  }
  w.finalizeDoc(formulario);
  return docToPdfGerado(doc, nome + '.pdf', 'Inspeção de SST');
}

