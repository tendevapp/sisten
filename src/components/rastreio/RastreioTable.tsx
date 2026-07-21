/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown, MessageSquare } from 'lucide-react';
import { RastreioRow, DeliveryStatus, DELIVERY_STATUS_META, deriveDeliveryStatus, formatDateBR } from '../../lib/rastreio';

export type SortDir = 'asc' | 'desc';

export interface ColumnOption {
  id: string;
  label: string;
  align?: 'left' | 'right';
  sortable?: boolean;
  // Largura proporcional (table-fixed). Nenhuma coluna é escondida em telas
  // pequenas: como na Central de Compras, a tabela mantém todas as colunas e o
  // container rola horizontalmente (min-width na <table>).
  width: string;
}

export const RASTREIO_COLUMNS: ColumnOption[] = [
  { id: 'rm', label: 'RM', sortable: true, width: 'w-[9%]' },
  { id: 'po', label: 'PO', sortable: true, width: 'w-[9%]' },
  { id: 'descricao', label: 'Item / Descrição', sortable: true, width: 'w-[24%]' },
  { id: 'fornecedor', label: 'Fornecedor', sortable: true, width: 'w-[15%]' },
  { id: 'setor', label: 'Setor', sortable: true, width: 'w-[11%]' },
  { id: 'qtd', label: 'Qtd', align: 'right', sortable: true, width: 'w-[7%]' },
  { id: 'dataCriacao', label: 'Criação', sortable: true, width: 'w-[8%]' },
  { id: 'dataPrevista', label: 'Prev.', sortable: true, width: 'w-[9%]' },
  { id: 'dataEntrega', label: 'Entrega', sortable: true, width: 'w-[9%]' },
  { id: 'status', label: 'Status', sortable: true, width: 'w-[12%]' },
];

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
  col, label, align = 'left', width, sortColumn, sortDir, onSort,
}: {
  col: string; label: string; align?: 'left' | 'right'; width: string;
  sortColumn: string | null; sortDir: SortDir; onSort: (col: string) => void;
}) => {
  const active = sortColumn === col;
  return (
    <th className={`px-2 py-2 font-black ${width} ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-0.5 uppercase tracking-wider hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer max-w-full ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-emerald-600 dark:text-emerald-500' : ''}`}
        title={`Ordenar por ${label}`}
      >
        <span className="truncate">{label}</span>
        {active
          ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />)
          : <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600 shrink-0" />}
      </button>
    </th>
  );
};

interface RastreioTableProps {
  rows: RastreioRow[];
  hoje: Date;
  visibleColumns: Record<string, boolean>;
  sortColumn: string | null;
  sortDir: SortDir;
  onSort: (col: string) => void;
  onOpenRow: (row: RastreioRow) => void;
  unreadRis: Set<string>;
}

export default function RastreioTable({ rows, hoje, visibleColumns, sortColumn, sortDir, onSort, onOpenRow, unreadRis }: RastreioTableProps) {
  const cols = RASTREIO_COLUMNS.filter(c => visibleColumns[c.id]);
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto bg-white dark:bg-slate-900 shadow-xs">
      <table className="w-full min-w-[1100px] table-fixed text-[11px]">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 text-left uppercase tracking-wider text-[10px]">
            {cols.map(col => (
              col.sortable
                ? <SortableTh key={col.id} col={col.id} label={col.label} align={col.align} width={col.width} sortColumn={sortColumn} sortDir={sortDir} onSort={onSort} />
                : <th key={col.id} className={`px-2 py-2 font-black ${col.width}`}>{col.label}</th>
            ))}
            <th className="w-[44px] px-2 py-2" aria-label="Ações" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r, idx) => {
            const delivery: DeliveryStatus = deriveDeliveryStatus(r, hoje);
            const unread = unreadRis.has(r.ri);
            return (
              <tr
                key={`${r.ri}-${idx}`}
                onClick={() => onOpenRow(r)}
                className="hover:bg-emerald-50/40 dark:hover:bg-emerald-500/5 transition-colors align-top cursor-pointer"
              >
                {visibleColumns.rm && (
                  <td className="px-2 py-1.5 font-mono font-bold text-slate-800 dark:text-slate-200 truncate">{r.rm}</td>
                )}
                {visibleColumns.po && (
                  <td className="px-2 py-1.5 font-mono text-slate-700 dark:text-slate-300 truncate">
                    {r.po !== '—' ? r.po : <span className="text-[9px] font-bold uppercase text-amber-600 dark:text-amber-500">sem po</span>}
                  </td>
                )}
                {visibleColumns.descricao && (
                  <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">
                    <div className="font-mono text-[9px] text-slate-400 dark:text-slate-500 truncate">{r.material}</div>
                    <div className="truncate" title={r.descricao}>{r.descricao}</div>
                  </td>
                )}
                {visibleColumns.fornecedor && (
                  <td className="px-2 py-1.5 text-slate-800 dark:text-slate-200 font-semibold truncate" title={r.fornecedor}>{r.fornecedor}</td>
                )}
                {visibleColumns.setor && (
                  <td className="px-2 py-1.5 text-slate-600 dark:text-slate-400 truncate" title={r.setor}>{r.setor}</td>
                )}
                {visibleColumns.qtd && (
                  <td className="px-2 py-1.5 text-right font-medium text-slate-700 dark:text-slate-300 truncate">
                    {r.qtd !== undefined ? r.qtd.toLocaleString('pt-BR') : '—'}
                  </td>
                )}
                {visibleColumns.dataCriacao && (
                  <td className="px-2 py-1.5 text-slate-550 dark:text-slate-400 truncate">{formatDateBR(r.dataCriacao)}</td>
                )}
                {visibleColumns.dataPrevista && (
                  <td className="px-2 py-1.5 truncate">
                    <span className="inline-flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DELIVERY_STATUS_META[delivery].dot}`} />
                      <span className="text-slate-600 dark:text-slate-300">{formatDateBR(r.dataPrevista)}</span>
                    </span>
                  </td>
                )}
                {visibleColumns.dataEntrega && (
                  <td className="px-2 py-1.5 truncate font-medium text-emerald-600 dark:text-emerald-400">{formatDateBR(r.dataEntrega)}</td>
                )}
                {visibleColumns.status && (
                  <td className="px-2 py-1.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-bold truncate max-w-full ${ITEM_STATUS_STYLE[r.status] || DEFAULT_STATUS_STYLE}`} title={r.status}>
                      {r.status}
                    </span>
                  </td>
                )}
                <td className="px-1 py-1.5 text-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenRow(r); }}
                    className="relative inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                    title="Ver detalhes e conversa"
                    aria-label="Ver detalhes e conversa"
                  >
                    <MessageSquare className="h-4 w-4" />
                    {unread && <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
