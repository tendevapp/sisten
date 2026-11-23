import * as XLSX from 'xlsx';
import { desviosPorHora, type ItemObservacao, type RegistroObservacao } from './ssmaObservacaoApi';

export function exportarObservacoesExcel(registros: RegistroObservacao[], itens: ItemObservacao[], nome: string) {
  const livro = XLSX.utils.book_new();
  livro.Props = { Title: 'Observação Comportamental · FRM.SEG-0042 · Revisão 04', Author: 'SISTEN' };
  function aba(titulo: string, linhas: (number|string)[][], larguras: number[]) {
    const folha = XLSX.utils.aoa_to_sheet(linhas);
    folha['!cols'] = larguras.map(wch => ({wch}));
    folha['!autofilter'] = {ref: folha['!ref']!};
    XLSX.utils.book_append_sheet(livro, folha, titulo);
  }
  aba('Observações', [
    ['Registro','Data','Observador','Local','Turno / letra','Líder da área','Duração (min)','Duração (h)','Pessoas contatadas','Pessoas observadas','Práticas seguras observadas','Itens marcados','Desvios relatados','Desvios por hora'],
    ...registros.map(r => [r.codigo,r.data,r.nome,r.local,r.turno_letra,r.lider_area,r.duracao_min,r.duracao_min/60,r.pessoas_contatadas,
      r.pessoas_observadas,r.praticas_seguras,r.itens.length,r.desvios.length,desviosPorHora(r.desvios.length,r.duracao_min)]),
  ], [20,14,32,35,16,32,18,18,20,20,70,18,20,18]);
  aba('Checklist', [['Registro','Grupo','Item','Marcação de prática ou condição insegura'],
    ...registros.flatMap(r => itens.map(i => [r.codigo,i.grupo,i.descricao,r.itens.includes(i.id) ? 'Marcado' : 'Em branco']))], [20,40,64,44]);
  aba('Desvios', [['Registro','Desvio nº','Descrição'],...registros.flatMap(r => r.desvios.map((d,i) => [r.codigo,i+1,d]))], [20,14,90]);
  XLSX.writeFile(livro, nome + '.xlsx');
}
