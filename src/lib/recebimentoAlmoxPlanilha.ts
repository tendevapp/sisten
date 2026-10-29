/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Recebimento de material — exportação de relatório Excel (.xlsx).
 *
 * Consolida conferências (RCM), itens conferidos e não conformidades (NCR)
 * em abas separadas, permitindo análise item a item e auditoria no Excel.
 * Mesma abordagem pura dos demais exportadores (`requisicaoBalcaoPlanilha.ts`).
 */

import * as XLSX from 'xlsx';
import { formatDateBR, formatDateTimeBR } from './format';
import {
  pendentePedido, ROTULO_DIVERGENCIA, ROTULO_NAO_CONFORMIDADE,
  type TipoDivergencia, type TipoNaoConformidade,
} from './recebimentoAlmox';
import type { ConferenciaRow } from './recebimentoAlmoxApi';

const FONTE_ROTULO: Record<string, string> = {
  cache_sap: 'Pedido do cache SAP',
  supabase: 'Pedido do servidor',
  manual: 'Digitado à mão',
  sem_pedido: 'Sem pedido',
};

/** Formata data para o nome do arquivo (ex.: 20261016). */
function formatarDataNome(iso: string): string {
  return iso.replace(/-/g, '');
}

/** Gera o nome padronizado do arquivo Excel de recebimento. */
export function nomeArquivoRelatorioRecebimento(agora = new Date(), de?: string, ate?: string): string {
  if (de && ate) {
    return `relatorio_recebimento_${formatarDataNome(de)}_a_${formatarDataNome(ate)}.xlsx`;
  }
  if (de) {
    return `relatorio_recebimento_a_partir_${formatarDataNome(de)}.xlsx`;
  }
  const p = (n: number) => String(n).padStart(2, '0');
  const carimbo = `${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}_${p(agora.getHours())}${p(agora.getMinutes())}`;
  return `relatorio_recebimento_${carimbo}.xlsx`;
}

/** Monta as linhas da aba detalhada de Itens Conferidos. */
export function montarLinhasItensRecebimento(conferencias: ConferenciaRow[]): Record<string, any>[] {
  const linhas: Record<string, any>[] = [];

  for (const c of conferencias) {
    const dataConf = formatDateBR(c.data);
    const poGeral = c.pedidos?.length ? c.pedidos.join(', ') : c.nro_pedido || (c.retorno_remessa ? 'Retorno de remessa' : '');
    const tipoItem = c.tipo_item === 'projeto' ? 'Projeto' : c.tipo_item === 'consumo' ? 'Consumo' : 'Misto';

    for (const it of c.itens ?? []) {
      const poLinha = it.nro_pedido || poGeral;
      const temPedido = it.qtd_pedido != null;
      const qtdPendente = temPedido ? pendentePedido(it.qtd_pedido, it.qtd_ja_fornecida) : '';

      linhas.push({
        'Código RCM': c.codigo,
        'Data Conferência': dataConf,
        'Fornecedor': c.fornecedor || '—',
        'PO': poLinha || '—',
        'NF': it.nota_fiscal || c.nota_fiscal || '',
        'Linha PO': it.linha_ref || '',
        'Cód. Material': it.material_code || '',
        'Descrição Material': it.descricao || '',
        'Unidade': it.unidade || '',
        'Tipo Item': tipoItem,
        'Depósito': c.deposito || '',
        'Qtd Pedido': temPedido ? Number(it.qtd_pedido) : '',
        'Qtd Já Fornecida': it.qtd_ja_fornecida != null ? Number(it.qtd_ja_fornecida) : '',
        'Qtd Pendente': qtdPendente !== '' ? Number(qtdPendente) : '',
        'Qtd Recebida': Number(it.qtd_recebida ?? 0),
        'Status Item': it.conferido ? 'Conferido' : 'Pendente',
        'Divergência': it.divergencia ? 'SIM' : 'NÃO',
        'Tipo Divergência': it.tipo_divergencia ? (ROTULO_DIVERGENCIA[it.tipo_divergencia as TipoDivergencia] ?? it.tipo_divergencia) : '',
        'Entrega Parcial': it.parcial ? 'SIM' : 'NÃO',
        'Parcial Conforme NF': it.parcial ? (it.parcial_conforme_nf ? 'SIM' : 'NÃO') : '',
        'Observação Item': it.observacao || '',
        'Conferente': c.criado_por_nome || '',
        'NCR Gerada': c.tem_nc ? 'SIM' : 'NÃO',
      });
    }
  }

  return linhas;
}

/** Monta as linhas da aba de Resumo das Conferências. */
export function montarLinhasResumoConferencias(conferencias: ConferenciaRow[]): Record<string, any>[] {
  return conferencias.map((c) => {
    const pos = c.pedidos?.length ? c.pedidos.join(' · ') : c.nro_pedido || (c.retorno_remessa ? 'Retorno de remessa' : 'Sem PO');
    const tipoItem = c.tipo_item === 'projeto' ? 'Projeto' : c.tipo_item === 'consumo' ? 'Consumo' : 'Misto';

    return {
      'Código RCM': c.codigo,
      'Data': formatDateBR(c.data),
      'PO(s)': pos,
      'NF(s)': c.nota_fiscal || '',
      'Fornecedor': c.fornecedor || '—',
      'RM': c.rm || '',
      'Tipo Item': tipoItem,
      'Depósito': c.deposito || '',
      'Origem Pedido': FONTE_ROTULO[c.fonte_pedido] ?? c.fonte_pedido ?? '',
      'Retorno Remessa': c.retorno_remessa ? 'SIM' : 'NÃO',
      'Total Itens': c.total_itens,
      'Itens OK': c.retorno_remessa ? c.total_itens : c.itens_ok,
      'Itens Divergentes': c.retorno_remessa ? 0 : c.itens_divergentes,
      'Possui NCR': c.tem_nc && !c.retorno_remessa ? 'SIM' : 'NÃO',
      'Encaminhado Projetos': c.encaminhado_projetos ? 'SIM' : 'NÃO',
      'Status': c.status === 'rascunho' ? 'Rascunho' : 'Concluída',
      'Conferente': c.criado_por_nome || '—',
      'Observação': c.observacao || '',
      'Data Registro': formatDateTimeBR(c.created_at),
    };
  });
}

/** Monta as linhas da aba de Não Conformidades (quando houver). */
export function montarLinhasNaoConformidades(conferencias: ConferenciaRow[]): Record<string, any>[] {
  const linhas: Record<string, any>[] = [];

  for (const c of conferencias) {
    if (!c.nc?.length) continue;
    for (const nc of c.nc) {
      linhas.push({
        'Código NCR': nc.codigo || '—',
        'Código RCM': c.codigo,
        'Data': formatDateBR(nc.created_at || c.data),
        'Fornecedor': nc.fornecedor || c.fornecedor || '—',
        'PO': nc.nro_pedido || (c.pedidos?.length ? c.pedidos.join(', ') : c.nro_pedido || ''),
        'Tipo Divergência': ROTULO_NAO_CONFORMIDADE[nc.tipo as TipoNaoConformidade] ?? nc.tipo ?? '',
        'Severidade': nc.severidade ? nc.severidade.toUpperCase() : '',
        'Status': nc.status ? nc.status.replace('_', ' ').toUpperCase() : 'ABERTA',
        'Responsável': nc.responsavel || '',
        'Descrição': nc.descricao || '',
        'Resolução': nc.resolucao || '',
        'Resolvida em': nc.resolvida_em ? formatDateTimeBR(nc.resolvida_em) : '',
      });
    }
  }

  return linhas;
}

/**
 * Cria o Workbook XLSX contendo as abas de Itens Conferidos, Resumo e NCRs.
 */
export function gerarWorkbookRecebimento(conferencias: ConferenciaRow[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // 1. Aba: Itens Conferidos
  const linhasItens = montarLinhasItensRecebimento(conferencias);
  const wsItens = linhasItens.length > 0
    ? XLSX.utils.json_to_sheet(linhasItens)
    : XLSX.utils.aoa_to_sheet([['Nenhum item registrado para as conferências selecionadas.']]);

  wsItens['!cols'] = [
    { wch: 15 }, // Código RCM
    { wch: 13 }, // Data Conferência
    { wch: 28 }, // Fornecedor
    { wch: 18 }, // PO
    { wch: 10 }, // Linha PO
    { wch: 14 }, // Cód. Material
    { wch: 38 }, // Descrição Material
    { wch: 8 },  // Unidade
    { wch: 11 }, // Tipo Item
    { wch: 10 }, // Depósito
    { wch: 12 }, // Qtd Pedido
    { wch: 16 }, // Qtd Já Fornecida
    { wch: 13 }, // Qtd Pendente
    { wch: 14 }, // Qtd Recebida
    { wch: 12 }, // Status Item
    { wch: 12 }, // Divergência
    { wch: 16 }, // Tipo Divergência
    { wch: 14 }, // Entrega Parcial
    { wch: 18 }, // Parcial Conforme NF
    { wch: 30 }, // Observação Item
    { wch: 20 }, // Conferente
    { wch: 12 }, // NCR Gerada
  ];
  XLSX.utils.book_append_sheet(wb, wsItens, 'Itens Conferidos');

  // 2. Aba: Resumo Conferências
  const linhasResumo = montarLinhasResumoConferencias(conferencias);
  const wsResumo = linhasResumo.length > 0
    ? XLSX.utils.json_to_sheet(linhasResumo)
    : XLSX.utils.aoa_to_sheet([['Nenhuma conferência selecionada.']]);

  wsResumo['!cols'] = [
    { wch: 15 }, // Código RCM
    { wch: 12 }, // Data
    { wch: 26 }, // PO(s)
    { wch: 28 }, // Fornecedor
    { wch: 12 }, // RM
    { wch: 11 }, // Tipo Item
    { wch: 10 }, // Depósito
    { wch: 22 }, // Origem Pedido
    { wch: 16 }, // Retorno Remessa
    { wch: 12 }, // Total Itens
    { wch: 10 }, // Itens OK
    { wch: 15 }, // Itens Divergentes
    { wch: 12 }, // Possui NCR
    { wch: 19 }, // Encaminhado Projetos
    { wch: 12 }, // Status
    { wch: 20 }, // Conferente
    { wch: 30 }, // Observação
    { wch: 18 }, // Data Registro
  ];
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo Conferências');

  // 3. Aba: Não Conformidades (se houver)
  const linhasNc = montarLinhasNaoConformidades(conferencias);
  if (linhasNc.length > 0) {
    const wsNc = XLSX.utils.json_to_sheet(linhasNc);
    wsNc['!cols'] = [
      { wch: 15 }, // Código NCR
      { wch: 15 }, // Código RCM
      { wch: 12 }, // Data
      { wch: 28 }, // Fornecedor
      { wch: 18 }, // PO
      { wch: 16 }, // Tipo Divergência
      { wch: 12 }, // Severidade
      { wch: 14 }, // Status
      { wch: 20 }, // Responsável
      { wch: 35 }, // Descrição
      { wch: 35 }, // Resolução
      { wch: 18 }, // Resolvida em
    ];
    XLSX.utils.book_append_sheet(wb, wsNc, 'Não Conformidades');
  }

  return wb;
}

/**
 * Dispara o download do relatório Excel no navegador.
 */
export function exportarRelatorioRecebimentoExcel(
  conferencias: ConferenciaRow[],
  periodo?: { de?: string; ate?: string },
): void {
  if (!conferencias.length) {
    throw new Error('Nenhuma conferência para exportar.');
  }
  const wb = gerarWorkbookRecebimento(conferencias);
  const nomeArquivo = nomeArquivoRelatorioRecebimento(new Date(), periodo?.de, periodo?.ate);
  XLSX.writeFile(wb, nomeArquivo);
}
