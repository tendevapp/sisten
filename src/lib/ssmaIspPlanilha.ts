import * as XLSX from 'xlsx';
import { GRUPOS_ISP, totalIsp, type ItemIsp, type RegistroIsp } from './ssmaIspApi';

export function criarPlanilhaIsp(registros: RegistroIsp[], itens: ItemIsp[]) {
  const livro = XLSX.utils.book_new();
  livro.Props = { Title: 'Inspeção de SST · FRM.SEG-0036 · Rev. 01', Author: 'SISTEN' };
  function aba(nome: string, titulos: string[], larguras: number[], linhas: (string | number | null)[][]) {
    const folha = XLSX.utils.aoa_to_sheet([titulos, ...linhas]);
    folha['!cols'] = larguras.map(wch => ({ wch }));
    folha['!autofilter'] = { ref: folha['!ref']! };
    XLSX.utils.book_append_sheet(livro, folha, nome);
  }
  aba('Inspeções', ['Registro', 'Data', 'Área', 'Responsável pela área', 'Responsável pela inspeção', 'TST da área',
    'Início', 'Duração (min)', 'Inspecionados', 'HHI', 'Comentários', 'Grupo G', 'Grupo M', 'Grupo L', 'Total de irregularidades', 'Fotos'],
    [20,14,28,32,32,32,11,16,16,12,65,12,12,12,26,10], registros.map(r => [
      r.codigo,r.data,r.area,r.responsavel_area,r.inspetor,r.tst,r.inicio.slice(0,5),r.duracao_min,r.inspecionados,r.hhi,
      r.comentarios,...GRUPOS_ISP.map(g => totalIsp(r.respostas,g)),totalIsp(r.respostas),r.fotos.length,
    ]));
  aba('Verificações',['Registro','Grupo','Item','Descrição','Nº de irregularidades'],[20,10,10,105,24],
    registros.flatMap(r => itens.map(i => [r.codigo,i.codigo[0],i.codigo,i.descricao,r.respostas[i.codigo]])));
  aba('Ações corretivas',['Registro','Item','Quantidade','Ação de correção','Responsável','Prazo','RNC'],[20,10,14,75,35,15,24],
    registros.flatMap(r => r.acoes.map(a => [r.codigo,a.item,a.quantidade,a.descricao,a.responsavel,a.prazo,a.rnc])));
  aba('Fotos',['Registro','Foto','Referência no Storage privado'],[20,10,95],
    registros.flatMap(r => r.fotos.map((path,i) => [r.codigo,i+1,path])));
  return livro;
}

export function exportarPlanilhaIsp(registros: RegistroIsp[], itens: ItemIsp[], arquivo: string) {
  XLSX.writeFile(criarPlanilhaIsp(registros,itens), arquivo + '.xlsx');
}

