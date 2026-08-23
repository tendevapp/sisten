/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { MessageSquare, PackageCheck, Undo2 } from 'lucide-react';
import { RastreioRow, DeliveryStatus, DELIVERY_STATUS_META, deriveDeliveryStatus, formatDateBR, formatBRL, isAlmoxarifadoCandidate } from '../../lib/rastreio';
import { formatInt } from '../../lib/format';
import { AlmoxarifadoChegada } from '../../types';
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
  { id: 'rm', label: 'RM', sortable: true, width: 'w-[110px] min-w-[110px]' },
  { id: 'po', label: 'PO', sortable: true, width: 'w-[110px] min-w-[110px]' },
  { id: 'descricao', label: 'Item / Descrição', sortable: true, width: 'w-[320px] min-w-[320px]' },
  { id: 'fornecedor', label: 'Fornecedor', sortable: true, width: 'w-[200px] min-w-[200px]' },
  { id: 'setor', label: 'Setor', sortable: true, width: 'w-[120px] min-w-[120px]' },
  { id: 'qtd', label: 'Qtd', align: 'right', sortable: true, width: 'w-[80px] min-w-[80px]' },
  { id: 'precoUnitario', label: 'Preço unit.', align: 'right', sortable: true, width: 'w-[115px] min-w-[115px]' },
  { id: 'valorTotal', label: 'Valor total', align: 'right', sortable: true, width: 'w-[125px] min-w-[125px]' },
  { id: 'dataCriacao', label: 'RM Data', sortable: true, width: 'w-[105px] min-w-[105px]' },
  { id: 'dataPo', label: 'PO Data', sortable: true, width: 'w-[105px] min-w-[105px]' },
  { id: 'dataPrevista', label: 'Prev.', sortable: true, width: 'w-[115px] min-w-[115px]' },
  { id: 'dataEntrega', label: 'Entrega', sortable: true, width: 'w-[105px] min-w-[105px]' },
  { id: 'status', label: 'Status', sortable: true, width: 'w-[170px] min-w-[170px]' },
];

// IDs das colunas que expõem valores de compra — visíveis apenas para quem
// tem a permissão `rastreio_valores` (comprador, coordenador, gestor, admin).
const VALUE_COLUMN_IDS = new Set(['precoUnitario', 'valorTotal']);

export function getRastreioColumns(canSeeValores: boolean): ColumnOption[] {
  return canSeeValores ? RASTREIO_COLUMNS : RASTREIO_COLUMNS.filter(c => !VALUE_COLUMN_IDS.has(c.id));
}

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
  canSeeValores: boolean;
  /** Permissão `rastreio_almoxarifado`: mostra seleção em lote e marcação de chegada. */
  canAlmoxarifado?: boolean;
  chegadasMap?: Map<string, AlmoxarifadoChegada>;
  selectedRis?: Set<string>;
  onToggleSelect?: (ri: string) => void;
  onToggleSelectAll?: () => void;
  savingRi?: string | null;
  onMarcarChegada?: (ri: string) => void;
  onDesfazerChegada?: (ri: string) => void;
}

export default function RastreioTable({
  rows, hoje, visibleColumns, sortColumn, sortDir, onSort, onOpenRow, unreadRis, canSeeValores,
  canAlmoxarifado, chegadasMap, selectedRis, onToggleSelect, onToggleSelectAll, savingRi, onMarcarChegada, onDesfazerChegada,
}: RastreioTableProps) {
  const cols = getRastreioColumns(canSeeValores).filter(c => visibleColumns[c.id]);
  const selectableRows = canAlmoxarifado ? rows.filter(isAlmoxarifadoCandidate) : [];
  const allSelected = selectableRows.length > 0 && selectableRows.every(r => selectedRis?.has(r.ri));

  const chegouChip = (chegada: AlmoxarifadoChegada) => (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold"
      style={{ color: 'var(--status-success, #059669)' }}
      title={`Registrado por ${chegada.registrado_por_nome}`}
    >
      <PackageCheck className="h-3.5 w-3.5" /> {formatDateBR(chegada.data_chegada)}
    </span>
  );

  return (
    <>
      {/* Mobile: cards (evita scroll horizontal na tabela densa) */}
      <div
        className="lg:hidden rounded-xl border overflow-hidden divide-y"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
      >
        {canAlmoxarifado && selectableRows.length > 0 && (
          <div className="p-3">
            <label className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>
              <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} className="cursor-pointer" />
              Selecionar todos os itens sem MIGO
            </label>
          </div>
        )}
        {rows.map((r, idx) => {
          const delivery: DeliveryStatus = deriveDeliveryStatus(r, hoje);
          const unread = unreadRis.has(r.ri);
          const chegada = chegadasMap?.get(r.ri);
          const candidate = canAlmoxarifado && isAlmoxarifadoCandidate(r);
          const saving = savingRi === r.ri;
          return (
            <div
              key={`m-${r.ri}-${idx}`}
              onClick={() => onOpenRow(r)}
              className="p-4 space-y-2.5 active:bg-slate-50 dark:active:bg-slate-800/60 transition-colors cursor-pointer"
              style={{ borderColor: 'var(--hairline)' }}
            >
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  {candidate && (
                    <input
                      type="checkbox"
                      checked={!!selectedRis?.has(r.ri)}
                      onChange={() => onToggleSelect?.(r.ri)}
                      onClick={(e) => e.stopPropagation()}
                      className="cursor-pointer shrink-0"
                      aria-label={`Selecionar ${r.rm}`}
                    />
                  )}
                  {visibleColumns.rm && <span className="font-mono text-[11px] font-bold" style={{ color: 'var(--ink-primary)' }}>{r.rm}</span>}
                  {visibleColumns.po && (
                    r.po !== '—'
                      ? <span className="font-mono text-[11px]" style={{ color: 'var(--ink-muted)' }}>PO {r.po}</span>
                      : <span className="text-[9px] font-bold uppercase" style={{ color: 'var(--status-warning)' }}>sem po</span>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenRow(r); }}
                  className="relative shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-lg transition-colors duration-150 hover:bg-[var(--brand-wash)] focus-visible:outline-2 focus-visible:outline-offset-1"
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
              </div>

              {visibleColumns.descricao && (
                <div>
                  <p className="font-mono text-[9px] truncate" style={{ color: 'var(--ink-muted)' }}>{r.material}</p>
                  <p className="text-sm font-semibold leading-snug line-clamp-2" style={{ color: 'var(--ink-primary)' }}>{r.descricao}</p>
                </div>
              )}

              <div className="flex items-start justify-between gap-3">
                {visibleColumns.fornecedor && (
                  <p className="text-xs font-semibold truncate min-w-0" style={{ color: 'var(--ink-secondary)' }}>{r.fornecedor}</p>
                )}
                {visibleColumns.valorTotal && r.valorTotal !== undefined && (
                  <span className="shrink-0 text-sm font-bold whitespace-nowrap tabular" style={{ color: 'var(--ink-primary)' }}>
                    {formatBRL(r.valorTotal)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] pt-0.5" style={{ color: 'var(--ink-muted)' }}>
                {visibleColumns.setor && <span>{r.setor}</span>}
                {visibleColumns.qtd && (
                  <span>Qtd <strong className="tabular" style={{ color: 'var(--ink-secondary)' }}>{r.qtd !== undefined ? formatInt(r.qtd) : '—'}</strong></span>
                )}
                {visibleColumns.precoUnitario && (
                  <span>Unit. <strong className="tabular" style={{ color: 'var(--ink-secondary)' }}>{formatBRL(r.precoUnitario)}</strong></span>
                )}
              </div>

              {(visibleColumns.dataCriacao || visibleColumns.dataPo || visibleColumns.dataPrevista || visibleColumns.dataEntrega) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] pt-0.5" style={{ color: 'var(--ink-muted)' }}>
                  {visibleColumns.dataCriacao && <span>RM <strong className="tabular" style={{ color: 'var(--ink-secondary)' }}>{formatDateBR(r.dataCriacao)}</strong></span>}
                  {visibleColumns.dataPo && <span>PO <strong className="tabular" style={{ color: 'var(--ink-secondary)' }}>{formatDateBR(r.dataPo)}</strong></span>}
                  {visibleColumns.dataPrevista && (
                    <span className="inline-flex items-center gap-1">
                      Prev.
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${DELIVERY_STATUS_META[delivery].dot}`}
                        title={DELIVERY_STATUS_META[delivery].label}
                      />
                      <strong className="tabular" style={{ color: 'var(--ink-secondary)' }}>{formatDateBR(r.dataPrevista)}</strong>
                    </span>
                  )}
                  {visibleColumns.dataEntrega && <span>Entrega <strong className="tabular" style={{ color: 'var(--ink-secondary)' }}>{formatDateBR(r.dataEntrega)}</strong></span>}
                </div>
              )}

              {visibleColumns.status && (
                <div>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-bold truncate max-w-full ${ITEM_STATUS_STYLE[r.status] || DEFAULT_STATUS_STYLE}`}
                    title={r.status}
                  >
                    {r.status}
                  </span>
                </div>
              )}

              {canAlmoxarifado && (chegada || candidate) && (
                <div className="flex items-center justify-between gap-2 pt-1 border-t" style={{ borderColor: 'var(--hairline)' }} onClick={(e) => e.stopPropagation()}>
                  <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--ink-muted)' }}>Almoxarifado</span>
                  {chegada ? (
                    <div className="flex items-center gap-2">
                      {chegouChip(chegada)}
                      <button
                        onClick={() => onDesfazerChegada?.(r.ri)}
                        disabled={saving}
                        title="Desfazer chegada"
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-500 disabled:opacity-50"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onMarcarChegada?.(r.ri)}
                      disabled={saving}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 hover:border-emerald-300 dark:hover:border-emerald-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 disabled:opacity-50"
                    >
                      <PackageCheck className="h-3.5 w-3.5" /> Marcar chegada
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop: tabela densa com todas as colunas, rolando horizontalmente se necessário */}
      <div className="hidden lg:block">
        <TableShell>
          {/* min-w-full e larguras explícitas em pixels por coluna garantem que nenhuma coluna
              fique espremida nem corte números de RM/PO e descrições. */}
          <table className="w-full min-w-full table-fixed text-[11px]">
            <TableHeadRow>
              {canAlmoxarifado && (
                <Th width="w-[36px] min-w-[36px]">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleSelectAll}
                    disabled={selectableRows.length === 0}
                    className="cursor-pointer"
                    aria-label="Selecionar todos os itens sem MIGO"
                  />
                </Th>
              )}
              {cols.map(col => (
                col.sortable
                  ? <SortableTh key={col.id} col={col.id} label={col.label} align={col.align} width={col.width} sortColumn={sortColumn} sortDir={sortDir} onSort={onSort} />
                  : <Th key={col.id} label={col.label} align={col.align} width={col.width} />
              ))}
              {canAlmoxarifado && <Th label="Almoxarifado" align="right" width="w-[160px] min-w-[160px]" />}
              <Th label="" width="w-[48px] min-w-[48px]" />
            </TableHeadRow>
            <TableBody>
              {rows.map((r, idx) => {
            const delivery: DeliveryStatus = deriveDeliveryStatus(r, hoje);
            const unread = unreadRis.has(r.ri);
            const chegada = chegadasMap?.get(r.ri);
            const candidate = canAlmoxarifado && isAlmoxarifadoCandidate(r);
            const saving = savingRi === r.ri;
            return (
              <Tr key={`${r.ri}-${idx}`} onClick={() => onOpenRow(r)}>
                {canAlmoxarifado && (
                  <Td className="py-1.5 px-2">
                    {candidate && (
                      <input
                        type="checkbox"
                        checked={!!selectedRis?.has(r.ri)}
                        onChange={() => onToggleSelect?.(r.ri)}
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-pointer"
                        aria-label={`Selecionar ${r.rm}`}
                      />
                    )}
                  </Td>
                )}
                {visibleColumns.rm && <Td mono strong className="py-1.5 px-2 whitespace-nowrap">{r.rm}</Td>}
                {visibleColumns.po && (
                  <Td mono className="py-1.5 px-2 whitespace-nowrap">
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
                    <div className="break-words leading-tight" title={r.descricao}>{r.descricao}</div>
                  </Td>
                )}
                {visibleColumns.fornecedor && (
                  <Td strong truncate title={r.fornecedor} className="py-1.5 px-2">{r.fornecedor}</Td>
                )}
                {visibleColumns.setor && (
                  <Td truncate title={r.setor} className="py-1.5 px-2">{r.setor}</Td>
                )}
                {visibleColumns.qtd && (
                  <Td align="right" numeric className="py-1.5 px-2 whitespace-nowrap">
                    {r.qtd !== undefined ? formatInt(r.qtd) : '—'}
                  </Td>
                )}
                {visibleColumns.precoUnitario && (
                  <Td align="right" numeric className="py-1.5 px-2 whitespace-nowrap" title={r.precoUnitario !== undefined ? formatBRL(r.precoUnitario) : undefined}>
                    {formatBRL(r.precoUnitario)}
                  </Td>
                )}
                {visibleColumns.valorTotal && (
                  <Td align="right" numeric strong className="py-1.5 px-2 whitespace-nowrap" title={r.valorTotal !== undefined ? formatBRL(r.valorTotal) : undefined}>
                    {formatBRL(r.valorTotal)}
                  </Td>
                )}
                {visibleColumns.dataCriacao && (
                  <Td numeric className="py-1.5 px-2 whitespace-nowrap">{formatDateBR(r.dataCriacao)}</Td>
                )}
                {visibleColumns.dataPo && (
                  <Td numeric className="py-1.5 px-2 whitespace-nowrap">{formatDateBR(r.dataPo)}</Td>
                )}
                {visibleColumns.dataPrevista && (
                  <Td className="py-1.5 px-2 whitespace-nowrap">
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
                  <Td numeric className="py-1.5 px-2 font-medium whitespace-nowrap">{formatDateBR(r.dataEntrega)}</Td>
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
                {canAlmoxarifado && (
                  <Td align="right" className="py-1.5 px-2">
                    <div className="flex items-center justify-end gap-2">
                      {chegada && chegouChip(chegada)}
                      {chegada ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDesfazerChegada?.(r.ri); }}
                          disabled={saving}
                          title="Desfazer chegada"
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-500 disabled:opacity-50"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                        </button>
                      ) : candidate ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onMarcarChegada?.(r.ri); }}
                          disabled={saving}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 hover:border-emerald-300 dark:hover:border-emerald-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 disabled:opacity-50"
                        >
                          <PackageCheck className="h-3.5 w-3.5" /> Marcar
                        </button>
                      ) : null}
                    </div>
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
      </div>
    </>
  );
}
