/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Planilha da Análise de Inventário Cíclico: o recorte filtrado, uma linha por
 * item de inventário, mais uma aba de resumo.
 */

import * as XLSX from 'xlsx';
import { ROTULO_STATUS_ITEM } from './inventarioCiclico';
import { ROTULO_ORIGEM, type LinhaAnalise, type ResumoAnalise } from './inventarioAnalise';

const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export function montarLinhasPlanilhaAnalise(linhas: LinhaAnalise[]): Record<string, string | number>[] {
  return [...linhas]
    .sort((a, b) => b.data.localeCompare(a.data) || a.inventario.localeCompare(b.inventario))
    .map((l) => ({
      Data: dataBR(l.data),
      Inventário: l.inventario,
      Origem: ROTULO_ORIGEM[l.origem],
      Material: l.material,
      Descrição: l.descricao,
      Depósito: l.deposito,
      Classe: l.classe,
      Situação: ROTULO_STATUS_ITEM[l.status],
      'Saldo ZL0024': l.saldo ?? '',
      'Qtd contada': l.contado ?? '',
      Diferença: l.diferenca ?? '',
      'Valor do erro (R$)': l.valor === null ? '' : Math.round(l.valor * 100) / 100,
      'Valor estimado?': l.valor === null ? '' : l.valorEstimado ? 'SIM' : 'NÃO',
      Contagens: l.contagens,
    }));
}

export function exportarPlanilhaAnalise(linhas: LinhaAnalise[], resumo: ResumoAnalise, periodo: string): string {
  const dados = montarLinhasPlanilhaAnalise(linhas);
  const ws = XLSX.utils.json_to_sheet(dados);
  ws['!cols'] = Object.keys(dados[0] || {}).map((k) => ({
    wch: k === 'Descrição' ? 42 : k === 'Material' ? 20 : Math.max(10, k.length + 2),
  }));
  if (dados.length > 0) {
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(Object.keys(dados[0]).length - 1)}${dados.length + 1}` };
  }

  const pct = (v: number | null) => (v === null ? '' : Math.round(v * 10) / 10);
  const cab = XLSX.utils.aoa_to_sheet([
    ['Período', periodo],
    ['Inventários', resumo.inventarios],
    ['Itens encerrados', resumo.encerrados],
    ['Conferidos', resumo.conferidos],
    ['Divergentes', resumo.divergentes],
    ['Em aberto', resumo.emAberto],
    ['Acuracidade (%)', pct(resumo.acuracidade)],
    ['Acerto na 1ª contagem (%)', pct(resumo.acertoPrimeira)],
    ['Faltas', resumo.faltas],
    ['Sobras', resumo.sobras],
    ['Valor do erro — divergentes (R$)', Math.round(resumo.valorTotal * 100) / 100],
    ['Do qual estimado (R$)', Math.round(resumo.valorEstimado * 100) / 100],
    ['Conferidos com diferença', resumo.conferidosComDiferenca],
    ['Valor dos conferidos com diferença (R$)', Math.round(resumo.valorConferidosComDiferenca * 100) / 100],
  ]);
  cab['!cols'] = [{ wch: 38 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Itens');
  XLSX.utils.book_append_sheet(wb, cab, 'Resumo');
  const arquivo = `analise-inventario-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, arquivo);
  return arquivo;
}
