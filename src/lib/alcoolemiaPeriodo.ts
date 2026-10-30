/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Teste de Alcoolemia (SSMA) — recorte de período da lista e da exportação,
 * e a busca do colaborador na fila. Sem React e sem Supabase.
 *
 * Datas como string ISO (YYYY-MM-DD) e aritmética em UTC ao meio-dia: `new
 * Date('2026-09-01')` volta como 31/08 em UTC-3 (ver CLAUDE.md, regra 2).
 */

export type ModoPeriodo = 'dia' | 'semana' | 'mes' | 'periodo';

export const ROTULO_MODO_PERIODO: Record<ModoPeriodo, string> = {
  dia: 'Dia',
  semana: 'Semana',
  mes: 'Mês',
  periodo: 'Período',
};

export interface Intervalo {
  inicio: string;
  fim: string;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function paraData(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function paraISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function somarDias(iso: string, dias: number): string {
  const d = paraData(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return paraISO(d);
}

function somarMeses(iso: string, meses: number): string {
  const [y, m] = iso.split('-').map(Number);
  return paraISO(new Date(Date.UTC(y, m - 1 + meses, 1, 12)));
}

/** dd/mm — o ano só aparece quando o intervalo atravessa anos. */
function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function formatarDataBR(iso: string): string {
  return `${ddmm(iso)}/${iso.slice(0, 4)}`;
}

/**
 * Intervalo que a tela mostra. Semana vai de segunda a domingo (o turno do
 * pátio vira a semana na segunda). Em `periodo`, datas trocadas são
 * reordenadas em vez de devolver um intervalo vazio.
 */
export function intervaloDoPeriodo(modo: ModoPeriodo, referencia: string, inicio?: string, fim?: string): Intervalo {
  if (modo === 'dia') return { inicio: referencia, fim: referencia };
  if (modo === 'semana') {
    const diaSemana = paraData(referencia).getUTCDay(); // 0 = domingo
    const seg = somarDias(referencia, diaSemana === 0 ? -6 : 1 - diaSemana);
    return { inicio: seg, fim: somarDias(seg, 6) };
  }
  if (modo === 'mes') {
    const primeiro = `${referencia.slice(0, 7)}-01`;
    return { inicio: primeiro, fim: somarDias(somarMeses(primeiro, 1), -1) };
  }
  const a = inicio || referencia;
  const b = fim || a;
  return a <= b ? { inicio: a, fim: b } : { inicio: b, fim: a };
}

/** Anda um dia, uma semana ou um mês a partir da data de referência. */
export function navegarPeriodo(modo: ModoPeriodo, referencia: string, passo: number): string {
  if (modo === 'semana') return somarDias(referencia, 7 * passo);
  if (modo === 'mes') return somarMeses(`${referencia.slice(0, 7)}-01`, passo);
  return somarDias(referencia, passo);
}

/** Rótulo curto do intervalo: "Hoje", "30/10/2026", "27/10 a 02/11", "outubro de 2026". */
export function rotuloPeriodo(modo: ModoPeriodo, intervalo: Intervalo, hoje: string): string {
  const { inicio, fim } = intervalo;
  if (inicio === fim) return inicio === hoje ? `Hoje, ${ddmm(inicio)}` : formatarDataBR(inicio);
  if (modo === 'mes') {
    const mes = Number(inicio.slice(5, 7)) - 1;
    return `${MESES[mes]} de ${inicio.slice(0, 4)}`;
  }
  if (inicio.slice(0, 4) !== fim.slice(0, 4)) return `${formatarDataBR(inicio)} a ${formatarDataBR(fim)}`;
  return `${ddmm(inicio)} a ${ddmm(fim)}`;
}

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Cabeçalho de um dia na lista agrupada: "Hoje", "Ontem" ou "sexta, 30/10". */
export function rotuloDia(iso: string, hoje: string): string {
  if (iso === hoje) return 'Hoje';
  if (iso === somarDias(hoje, -1)) return 'Ontem';
  return `${DIAS_SEMANA[paraData(iso).getUTCDay()]}, ${ddmm(iso)}`;
}

/** Quantidade de dias do intervalo, contando as duas pontas. */
export function diasNoIntervalo({ inicio, fim }: Intervalo): number {
  return Math.round((paraData(fim).getTime() - paraData(inicio).getTime()) / 86_400_000) + 1;
}

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();

export interface TesteBuscavel {
  nome: string;
  matricula?: string | null;
  documento?: string | null;
  empresa?: string | null;
  cargo_funcao?: string | null;
  codigo_formulario?: string | null;
}

/**
 * Busca do colaborador que chegou no ambulatório: todos os termos precisam
 * aparecer, em qualquer ordem e sem acento — "andre araujo" acha "ANDRÉ
 * MURITIBA ARAÚJO". Também acha por matrícula, documento, empresa, função e
 * código do teste.
 */
export function testeCombinaBusca(t: TesteBuscavel, busca: string): boolean {
  const termos = normalizar(busca.trim()).split(/\s+/).filter(Boolean);
  if (termos.length === 0) return true;
  const alvo = normalizar([t.nome, t.matricula, t.documento, t.empresa, t.cargo_funcao, t.codigo_formulario].filter(Boolean).join(' '));
  return termos.every((termo) => alvo.includes(termo));
}

/** Agrupa a lista por data, na ordem em que os testes chegam (mais recente primeiro). */
export function agruparPorData<T extends { data: string }>(testes: T[]): { data: string; itens: T[] }[] {
  const grupos: { data: string; itens: T[] }[] = [];
  for (const t of testes) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.data === t.data) ultimo.itens.push(t);
    else grupos.push({ data: t.data, itens: [t] });
  }
  return grupos;
}
