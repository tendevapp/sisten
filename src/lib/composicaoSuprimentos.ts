/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Colunas e formatadores compartilhados pelos modais de composição dos
 * dashboards de Suprimentos (Visão Geral, Demandas, Carteira, Fornecedores) —
 * todos operam sobre `EnrichedSAPRecord`. Análise de Compras usa
 * `HistoricoPedidoView`, outra base, e monta suas próprias colunas em
 * `TabAnaliseCompras.tsx`.
 */

import React from 'react';
import { EnrichedSAPRecord } from '../types';
import { CompradorInfo, resolveComprador, isProjetoItem } from './demandas';
import { formatBRL, formatDateBR } from './format';
import { DIAS_CRITICO } from './suprimentos';
import { ComposicaoColuna, ComposicaoFiltro } from '../components/charts/ComposicaoModal';

/** Colunas de detalhe padrão para um item de RI/pedido dentro do modal. */
export function colunasEnrichedSAPRecord(compradores: CompradorInfo[]): ComposicaoColuna<EnrichedSAPRecord>[] {
  return [
    { header: 'RI', render: r => React.createElement('span', { className: 'font-mono font-medium' }, r.ri) },
    { header: 'Material', render: r => React.createElement('span', { className: 'font-mono' }, r.material_code || '—') },
    { header: 'Descrição', render: r => r.texto_breve || '—' },
    { header: 'Requisitante', render: r => r.requisitante_name || '—' },
    { header: 'Área Solicitante', render: r => r.area_solicitante || '—' },
    { header: 'Comprador', render: r => resolveComprador(r, compradores) },
    { header: 'Status', render: r => r.status_requisicao },
    { header: 'Data Solicitação', render: r => formatDateBR(r.data_solicitacao) },
    { header: 'Data do PO', render: r => (r.data_pedido ? formatDateBR(r.data_pedido) : '—') },
    {
      header: 'Valor',
      align: 'right',
      render: r => (typeof r.valor_total === 'number' && Number.isFinite(r.valor_total) ? formatBRL(r.valor_total) : '—'),
    },
  ];
}

export const STATUS_SEM_PO_ATE_CRITICO = `Sem PO — até ${DIAS_CRITICO} d`;
export const STATUS_SEM_PO_CRITICO = `Sem PO — crítico (+ de ${DIAS_CRITICO} d)`;

/**
 * Status do item para o filtro: o do SAP e, para quem está sem PO, também a
 * faixa — crítico é aberto há mais de DIAS_CRITICO dias, mesmo corte da
 * coluna "Críticos" da carteira. O item fica nas duas opções ("Sem PO" e a faixa).
 */
export function statusFiltroEnrichedSAPRecord(r: EnrichedSAPRecord): string[] {
  if (r.status_requisicao !== 'Sem PO') return [r.status_requisicao];
  return [r.status_requisicao, (r.dias_em_aberto || 0) > DIAS_CRITICO ? STATUS_SEM_PO_CRITICO : STATUS_SEM_PO_ATE_CRITICO];
}

/** Filtros de Status, Natureza e Comprador exibidos no modal de composição. */
export function filtrosEnrichedSAPRecord(compradores: CompradorInfo[]): ComposicaoFiltro<EnrichedSAPRecord>[] {
  return [
    { key: 'status', label: 'Status', valueOf: statusFiltroEnrichedSAPRecord },
    { key: 'tipo_item', label: 'Natureza', valueOf: r => (isProjetoItem(r.material_code) ? 'Projeto' : 'Consumo') },
    { key: 'comprador', label: 'Comprador', valueOf: r => resolveComprador(r, compradores) },
  ];
}

/** Valor monetário do item, quando existir (só itens com PO trazem `valor_total`). */
export function valorEnrichedSAPRecord(r: EnrichedSAPRecord): number {
  return typeof r.valor_total === 'number' && Number.isFinite(r.valor_total) ? r.valor_total : 0;
}

export function itemKeyEnrichedSAPRecord(r: EnrichedSAPRecord, idx: number): string {
  return r.ri || `item-${idx}`;
}

export function searchEnrichedSAPRecord(r: EnrichedSAPRecord, q: string): boolean {
  return (
    (r.ri || '').toLowerCase().includes(q) ||
    (r.material_code || '').toLowerCase().includes(q) ||
    (r.texto_breve || '').toLowerCase().includes(q) ||
    (r.requisitante_name || '').toLowerCase().includes(q) ||
    (r.area_solicitante || '').toLowerCase().includes(q)
  );
}

export const SEARCH_PLACEHOLDER_SUPRIMENTOS = 'Pesquisar por RI, material, descrição ou requisitante...';
