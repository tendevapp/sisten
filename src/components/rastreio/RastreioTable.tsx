/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { MessageSquare } from 'lucide-react';
import { RastreioRow, DeliveryStatus, DELIVERY_STATUS_META, deriveDeliveryStatus, formatDateBR, formatBRL } from '../../lib/rastreio';
import { formatInt } from '../../lib/format';
import {
  TableShell, TableHeadRow, TableBody, Th, SortableTh, Tr, Td, SortDir,
} from '../ui/DataTable';

export type { SortDir };

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
  { id: 'descricao', label: 'Item / Descrição', sortable: true, width: 'w-[20%]' },
  { id: 'fornecedor', label: 'Fornecedor', sortable: true, width: 'w-[13%]' },
  { id: 'setor', label: 'Setor', sortable: true, width: 'w-[10%]' },
  { id: 'qtd', label: 'Qtd', align: 'right', sortable: true, width: 'w-[7%]' },
  { id: 'precoUnitario', label: 'Preço unit.', align: 'right', sortable: true, width: 'w-[9%]' },
  { id: 'valorTotal', label: 'Valor total', align: 'right', sortable: true, width: 'w-[10%]' },
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
    <TableShell>
      {/* min-width força a rolagem horizontal em vez de espremer 12 colunas;
          table-fixed mantém as larguras estáveis entre uma página e outra. */}
      <table className="w-full min-w-[1300px] table-fixed text-[11px]">
        <TableHeadRow>
          {cols.map(col => (
            col.sortable
              ? <SortableTh key={col.id} col={col.id} label={col.label} align={col.align} width={col.width} sortColumn={sortColumn} sortDir={sortDir} onSort={onSort} />
              : <Th key={col.id} label={col.label} align={col.align} width={col.width} />
          ))}
          <Th label="" width="w-[44px]" />
        </TableHeadRow>
        <TableBody>
          {rows.map((r, idx) => {
            const delivery: DeliveryStatus = deriveDeliveryStatus(r, hoje);
            const unread = unreadRis.has(r.ri);
            return (
              <Tr key={`${r.ri}-${idx}`} onClick={() => onOpenRow(r)}>
                {visibleColumns.rm && <Td mono strong truncate className="py-1.5 px-2">{r.rm}</Td>}
                {visibleColumns.po && (
                  <Td mono truncate className="py-1.5 px-2">
                    {r.po !== '—'
                      ? r.po
                      : (
                        <span className="text-[9px] font-bold uppercase" style={{ color: 'var(--status-warning)' }}>
                          sem po
                        </span>
                      )}
                  </Td>
                )}
                {visibleColumns.descricao && (
                  <Td className="py-1.5 px-2">
                    <div className="font-mono text-[9px] truncate" style={{ color: 'var(--ink-muted)' }}>{r.material}</div>
                    <div className="truncate" title={r.descricao}>{r.descricao}</div>
                  </Td>
                )}
                {visibleColumns.fornecedor && (
                  <Td strong truncate title={r.fornecedor} className="py-1.5 px-2">{r.fornecedor}</Td>
                )}
                {visibleColumns.setor && (
                  <Td truncate title={r.setor} className="py-1.5 px-2">{r.setor}</Td>
                )}
                {visibleColumns.qtd && (
                  <Td align="right" numeric truncate className="py-1.5 px-2">
                    {r.qtd !== undefined ? formatInt(r.qtd) : '—'}
                  </Td>
                )}
                {visibleColumns.precoUnitario && (
                  <Td align="right" numeric truncate className="py-1.5 px-2" title={r.precoUnitario !== undefined ? formatBRL(r.precoUnitario) : undefined}>
                    {formatBRL(r.precoUnitario)}
                  </Td>
                )}
                {visibleColumns.valorTotal && (
                  <Td align="right" numeric strong truncate className="py-1.5 px-2" title={r.valorTotal !== undefined ? formatBRL(r.valorTotal) : undefined}>
                    {formatBRL(r.valorTotal)}
                  </Td>
                )}
                {visibleColumns.dataCriacao && (
                  <Td numeric truncate className="py-1.5 px-2">{formatDateBR(r.dataCriacao)}</Td>
                )}
                {visibleColumns.dataPrevista && (
                  <Td truncate className="py-1.5 px-2">
                    {/* O ponto colorido é o alerta de prazo; a data ao lado é o
                        dado. Cor sozinha não carrega o status — o título do
                        ponto nomeia a situação. */}
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${DELIVERY_STATUS_META[delivery].dot}`}
                        title={DELIVERY_STATUS_META[delivery].label}
                      />
                      <span className="tabular">{formatDateBR(r.dataPrevista)}</span>
                    </span>
                  </Td>
                )}
                {visibleColumns.dataEntrega && (
                  <Td numeric truncate className="py-1.5 px-2 font-medium">{formatDateBR(r.dataEntrega)}</Td>
                )}
                {visibleColumns.status && (
                  <Td className="py-1.5 px-2">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-bold truncate max-w-full ${ITEM_STATUS_STYLE[r.status] || DEFAULT_STATUS_STYLE}`}
                      title={r.status}
                    >
                      {r.status}
                    </span>
                  </Td>
                )}
                <td className="px-1 py-1.5 text-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenRow(r); }}
                    className="relative inline-flex items-center justify-center h-7 w-7 rounded-lg transition-colors duration-150 hover:bg-[var(--brand-wash)] focus-visible:outline-2 focus-visible:outline-offset-1"
                    style={{ color: 'var(--ink-muted)', outlineColor: 'var(--brand)' }}
                    title="Ver detalhes e conversa"
                    aria-label={unread ? 'Ver detalhes e conversa — há mensagens não lidas' : 'Ver detalhes e conversa'}
                  >
                    <MessageSquare className="h-4 w-4" />
                    {unread && (
                      <span
                        className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full ring-2"
                        style={{ background: 'var(--status-critical)', ['--tw-ring-color' as any]: 'var(--surface-card)' }}
                      />
                    )}
                  </button>
                </td>
              </Tr>
            );
          })}
        </TableBody>
      </table>
    </TableShell>
  );
}
