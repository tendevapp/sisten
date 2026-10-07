/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Apontamento por tramo — regras puras (sem Supabase).
 *
 * O tramo segue uma trilha fixa de 5 marcos (as colunas de data da aba
 * TRAMOS da planilha). A etapa atual decorre do último marco; a situação
 * (Setor + Atividade da planilha) detalha onde ele está dentro da etapa.
 * Daqui saem também as análises que a planilha fazia por fórmula: "Dias"
 * entre marcos, Plan × Real mensal, ritmo necessário, curva S semanal.
 */

import { adicionarDias, semanaISO, semanasNoAno, type SemanaRef } from './producaoApontamentos';

// ---------------------------------------------------------------------------
// Marcos e etapas
// ---------------------------------------------------------------------------

export const MARCOS_TRAMO = ['inicio', 'liberado_nav02', 'liberado_jato', 'liberado_patio', 'expedido'] as const;
export type MarcoTramo = (typeof MARCOS_TRAMO)[number];

export const ROTULO_MARCO: Record<MarcoTramo, string> = {
  inicio: 'Início',
  liberado_nav02: 'Liberado p/ NAV02',
  liberado_jato: 'Liberado p/ Jato',
  liberado_patio: 'Liberado p/ Pátio',
  expedido: 'Expedido',
};

/** Como a planilha chama o indicador do marco no resumo mensal. */
export const INDICADOR_MARCO: Record<MarcoTramo, string> = {
  inicio: 'Início NAV01',
  liberado_nav02: 'NAV01',
  liberado_jato: 'Jato (Black)',
  liberado_patio: 'Greentag',
  expedido: 'Expedido',
};

export const ETAPAS_TRAMO = ['corte', 'nav01', 'nav02', 'jato', 'patio', 'expedido'] as const;
export type EtapaTramo = (typeof ETAPAS_TRAMO)[number];

export interface ConfigEtapa {
  rotulo: string;
  detalhe: string;
  /** Marco que tira o tramo desta etapa. */
  proximo: MarcoTramo | null;
  /** Marco que colocou o tramo nesta etapa. */
  entrada: MarcoTramo | null;
}

export const CONFIG_ETAPA: Record<EtapaTramo, ConfigEtapa> = {
  corte: { rotulo: 'A iniciar', detalhe: 'Corte e chapas', proximo: 'inicio', entrada: null },
  nav01: { rotulo: 'NAV01', detalhe: 'Calandra e visual', proximo: 'liberado_nav02', entrada: 'inicio' },
  nav02: { rotulo: 'NAV02', detalhe: 'SAW e Internos', proximo: 'liberado_jato', entrada: 'liberado_nav02' },
  jato: { rotulo: 'Jato / White', detalhe: 'Jato, pintura e montagem', proximo: 'liberado_patio', entrada: 'liberado_jato' },
  patio: { rotulo: 'Pátio', detalhe: 'Greentag, aguardando expedição', proximo: 'expedido', entrada: 'liberado_patio' },
  expedido: { rotulo: 'Expedido', detalhe: 'Enviado ao parque', proximo: null, entrada: 'expedido' },
};

export const ETAPA_APOS_MARCO: Record<MarcoTramo, EtapaTramo> = {
  inicio: 'nav01',
  liberado_nav02: 'nav02',
  liberado_jato: 'jato',
  liberado_patio: 'patio',
  expedido: 'expedido',
};

export const TIPOS_TRAMO = ['T1', 'T2', 'T3', 'T4', 'T5'] as const;

export interface TramoAtual {
  tramoId: string;
  serie: number;
  torreNumero: number;
  tramo: string;
  marcos: Partial<Record<MarcoTramo, string>>;
  etapa: EtapaTramo;
  situacaoId: string | null;
  setorAtual: string | null;
  atividadeAtual: string | null;
  situacaoEm: string | null;
  reparosSolda: number;
  ultimoEventoEm: string | null;
  eventos: number;
}

export interface SituacaoTramo {
  id: string;
  etapa: EtapaTramo;
  setor: string;
  atividade: string;
  categoriaEntrega: string;
  ordem: number;
  ativo: boolean;
}

export type TipoEvento = 'marco' | 'situacao' | 'reparo';

export interface EventoTramo {
  id: string;
  codigo: string;
  tramoId: string;
  tipo: TipoEvento;
  marco: MarcoTramo | null;
  dataOperacional: string;
  situacaoId: string | null;
  setor: string | null;
  atividade: string | null;
  reparosSolda: number | null;
  observacao: string | null;
  origem: 'manual' | 'importacao';
  criadoPor: string;
  createdAt: string;
  excluidoEm: string | null;
  motivoExclusao: string | null;
  corrigeEventoId: string | null;
}

export function etapaDosMarcos(marcos: Partial<Record<MarcoTramo, string>>): EtapaTramo {
  for (let i = MARCOS_TRAMO.length - 1; i >= 0; i -= 1) {
    if (marcos[MARCOS_TRAMO[i]]) return ETAPA_APOS_MARCO[MARCOS_TRAMO[i]];
  }
  return 'corte';
}

/** Situações oferecidas ao registrar: as da etapa em que o tramo vai ficar. */
export function situacoesDaEtapa(situacoes: SituacaoTramo[], etapa: EtapaTramo): SituacaoTramo[] {
  return situacoes.filter(s => s.ativo && s.etapa === etapa).sort((a, b) => a.ordem - b.ordem);
}

// ---------------------------------------------------------------------------
// Datas (strings yyyy-MM-dd, sem `new Date('yyyy-mm-dd')` — UTC-3)
// ---------------------------------------------------------------------------

const DIA_MS = 86400000;
const utc = (dataISO: string): number => {
  const [a, m, d] = dataISO.slice(0, 10).split('-').map(Number);
  return Date.UTC(a, m - 1, d);
};

export function diasEntre(de: string, ate: string): number {
  return Math.round((utc(ate) - utc(de)) / DIA_MS);
}

export const dataCurta = (dataISO: string): string => `${dataISO.slice(8, 10)}/${dataISO.slice(5, 7)}/${dataISO.slice(2, 4)}`;

const diaDaSemana = (dataISO: string): number => new Date(utc(dataISO)).getUTCDay();

/** Dias úteis (seg–sex) de `de` a `ate`, inclusive. Feriados não entram. */
export function diasUteis(de: string, ate: string): number {
  if (ate < de) return 0;
  let total = 0;
  for (let d = de; d <= ate; d = adicionarDias(d, 1)) {
    const dia = diaDaSemana(d);
    if (dia !== 0 && dia !== 6) total += 1;
  }
  return total;
}

/** Data em que `n` dias úteis depois de `de` terminam. */
export function adicionarDiasUteis(de: string, n: number): string {
  let data = de;
  let restantes = Math.ceil(n);
  while (restantes > 0) {
    data = adicionarDias(data, 1);
    const dia = diaDaSemana(data);
    if (dia !== 0 && dia !== 6) restantes -= 1;
  }
  return data;
}

/** Dia útil anterior: na segunda, a sexta. */
export function diaUtilAnterior(dataISO: string): string {
  let data = adicionarDias(dataISO, -1);
  while (diaDaSemana(data) === 0 || diaDaSemana(data) === 6) data = adicionarDias(data, -1);
  return data;
}

export const chaveMes = (dataISO: string): string => dataISO.slice(0, 7);

const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeMes = (mes: string): string => NOMES_MES[Number(mes.slice(5, 7)) - 1] ?? mes;
export const nomeMesCurto = (mes: string): string => {
  const nome = nomeMes(mes);
  return nome.charAt(0).toUpperCase() + nome.slice(1, 3);
};

export function mesesDoIntervalo(de: string, ate: string): string[] {
  const meses: string[] = [];
  let [a, m] = de.split('-').map(Number);
  const [aFim, mFim] = ate.split('-').map(Number);
  while (a < aFim || (a === aFim && m <= mFim)) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return meses;
}

const ultimoDiaDoMes = (mes: string): string => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Cronologia (espelho da regra do banco, para avisar antes de enviar)
// ---------------------------------------------------------------------------

export function validarMarco(
  marcos: Partial<Record<MarcoTramo, string>>,
  marco: MarcoTramo,
  data: string,
  hoje: string,
): string | null {
  if (!data) return 'Informe a data.';
  if (data > hoje) return 'A data não pode ser futura.';
  if (marcos[marco]) return `O tramo já tem o marco "${ROTULO_MARCO[marco]}". Use Corrigir para mudar a data.`;
  const pos = MARCOS_TRAMO.indexOf(marco);
  const anterior = pos > 0 ? MARCOS_TRAMO[pos - 1] : null;
  if (anterior) {
    const dataAnterior = marcos[anterior];
    if (!dataAnterior) return `"${ROTULO_MARCO[marco]}" exige "${ROTULO_MARCO[anterior]}" antes.`;
    if (data < dataAnterior) {
      return `"${ROTULO_MARCO[marco]}" (${dataCurta(data)}) não pode ser antes de "${ROTULO_MARCO[anterior]}" (${dataCurta(dataAnterior)}).`;
    }
  }
  const seguinte = MARCOS_TRAMO[pos + 1];
  if (seguinte && marcos[seguinte] && data > marcos[seguinte]!) {
    return `"${ROTULO_MARCO[marco]}" (${dataCurta(data)}) não pode ser depois de "${ROTULO_MARCO[seguinte]}" (${dataCurta(marcos[seguinte]!)}).`;
  }
  return null;
}

/** Lançamento com mais de 7 dias exige observação (o banco também exige). */
export const exigeObservacao = (data: string, hoje: string): boolean => diasEntre(data, hoje) > 7;

// ---------------------------------------------------------------------------
// Tempo na etapa e lead time ("Dias" da planilha)
// ---------------------------------------------------------------------------

export function entradaNaEtapa(t: Pick<TramoAtual, 'etapa' | 'marcos'>): string | null {
  const marco = CONFIG_ETAPA[t.etapa].entrada;
  return marco ? t.marcos[marco] ?? null : null;
}

/** Dias desde que o tramo entrou na etapa atual (não conta para expedidos). */
export function diasNaEtapa(t: Pick<TramoAtual, 'etapa' | 'marcos'>, hoje: string): number | null {
  if (t.etapa === 'expedido') return null;
  const entrada = entradaNaEtapa(t);
  return entrada ? Math.max(0, diasEntre(entrada, hoje)) : null;
}

export interface Trecho {
  id: string;
  de: MarcoTramo;
  ate: MarcoTramo;
  rotulo: string;
  /** Etapa que o trecho mede, quando é uma etapa só. */
  etapa?: EtapaTramo;
}

export const TRECHOS: Trecho[] = [
  { id: 'nav01', de: 'inicio', ate: 'liberado_nav02', rotulo: 'NAV01 (Início → NAV02)', etapa: 'nav01' },
  { id: 'nav02', de: 'liberado_nav02', ate: 'liberado_jato', rotulo: 'NAV02 → Jato', etapa: 'nav02' },
  { id: 'jato', de: 'liberado_jato', ate: 'liberado_patio', rotulo: 'Jato → Pátio', etapa: 'jato' },
  { id: 'patio', de: 'liberado_patio', ate: 'expedido', rotulo: 'Pátio → Expedido', etapa: 'patio' },
  { id: 'processo', de: 'liberado_nav02', ate: 'liberado_patio', rotulo: 'Dias em processo (NAV02 → Pátio)' },
  { id: 'total', de: 'inicio', ate: 'expedido', rotulo: 'Início × Fim' },
];

export interface DuracaoTramo {
  tramo: TramoAtual;
  dias: number;
  concluidoEm: string;
}

export function duracoesTrecho(tramos: TramoAtual[], trecho: Trecho): DuracaoTramo[] {
  return tramos.flatMap(tramo => {
    const de = tramo.marcos[trecho.de];
    const ate = tramo.marcos[trecho.ate];
    return de && ate ? [{ tramo, dias: diasEntre(de, ate), concluidoEm: ate }] : [];
  });
}

/** Quantil com interpolação linear (q entre 0 e 1). */
export function quantil(valores: number[], q: number): number | null {
  if (!valores.length) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const pos = (ordenados.length - 1) * q;
  const base = Math.floor(pos);
  const resto = pos - base;
  return ordenados[base + 1] !== undefined ? ordenados[base] + resto * (ordenados[base + 1] - ordenados[base]) : ordenados[base];
}

export interface ResumoDuracoes {
  n: number;
  mediana: number | null;
  p80: number | null;
  maximo: number | null;
}

export function resumoDuracoes(dias: number[]): ResumoDuracoes {
  return {
    n: dias.length,
    mediana: quantil(dias, 0.5),
    p80: quantil(dias, 0.8),
    maximo: dias.length ? Math.max(...dias) : null,
  };
}

export function leadTimePorMes(tramos: TramoAtual[], trecho: Trecho): Array<ResumoDuracoes & { mes: string }> {
  const porMes = new Map<string, number[]>();
  for (const d of duracoesTrecho(tramos, trecho)) {
    const mes = chaveMes(d.concluidoEm);
    porMes.set(mes, [...(porMes.get(mes) ?? []), d.dias]);
  }
  return [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, dias]) => ({ mes, ...resumoDuracoes(dias) }));
}

export type FaixaEspera = 'normal' | 'alerta' | 'critico';

export interface ReferenciaEspera {
  alerta: number;
  critico: number;
  /** Quantos tramos já concluíram a etapa (base da referência). */
  base: number;
}

/**
 * "Parado demais" é relativo à própria etapa: acima da mediana histórica
 * do trecho = alerta, acima do P80 = crítico. Com menos de 5 tramos
 * concluídos, usa 30/60 dias.
 */
export function referenciasEspera(tramos: TramoAtual[]): Record<EtapaTramo, ReferenciaEspera> {
  const padrao = (base: number): ReferenciaEspera => ({ alerta: 30, critico: 60, base });
  const refs = Object.fromEntries(ETAPAS_TRAMO.map(e => [e, padrao(0)])) as Record<EtapaTramo, ReferenciaEspera>;
  for (const trecho of TRECHOS) {
    if (!trecho.etapa) continue;
    const dias = duracoesTrecho(tramos, trecho).map(d => d.dias);
    const r = resumoDuracoes(dias);
    refs[trecho.etapa] = dias.length >= 5 && r.mediana !== null && r.p80 !== null
      ? { alerta: Math.round(r.mediana), critico: Math.max(Math.round(r.p80), Math.round(r.mediana) + 1), base: dias.length }
      : padrao(dias.length);
  }
  return refs;
}

export function faixaEspera(dias: number | null, ref: ReferenciaEspera): FaixaEspera {
  if (dias === null) return 'normal';
  if (dias > ref.critico) return 'critico';
  if (dias > ref.alerta) return 'alerta';
  return 'normal';
}

export const FAIXAS_ENVELHECIMENTO = [
  { id: 'ate15', rotulo: '0–15 dias', min: 0, max: 15 },
  { id: 'ate30', rotulo: '16–30 dias', min: 16, max: 30 },
  { id: 'ate60', rotulo: '31–60 dias', min: 31, max: 60 },
  { id: 'mais60', rotulo: '> 60 dias', min: 61, max: Infinity },
] as const;

export type LinhaEnvelhecimento = { etapa: EtapaTramo; total: number } & Record<(typeof FAIXAS_ENVELHECIMENTO)[number]['id'], number>;

/** Tramos em processo agora, por etapa e faixa de dias parados. */
export function envelhecimento(tramos: TramoAtual[], hoje: string): LinhaEnvelhecimento[] {
  const etapas: EtapaTramo[] = ['nav01', 'nav02', 'jato', 'patio'];
  return etapas.map(etapa => {
    const linha = { etapa, total: 0, ate15: 0, ate30: 0, ate60: 0, mais60: 0 } as LinhaEnvelhecimento;
    for (const t of tramos) {
      if (t.etapa !== etapa) continue;
      const dias = diasNaEtapa(t, hoje);
      if (dias === null) continue;
      const faixa = FAIXAS_ENVELHECIMENTO.find(f => dias >= f.min && dias <= f.max)!;
      linha[faixa.id] += 1;
      linha.total += 1;
    }
    return linha;
  });
}

// ---------------------------------------------------------------------------
// Metas, Plan × Real e ritmo
// ---------------------------------------------------------------------------

export interface MetaMarco {
  marco: MarcoTramo;
  granularidade: 'mes' | 'semana';
  ano: number;
  periodo: number;
  quantidade: number;
}

export interface PrazoMarco {
  marco: MarcoTramo;
  total: number;
  prazo: string | null;
}

export function realizadoPorMes(tramos: TramoAtual[], marco: MarcoTramo): Map<string, number> {
  const porMes = new Map<string, number>();
  for (const t of tramos) {
    const data = t.marcos[marco];
    if (data) porMes.set(chaveMes(data), (porMes.get(chaveMes(data)) ?? 0) + 1);
  }
  return porMes;
}

export const contarMarco = (tramos: TramoAtual[], marco: MarcoTramo): number => tramos.filter(t => t.marcos[marco]).length;

export function metaMensal(metas: MetaMarco[], marco: MarcoTramo, mes: string): number | null {
  const [ano, m] = mes.split('-').map(Number);
  return metas.find(x => x.marco === marco && x.granularidade === 'mes' && x.ano === ano && x.periodo === m)?.quantidade ?? null;
}

export type SituacaoMes = 'atingido' | 'abaixo' | 'andamento' | 'vazio';

export interface CelulaMensal {
  mes: string;
  plan: number | null;
  real: number;
  situacao: SituacaoMes;
}

/** Plan × Real de um marco por mês; o mês corrente fica "em andamento" até fechar. */
export function linhaMensal(tramos: TramoAtual[], metas: MetaMarco[], marco: MarcoTramo, meses: string[], mesAtual: string): CelulaMensal[] {
  const real = realizadoPorMes(tramos, marco);
  return meses.map(mes => {
    const plan = metaMensal(metas, marco, mes);
    const r = real.get(mes) ?? 0;
    let situacao: SituacaoMes = 'vazio';
    if (mes > mesAtual) situacao = 'vazio';
    else if (plan === null || plan === 0) situacao = r > 0 ? 'atingido' : 'vazio';
    else if (r >= plan) situacao = 'atingido';
    else situacao = mes === mesAtual ? 'andamento' : 'abaixo';
    return { mes, plan, real: r, situacao };
  });
}

/** Meses da tabela: do primeiro com meta ou realizado até o último com meta (ou o atual). */
export function mesesDoPainel(tramos: TramoAtual[], metas: MetaMarco[], marcos: readonly MarcoTramo[], mesAtual: string): string[] {
  const meses = new Set<string>([mesAtual]);
  for (const m of metas) if (m.granularidade === 'mes' && marcos.includes(m.marco)) meses.add(`${m.ano}-${String(m.periodo).padStart(2, '0')}`);
  for (const t of tramos) for (const marco of marcos) if (t.marcos[marco]) meses.add(chaveMes(t.marcos[marco]!));
  const ordenados = [...meses].sort();
  return mesesDoIntervalo(ordenados[0], ordenados[ordenados.length - 1]);
}

export interface IndicadoresMarco {
  marco: MarcoTramo;
  realizado: number;
  total: number;
  saldo: number;
  percentual: number;
  prazo: string | null;
  diasUteisRestantes: number | null;
  /** Tramos por dia útil para fechar o saldo até o prazo. */
  ritmoNecessario: number | null;
  /** Tramos por dia útil nas últimas 4 semanas. */
  ritmoReal: number;
  /** Data em que o saldo acaba no ritmo real (null sem ritmo). */
  previsao: string | null;
  atrasado: boolean;
}

export function ritmoReal(tramos: TramoAtual[], marco: MarcoTramo, hoje: string, janelaDias = 28): number {
  const inicio = adicionarDias(hoje, -(janelaDias - 1));
  const feitos = tramos.filter(t => {
    const d = t.marcos[marco];
    return d && d >= inicio && d <= hoje;
  }).length;
  const uteis = diasUteis(inicio, hoje);
  return uteis ? feitos / uteis : 0;
}

export function indicadoresMarco(tramos: TramoAtual[], marco: MarcoTramo, prazo: PrazoMarco | undefined, hoje: string): IndicadoresMarco {
  const total = prazo?.total ?? tramos.length;
  const realizado = contarMarco(tramos, marco);
  const saldo = Math.max(0, total - realizado);
  const dataPrazo = prazo?.prazo ?? null;
  const restantes = dataPrazo ? diasUteis(hoje, dataPrazo) : null;
  const ritmo = ritmoReal(tramos, marco, hoje);
  const previsao = saldo === 0 ? null : ritmo > 0 ? adicionarDiasUteis(hoje, saldo / ritmo) : null;
  return {
    marco,
    realizado,
    total,
    saldo,
    percentual: total ? realizado / total : 0,
    prazo: dataPrazo,
    diasUteisRestantes: restantes,
    ritmoNecessario: restantes === null || saldo === 0 ? null : restantes > 0 ? saldo / restantes : Infinity,
    ritmoReal: ritmo,
    previsao,
    atrasado: saldo > 0 && !!dataPrazo && (previsao === null || previsao > dataPrazo),
  };
}

// ---------------------------------------------------------------------------
// Curva S semanal
// ---------------------------------------------------------------------------

export interface PontoCurva {
  semana: SemanaRef;
  rotulo: string;
  plan: number | null;
  real: number | null;
  planAcum: number | null;
  realAcum: number | null;
  projecao: number | null;
}

/**
 * Plano semanal de um marco: usa a meta semanal a partir da 1ª semana que a
 * tem; antes disso (e para marcos só com meta mensal) a meta do mês entra na
 * semana do último dia do mês. É o que a planilha faz no Jato: "Julho" = 22
 * acumulado, e W32 em diante semana a semana.
 */
export function planoSemanal(metas: MetaMarco[], marco: MarcoTramo, ano: number): Map<number, number> {
  const semanais = metas.filter(m => m.marco === marco && m.granularidade === 'semana' && m.ano === ano);
  const primeiraSemanal = semanais.length ? Math.min(...semanais.map(m => m.periodo)) : Infinity;
  const plano = new Map<number, number>();
  for (const m of metas) {
    if (m.marco !== marco || m.granularidade !== 'mes' || m.ano !== ano) continue;
    const ultimo = ultimoDiaDoMes(`${ano}-${String(m.periodo).padStart(2, '0')}`);
    const ref = semanaISO(ultimo);
    const semana = ref.ano === ano ? ref.semana : semanasNoAno(ano);
    if (semana >= primeiraSemanal) continue;
    plano.set(semana, (plano.get(semana) ?? 0) + m.quantidade);
  }
  for (const m of semanais) plano.set(m.periodo, (plano.get(m.periodo) ?? 0) + m.quantidade);
  return plano;
}

export function curvaSemanal(entrada: {
  tramos: TramoAtual[];
  metas: MetaMarco[];
  marco: MarcoTramo;
  total: number;
  ano: number;
  semanaAtual: SemanaRef;
}): PontoCurva[] {
  const { tramos, metas, marco, total, ano, semanaAtual } = entrada;
  const plano = planoSemanal(metas, marco, ano);
  const real = new Map<number, number>();
  for (const t of tramos) {
    const d = t.marcos[marco];
    if (!d) continue;
    const ref = semanaISO(d);
    if (ref.ano === ano) real.set(ref.semana, (real.get(ref.semana) ?? 0) + 1);
  }
  const atual = semanaAtual.ano === ano ? semanaAtual.semana : semanaAtual.ano > ano ? semanasNoAno(ano) : 0;
  const comDados = [...plano.keys(), ...real.keys()];
  if (!comDados.length) return [];
  const primeira = Math.min(...comDados);
  const ultima = Math.min(semanasNoAno(ano), Math.max(...plano.keys(), atual + 4));

  // Ritmo semanal das 4 semanas completas anteriores à atual.
  const janela = [1, 2, 3, 4].map(k => real.get(atual - k) ?? 0);
  const ritmo = janela.reduce((a, b) => a + b, 0) / 4;

  const pontos: PontoCurva[] = [];
  let planAcum = 0;
  let realAcum = 0;
  let realNaAtual = 0;
  for (let semana = 1; semana <= ultima; semana += 1) {
    const p = plano.get(semana) ?? 0;
    const r = real.get(semana) ?? 0;
    planAcum += p;
    if (semana <= atual) realAcum += r;
    if (semana === atual) realNaAtual = realAcum;
    if (semana < primeira) continue;
    const futura = semana > atual;
    pontos.push({
      semana: { ano, semana },
      rotulo: `W${String(semana).padStart(2, '0')}`,
      plan: plano.has(semana) ? p : null,
      real: futura ? null : r,
      planAcum: Math.min(planAcum, total),
      realAcum: futura ? null : realAcum,
      projecao: semana < atual || ritmo === 0 ? null : Math.min(total, Math.round((realNaAtual + ritmo * (semana - atual)) * 10) / 10),
    });
  }
  return pontos;
}

// ---------------------------------------------------------------------------
// Torres e qualidade
// ---------------------------------------------------------------------------

export interface ResumoTorre {
  torre: number;
  tramos: TramoAtual[];
  /** Os 5 tramos no pátio ou expedidos, com ao menos um ainda no pátio. */
  prontaParaExpedir: boolean;
  expedida: boolean;
}

export function resumoTorres(tramos: TramoAtual[]): ResumoTorre[] {
  const porTorre = new Map<number, TramoAtual[]>();
  for (const t of tramos) porTorre.set(t.torreNumero, [...(porTorre.get(t.torreNumero) ?? []), t]);
  return [...porTorre.entries()]
    .sort(([a], [b]) => a - b)
    .map(([torre, lista]) => {
      const ordenados = [...lista].sort((a, b) => a.tramo.localeCompare(b.tramo));
      const noFim = ordenados.length === 5 && ordenados.every(t => t.etapa === 'patio' || t.etapa === 'expedido');
      const expedida = ordenados.length === 5 && ordenados.every(t => t.etapa === 'expedido');
      return { torre, tramos: ordenados, prontaParaExpedir: noFim && !expedida, expedida };
    });
}

export function reparosPorMes(eventos: Pick<EventoTramo, 'tipo' | 'dataOperacional' | 'reparosSolda' | 'excluidoEm'>[]): Map<string, number> {
  const porMes = new Map<string, number>();
  for (const e of eventos) {
    if (e.tipo !== 'reparo' || e.excluidoEm || !e.reparosSolda) continue;
    const mes = chaveMes(e.dataOperacional);
    porMes.set(mes, (porMes.get(mes) ?? 0) + e.reparosSolda);
  }
  return porMes;
}

export function reparosPorTipo(tramos: TramoAtual[]): Array<{ tipo: string; tramos: number; reparos: number; media: number }> {
  return TIPOS_TRAMO.map(tipo => {
    const doTipo = tramos.filter(t => t.tramo === tipo && t.etapa !== 'corte');
    const reparos = doTipo.reduce((soma, t) => soma + t.reparosSolda, 0);
    return { tipo, tramos: doTipo.length, reparos, media: doTipo.length ? reparos / doTipo.length : 0 };
  });
}
