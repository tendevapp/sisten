import * as XLSX from 'xlsx';
import { DEPOSITO_EPI, type FiltrosSaidaEstoque, type JanelaAnalise, type LinhaItemSaida, type SaidaEstoque } from './consumoEstoqueEpi';

export const COLUNAS_ITENS_SAIDA = [
  'Material', 'Descrição', 'UM', 'Saldo atual (dep. 0002)', 'Valor em estoque', 'Saída líquida (un.)',
  'Valor da saída (R$)', 'Saídas (lançamentos)', 'Estornos', 'Média mensal (un.)', 'Cobertura (dias)',
  'Primeira saída', 'Última saída', 'Finalidades',
] as const;

export const COLUNAS_MOVIMENTOS_SAIDA = [
  'Data', 'Material', 'Descrição', 'Lançamento (TMV)', 'Quantidade', 'Valor (R$)', 'Documento MB51',
  'Finalidade', 'Elemento PEP', 'Usuário',
] as const;

export function criarWorkbookSaidasEstoque(
  itens: LinhaItemSaida[],
  movimentos: SaidaEstoque[],
  filtros: FiltrosSaidaEstoque,
  janela: JanelaAnalise,
  geradoEm: Date = new Date(),
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  const linhasItens = itens.map(item => [
    item.material, item.descricao ?? '', item.umb ?? '', item.saldo, item.valorEstoque, item.quantidade,
    item.valor, item.lancamentos, item.estornos, item.mediaMensal, item.coberturaDias ?? '',
    item.primeiraSaida ?? '', item.ultimaSaida ?? '', item.finalidades.join(' | '),
  ]);
  const planilhaItens = XLSX.utils.aoa_to_sheet([Array.from(COLUNAS_ITENS_SAIDA), ...linhasItens]);
  planilhaItens['!cols'] = [18, 44, 6, 14, 14, 14, 14, 12, 9, 14, 12, 12, 12, 30].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, planilhaItens, 'Itens');

  const linhasMovimentos = movimentos.map(m => [
    m.data, m.material, m.descricao ?? '', m.tipo, m.quantidade, m.valor, m.documento ?? '',
    m.finalidade, m.pep ?? '', m.usuario ?? '',
  ]);
  const planilhaMovimentos = XLSX.utils.aoa_to_sheet([Array.from(COLUNAS_MOVIMENTOS_SAIDA), ...linhasMovimentos]);
  planilhaMovimentos['!cols'] = [12, 18, 44, 10, 12, 12, 16, 22, 18, 12].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, planilhaMovimentos, 'Movimentos');

  const parametros = XLSX.utils.aoa_to_sheet([
    ['Parâmetro', 'Valor'],
    ['Depósito', DEPOSITO_EPI],
    ['Fonte', 'SAP MB51 (baixas de consumo e estornos) e ZL0024 (saldo)'],
    ['Janela', `${janela.inicio} a ${janela.fim}`],
    ['Finalidade', filtros.finalidade ?? 'Todas'],
    ['Palavras-chave', filtros.palavras.join(' + ') || '—'],
    ['Gerado em', geradoEm.toISOString()],
  ]);
  parametros['!cols'] = [18, 60].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, parametros, 'Parametros');

  return workbook;
}

export function exportarSaidasEstoqueExcel(
  itens: LinhaItemSaida[],
  movimentos: SaidaEstoque[],
  filtros: FiltrosSaidaEstoque,
  janela: JanelaAnalise,
): void {
  XLSX.writeFile(
    criarWorkbookSaidasEstoque(itens, movimentos, filtros, janela),
    `saidas-estoque-epi-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}
