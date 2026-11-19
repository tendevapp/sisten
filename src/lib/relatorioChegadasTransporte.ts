/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Portaria › Chegada de Transportes (FRM.SGP-0009) — relatório de chegadas:
 * pontualidade por leva (janela de horário), atrasos e recorrências.
 *
 * O "turno" gravado no registro é o plantão do vigilante, não o turno dos
 * colaboradores — por isso a chegada é classificada pela janela de horário
 * (`port_transporte_janelas`) em que caiu. Janela que atravessa a meia-noite
 * (22h–05h) conta a madrugada no dia em que a janela começou.
 *
 * Referência de cada chegada:
 *  - a janela tem horário limite oficial → limite + tolerância;
 *  - senão, o horário habitual da rota naquela janela (mediana do histórico,
 *    com pelo menos `AMOSTRA_MINIMA_HABITUAL` chegadas) + tolerância.
 *
 * Módulo puro. Horas sempre como texto "HH:MM" e datas como ISO (sem
 * `new Date('YYYY-MM-DD')`, que volta um dia em UTC-3).
 */

import type { PortRegistroTransporte } from '../types';

export interface JanelaChegada {
  id: string;
  nome: string;
  inicio: string;
  fim: string;
  /** Horário oficial de chegada; nulo = habitual da rota. */
  limite: string | null;
  tolerancia_min: number;
  ordem: number;
  ativo: boolean;
}

export type SituacaoChegada = 'no_horario' | 'atraso' | 'sem_referencia' | 'fora_janela';
export type OcupacaoChegada = 'com' | 'vazio' | 'outro';

export interface ChegadaAvaliada {
  registro: PortRegistroTransporte;
  rota: string;
  janela: JanelaChegada | null;
  /** Dia da leva (a madrugada conta no dia em que a janela começou). */
  dia: string;
  hora: string;
  /** Horário contra o qual a chegada foi medida (sem a tolerância). */
  referencia: string | null;
  origemReferencia: 'limite' | 'habitual' | null;
  /** Minutos depois da referência (negativo = adiantado). */
  atrasoMin: number;
  situacao: SituacaoChegada;
  ocupacao: OcupacaoChegada;
}

export const SEM_ROTA = 'SEM ROTA';
export const AMOSTRA_MINIMA_HABITUAL = 3;
const DIA = 1440;

// ---------------------------------------------------------------------------
// Horas e datas
// ---------------------------------------------------------------------------

export function minutosDaHora(h: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((h ?? '').trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v < DIA ? v : null;
}

export function horaDosMinutos(min: number): string {
  const v = ((Math.round(min) % DIA) + DIA) % DIA;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d) + dias * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export const ROTULO_DIA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ---------------------------------------------------------------------------
// Janelas
// ---------------------------------------------------------------------------

export function atravessaMeiaNoite(j: Pick<JanelaChegada, 'inicio' | 'fim'>): boolean {
  return (minutosDaHora(j.fim) ?? 0) <= (minutosDaHora(j.inicio) ?? 0);
}

export function dentroDaJanela(min: number, j: Pick<JanelaChegada, 'inicio' | 'fim'>): boolean {
  const i = minutosDaHora(j.inicio) ?? 0;
  const f = minutosDaHora(j.fim) ?? 0;
  return i < f ? min >= i && min < f : min >= i || min < f;
}

/** Minutos desde o início da janela — compara 23:50 e 00:10 na mesma escala. */
export function deslocamentoNaJanela(min: number, j: Pick<JanelaChegada, 'inicio'>): number {
  return (min - (minutosDaHora(j.inicio) ?? 0) + DIA) % DIA;
}

export function janelaDaHora(min: number | null, janelas: JanelaChegada[]): JanelaChegada | null {
  if (min == null) return null;
  return [...janelas].filter(j => j.ativo).sort((a, b) => a.ordem - b.ordem).find(j => dentroDaJanela(min, j)) ?? null;
}

/** Dia da leva: na janela que atravessa a meia-noite, a madrugada volta um dia. */
export function diaOperacional(dataISO: string, min: number, j: JanelaChegada | null): string {
  if (j && atravessaMeiaNoite(j) && min < (minutosDaHora(j.fim) ?? 0)) return somarDias(dataISO, -1);
  return dataISO.slice(0, 10);
}

/**
 * Janelas sobrepostas ou com horário inválido — a edição avisa antes de
 * gravar. Devolve a lista de problemas (vazia = ok).
 */
export function problemasDasJanelas(janelas: Pick<JanelaChegada, 'nome' | 'inicio' | 'fim' | 'limite' | 'ativo'>[]): string[] {
  const out: string[] = [];
  const ativas = janelas.filter(j => j.ativo);
  for (const j of janelas) {
    if (!j.nome.trim()) out.push('Toda janela precisa de nome.');
    if (minutosDaHora(j.inicio) == null || minutosDaHora(j.fim) == null) out.push(`${j.nome || 'Janela'}: início e fim são obrigatórios.`);
    else if (j.inicio.slice(0, 5) === j.fim.slice(0, 5)) out.push(`${j.nome}: início e fim iguais.`);
    if (j.limite && minutosDaHora(j.limite) != null && minutosDaHora(j.inicio) != null
        && !dentroDaJanela(minutosDaHora(j.limite)!, j)) out.push(`${j.nome}: o horário limite fica fora da janela.`);
  }
  for (let a = 0; a < ativas.length; a++) {
    for (let b = a + 1; b < ativas.length; b++) {
      const x = ativas[a], y = ativas[b];
      const ix = minutosDaHora(x.inicio), iy = minutosDaHora(y.inicio);
      if (ix == null || iy == null) continue;
      if (dentroDaJanela(ix, y) || dentroDaJanela(iy, x)) out.push(`${x.nome} e ${y.nome} se sobrepõem.`);
    }
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// Avaliação
// ---------------------------------------------------------------------------

export function rotaDoRegistro(r: Pick<PortRegistroTransporte, 'rota'>): string {
  return (r.rota ?? '').trim().toUpperCase() || SEM_ROTA;
}

export function ocupacaoDoRegistro(o: string | null | undefined): OcupacaoChegada {
  const t = (o ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (t.startsWith('SIM')) return 'com';
  if (t.startsWith('NAO')) return 'vazio';
  return 'outro';
}

function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2);
}

function percentil(valores: number[], p: number): number | null {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)];
}

/**
 * Avalia cada chegada. `historico` (padrão: os próprios registros) é a base do
 * horário habitual — passe um período maior que o filtrado para a referência
 * não oscilar com o filtro de 7 dias.
 */
export function avaliarChegadas(
  registros: PortRegistroTransporte[],
  janelas: JanelaChegada[],
  historico: PortRegistroTransporte[] = registros,
): ChegadaAvaliada[] {
  const base = (r: PortRegistroTransporte) => {
    const min = minutosDaHora(r.hora_chegada);
    const janela = janelaDaHora(min, janelas);
    return { min, janela };
  };

  const amostras = new Map<string, number[]>();
  for (const r of historico) {
    if (r.excluido_em) continue;
    const { min, janela } = base(r);
    if (min == null || !janela) continue;
    const k = `${janela.id}|${rotaDoRegistro(r)}`;
    const lista = amostras.get(k) ?? [];
    lista.push(deslocamentoNaJanela(min, janela));
    amostras.set(k, lista);
  }
  const habitual = new Map<string, number>();
  for (const [k, lista] of amostras) {
    if (lista.length >= AMOSTRA_MINIMA_HABITUAL) habitual.set(k, mediana(lista)!);
  }

  const out: ChegadaAvaliada[] = [];
  for (const r of registros) {
    if (r.excluido_em) continue;
    const { min, janela } = base(r);
    const rota = rotaDoRegistro(r);
    const ocupacao = ocupacaoDoRegistro(r.ocupacao);
    if (min == null || !janela) {
      out.push({
        registro: r, rota, janela: null, dia: r.data.slice(0, 10), hora: (r.hora_chegada ?? '').slice(0, 5),
        referencia: null, origemReferencia: null, atrasoMin: 0, situacao: 'fora_janela', ocupacao,
      });
      continue;
    }
    const desloc = deslocamentoNaJanela(min, janela);
    const limiteMin = minutosDaHora(janela.limite);
    const refDesloc = limiteMin != null ? deslocamentoNaJanela(limiteMin, janela) : habitual.get(`${janela.id}|${rota}`) ?? null;
    const origemReferencia = limiteMin != null ? 'limite' : refDesloc != null ? 'habitual' : null;
    const atrasoMin = refDesloc == null ? 0 : desloc - refDesloc;
    out.push({
      registro: r,
      rota,
      janela,
      dia: diaOperacional(r.data, min, janela),
      hora: horaDosMinutos(min),
      referencia: refDesloc == null ? null : horaDosMinutos((minutosDaHora(janela.inicio) ?? 0) + refDesloc),
      origemReferencia,
      atrasoMin,
      situacao: refDesloc == null ? 'sem_referencia' : atrasoMin > janela.tolerancia_min ? 'atraso' : 'no_horario',
      ocupacao,
    });
  }
  return out.sort((a, b) => b.dia.localeCompare(a.dia) || (a.janela?.ordem ?? 99) - (b.janela?.ordem ?? 99) || a.hora.localeCompare(b.hora));
}

// ---------------------------------------------------------------------------
// Resumos
// ---------------------------------------------------------------------------

const avaliada = (c: ChegadaAvaliada) => c.situacao === 'no_horario' || c.situacao === 'atraso';

export interface ResumoChegadas {
  total: number;
  avaliadas: number;
  noHorario: number;
  atrasos: number;
  /** 0–1; nulo sem chegada avaliada. */
  pontualidade: number | null;
  atrasoMedio: number | null;
  maiorAtraso: ChegadaAvaliada | null;
  semRota: number;
  foraJanela: number;
  dias: number;
}

export function resumirChegadas(av: ChegadaAvaliada[]): ResumoChegadas {
  const avaliadas = av.filter(avaliada);
  const atrasos = avaliadas.filter(c => c.situacao === 'atraso');
  return {
    total: av.length,
    avaliadas: avaliadas.length,
    noHorario: avaliadas.length - atrasos.length,
    atrasos: atrasos.length,
    pontualidade: avaliadas.length ? (avaliadas.length - atrasos.length) / avaliadas.length : null,
    atrasoMedio: atrasos.length ? Math.round(atrasos.reduce((s, c) => s + c.atrasoMin, 0) / atrasos.length) : null,
    maiorAtraso: atrasos.reduce<ChegadaAvaliada | null>((m, c) => (!m || c.atrasoMin > m.atrasoMin ? c : m), null),
    semRota: av.filter(c => c.rota === SEM_ROTA).length,
    foraJanela: av.filter(c => c.situacao === 'fora_janela').length,
    dias: new Set(av.map(c => c.dia)).size,
  };
}

export interface ResumoJanela {
  janela: JanelaChegada;
  chegadas: number;
  avaliadas: number;
  atrasos: number;
  pontualidade: number | null;
  /** Hora mediana e a do 90º percentil das chegadas. */
  mediana: string | null;
  p90: string | null;
}

export function resumoPorJanela(av: ChegadaAvaliada[], janelas: JanelaChegada[]): ResumoJanela[] {
  return [...janelas].filter(j => j.ativo).sort((a, b) => a.ordem - b.ordem).map(janela => {
    const daqui = av.filter(c => c.janela?.id === janela.id);
    const avals = daqui.filter(avaliada);
    const atrasos = avals.filter(c => c.situacao === 'atraso').length;
    const desloc = daqui.map(c => deslocamentoNaJanela(minutosDaHora(c.hora) ?? 0, janela));
    const ini = minutosDaHora(janela.inicio) ?? 0;
    const med = mediana(desloc);
    const p90 = percentil(desloc, 0.9);
    return {
      janela,
      chegadas: daqui.length,
      avaliadas: avals.length,
      atrasos,
      pontualidade: avals.length ? (avals.length - atrasos) / avals.length : null,
      mediana: med == null ? null : horaDosMinutos(ini + med),
      p90: p90 == null ? null : horaDosMinutos(ini + p90),
    };
  });
}

export interface LinhaRanking {
  /** Chave normalizada (sem acento, maiúscula). */
  chave: string;
  /** Grafia mais usada nos lançamentos. */
  rotulo: string;
  chegadas: number;
  avaliadas: number;
  atrasos: number;
  pontualidade: number | null;
  atrasoMedio: number | null;
  /** Dias (da leva) com atraso, mais recentes primeiro. */
  diasComAtraso: string[];
  /** Atraso que se repete: 3+ dias, ou 2+ dias e 25%+ das chegadas. */
  recorrente: boolean;
}

/** "Guimarães " e "GUIMARAES" são a mesma empresa. */
export function normalizarChave(t: string | null | undefined): string {
  return (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

export function rankingDeAtrasos(av: ChegadaAvaliada[], chave: (c: ChegadaAvaliada) => string | null): LinhaRanking[] {
  const grupos = new Map<string, { lista: ChegadaAvaliada[]; grafias: Map<string, number> }>();
  for (const c of av) {
    const original = chave(c)?.trim();
    const k = normalizarChave(original);
    if (!k || !original) continue;
    const g = grupos.get(k) ?? { lista: [], grafias: new Map<string, number>() };
    g.lista.push(c);
    g.grafias.set(original, (g.grafias.get(original) ?? 0) + 1);
    grupos.set(k, g);
  }
  return [...grupos].map(([k, { lista, grafias }]) => {
    const avals = lista.filter(avaliada);
    const atrasos = avals.filter(c => c.situacao === 'atraso');
    const dias = [...new Set(atrasos.map(c => c.dia))].sort().reverse();
    return {
      chave: k,
      rotulo: [...grafias].sort((a, b) => b[1] - a[1])[0][0],
      chegadas: lista.length,
      avaliadas: avals.length,
      atrasos: atrasos.length,
      pontualidade: avals.length ? (avals.length - atrasos.length) / avals.length : null,
      atrasoMedio: atrasos.length ? Math.round(atrasos.reduce((s, c) => s + c.atrasoMin, 0) / atrasos.length) : null,
      diasComAtraso: dias,
      recorrente: dias.length >= 3 || (dias.length >= 2 && avals.length > 0 && atrasos.length / avals.length >= 0.25),
    };
  }).sort((a, b) => b.atrasos - a.atrasos || (a.pontualidade ?? 1) - (b.pontualidade ?? 1) || b.chegadas - a.chegadas || a.chave.localeCompare(b.chave));
}

export interface AusenciaRota {
  janela: JanelaChegada;
  rota: string;
  /** Dias em que a leva teve chegadas e esta rota não. */
  dias: string[];
  /** Dias com a rota / dias com a leva. */
  regularidade: number;
}

/**
 * Rota regular (presente em `limiar` dos dias da leva, com `minDias` ou mais)
 * que faltou em algum dia em que a leva rodou — possível falta ou chegada não
 * lançada.
 */
export function ausenciasDeRotasRegulares(
  av: ChegadaAvaliada[],
  janelas: JanelaChegada[],
  minDias = 4,
  limiar = 0.6,
): AusenciaRota[] {
  const out: AusenciaRota[] = [];
  for (const janela of [...janelas].filter(j => j.ativo).sort((a, b) => a.ordem - b.ordem)) {
    const daqui = av.filter(c => c.janela?.id === janela.id);
    const diasLeva = new Set(daqui.map(c => c.dia));
    const porRota = new Map<string, Set<string>>();
    for (const c of daqui) {
      if (c.rota === SEM_ROTA) continue;
      porRota.set(c.rota, (porRota.get(c.rota) ?? new Set()).add(c.dia));
    }
    for (const [rota, dias] of porRota) {
      const regularidade = dias.size / (diasLeva.size || 1);
      if (dias.size < minDias || regularidade < limiar) continue;
      const faltas = [...diasLeva].filter(d => !dias.has(d)).sort().reverse();
      if (faltas.length) out.push({ janela, rota, dias: faltas, regularidade });
    }
  }
  return out.sort((a, b) => b.dias.length - a.dias.length || a.janela.ordem - b.janela.ordem || a.rota.localeCompare(b.rota));
}

export interface AtrasosDiaSemana {
  dia: number;
  rotulo: string;
  avaliadas: number;
  atrasos: number;
}

export function atrasosPorDiaDaSemana(av: ChegadaAvaliada[]): AtrasosDiaSemana[] {
  const out = ROTULO_DIA_SEMANA.map((rotulo, dia) => ({ dia, rotulo, avaliadas: 0, atrasos: 0 }));
  for (const c of av) {
    if (!avaliada(c)) continue;
    const d = out[diaDaSemana(c.dia)];
    d.avaliadas++;
    if (c.situacao === 'atraso') d.atrasos++;
  }
  // Segunda primeiro.
  return [...out.slice(1), out[0]];
}
