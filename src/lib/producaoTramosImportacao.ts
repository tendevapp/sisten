import * as XLSX from 'xlsx';

export type MarcoTramo = 'inicio' | 'liberado_nav02' | 'liberado_jato' | 'liberado_patio' | 'expedido';

export interface CadastroTorreTramo {
  torreNumero: number;
  tramo: 'T1' | 'T2' | 'T3' | 'T4' | 'T5';
  sequencial: number;
}

export interface SnapshotTramoPlanilha {
  linhaOrigem: number;
  sequencial: number;
  tramo: 'T1' | 'T2' | 'T3' | 'T4' | 'T5';
  setor: string;
  atividade: string;
  reparosSolda: number | null;
  marcos: Partial<Record<MarcoTramo, string>>;
}

export interface DivergenciaImportacaoTramos {
  codigo:
    | 'CADASTRO_3102_3202'
    | 'SEQUENCIAL_DUPLICADO'
    | 'SEQUENCIAL_SEM_TRAMO'
    | 'TRAMO_DIVERGENTE'
    | 'REPARO_INVALIDO'
    | 'CRONOLOGIA_INVALIDA';
  bloqueante: boolean;
  sequencial: number;
  linhaOrigem?: number;
}

export interface TotaisDiretosTramos {
  inicio: number;
  liberadoNav02: number;
  liberadoJato: number;
  liberadoPatio: number;
  expedido: number;
}

export interface ResultadoLeituraPlanilhaTramos {
  cadastro: CadastroTorreTramo[];
  snapshots: SnapshotTramoPlanilha[];
  totaisDiretos: TotaisDiretosTramos;
  divergencias: DivergenciaImportacaoTramos[];
}

type Planilha = XLSX.WorkSheet;

const MARCOS: Array<{ marco: MarcoTramo; cabecalho: string }> = [
  { marco: 'inicio', cabecalho: 'inicio' },
  { marco: 'liberado_nav02', cabecalho: 'liberadopnav02' },
  { marco: 'liberado_jato', cabecalho: 'liberadopjato' },
  { marco: 'liberado_patio', cabecalho: 'liberadoppatio' },
  { marco: 'expedido', cabecalho: 'expedido' },
];

function normalizar(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function celula(sheet: Planilha, linha: number, coluna: number): XLSX.CellObject | undefined {
  return sheet[XLSX.utils.encode_cell({ r: linha, c: coluna })];
}

function valorDireto(sheet: Planilha, linha: number, coluna: number): unknown {
  const item = celula(sheet, linha, coluna);
  return item?.f ? undefined : item?.v;
}

function tramoValido(valor: unknown): valor is SnapshotTramoPlanilha['tramo'] {
  return typeof valor === 'string' && /^T[1-5]$/.test(valor.trim());
}

function dataIso(valor: unknown): string | undefined {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, '0')}-${String(valor.getDate()).padStart(2, '0')}`;
  }
  if (typeof valor === 'number') {
    const data = XLSX.SSF.parse_date_code(valor);
    return data
      ? `${String(data.y).padStart(4, '0')}-${String(data.m).padStart(2, '0')}-${String(data.d).padStart(2, '0')}`
      : undefined;
  }
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor.trim())) return valor.trim().slice(0, 10);
  return undefined;
}

function encontrarLinhaCabecalho(sheet: Planilha, exigidos: string[]): number {
  const limite = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1');
  for (let linha = limite.s.r; linha <= limite.e.r; linha += 1) {
    const encontrados = new Set<string>();
    for (let coluna = limite.s.c; coluna <= limite.e.c; coluna += 1) {
      encontrados.add(normalizar(valorDireto(sheet, linha, coluna)));
    }
    if (exigidos.every(exigido => encontrados.has(exigido))) return linha;
  }
  throw new Error(`Cabeçalho não encontrado: ${exigidos.join(', ')}`);
}

function lerCadastro(sheet: Planilha): { cadastro: CadastroTorreTramo[]; lookup: Map<number, SnapshotTramoPlanilha['tramo']>; divergencias: DivergenciaImportacaoTramos[] } {
  const linhaCabecalho = encontrarLinhaCabecalho(sheet, ['torre', 't1', 't2', 't3', 't4', 't5']);
  const cadastro: CadastroTorreTramo[] = [];
  const limite = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1');
  for (let linha = linhaCabecalho + 1; linha <= limite.e.r; linha += 1) {
    const celulaTorre = celula(sheet, linha, 0);
    const valorTorre = valorDireto(sheet, linha, 0);
    // The tower column is catalog identity. The source uses formulas here, so
    // only its cached identity is read; production milestones never use formulas.
    const torreNumero = typeof valorTorre === 'number'
      ? valorTorre
      : celulaTorre?.f && typeof celulaTorre.v === 'number'
        ? celulaTorre.v
        : undefined;
    if (typeof torreNumero !== 'number') continue;
    for (let coluna = 1; coluna <= 5; coluna += 1) {
      const sequencial = valorDireto(sheet, linha, coluna);
      if (typeof sequencial === 'number') cadastro.push({ torreNumero, tramo: `T${coluna}` as CadastroTorreTramo['tramo'], sequencial });
    }
  }

  const lookup = new Map<number, SnapshotTramoPlanilha['tramo']>();
  for (let linha = limite.s.r; linha <= limite.e.r; linha += 1) {
    const sequencial = valorDireto(sheet, linha, 10);
    const tramo = valorDireto(sheet, linha, 11);
    if (typeof sequencial === 'number' && tramoValido(tramo)) {
      lookup.set(sequencial, tramo.trim() as SnapshotTramoPlanilha['tramo']);
    }
  }

  const divergencias: DivergenciaImportacaoTramos[] = [];
  const matriz3102 = cadastro.find(item => item.torreNumero === 8 && item.tramo === 'T5' && item.sequencial === 3102);
  if (matriz3102 && lookup.get(3202) === matriz3102.tramo) {
    divergencias.push({ codigo: 'CADASTRO_3102_3202', bloqueante: false, sequencial: 3202 });
  }
  return { cadastro, lookup, divergencias };
}

function lerSnapshots(sheet: Planilha, lookup: Map<number, SnapshotTramoPlanilha['tramo']>): { snapshots: SnapshotTramoPlanilha[]; divergencias: DivergenciaImportacaoTramos[] } {
  const linhaCabecalho = encontrarLinhaCabecalho(sheet, ['setor', 'sequencial', 'atividade']);
  const limite = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1');
  const colunas = new Map<string, number>();
  for (let coluna = limite.s.c; coluna <= limite.e.c; coluna += 1) colunas.set(normalizar(valorDireto(sheet, linhaCabecalho, coluna)), coluna);
  const sequencialColuna = colunas.get('sequencial');
  const setorColuna = colunas.get('setor');
  const atividadeColuna = colunas.get('atividade');
  const tramoColuna = colunas.get('tramo');
  if (sequencialColuna == null || setorColuna == null || atividadeColuna == null) throw new Error('Colunas diretas de TRAMOS ausentes.');

  const snapshots: SnapshotTramoPlanilha[] = [];
  const divergencias: DivergenciaImportacaoTramos[] = [];
  for (let linha = linhaCabecalho + 1; linha <= limite.e.r; linha += 1) {
    const sequencial = valorDireto(sheet, linha, sequencialColuna);
    if (typeof sequencial !== 'number') continue;
    const tramo = lookup.get(sequencial);
    if (!tramo) {
      divergencias.push({ codigo: 'SEQUENCIAL_SEM_TRAMO', bloqueante: true, sequencial, linhaOrigem: linha + 1 });
      continue;
    }
    const tramoPlanilha = tramoColuna == null ? undefined : valorDireto(sheet, linha, tramoColuna);
    if (tramoValido(tramoPlanilha) && tramoPlanilha.trim() !== tramo) {
      divergencias.push({ codigo: 'TRAMO_DIVERGENTE', bloqueante: true, sequencial, linhaOrigem: linha + 1 });
    }
    const marcos: Partial<Record<MarcoTramo, string>> = {};
    for (const { marco, cabecalho } of MARCOS) {
      const coluna = colunas.get(cabecalho);
      const data = coluna == null ? undefined : dataIso(valorDireto(sheet, linha, coluna));
      if (data) marcos[marco] = data;
    }
    const ordem = MARCOS.map(({ marco }) => marcos[marco]).filter((data): data is string => Boolean(data));
    if (ordem.some((data, indice) => indice > 0 && data < ordem[indice - 1])) {
      divergencias.push({ codigo: 'CRONOLOGIA_INVALIDA', bloqueante: true, sequencial, linhaOrigem: linha + 1 });
    }
    const reparo = colunas.get('reparodesolda');
    const reparosSolda = reparo == null ? null : valorDireto(sheet, linha, reparo);
    if (reparosSolda != null && (typeof reparosSolda !== 'number' || !Number.isInteger(reparosSolda) || reparosSolda < 0)) {
      divergencias.push({ codigo: 'REPARO_INVALIDO', bloqueante: true, sequencial, linhaOrigem: linha + 1 });
    }
    snapshots.push({
      linhaOrigem: linha + 1,
      sequencial,
      tramo,
      setor: String(valorDireto(sheet, linha, setorColuna) ?? '').trim(),
      atividade: String(valorDireto(sheet, linha, atividadeColuna) ?? '').trim(),
      reparosSolda: typeof reparosSolda === 'number' ? reparosSolda : null,
      marcos,
    });
  }
  return { snapshots, divergencias };
}

export function lerPlanilhaTramos(bytes: ArrayBuffer): ResultadoLeituraPlanilhaTramos {
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
  const torre = workbook.Sheets.TORRE;
  const tramos = workbook.Sheets.TRAMOS;
  if (!torre || !tramos) throw new Error('A planilha deve conter as abas TORRE e TRAMOS.');
  const cadastro = lerCadastro(torre);
  const apontamentos = lerSnapshots(tramos, cadastro.lookup);
  const contarMarco = (marco: MarcoTramo) => apontamentos.snapshots.filter(snapshot => Boolean(snapshot.marcos[marco])).length;
  const totaisDiretos: TotaisDiretosTramos = {
    inicio: contarMarco('inicio'),
    liberadoNav02: contarMarco('liberado_nav02'),
    liberadoJato: contarMarco('liberado_jato'),
    liberadoPatio: contarMarco('liberado_patio'),
    expedido: contarMarco('expedido'),
  };
  return {
    cadastro: cadastro.cadastro,
    snapshots: apontamentos.snapshots,
    totaisDiretos,
    divergencias: [...cadastro.divergencias, ...apontamentos.divergencias],
  };
}

export function validarPlanilhaTramos(resultado: ResultadoLeituraPlanilhaTramos): DivergenciaImportacaoTramos[] {
  const porSequencial = new Map<number, number>();
  for (const snapshot of resultado.snapshots) {
    porSequencial.set(snapshot.sequencial, (porSequencial.get(snapshot.sequencial) ?? 0) + 1);
  }
  const duplicados = [...porSequencial.entries()]
    .filter(([, quantidade]) => quantidade > 1)
    .map(([sequencial]) => ({ codigo: 'SEQUENCIAL_DUPLICADO' as const, bloqueante: true, sequencial }));
  return [...resultado.divergencias, ...duplicados];
}

export function resumoImportacao(resultado: ResultadoLeituraPlanilhaTramos, divergencias = validarPlanilhaTramos(resultado)) {
  return {
    cadastro: resultado.cadastro.length,
    snapshots: resultado.snapshots.length,
    ...resultado.totaisDiretos,
    bloqueios: divergencias.filter(divergencia => divergencia.bloqueante).length,
    avisos: divergencias.filter(divergencia => !divergencia.bloqueante).length,
  };
}
