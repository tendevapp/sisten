export type AcompanhamentoDiarioRow = Record<string, unknown>;

export const DAILY_MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;

export type DailyAreaId = 'NAVE_1' | 'SAW_03' | 'INTERNOS' | 'WHITE' | 'FATURAMENTO' | 'EXPEDICAO';

export interface DailyAreaDefinition {
  id: DailyAreaId;
  label: string;
  targetProfile: 'standard' | 'internos';
}

export const DAILY_AREAS: DailyAreaDefinition[] = [
  { id: 'NAVE_1', label: 'NAVE 1', targetProfile: 'standard' },
  { id: 'SAW_03', label: 'SAW 03', targetProfile: 'standard' },
  { id: 'INTERNOS', label: 'INTERNOS SOLDÁVEIS', targetProfile: 'internos' },
  { id: 'WHITE', label: 'WHITE', targetProfile: 'standard' },
  { id: 'FATURAMENTO', label: 'FATURAMENTO', targetProfile: 'standard' },
  { id: 'EXPEDICAO', label: 'EXPEDIÇÃO', targetProfile: 'standard' },
];

const STANDARD_TARGETS = [0, 0, 0, 0, 0, 0, 0, 21, 33, 34, 25, 2];
const INTERNALS_TARGETS = [0, 0, 0, 0, 0, 4, 15, 27, 20, 27, 22, 0];
const WORKING_DAYS = [0, 0, 0, 6, 20, 21, 22, 21, 21, 21, 19, 2];
const HOLIDAYS_BY_YEAR: Record<number, string[]> = {
  2026: ['2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20'],
};

export interface DailyPoint {
  label: string;
  kind: 'week' | 'day';
  date: string | null;
  real: number;
  media: number | null;
  mediaAcumulada: number | null;
}

export interface DailyMonthPoint {
  month: string;
  monthIndex: number;
  real: number;
  programado: number;
  pendencia: number | null;
  diasUteis: number;
}

export interface AcompanhamentoDiarioMeta {
  area: DailyAreaId;
  ano: number;
  mes: number;
  meta: number;
  dias_uteis: number;
}

export interface AcompanhamentoDiarioRealizado {
  area: DailyAreaId;
  data: string;
  realizado: number;
}

export interface AcompanhamentoDiarioMetaSemanal {
  area: DailyAreaId;
  semana_inicio: string;
  meta: number;
  dias_uteis: number;
}

export interface AcompanhamentoDiarioConfiguracao {
  metas: AcompanhamentoDiarioMeta[];
  metasSemanais?: AcompanhamentoDiarioMetaSemanal[];
  realizados: AcompanhamentoDiarioRealizado[];
  feriados: string[];
}

export interface DailyAreaModel extends DailyAreaDefinition {
  weeklyDaily: DailyPoint[];
  monthly: DailyMonthPoint[];
  fallbackFaturamento: boolean;
}

export interface AcompanhamentoDiarioModel {
  referenceYear: number;
  referenceMonthIndex: number;
  referenceMonth: string;
  areas: DailyAreaModel[];
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    const correctedSerial = value >= 60 ? value - 1 : value;
    return new Date(Date.UTC(1899, 11, 31) + Math.floor(correctedSerial) * 86400000);
  }
  const raw = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function selectedReferenceDate(today: Date, selectedMonthIndex: number): Date {
  const year = today.getUTCFullYear();
  if (selectedMonthIndex === today.getUTCMonth()) {
    return new Date(Date.UTC(year, selectedMonthIndex, today.getUTCDate()));
  }
  return new Date(Date.UTC(year, selectedMonthIndex + 1, 0));
}

function monthIndex(date: Date): number {
  return date.getUTCMonth();
}

function isBusinessDay(date: Date, holidays: Set<string>): boolean {
  if (date.getUTCDay() === 0 || date.getUTCDay() === 6) return false;
  return !holidays.has(dateKey(date));
}

function sundayWeekStart(date: Date): Date {
  return addDays(date, -date.getUTCDay());
}

function sundayWeekNumber(date: Date): number {
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((date.getTime() - yearStart.getTime()) / 86400000) + 1;
  return Math.ceil((dayOfYear + yearStart.getUTCDay()) / 7);
}

function rawDate(row: AcompanhamentoDiarioRow, names: string[]): Date | null {
  const raw = row.raw_data;
  if (!raw || typeof raw !== 'object') return null;
  const wanted = names.map(normalize);
  const entry = Object.entries(raw as Record<string, unknown>).find(([key, value]) => wanted.includes(normalize(key)) && value !== null && value !== '');
  return entry ? toDate(entry[1]) : null;
}

function areaDate(row: AcompanhamentoDiarioRow, id: DailyAreaId): { date: Date | null; fallbackFaturamento: boolean } {
  if (id === 'NAVE_1') return { date: toDate(row.fim_nav01 ?? row.termino_nav01), fallbackFaturamento: false };
  if (id === 'SAW_03') return { date: toDate(row.fim_saw3 ?? row.data_termino_saw3), fallbackFaturamento: false };
  if (id === 'INTERNOS') return { date: toDate(row.fim_internos ?? row.data_termino_internos), fallbackFaturamento: false };
  if (id === 'WHITE') return { date: toDate(row.fim_white ?? row.termino_final), fallbackFaturamento: false };
  if (id === 'FATURAMENTO') {
    const distinct = toDate(row.data_faturamento) ?? rawDate(row, ['FATURAMENTO', 'FATURADO', 'DATA FATURAMENTO']);
    return { date: distinct ?? toDate(row.data_expedicao), fallbackFaturamento: !distinct && !!toDate(row.data_expedicao) };
  }
  return { date: rawDate(row, ['DATA', 'DATA EXPEDICAO', 'EXPEDIDO']) ?? toDate(row.data_expedicao), fallbackFaturamento: false };
}

function targetsFor(profile: DailyAreaDefinition['targetProfile']): number[] {
  return profile === 'internos' ? INTERNALS_TARGETS : STANDARD_TARGETS;
}

function targetsAndDaysFor(definition: DailyAreaDefinition, year: number, config?: AcompanhamentoDiarioConfiguracao): { metas: number[]; diasUteis: number[] } {
  const metas = [...targetsFor(definition.targetProfile)];
  const diasUteis = [...WORKING_DAYS];
  for (const item of config?.metas ?? []) {
    if (item.area !== definition.id || item.ano !== year || item.mes < 1 || item.mes > 12) continue;
    metas[item.mes - 1] = Number(item.meta);
    diasUteis[item.mes - 1] = Number(item.dias_uteis);
  }
  return { metas, diasUteis };
}

function countsByDate(dates: Date[], overrides: AcompanhamentoDiarioRealizado[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const date of dates) counts.set(dateKey(date), (counts.get(dateKey(date)) ?? 0) + 1);
  for (const override of overrides) {
    const date = toDate(override.data);
    if (date) counts.set(dateKey(date), Number(override.realizado));
  }
  return counts;
}

function countInRange(counts: Map<string, number>, start: Date, end: Date): number {
  let result = 0;
  for (let date = start; date <= end; date = addDays(date, 1)) result += counts.get(dateKey(date)) ?? 0;
  return result;
}

function dailyPlanRate(month: number, targets: number[], days: number[]): number {
  return days[month] > 0 ? targets[month] / days[month] : 0;
}

function weeklyRates(items: AcompanhamentoDiarioMetaSemanal[]): Map<string, AcompanhamentoDiarioMetaSemanal> {
  return new Map(items.map(item => [item.semana_inicio, item]));
}

function planRateForDate(date: Date, targets: number[], days: number[], weekly: Map<string, AcompanhamentoDiarioMetaSemanal>): number {
  const metaSemanal = weekly.get(dateKey(sundayWeekStart(date)));
  if (metaSemanal) return metaSemanal.dias_uteis > 0 ? metaSemanal.meta / metaSemanal.dias_uteis : 0;
  return dailyPlanRate(monthIndex(date), targets, days);
}

function weeklyAdjustmentTouchesMonth(weekly: Map<string, AcompanhamentoDiarioMetaSemanal>, start: Date, end: Date): boolean {
  return [...weekly.keys()].some(key => {
    const weekStart = toDate(key);
    return !!weekStart && weekStart <= end && addDays(weekStart, 6) >= start;
  });
}

function plannedInMonth(start: Date, end: Date, targets: number[], days: number[], holidays: Set<string>, weekly: Map<string, AcompanhamentoDiarioMetaSemanal>): number {
  let planned = 0;
  for (let date = start; date <= end; date = addDays(date, 1)) {
    if (isBusinessDay(date, holidays)) planned += planRateForDate(date, targets, days, weekly);
  }
  return planned;
}

function buildWeeklyDaily(counts: Map<string, number>, referenceDate: Date, targets: number[], days: number[], holidays: Set<string>, weekly: Map<string, AcompanhamentoDiarioMetaSemanal>): DailyPoint[] {
  const currentWeek = sundayWeekStart(referenceDate);
  const points: DailyPoint[] = [];
  for (let offset = -4; offset <= 0; offset += 1) {
    const start = addDays(currentWeek, offset * 7);
    points.push({
      label: `W${sundayWeekNumber(start)}`,
      kind: 'week',
      date: dateKey(start),
      real: countInRange(counts, start, addDays(start, 6)),
      media: null,
      mediaAcumulada: null,
    });
  }

  const monthStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
  let accumulated: number | null = null;
  const accumulatedByDay = new Map<string, number>();
  for (let date = monthStart; date <= addDays(currentWeek, 6); date = addDays(date, 1)) {
    const rate = planRateForDate(date, targets, days, weekly);
    if (isBusinessDay(date, holidays)) {
      accumulated = accumulated === null ? rate : accumulated + rate - (counts.get(dateKey(addDays(date, -1))) ?? 0);
    }
    if (accumulated !== null) accumulatedByDay.set(dateKey(date), accumulated);
  }
  for (let day = 1; day <= 6; day += 1) {
    const date = addDays(currentWeek, day);
    const businessDay = isBusinessDay(date, holidays);
    points.push({
      label: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][day - 1],
      kind: 'day',
      date: dateKey(date),
      real: countInRange(counts, date, date),
      media: businessDay ? planRateForDate(date, targets, days, weekly) : null,
      mediaAcumulada: accumulatedByDay.get(dateKey(date)) ?? null,
    });
  }
  return points;
}

function buildMonthly(counts: Map<string, number>, referenceDate: Date, targets: number[], days: number[], holidays: Set<string>, weekly: Map<string, AcompanhamentoDiarioMetaSemanal>): DailyMonthPoint[] {
  return DAILY_MONTHS.map((month, index) => {
    const start = new Date(Date.UTC(referenceDate.getUTCFullYear(), index, 1));
    const end = new Date(Date.UTC(referenceDate.getUTCFullYear(), index + 1, 0, 23, 59, 59));
    const real = countInRange(counts, start, end);
    const programado = weeklyAdjustmentTouchesMonth(weekly, start, end)
      ? plannedInMonth(start, end, targets, days, holidays, weekly)
      : targets[index];
    return {
      month,
      monthIndex: index,
      real,
      programado,
      pendencia: index <= referenceDate.getUTCMonth() ? programado - real : null,
      diasUteis: days[index],
    };
  });
}

export function buildAcompanhamentoDiarioModel(rows: AcompanhamentoDiarioRow[], today = new Date(), selectedMonthIndex = today.getUTCMonth(), config?: AcompanhamentoDiarioConfiguracao): AcompanhamentoDiarioModel {
  const currentDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const monthIndex = Math.max(0, Math.min(DAILY_MONTHS.length - 1, selectedMonthIndex));
  const referenceDate = selectedReferenceDate(currentDate, monthIndex);
  return {
    referenceYear: referenceDate.getUTCFullYear(),
    referenceMonthIndex: monthIndex,
    referenceMonth: DAILY_MONTHS[monthIndex],
    areas: DAILY_AREAS.map(definition => {
      const resolved = rows.map(row => areaDate(row, definition.id));
      const dates = resolved.flatMap(item => item.date ? [item.date] : []);
      const targetConfig = targetsAndDaysFor(definition, currentDate.getUTCFullYear(), config);
      const manualOverrides = (config?.realizados ?? []).filter(item => item.area === definition.id);
      const counts = countsByDate(dates, manualOverrides);
      const holidays = new Set(config ? config.feriados : HOLIDAYS_BY_YEAR[currentDate.getUTCFullYear()] ?? []);
      const metasSemanais = weeklyRates((config?.metasSemanais ?? []).filter(item => item.area === definition.id));
      return {
        ...definition,
        weeklyDaily: buildWeeklyDaily(counts, referenceDate, targetConfig.metas, targetConfig.diasUteis, holidays, metasSemanais),
        monthly: buildMonthly(counts, currentDate, targetConfig.metas, targetConfig.diasUteis, holidays, metasSemanais),
        fallbackFaturamento: definition.id === 'FATURAMENTO' && resolved.some(item => item.fallbackFaturamento),
      };
    }),
  };
}
