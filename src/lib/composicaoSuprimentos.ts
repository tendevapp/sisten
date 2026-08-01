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
import { CompradorInfo, resolveComprador } from './demandas';
import { formatBRL, formatDateBR } from './format';
import { ComposicaoColuna } from '../components/charts/ComposicaoModal';

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
    {
      header: 'Valor',
      align: 'right',
      render: r => (typeof r.valor_total === 'number' && Number.isFinite(r.valor_total) ? formatBRL(r.valor_total) : '—'),
    },
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
