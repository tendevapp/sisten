/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { RastreioRow, DeliveryStatus, DELIVERY_STATUS_META, deriveDeliveryStatus, formatDateBR } from '../../lib/rastreio';

export type SortDir = 'asc' | 'desc';

export interface ColumnOption {
  id: string;
  label: string;
  align?: 'left' | 'right';
  sortable?: boolean;
}

// Colunas da tabela de rastreio. `descricao` combina material + texto breve.
export const RASTREIO_COLUMNS: ColumnOption[] = [
  { id: 'rm', label: 'RM', sortable: true },
  { id: 'po', label: 'PO', sortable: true },
  { id: 'descricao', label: 'Item / Descrição', sortable: true },
  { id: 'fornecedor', label: 'Fornecedor', sortable: true },
  { id: 'setor', label: 'Setor', sortable: true },
  { id: 'qtd', label: 'Qtd', align: 'right', sortable: true },
  { id: 'dataCriacao', label: 'Criação', sortable: true },
  { id: 'dataPrevista', label: 'Prev. Entrega', sortable: true },
  { id: 'dataEntrega', label: 'Entrega (MIGO)', sortable: true },
  { id: 'status', label: 'Status', sortable: true },
  { id: 'observacoes', label: 'Observações' },
];

// Estilo do badge por status operacional (item_status).
const ITEM_STATUS_STYLE: Record<string, string> = {
  'Entregue': 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30',
  'Em rota de entrega': 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30',
  'Aguardando Coleta': 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/30',
  'Pedido Enviado': 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/30',
  'Aguardando Aprovação PO': 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30',
  'Análise de Cotações': 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/30',
  'Cotação enviada': 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/30',
  'Aguardando Cotação': 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/30',
  'Aguardando Solicitante': 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30',
  'Inativo': 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700/40 dark:text-slate-400 dark:border-slate-600',
};
const DEFAULT_STATUS_STYLE = 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600';

const SortableTh = ({
  col, label, align = 'left', sortColumn, sortDir, onSort,
}: {
  col: string; label: string; align?: 'left' | 'right';
  sortColumn: string | null; sortDir: SortDir; onSort: (col: string) => void;
}) => {
  const active = sortColumn === col;
  return (
    <th className={`px-3 py-2.5 font-black ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-emerald-600 dark:text-emerald-500' : ''}`}
        title={`Ordenar por ${label}`}
      >
        <span>{label}</span>
        {active
          ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600" />}
      </button>
    </th>
  );
};

interface RastreioTableProps {
  rows: RastreioRow[]; // fatia já paginada e ordenada
  hoje: Date;
  visibleColumns: Record<string, boolean>;
  sortColumn: string | null;
  sortDir: SortDir;
  onSort: (col: string) => void;
}

export default function RastreioTable({ rows, hoje, visibleColumns, sortColumn, sortDir, onSort }: RastreioTableProps) {
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 text-left uppercase tracking-wider text-[10px]">
              {RASTREIO_COLUMNS.map(col => (
                visibleColumns[col.id] && (
                  col.sortable
                    ? <SortableTh key={col.id} col={col.id} label={col.label} align={col.align} sortColumn={sortColumn} sortDir={sortDir} onSort={onSort} />
                    : <th key={col.id} className="px-3 py-2.5 font-black">{col.label}</th>
                )
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, idx) => {
              const delivery: DeliveryStatus = deriveDeliveryStatus(r, hoje);
              return (
                <tr key={`${r.ri}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors align-top">
                  {visibleColumns.rm && (
                    <td className="px-3 py-2 font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">{r.rm}</td>
                  )}
                  {visibleColumns.po && (
                    <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {r.po}
                      {r.statusReq === 'Sem PO' && r.po === '—' && (
                        <span className="ml-1 text-[9px] font-bold uppercase text-amber-600 dark:text-amber-500">sem po</span>
                      )}
                    </td>
                  )}
                  {visibleColumns.descricao && (
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[260px]">
                      <div className="font-mono text-[10px] text-slate-400 dark:text-slate-500">{r.material}</div>
                      <div className="truncate" title={r.descricao}>{r.descricao}</div>
                    </td>
                  )}
                  {visibleColumns.fornecedor && (
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-200 font-semibold max-w-[190px] truncate" title={r.fornecedor}>{r.fornecedor}</td>
                  )}
                  {visibleColumns.setor && (
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 max-w-[150px] truncate" title={r.setor}>{r.setor}</td>
                  )}
                  {visibleColumns.qtd && (
                    <td className="px-3 py-2 text-right font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {r.qtd !== undefined ? `${r.qtd.toLocaleString('pt-BR')}${r.unidade !== '—' ? ` ${r.unidade}` : ''}` : '—'}
                    </td>
                  )}
                  {visibleColumns.dataCriacao && (
                    <td className="px-3 py-2 text-slate-550 dark:text-slate-400 whitespace-nowrap">{formatDateBR(r.dataCriacao)}</td>
                  )}
                  {visibleColumns.dataPrevista && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${DELIVERY_STATUS_META[delivery].dot}`} />
                        <span className="text-slate-600 dark:text-slate-300">{formatDateBR(r.dataPrevista)}</span>
                      </span>
                    </td>
                  )}
                  {visibleColumns.dataEntrega && (
                    <td className="px-3 py-2 whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400">{formatDateBR(r.dataEntrega)}</td>
                  )}
                  {visibleColumns.status && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${ITEM_STATUS_STYLE[r.status] || DEFAULT_STATUS_STYLE}`}>
                        {r.status}
                      </span>
                    </td>
                  )}
                  {visibleColumns.observacoes && (
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 max-w-[220px]">
                      <span className="line-clamp-2" title={r.observacoes}>{r.observacoes}</span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
