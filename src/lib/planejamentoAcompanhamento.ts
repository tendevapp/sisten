export type PlanejamentoRow = Record<string, any>;

export const PLANEJAMENTO_ETAPAS = [
  { etapa: 'NAV01', okKey: 'ok_nav01', leadKey: 'lt_nav01' },
  { etapa: 'SAW3', okKey: 'ok_saw3', leadKey: 'lt_saw3' },
  { etapa: 'INTERNOS', okKey: 'ok_internos', leadKey: 'lt_internos' },
  { etapa: 'WHITE', okKey: 'ok_white', leadKey: 'lt_white' },
] as const;

export interface DashboardStageModel {
  etapa: string;
  concluidos: number;
  pendentes: number;
  media: number;
  mediana: number;
  amostra: number;
}

export interface DashboardKpis {
  totalTramos: number;
  totalEtapas: number;
  etapasConcluidas: number;
  whiteConcluidos: number;
  totalTorres: number;
  torresConcluidas: number;
  wip: number;
  naoIniciados: number;
  avancoFisico: number;
  leadTimeAcumuladoMedio: number;
  agingMedioWip: number;
}

export interface DashboardTowerModel {
  torre: string;
  tramos: number;
  avanco: number;
  white: number;
  porTramo: Record<string, number>;
}

export interface DashboardPostModel {
  posto: string;
  tramos: number;
  percentual: number;
}

export interface DashboardDeadlineModel {
  torre: string;
  saldos: Record<string, number | null>;
  saldo_total: number;
}

export interface DashboardModel {
  kpis: DashboardKpis;
  stages: DashboardStageModel[];
  towers: DashboardTowerModel[];
  postos: DashboardPostModel[];
  prazoPorTorre: DashboardDeadlineModel[];
  weekly: PlanejamentoRow[];
  ritmoSemanal: number;
  etapasRestantes: number;
  dataProjetada: string | null;
}

export interface AcompanhamentoFilters {
  torre: string;
  tramo: string;
  posto: string;
}

export function text(value: unknown, fallback = '—'): string {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

export function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function date(value: unknown): string {
  if (!value) return '—';
  const raw = String(value).slice(0, 10);
  const parts = raw.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : raw;
}

export function percent(value: unknown): string {
  return `${(number(value) * 100).toFixed(1).replace('.', ',')}%`;
}

function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { numeric: true });
}

function fallbackPosto(row: PlanejamentoRow): string {
  const posto = text(row.posto_atual, '').trim();
  if (posto && posto !== 'ERRO') return posto;
  if (row.status === 'NAO INICIADO') return 'PROGRAMADO';
  const etapa = text(row.prox_etapa, '');
  return etapa || 'SEM POSTO';
}

function median(values: number[]): number {
  if (!values.length) return 0;
  return values[Math.floor((values.length - 1) / 2)];
}

function averageLeadTime(rows: PlanejamentoRow[], leadKey: string): { media: number; mediana: number; amostra: number } {
  const values = rows.map(row => number(row[leadKey], NaN)).filter(Number.isFinite).sort((a, b) => a - b);
  return { media: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0, mediana: median(values), amostra: values.length };
}

function isoAfterDays(today: Date, days: number): string {
  const result = new Date(today);
  result.setUTCDate(result.getUTCDate() + Math.ceil(days));
  return result.toISOString().slice(0, 10);
}

export function buildDashboardModel(rows: PlanejamentoRow[], weeklyRows: PlanejamentoRow[], today = new Date()): DashboardModel {
  const totalTramos = rows.length;
  const stages = PLANEJAMENTO_ETAPAS.map(({ etapa, okKey, leadKey }) => {
    const lead = averageLeadTime(rows, leadKey);
    const concluidos = rows.reduce((sum, row) => sum + (number(row[okKey]) === 1 ? 1 : 0), 0);
    return { etapa, concluidos, pendentes: Math.max(0, totalTramos - concluidos), ...lead };
  });
  const towerMap = new Map<string, DashboardTowerModel>();
  const prazoMap = new Map<string, DashboardDeadlineModel>();
  rows.forEach(row => {
    const torre = text(row.torre, 'SEM TORRE');
    const tramo = text(row.tramo, '');
    const tower = towerMap.get(torre) ?? { torre, tramos: 0, avanco: 0, white: 0, porTramo: {} };
    tower.tramos += 1;
    tower.avanco += number(row.avanco_tramo);
    tower.white += number(row.ok_white) === 1 ? 1 : 0;
    if (tramo) tower.porTramo[tramo] = number(row.avanco_tramo);
    towerMap.set(torre, tower);

    const deadline = prazoMap.get(torre) ?? { torre, saldos: {}, saldo_total: 0 };
    const saldo = row.saldo_prazo === null || row.saldo_prazo === undefined || row.saldo_prazo === '' ? null : number(row.saldo_prazo, NaN);
    deadline.saldos[tramo] = Number.isFinite(saldo) ? saldo : null;
    if (Number.isFinite(saldo)) deadline.saldo_total += saldo;
    prazoMap.set(torre, deadline);
  });
  const towers = [...towerMap.values()]
    .map(row => ({ ...row, avanco: row.tramos ? row.avanco / row.tramos : 0 }))
    .sort((a, b) => naturalSort(a.torre, b.torre));
  const prazoPorTorre = [...prazoMap.values()].sort((a, b) => naturalSort(a.torre, b.torre));
  const postoMap = new Map<string, number>();
  rows.filter(row => row.status === 'EM PRODUCAO').forEach(row => {
    const posto = fallbackPosto(row);
    postoMap.set(posto, (postoMap.get(posto) ?? 0) + 1);
  });
  const wip = rows.filter(row => row.status === 'EM PRODUCAO');
  const postosTotal = wip.length;
  const postos = [...postoMap.entries()]
    .map(([posto, tramos]) => ({ posto, tramos, percentual: postosTotal ? tramos / postosTotal : 0 }))
    .sort((a, b) => b.tramos - a.tramos || naturalSort(a.posto, b.posto));
  const etapasConcluidas = stages.reduce((sum, stage) => sum + stage.concluidos, 0);
  const totalTorres = towers.length;
  const torresConcluidas = towers.filter(row => row.tramos > 0 && row.white === row.tramos).length;
  const agingMedioWip = wip.length ? wip.reduce((sum, row) => sum + number(row.dias_sem_movto), 0) / wip.length : 0;
  const weekly = weeklyRows.map(row => ({
    ...row,
    nav01_sem: number(row.nav01_sem), saw3_sem: number(row.saw3_sem), internos_sem: number(row.internos_sem), white_sem: number(row.white_sem),
  }));
  const lastWeeks = weekly.slice(-4);
  const ritmoSemanal = lastWeeks.length ? lastWeeks.reduce((sum, row) => sum + number(row.nav01_sem) + number(row.saw3_sem) + number(row.internos_sem) + number(row.white_sem), 0) / lastWeeks.length : 0;
  const etapasRestantes = Math.max(0, totalTramos * PLANEJAMENTO_ETAPAS.length - etapasConcluidas);
  const leadTimeAcumuladoMedio = stages.reduce((sum, stage) => sum + stage.media, 0);
  return {
    kpis: {
      totalTramos,
      totalEtapas: totalTramos * PLANEJAMENTO_ETAPAS.length,
      etapasConcluidas,
      whiteConcluidos: stages.find(stage => stage.etapa === 'WHITE')?.concluidos ?? 0,
      totalTorres,
      torresConcluidas,
      wip: wip.length,
      naoIniciados: rows.filter(row => row.status === 'NAO INICIADO').length,
      avancoFisico: totalTramos ? rows.reduce((sum, row) => sum + number(row.avanco_tramo), 0) / totalTramos : 0,
      leadTimeAcumuladoMedio,
      agingMedioWip,
    },
    stages,
    towers,
    postos,
    prazoPorTorre,
    weekly,
    ritmoSemanal,
    etapasRestantes,
    dataProjetada: ritmoSemanal > 0 && etapasRestantes > 0 ? isoAfterDays(today, etapasRestantes / ritmoSemanal * 7) : null,
  };
}

export function uniqueValues(rows: PlanejamentoRow[], key: string): string[] {
  return [...new Set(rows.map(row => text(row[key], '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

export function filterEngine(rows: PlanejamentoRow[], filters: AcompanhamentoFilters): PlanejamentoRow[] {
  return rows.filter(row =>
    (filters.torre === 'TODAS' || row.torre === filters.torre) &&
    (filters.tramo === 'TODOS' || row.tramo === filters.tramo) &&
    (filters.posto === 'TODOS' || row.posto_atual === filters.posto),
  );
}

export function stageStats(rows: PlanejamentoRow[]) {
  const definitions = [
    ['NAV01', 'lt_nav01'], ['SAW3', 'lt_saw3'], ['INTERNOS', 'lt_internos'], ['WHITE', 'lt_white'],
  ] as const;
  return definitions.map(([etapa, key]) => {
    const values = rows.map(row => number(row[key], NaN)).filter(Number.isFinite).sort((a, b) => a - b);
    const median = values.length ? values[Math.floor((values.length - 1) / 2)] : 0;
    return { etapa, media: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0, mediana: median, minimo: values[0] ?? 0, maximo: values.at(-1) ?? 0, amostra: values.length };
  });
}

export function fmtNumber(value: unknown, decimals = 0): string {
  return number(value).toLocaleString('pt-BR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

export function postosFromEngine(rows: PlanejamentoRow[]): PlanejamentoRow[] {
  const groups = new Map<string, PlanejamentoRow>();
  rows.filter(row => row.status === 'EM PRODUCAO').forEach(row => {
    const posto = text(row.posto_atual, '(SEM POSTO)');
    const current = groups.get(posto) ?? { posto, tramos: 0, aging_medio: 0 };
    current.tramos += 1;
    current.aging_medio += number(row.dias_sem_movto);
    groups.set(posto, current);
  });
  const total = [...groups.values()].reduce((sum, row) => sum + number(row.tramos), 0);
  return [...groups.values()].map(row => ({ ...row, aging_medio: row.tramos ? row.aging_medio / row.tramos : 0, percentual_carteira: total ? row.tramos / total : 0 }));
}

function isoDate(value: unknown): Date | null {
  const raw = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfWeek(value: Date): Date {
  const day = value.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + mondayOffset);
  return result;
}

export function weeklyFromEngine(rows: PlanejamentoRow[]): PlanejamentoRow[] {
  const dates = rows.flatMap(row => ['fim_nav01', 'fim_saw3', 'fim_internos', 'fim_white'].map(key => isoDate(row[key]))).filter((value): value is Date => value !== null);
  if (!dates.length) return [];
  const first = startOfWeek(new Date(Math.min(...dates.map(value => value.getTime()))));
  const today = new Date();
  const last = startOfWeek(new Date(Math.max(today.getTime(), ...dates.map(value => value.getTime()))));
  const weeks: PlanejamentoRow[] = [];
  const cumulative = { nav01: 0, saw3: 0, internos: 0, white: 0 };
  for (const week = new Date(first); week <= last; week.setUTCDate(week.getUTCDate() + 7)) {
    const end = new Date(week);
    end.setUTCDate(end.getUTCDate() + 6);
    const count = (key: string) => rows.filter(row => { const value = isoDate(row[key]); return value && value >= week && value <= end; }).length;
    const nav01 = count('fim_nav01'); const saw3 = count('fim_saw3'); const internos = count('fim_internos'); const white = count('fim_white');
    cumulative.nav01 += nav01; cumulative.saw3 += saw3; cumulative.internos += internos; cumulative.white += white;
    weeks.push({ semana_inicio: week.toISOString().slice(0, 10), semana_fim: end.toISOString().slice(0, 10), nav01_acum: cumulative.nav01, saw3_acum: cumulative.saw3, internos_acum: cumulative.internos, white_acum: cumulative.white });
  }
  return weeks;
}
