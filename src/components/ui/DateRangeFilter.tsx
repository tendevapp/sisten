import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown, X, Clock, AlertTriangle, CalendarDays } from 'lucide-react';

export interface DateRangeValue {
  from: string;
  to: string;
  preset?: string;
}

export interface DateRangeFilterProps {
  label: string;
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  icon?: React.ComponentType<{ className?: string }>;
  allLabel?: string;
  className?: string;
  panelClassName?: string;
}

const getTodayISO = (): string => new Date().toISOString().slice(0, 10);

const addDaysISO = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const getMonthEndISO = (): string => {
  const d = new Date();
  const nextMonthFirst = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const lastDay = new Date(nextMonthFirst.getTime() - 86400000);
  return lastDay.toISOString().slice(0, 10);
};

const formatDateDisplay = (isoDate: string): string => {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y.slice(2)}`;
};

export default function DateRangeFilter({
  label,
  value,
  onChange,
  icon: Icon = Calendar,
  allLabel = 'Todas',
  className = 'min-w-[160px]',
  panelClassName,
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isActive = useMemo(() => {
    return (
      (value.preset && value.preset !== 'all') ||
      Boolean(value.from) ||
      Boolean(value.to)
    );
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const resumo = useMemo(() => {
    if (!isActive) return `${label}: ${allLabel}`;
    if (value.preset === 'sem_data') return `${label}: Sem data`;
    if (value.preset === 'atrasadas') return `${label}: Atrasadas`;
    if (value.preset === 'com_data' && !value.from && !value.to) return `${label}: Com data`;
    if (value.preset === 'hoje') return `${label}: Hoje`;
    if (value.preset === '7dias') return `${label}: Próx. 7 dias`;
    if (value.preset === '15dias') return `${label}: Próx. 15 dias`;
    if (value.preset === '30dias') return `${label}: Próx. 30 dias`;
    if (value.preset === 'este_mes') return `${label}: Este mês`;

    if (value.from && value.to) {
      if (value.from === value.to) return `${label}: ${formatDateDisplay(value.from)}`;
      return `${label}: ${formatDateDisplay(value.from)} a ${formatDateDisplay(value.to)}`;
    }
    if (value.from) return `${label}: a partir de ${formatDateDisplay(value.from)}`;
    if (value.to) return `${label}: até ${formatDateDisplay(value.to)}`;

    return `${label}: Filtrado`;
  }, [isActive, label, allLabel, value]);

  const handleClear = () => {
    onChange({ from: '', to: '', preset: 'all' });
  };

  const handlePreset = (preset: string) => {
    const today = getTodayISO();
    if (preset === 'all') {
      onChange({ from: '', to: '', preset: 'all' });
    } else if (preset === 'sem_data') {
      onChange({ from: '', to: '', preset: 'sem_data' });
    } else if (preset === 'com_data') {
      onChange({ from: '', to: '', preset: 'com_data' });
    } else if (preset === 'atrasadas') {
      onChange({ from: '', to: '', preset: 'atrasadas' });
    } else if (preset === 'hoje') {
      onChange({ from: today, to: today, preset: 'hoje' });
    } else if (preset === '7dias') {
      onChange({ from: today, to: addDaysISO(7), preset: '7dias' });
    } else if (preset === '15dias') {
      onChange({ from: today, to: addDaysISO(15), preset: '15dias' });
    } else if (preset === '30dias') {
      onChange({ from: today, to: addDaysISO(30), preset: '30dias' });
    } else if (preset === 'este_mes') {
      onChange({ from: today, to: getMonthEndISO(), preset: 'este_mes' });
    }
  };

  const handleCustomDateChange = (field: 'from' | 'to', val: string) => {
    onChange({
      ...value,
      [field]: val,
      preset: 'custom',
    });
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={resumo}
        className={`w-full flex items-center gap-1.5 ${Icon ? 'pl-8' : 'pl-3'} pr-8 py-2 rounded-xl border bg-slate-50 dark:bg-slate-950 text-xs font-bold text-left truncate focus:outline-none cursor-pointer transition-all ${
          isActive
            ? 'border-[#0056c6] text-[#0056c6] bg-blue-50/50 dark:bg-blue-950/20'
            : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 focus:border-[#0056c6]'
        }`}
      >
        {Icon && (
          <Icon
            className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none ${
              isActive ? 'text-[#0056c6]' : 'text-slate-450'
            }`}
          />
        )}
        <span className="truncate">{resumo}</span>
        <ChevronDown
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none transition-transform ${
            open ? 'rotate-180' : ''
          } ${isActive ? 'text-[#0056c6]' : 'text-slate-400'}`}
        />
      </button>

      {isActive && !open && (
        <button
          type="button"
          onClick={handleClear}
          aria-label={`Limpar filtro ${label}`}
          className="absolute -top-1.5 -right-1.5 rounded-full bg-[#0056c6] text-white p-0.5 shadow-xs hover:bg-[#00459e] transition-colors cursor-pointer"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label={`Opções do filtro ${label}`}
          className={`absolute z-30 mt-1 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-3.5 w-76 sm:w-80 ${
            panelClassName || ''
          }`}
        >
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-150 dark:border-slate-850">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-[#0056c6]" />
              Filtro de {label}
            </span>
            {isActive && (
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Status da Promessa */}
          <div className="space-y-1.5 mb-3">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Estado da Data
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handlePreset('all')}
                className={`px-2 py-1.5 rounded-lg text-xs font-bold border text-left transition-all cursor-pointer ${
                  !isActive || value.preset === 'all'
                    ? 'bg-[#0056c6] text-white border-[#0056c6] shadow-2xs'
                    : 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => handlePreset('sem_data')}
                className={`px-2 py-1.5 rounded-lg text-xs font-bold border text-left transition-all cursor-pointer flex items-center justify-between ${
                  value.preset === 'sem_data'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                    : 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>Sem data</span>
                <Clock className="h-3 w-3 opacity-80" />
              </button>
              <button
                type="button"
                onClick={() => handlePreset('com_data')}
                className={`px-2 py-1.5 rounded-lg text-xs font-bold border text-left transition-all cursor-pointer ${
                  value.preset === 'com_data' && !value.from && !value.to
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Com data
              </button>
              <button
                type="button"
                onClick={() => handlePreset('atrasadas')}
                className={`px-2 py-1.5 rounded-lg text-xs font-bold border text-left transition-all cursor-pointer flex items-center justify-between ${
                  value.preset === 'atrasadas'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                    : 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>Atrasadas</span>
                <AlertTriangle className="h-3 w-3 opacity-80" />
              </button>
            </div>
          </div>

          {/* Atalhos de Intervalos */}
          <div className="space-y-1.5 mb-3">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Prazos Rápidos
            </span>
            <div className="flex flex-wrap gap-1">
              {[
                { id: 'hoje', label: 'Hoje' },
                { id: '7dias', label: '7 dias' },
                { id: '15dias', label: '15 dias' },
                { id: '30dias', label: '30 dias' },
                { id: 'este_mes', label: 'Este mês' },
              ].map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePreset(p.id)}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                    value.preset === p.id
                      ? 'bg-[#0056c6] text-white border-[#0056c6]'
                      : 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Intervalo Personalizado */}
          <div className="space-y-2 pt-2.5 border-t border-slate-150 dark:border-slate-850">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
              Intervalo Personalizado
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mb-0.5">
                  De:
                </label>
                <input
                  type="date"
                  value={value.from || ''}
                  max={value.to || undefined}
                  onChange={e => handleCustomDateChange('from', e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:border-[#0056c6] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mb-0.5">
                  Até:
                </label>
                <input
                  type="date"
                  value={value.to || ''}
                  min={value.from || undefined}
                  onChange={e => handleCustomDateChange('to', e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:border-[#0056c6] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-150 dark:border-slate-850 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 bg-[#0056c6] hover:bg-[#004bb0] text-white rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer"
            >
              Concluir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
