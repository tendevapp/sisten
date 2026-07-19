/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Package, Truck, CalendarClock } from 'lucide-react';
import { addDays, addMonths, format, isSameDay, isSameMonth, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  RastreioRow, DeliveryStatus, DELIVERY_STATUS_META, deriveDeliveryStatus,
  schedulableRows, entriesForDay, weekDays, monthMatrix,
} from '../../lib/rastreio';

type Mode = 'diario' | 'semanal' | 'mensal';

interface RastreioCronogramaProps {
  rows: RastreioRow[]; // linhas já filtradas (a agenda usa só as com data prevista)
  hoje: Date;
  onOpenRow?: (row: RastreioRow) => void;
  unreadRis?: Set<string>;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Cartão de uma entrega no cronograma: item, qtd, PO e fornecedor.
function EntryCard({ row, delivery, compact, onOpen, unread }: { row: RastreioRow; delivery: DeliveryStatus; compact?: boolean; onOpen?: (row: RastreioRow) => void; unread?: boolean }) {
  const meta = DELIVERY_STATUS_META[delivery];
  return (
    <div
      onClick={onOpen ? () => onOpen(row) : undefined}
      className={`relative rounded-lg border-l-4 bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-xs ${compact ? 'p-2' : 'p-2.5'} ${onOpen ? 'cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5 transition-colors' : ''}`}
      style={{ borderLeftColor: 'transparent' }}
      title={`${row.descricao} · PO ${row.po} · ${row.fornecedor}`}
    >
      {unread && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />}
      <div className="flex items-start gap-1.5">
        <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">{row.descricao}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
            {row.qtd !== undefined && (
              <span className="inline-flex items-center gap-0.5 font-semibold">
                <Package className="h-2.5 w-2.5" />{row.qtd.toLocaleString('pt-BR')}{row.unidade !== '—' ? ` ${row.unidade}` : ''}
              </span>
            )}
            {row.po !== '—' && <span className="font-mono">PO {row.po}</span>}
          </div>
          {!compact && row.fornecedor !== '—' && (
            <p className="mt-0.5 text-[10px] text-slate-600 dark:text-slate-300 truncate flex items-center gap-1">
              <Truck className="h-2.5 w-2.5 shrink-0" />{row.fornecedor}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend() {
  // O cronograma só exibe itens ainda não entregues com data prevista, então
  // só "no prazo" e "atrasado" chegam a aparecer aqui.
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
      {(['no_prazo', 'atrasado'] as DeliveryStatus[]).map(s => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${DELIVERY_STATUS_META[s].dot}`} />{DELIVERY_STATUS_META[s].label}
        </span>
      ))}
    </div>
  );
}

export default function RastreioCronograma({ rows, hoje, onOpenRow, unreadRis }: RastreioCronogramaProps) {
  const [mode, setMode] = useState<Mode>('semanal');
  const [refDate, setRefDate] = useState<Date>(hoje);

  const agendaRows = useMemo(() => schedulableRows(rows), [rows]);
  const omitidos = rows.length - agendaRows.length;

  const navigate = (dir: -1 | 1) => {
    if (mode === 'diario') setRefDate(d => addDays(d, dir));
    else if (mode === 'semanal') setRefDate(d => addDays(d, dir * 7));
    else setRefDate(d => addMonths(d, dir));
  };

  const periodLabel = useMemo(() => {
    if (mode === 'diario') return cap(format(refDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR }));
    if (mode === 'semanal') {
      const s = startOfWeek(refDate, { weekStartsOn: 1 });
      const e = endOfWeek(refDate, { weekStartsOn: 1 });
      return `${format(s, "dd MMM", { locale: ptBR })} – ${format(e, "dd MMM yyyy", { locale: ptBR })}`;
    }
    return cap(format(refDate, "MMMM 'de' yyyy", { locale: ptBR }));
  }, [mode, refDate]);

  const modes: { id: Mode; label: string }[] = [
    { id: 'diario', label: 'Diário' },
    { id: 'semanal', label: 'Semanal' },
    { id: 'mensal', label: 'Mensal' },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-50 dark:bg-slate-950 self-start">
          {modes.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${mode === m.id ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="rounded-lg border border-slate-200 dark:border-slate-800 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300" aria-label="Período anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[150px] text-center text-xs font-bold text-slate-700 dark:text-slate-200">{periodLabel}</span>
          <button onClick={() => navigate(1)} className="rounded-lg border border-slate-200 dark:border-slate-800 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300" aria-label="Próximo período">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={() => setRefDate(hoje)} className="rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">Hoje</button>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <Legend />
        {omitidos > 0 && (
          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
            {omitidos.toLocaleString('pt-BR')} já entregues ou sem data prevista (não exibidos)
          </span>
        )}
      </div>

      {mode === 'diario' && <DailyView rows={agendaRows} refDate={refDate} hoje={hoje} onOpen={onOpenRow} unreadRis={unreadRis} />}
      {mode === 'semanal' && <WeeklyView rows={agendaRows} refDate={refDate} hoje={hoje} onOpen={onOpenRow} unreadRis={unreadRis} />}
      {mode === 'mensal' && (
        <MonthlyView
          rows={agendaRows}
          refDate={refDate}
          hoje={hoje}
          onSelectDay={(d) => { setRefDate(d); setMode('diario'); }}
          onOpen={onOpenRow}
          unreadRis={unreadRis}
        />
      )}
    </div>
  );
}

function EmptyDay({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
      <CalendarClock className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
      <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Nenhuma entrega prevista</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

type ViewExtras = { onOpen?: (row: RastreioRow) => void; unreadRis?: Set<string> };

function DailyView({ rows, refDate, hoje, onOpen, unreadRis }: { rows: RastreioRow[]; refDate: Date; hoje: Date } & ViewExtras) {
  const entries = useMemo(() => entriesForDay(rows, refDate), [rows, refDate]);
  if (entries.length === 0) return <EmptyDay label="para este dia" />;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((r, i) => <EntryCard key={`${r.ri}-${i}`} row={r} delivery={deriveDeliveryStatus(r, hoje)} onOpen={onOpen} unread={unreadRis?.has(r.ri)} />)}
    </div>
  );
}

function WeeklyView({ rows, refDate, hoje, onOpen, unreadRis }: { rows: RastreioRow[]; refDate: Date; hoje: Date } & ViewExtras) {
  const days = useMemo(() => weekDays(refDate), [refDate]);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day, i) => {
        const entries = entriesForDay(rows, day);
        const isToday = isSameDay(day, hoje);
        return (
          <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-2 min-h-[120px]">
            <div className={`mb-2 flex items-center justify-between px-0.5 ${isToday ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
              <span className="text-[10px] font-black uppercase tracking-wider">{format(day, 'EEE', { locale: ptBR })}</span>
              <span className={`text-xs font-bold ${isToday ? 'flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white' : ''}`}>{format(day, 'dd')}</span>
            </div>
            <div className="space-y-1.5">
              {entries.length === 0
                ? <p className="px-0.5 py-2 text-[10px] text-slate-300 dark:text-slate-600">—</p>
                : entries.map((r, j) => <EntryCard key={`${r.ri}-${j}`} row={r} delivery={deriveDeliveryStatus(r, hoje)} compact onOpen={onOpen} unread={unreadRis?.has(r.ri)} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthlyView({ rows, refDate, hoje, onSelectDay, onOpen, unreadRis }: { rows: RastreioRow[]; refDate: Date; hoje: Date; onSelectDay: (d: Date) => void } & ViewExtras) {
  const weeks = useMemo(() => monthMatrix(refDate), [refDate]);
  const weekdayHeaders = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  // Agenda (mobile): apenas dias do mês com entregas.
  const agendaDays = useMemo(() => {
    return weeks.flat()
      .filter(d => isSameMonth(d, refDate) && entriesForDay(rows, d).length > 0);
  }, [weeks, rows, refDate]);

  return (
    <>
      {/* Grade de calendário — desktop/tablet */}
      <div className="hidden md:block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-950/50 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {weekdayHeaders.map(h => <div key={h} className="px-2 py-2 text-center">{h}</div>)}
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 divide-x divide-slate-100 dark:divide-slate-800">
              {week.map((day, di) => {
                const entries = entriesForDay(rows, day);
                const inMonth = isSameMonth(day, refDate);
                const isToday = isSameDay(day, hoje);
                return (
                  <button
                    key={di}
                    onClick={() => entries.length > 0 && onSelectDay(day)}
                    className={`min-h-[92px] p-1.5 text-left align-top transition-colors ${inMonth ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-950/30'} ${entries.length > 0 ? 'hover:bg-emerald-50/50 dark:hover:bg-emerald-500/5 cursor-pointer' : 'cursor-default'}`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className={`text-[11px] font-bold ${isToday ? 'flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white' : inMonth ? 'text-slate-600 dark:text-slate-300' : 'text-slate-300 dark:text-slate-600'}`}>{format(day, 'd')}</span>
                      {entries.length > 0 && <span className="text-[9px] font-black text-slate-400 dark:text-slate-500">{entries.length}</span>}
                    </div>
                    <div className="space-y-0.5">
                      {entries.slice(0, 3).map((r, i) => {
                        const meta = DELIVERY_STATUS_META[deriveDeliveryStatus(r, hoje)];
                        return (
                          <div key={i} className="flex items-center gap-1 truncate">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                            <span className="truncate text-[9px] text-slate-600 dark:text-slate-400">{r.descricao}</span>
                          </div>
                        );
                      })}
                      {entries.length > 3 && <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-500">+{entries.length - 3} mais</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Agenda por dia — mobile */}
      <div className="md:hidden space-y-3">
        {agendaDays.length === 0
          ? <EmptyDay label="para este mês" />
          : agendaDays.map((day, i) => {
              const entries = entriesForDay(rows, day);
              const isToday = isSameDay(day, hoje);
              return (
                <div key={i}>
                  <div className={`mb-1.5 flex items-center gap-2 px-0.5 text-xs font-bold ${isToday ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                    <CalendarDays className="h-3.5 w-3.5" />
                    {cap(format(day, "EEEE, dd 'de' MMMM", { locale: ptBR }))}
                    <span className="text-slate-400 dark:text-slate-500 font-semibold">· {entries.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {entries.map((r, j) => <EntryCard key={`${r.ri}-${j}`} row={r} delivery={deriveDeliveryStatus(r, hoje)} onOpen={onOpen} unread={unreadRis?.has(r.ri)} />)}
                  </div>
                </div>
              );
            })}
      </div>
    </>
  );
}
