import * as XLSX from 'xlsx';
import { categoriasRonda, totalRonda, type RegistroRonda } from './ssmaRondaApi';

export function criarPlanilhaRondas(registros: RegistroRonda[]) {
  const livro = XLSX.utils.book_new();
  livro.Props = { Title: 'Ronda de Segurança do Trabalho · FRM.SEG-0041 · Rev. 00', Author: 'SISTEN' };
  function aba(nome: string, linhas: (string | number)[][], larguras: number[]) {
    const folha = XLSX.utils.aoa_to_sheet(linhas);
    folha['!cols'] = larguras.map(wch => ({ wch }));
    folha['!autofilter'] = { ref: folha['!ref']! };
    XLSX.utils.book_append_sheet(livro, folha, nome);
  }
  aba('Rondas', [
    ['Nº da ronda', 'Data', 'Hora', 'Gerente da unidade', 'Frentes de trabalho', ...categoriasRonda.map(c => c.nome),
      'Total de irregularidades', 'Boas práticas', 'Observações e sugestões'],
    ...registros.map(r => [r.codigo, r.data, r.hora.slice(0,5), r.gerente, r.frentes, ...categoriasRonda.map(c => r[c.chave]),
      totalRonda(r), r.boas_praticas, r.observacoes]),
  ], [20,14,10,32,52,43,39,32,30,25,65,65]);
  aba('Participantes e assinaturas', [
    ['Nº da ronda','Papel','Nome','Assinatura digital'],
    ...registros.flatMap(r => [{ papel: 'Gerente da unidade', nome: r.gerente, assinatura: r.assinatura_gerente },
      ...r.participantes.map(p => ({ ...p, papel: 'Participante' }))].map(p =>
      [r.codigo, p.papel, p.nome, p.assinatura ? 'Coletada' : 'Em branco'])),
  ], [20,24,42,24]);
  return livro;
}

export function exportarRondasExcel(registros: RegistroRonda[], nome: string) {
  XLSX.writeFile(criarPlanilhaRondas(registros), nome + '.xlsx');
}
