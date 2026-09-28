import * as XLSX from 'xlsx';

export const ACOMPANHAMENTO_IMPORT_PROGRESS = [
  { value: 10, label: 'Lendo planilha...' },
  { value: 30, label: 'Validando dados...' },
  { value: 55, label: 'Enviando base ao Supabase...' },
  { value: 80, label: 'Recalculando dashboards...' },
] as const;

export interface AcompanhamentoRowPayload {
  linha_origem: number;
  bd: string | null;
  sequencial: number | null;
  tramo: string | null;
  projeto: string | null;
  descricao: string | null;
  posto_origem: string | null;
  inicio: string | null;
  turno_inicio: number | null;
  calandra: string | null;
  termino_nav01: string | null;
  turno_termino_nav01: number | null;
  total_nav01: number | null;
  data_inicio_internos: string | null;
  turno_inicio_internos: number | null;
  data_termino_saw3: string | null;
  turno_termino_saw3: number | null;
  total_turno_saw3: number | null;
  data_termino_internos: string | null;
  turno_lib_jato: number | null;
  qtd_reparos: number | null;
  metragem_reparos: number | null;
  total_turno_internos: number | null;
  termino_final: string | null;
  turno_termino_final: number | null;
  total_turno_final: number | null;
  marcador_x: string | null;
  data_expedicao: string | null;
  cort_x_expedicao: string | null;
  marcador_x_expedicao: string | null;
  numero_torre: number | null;
  lead_time_corte: number | null;
  lead_time_calandra: number | null;
  tempo_armazenagem: number | null;
  raw_data: Record<string, unknown>;
}

export interface CronogramaRowPayload {
  linha_origem: number;
  sequencial: number;
  posto: string | null;
  raw_data: Record<string, unknown>;
}

export interface ParsedAcompanhamentoWorkbook {
  bdHeaders: string[];
  bdRows: AcompanhamentoRowPayload[];
  cronogramaHeaders: string[];
  cronogramaRows: CronogramaRowPayload[];
}

const BD_SHEET = 'BD_ACOMPANHAMENTO_GERAL';

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function emptyToNull(value: unknown): unknown {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const text = String(value).trim();
  return text.startsWith('#') ? null : value;
}

function textAt(row: unknown[], index: number): string | null {
  const value = emptyToNull(row[index]);
  return value === null ? null : String(value).trim();
}

function numberAt(row: unknown[], index: number): number | null {
  const value = emptyToNull(row[index]);
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerAt(row: unknown[], index: number): number | null {
  const value = numberAt(row, index);
  return value === null ? null : Math.round(value);
}

export function excelSerialToIsoDate(value: unknown): string | null {
  const normalized = emptyToNull(value);
  if (normalized === null) return null;
  if (normalized instanceof Date && !Number.isNaN(normalized.getTime())) {
    return normalized.toISOString().slice(0, 10);
  }
  if (typeof normalized === 'number' || /^\d+(\.\d+)?$/.test(String(normalized).trim())) {
    const serial = Number(normalized);
    if (!Number.isFinite(serial) || serial < 1) return null;
    const excelEpoch = Date.UTC(1899, 11, 31);
    const correctedSerial = serial >= 60 ? serial - 1 : serial;
    const date = new Date(excelEpoch + Math.floor(correctedSerial) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = String(normalized).trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function uniqueHeaders(row: unknown[], width: number): string[] {
  const seen = new Map<string, number>();
  return Array.from({ length: width }, (_, index) => {
    const original = String(row[index] ?? '').trim();
    const base = original || `COLUNA_${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

function rawData(headers: string[], row: unknown[]): Record<string, unknown> {
  return headers.reduce<Record<string, unknown>>((acc, header, index) => {
    const value = row[index];
    if (value !== null && value !== undefined && value !== '') acc[header] = value instanceof Date ? value.toISOString() : value;
    return acc;
  }, {});
}

function findSheet(workbook: XLSX.WorkBook, name: string): XLSX.WorkSheet | null {
  const target = normalize(name);
  const sheetName = workbook.SheetNames.find((candidate) => normalize(candidate) === target);
  return sheetName ? workbook.Sheets[sheetName] : null;
}

function rowsOf(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, blankrows: false }) as unknown[][];
}

function findHeaderRow(rows: unknown[][]): number {
  const index = rows.findIndex((row) => {
    const labels = row.map(normalize);
    return labels.includes('BD') && labels.some((label) => label === 'SEQUENCIAL');
  });
  if (index >= 0) return index;
  return rows.findIndex((row) => row.some((value) => normalize(value) === 'SEQUENCIAL'));
}

function maxWidth(rows: unknown[][]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

function parseBaseRows(rows: unknown[][], headerIndex: number, headers: string[]): AcompanhamentoRowPayload[] {
  return rows.slice(headerIndex + 1).flatMap((row, offset) => {
    const sourceRow = headerIndex + offset + 2;
    if (integerAt(row, 1) === null && textAt(row, 0) === null) return [];
    const parsed: AcompanhamentoRowPayload = {
      linha_origem: sourceRow,
      bd: textAt(row, 0), sequencial: integerAt(row, 1), tramo: textAt(row, 2), projeto: textAt(row, 3), descricao: textAt(row, 4), posto_origem: textAt(row, 5),
      inicio: excelSerialToIsoDate(row[6]), turno_inicio: integerAt(row, 7), calandra: excelSerialToIsoDate(row[8]), termino_nav01: excelSerialToIsoDate(row[9]), turno_termino_nav01: integerAt(row, 10), total_nav01: numberAt(row, 11),
      data_inicio_internos: excelSerialToIsoDate(row[12]), turno_inicio_internos: integerAt(row, 13), data_termino_saw3: excelSerialToIsoDate(row[14]), turno_termino_saw3: integerAt(row, 15), total_turno_saw3: numberAt(row, 16),
      data_termino_internos: excelSerialToIsoDate(row[17]), turno_lib_jato: integerAt(row, 18), qtd_reparos: numberAt(row, 19), metragem_reparos: numberAt(row, 20), total_turno_internos: numberAt(row, 21),
      termino_final: excelSerialToIsoDate(row[22]), turno_termino_final: integerAt(row, 23), total_turno_final: numberAt(row, 24), marcador_x: textAt(row, 25), data_expedicao: excelSerialToIsoDate(row[26]),
      cort_x_expedicao: textAt(row, 27), marcador_x_expedicao: textAt(row, 28), numero_torre: integerAt(row, 29), lead_time_corte: numberAt(row, 30), lead_time_calandra: numberAt(row, 31), tempo_armazenagem: numberAt(row, 32), raw_data: rawData(headers, row),
    };
    return parsed.sequencial === null ? [] : [parsed];
  });
}

function parseCronogramaRows(rows: unknown[][]): { headers: string[]; rows: CronogramaRowPayload[] } {
  const headerIndex = rows.findIndex((row) => row.some((value) => normalize(value) === 'SEQUENCIAL'));
  const effectiveHeaderIndex = headerIndex >= 0 ? headerIndex : -1;
  const header = rows[effectiveHeaderIndex] ?? [];
  const headers = uniqueHeaders(header, maxWidth(rows));
  const sequencialIndex = headerIndex >= 0 ? header.findIndex((value) => normalize(value) === 'SEQUENCIAL') : 3;
  const postoIndex = headerIndex >= 0 ? header.findIndex((value) => normalize(value) === 'POSTO') : 10;
  const dataRows = rows.slice(effectiveHeaderIndex + 1).flatMap((row, offset) => {
    const sequencial = integerAt(row, sequencialIndex >= 0 ? sequencialIndex : 3);
    if (sequencial === null) return [];
    return [{ linha_origem: effectiveHeaderIndex + offset + 2, sequencial, posto: textAt(row, postoIndex >= 0 ? postoIndex : 10), raw_data: rawData(headers, row) }];
  });
  return { headers, rows: dataRows };
}

export function parseAcompanhamentoWorkbook(buffer: ArrayBuffer | Uint8Array): ParsedAcompanhamentoWorkbook {
  const workbook = XLSX.read(buffer, { type: 'array', raw: true, cellDates: true });
  const bdSheet = findSheet(workbook, BD_SHEET);
  if (!bdSheet) throw new Error(`A aba ${BD_SHEET} não foi encontrada.`);
  const bdRows = rowsOf(bdSheet);
  const headerIndex = findHeaderRow(bdRows);
  if (headerIndex < 0) throw new Error(`A aba ${BD_SHEET} não possui a linha de cabeçalho esperada.`);
  const bdHeaders = uniqueHeaders(bdRows[headerIndex], maxWidth(bdRows));
  const cronogramaSheet = findSheet(workbook, 'CRONOGRAMA');
  const cronograma = cronogramaSheet ? parseCronogramaRows(rowsOf(cronogramaSheet)) : { headers: [], rows: [] };
  return { bdHeaders, bdRows: parseBaseRows(bdRows, headerIndex, bdHeaders), cronogramaHeaders: cronograma.headers, cronogramaRows: cronograma.rows };
}

export function parseCronogramaWorkbook(buffer: ArrayBuffer | Uint8Array): { headers: string[]; rows: CronogramaRowPayload[] } {
  const workbook = XLSX.read(buffer, { type: 'array', raw: true, cellDates: true });
  const sheet = findSheet(workbook, 'CRONOGRAMA') ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('A planilha CRONOGRAMA não possui abas.');
  return parseCronogramaRows(rowsOf(sheet));
}
