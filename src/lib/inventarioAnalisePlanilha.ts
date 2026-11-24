/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Planilha da Análise de Inventário Cíclico: o recorte filtrado, uma linha por
 * item de inventário, mais uma aba de resumo e a aba "Baixa pendente" (itens
 * fora da acuracidade, para validar depois da regularização).
 */

import * as XLSX from 'xlsx';
import { ROTULO_STATUS_ITEM } from './inventarioCiclico';
import { ROTULO_ORIGEM, contadosComBaixaPendente, type LinhaAnalise, type ResumoAnalise } from './inventarioAnalise';
import {
  ROTULO_SITUACAO_REGULARIZACAO, codigosDoRetrato, pendenteNoDeposito, situacaoRegularizacao,
} from './inventarioBaixaPendente';
import { rotuloMovimento, type BaixaPendenteMaterial } from './baixasPendentesCatalogo';
import { rotuloCausa } from './inventarioAuditoria';
import { dataHojeLocal } from './dataLocal';

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
      'Causa provável declarada': l.causa ? rotuloCausa(l.causa) : '',
      'Detalhe da causa': l.causaDetalhe || '',
      'Baixa pendente na contagem': l.baixaPendente ? `SIM — fora da acuracidade (${codigosDoRetrato(l.baixaPendente)})` : '',
    }));
}

/**
 * Uma linha por movimento sem baixa de cada item contado com baixa pendente.
 * "Diferença esperada após baixa" = diferença + o que saiu do depósito sem o
 * SAP saber (por item: repete nas linhas do mesmo item).
 */
export function montarLinhasBaixaPendente(
  linhas: LinhaAnalise[],
  agora: Map<string, BaixaPendenteMaterial> | null,
): Record<string, string | number>[] {
  const saida: Record<string, string | number>[] = [];
  for (const l of contadosComBaixaPendente(linhas)) {
    const movs = l.baixaPendente!;
    const noDeposito = pendenteNoDeposito(movs, l.deposito);
    const situacao = ROTULO_SITUACAO_REGULARIZACAO[situacaoRegularizacao(l.material, movs, agora)];
    const aindaPendentes = new Set((agora?.get(l.material.replace(/^0+/, ''))?.movimentos ?? []).map((m) => m.codigo));
    for (const m of movs) {
      saida.push({
        'Data inventário': dataBR(l.data),
        Inventário: l.inventario,
        Material: l.material,
        Descrição: l.descricao,
        Depósito: l.deposito,
        Situação: ROTULO_STATUS_ITEM[l.status],
        'Saldo ZL0024': l.saldo ?? '',
        'Qtd contada': l.contado ?? '',
        Diferença: l.diferenca ?? '',
        'Pendente no depósito': noDeposito,
        'Diferença esperada após baixa': l.diferenca === null ? '' : Math.round((l.diferenca + noDeposito) * 1000) / 1000,
        'Regularização (item)': situacao,
        Requisição: m.codigo,
        'Data requisição': m.data ? dataBR(m.data) : '',
        Movimento: rotuloMovimento({ ...m, material: l.material }),
        'Qtd requisição': m.quantidade ?? '',
        Unidade: m.unidade ?? '',
        'Requisição hoje': agora ? (aindaPendentes.has(m.codigo) ? 'Sem baixa' : 'Com baixa') : '',
      });
    }
  }
  return saida;
}

export function exportarPlanilhaAnalise(
  linhas: LinhaAnalise[],
  resumo: ResumoAnalise,
  periodo: string,
  agora: Map<string, BaixaPendenteMaterial> | null = null,
): string {
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
    ['Contados com baixa pendente (fora da acuracidade)', resumo.comBaixaPendente],
  ]);
  cab['!cols'] = [{ wch: 38 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Itens');
  XLSX.utils.book_append_sheet(wb, cab, 'Resumo');
  const baixa = montarLinhasBaixaPendente(linhas, agora);
  if (baixa.length > 0) {
    const wsB = XLSX.utils.json_to_sheet(baixa);
    wsB['!cols'] = Object.keys(baixa[0]).map((k) => ({ wch: k === 'Descrição' ? 42 : Math.max(10, k.length + 2) }));
    wsB['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(Object.keys(baixa[0]).length - 1)}${baixa.length + 1}` };
    XLSX.utils.book_append_sheet(wb, wsB, 'Baixa pendente');
  }
  const arquivo = `analise-inventario-${dataHojeLocal()}.xlsx`;
  XLSX.writeFile(wb, arquivo);
  return arquivo;
}

/** Só a aba "Baixa pendente" — para validar depois que as baixas saírem no SAP. */
export function exportarPlanilhaBaixaPendente(
  linhas: LinhaAnalise[],
  agora: Map<string, BaixaPendenteMaterial> | null,
): string | null {
  const baixa = montarLinhasBaixaPendente(linhas, agora);
  if (baixa.length === 0) return null;
  const ws = XLSX.utils.json_to_sheet(baixa);
  ws['!cols'] = Object.keys(baixa[0]).map((k) => ({ wch: k === 'Descrição' ? 42 : Math.max(10, k.length + 2) }));
  ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(Object.keys(baixa[0]).length - 1)}${baixa.length + 1}` };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Baixa pendente');
  const arquivo = `inventario-baixa-pendente-${dataHojeLocal()}.xlsx`;
  XLSX.writeFile(wb, arquivo);
  return arquivo;
}
