/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dias úteis do processo de compra — segunda a sexta, sem feriados nacionais.
 *
 * Mesma regra da função `core_dias_uteis` do banco (migration
 * 20261110090000), que calcula `dias_em_aberto` e `atraso_comprador` na
 * `vw_sap_requisicoes_enriquecidas`. O aparelho refaz a conta porque guarda a
 * cópia da view e só a baixa de novo quando há importação SAP: sem isso, os
 * dias em aberto ficariam parados na data da última carga.
 *
 * Conta (de, ate]: o dia da solicitação não entra, o de referência entra.
 * RM de sexta vista na segunda está aberta há 1 dia útil; RM de hoje, 0.
 *
 * Feriado local (que não é nacional) precisa entrar nos dois lugares: na
 * tabela `core_feriados` e em `FERIADOS_EXTRAS` aqui.
 */

const DIA_MS = 86_400_000;

/** Feriados fora da lista nacional, `YYYY-MM-DD`. Manter igual à `core_feriados`. */
export const FERIADOS_EXTRAS: readonly string[] = [];

/** Número do dia (UTC) de uma data `YYYY-MM-DD`; aceita data com hora (usa os 10 primeiros caracteres). */
function numeroDia(dataISO: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dataISO ?? '').trim());
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DIA_MS);
}

/** 0 = domingo … 6 = sábado. 01/01/1970 (dia 0) foi quinta. */
const diaDaSemana = (n: number): number => (((n + 4) % 7) + 7) % 7;

const ehFimDeSemana = (n: number): boolean => {
  const d = diaDaSemana(n);
  return d === 0 || d === 6;
};

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), como número do dia. */
function pascoa(ano: number): number {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return Math.floor(Date.UTC(ano, mes - 1, dia) / DIA_MS);
}

/** Feriados nacionais do ano (Lei 662/1949 e Lei 14.759/2023), `YYYY-MM-DD`. */
export function feriadosNacionais(ano: number): string[] {
  const p = (mes: number, dia: number) => `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const sextaSanta = new Date((pascoa(ano) - 2) * DIA_MS).toISOString().slice(0, 10);
  return [p(1, 1), sextaSanta, p(4, 21), p(5, 1), p(9, 7), p(10, 12), p(11, 2), p(11, 15), p(11, 20), p(12, 25)].sort();
}

const cacheFeriadosAno = new Map<number, number[]>();

/** Feriados do ano que caem de segunda a sexta, como números do dia. */
function feriadosUteisDoAno(ano: number): number[] {
  let lista = cacheFeriadosAno.get(ano);
  if (!lista) {
    const extras = FERIADOS_EXTRAS.filter(d => d.startsWith(`${ano}-`));
    lista = [...new Set([...feriadosNacionais(ano), ...extras])]
      .map(numeroDia)
      .filter((n): n is number => n !== null && !ehFimDeSemana(n));
    cacheFeriadosAno.set(ano, lista);
  }
  return lista;
}

const anoDoDia = (n: number): number => new Date(n * DIA_MS).getUTCFullYear();

/**
 * Dias úteis em (de, ate]. Data inválida, ausente ou `ate <= de` dá 0.
 */
export function diasUteisEntre(deISO: string | null | undefined, ateISO: string | null | undefined): number {
  const de = deISO ? numeroDia(deISO) : null;
  const ate = ateISO ? numeroDia(ateISO) : null;
  if (de === null || ate === null || ate <= de) return 0;

  const total = ate - de;
  const semanas = Math.floor(total / 7);
  let uteis = semanas * 5;
  for (let k = 1; k <= total % 7; k++) if (!ehFimDeSemana(de + semanas * 7 + k)) uteis += 1;

  for (let ano = anoDoDia(de + 1); ano <= anoDoDia(ate); ano++) {
    for (const f of feriadosUteisDoAno(ano)) if (f > de && f <= ate) uteis -= 1;
  }
  return uteis;
}

/** `n` dias úteis depois de `dataISO` (o próprio dia não conta). Data inválida devolve null. */
export function somarDiasUteis(dataISO: string | null | undefined, n: number): string | null {
  let d = dataISO ? numeroDia(dataISO) : null;
  if (d === null) return null;
  let faltam = Math.max(0, Math.round(n));
  while (faltam > 0) {
    d += 1;
    if (!ehFimDeSemana(d) && !feriadosUteisDoAno(anoDoDia(d)).includes(d)) faltam -= 1;
  }
  return new Date(d * DIA_MS).toISOString().slice(0, 10);
}

/** "1 dia útil" / "3 dias úteis". */
export function rotuloDiasUteis(n: number): string {
  return `${n} ${n === 1 ? 'dia útil' : 'dias úteis'}`;
}

/** Faixa de atraso do comprador (dias úteis além da meta). */
export function faixaAtrasoComprador(atraso: number): string {
  if (atraso <= 0) return 'Sem Atraso';
  if (atraso <= 7) return '1-7 dias';
  if (atraso <= 15) return '8-15 dias';
  if (atraso <= 30) return '16-30 dias';
  return 'Acima 30 dias';
}

const NATUREZAS_URGENTES = new Set(['Urgente', 'Exportação urgente', 'Serviço - Urgente']);

/** Alerta do atraso, como na view (urgente com mais de 15 dias úteis escala). */
export function alertaAtrasoComprador(atraso: number, natureza: string | null | undefined): string {
  if (atraso > 15 && NATUREZAS_URGENTES.has(String(natureza ?? ''))) return '⚠️ ESCALAR IMEDIATAMENTE';
  if (atraso > 30) return '⚠️ AÇÃO URGENTE';
  if (atraso > 15) return '⚡ ACOMPANHAR';
  if (atraso > 7) return '📋 MONITORAR';
  return '✅ OK';
}

/** Status derivado só do atraso (quando não é "Concluído" nem "Em Cotação"). */
export function statusPorAtraso(atraso: number): string {
  if (atraso > 30) return 'Crítico - Ação Urgente';
  if (atraso > 15) return 'Atrasado';
  if (atraso > 0) return 'Em Andamento';
  return 'No Prazo';
}

export const STATUS_DERIVADOS_DO_ATRASO: ReadonlySet<string> = new Set([
  'Crítico - Ação Urgente', 'Atrasado', 'Em Andamento', 'No Prazo',
]);
