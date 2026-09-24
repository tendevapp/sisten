/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Inventário Cíclico — planilha de resultado.
 *
 * Uma linha por item, com as três contagens lado a lado. O saldo da ZL0024
 * só sai para item encerrado; item ainda aberto sai com a célula vazia.
 */

import * as XLSX from 'xlsx';
import { descricaoDeposito } from './almoxarifado';
import { MAX_CONTAGENS, linhasResultado, nomeArquivoInventario, type ItemInventario } from './inventarioCiclico';

export interface InventarioParaExportar {
  codigo: string;
  data: string;
  conferente_nome: string | null;
  criado_por_nome: string | null;
  criterio: string | null;
  itens: ItemInventario[];
}

const vazio = (v: number | null) => (v == null ? '' : v);

/** Linhas da aba "Resultado", já com os cabeçalhos em português. */
export function montarLinhasPlanilhaInventario(inv: InventarioParaExportar): Record<string, string | number>[] {
  return linhasResultado(inv.itens).map((l) => {
    const linha: Record<string, string | number> = {
      Item: l.item,
      Material: l.material,
      'Descrição': l.descricao,
      'Depósito': l.deposito,
      'Descrição depósito': descricaoDeposito(l.deposito),
      UMB: l.unidade,
      Classe: l.classe,
    };
    for (let n = 0; n < MAX_CONTAGENS; n++) linha[`${n + 1}ª contagem`] = vazio(l.contagens[n]);
    linha['Qtd final'] = vazio(l.qtdFinal);
    linha['Saldo ZL0024'] = vazio(l.saldo);
    linha['Diferença'] = vazio(l.diferenca);
    linha.Status = l.status;
    linha['Endereço encontrado'] = l.endereco;
    linha['Validade'] = l.validade ? l.validade.split('-').reverse().join('/') : '';
    linha.Alerta = l.alerta;
    return linha;
  });
}

export function exportarPlanilhaInventario(inv: InventarioParaExportar): string {
  const linhas = montarLinhasPlanilhaInventario(inv);
  const ws = XLSX.utils.json_to_sheet(linhas);
  const colunas = linhas.length > 0 ? Object.keys(linhas[0]).length : 1;
  ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(colunas - 1)}${Math.max(linhas.length + 1, 1)}` };
  ws['!cols'] = Object.keys(linhas[0] || {}).map((k) => ({
    wch: k === 'Descrição' ? 42 : k === 'Alerta' ? 60 : k === 'Material' ? 20 : Math.max(10, k.length + 2),
  }));

  const cab = XLSX.utils.aoa_to_sheet([
    ['Inventário', inv.codigo],
    ['Data', inv.data.split('-').reverse().join('/')],
    ['Responsável', inv.criado_por_nome || ''],
    ['Conferente', inv.conferente_nome || ''],
    ['Critério de seleção', inv.criterio || ''],
    ['Itens', inv.itens.length],
  ]);
  cab['!cols'] = [{ wch: 20 }, { wch: 50 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resultado');
  XLSX.utils.book_append_sheet(wb, cab, 'Cabeçalho');
  const arquivo = nomeArquivoInventario(inv.codigo, 'xlsx');
  XLSX.writeFile(wb, arquivo);
  return arquivo;
}
