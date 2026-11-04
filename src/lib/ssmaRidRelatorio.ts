/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * RID › Relatório — números do período para apresentação (print no PPT).
 *
 * Definições (ficam no rodapé do relatório):
 *   - Período: pela data do registro (`data_registro`).
 *   - Fechado: status CONCLUIDO. Aberto: REGISTRADO ou EM_TRATAMENTO.
 *     O RID não grava a data de fechamento, então "fechados" são os RIDs
 *     registrados no período que hoje estão concluídos.
 *   - Cancelados e excluídos ficam fora de todas as contas.
 *   - Setor: o setor de quem registrou (campo `setor` do formulário).
 *
 * A listagem do RID (`listarDesviosRid`) corta em 250 e assina as fotos;
 * aqui a leitura é só das colunas usadas e paginada (`buscarTudo`).
 */

import { supabase } from '../db/supabaseClient';
import { buscarTudo } from './buscarTudo';
import type { SsmaRidStatus, SsmaEmpresa } from '../types';

export interface RidRelatorioLinha {
  id: string;
  setor: string | null;
  data_registro: string;
  empresa: SsmaEmpresa | null;
  area_desvio: string | null;
  area_desvio_outro: string | null;
  sanado_imediato: boolean;
  status: SsmaRidStatus;
  comportamentos_inseguros: string[] | null;
  condicoes_inseguras: string[] | null;
}

export type PresetPeriodo = 'mes_atual' | 'mes_anterior' | 'ultimos_30' | 'ultimos_90' | 'ano' | 'personalizado';

export const ROTULO_PRESET: Record<PresetPeriodo, string> = {
  mes_atual: 'Mês atual',
  mes_anterior: 'Mês anterior',
  ultimos_30: 'Últimos 30 dias',
  ultimos_90: 'Últimos 90 dias',
  ano: 'Ano',
  personalizado: 'Personalizado',
};

export type FiltroEmpresa = 'TODAS' | SsmaEmpresa;

// ── Datas (sempre pela string ISO, em UTC — `new Date('2026-09-01')` em UTC-3 vira 31/08) ──

const DIA_MS = 86_400_000;

function paraData(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, (m || 1) - 1, d || 1));
}

function paraIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function somarDias(iso: string, dias: number): string {
  return paraIso(new Date(paraData(iso).getTime() + dias * DIA_MS));
}

export function diasEntre(inicioIso: string, fimIso: string): number {
  return Math.round((paraData(fimIso).getTime() - paraData(inicioIso).getTime()) / DIA_MS);
}

/** Hoje no fuso local, como YYYY-MM-DD. */
export function hojeLocalIso(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

export function dataBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function intervaloDoPreset(preset: Exclude<PresetPeriodo, 'personalizado'>, hoje: string): { inicio: string; fim: string } {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const p = (n: number) => String(n).padStart(2, '0');
  switch (preset) {
    case 'mes_atual':
      return { inicio: `${ano}-${p(mes)}-01`, fim: hoje };
    case 'mes_anterior': {
      const a = mes === 1 ? ano - 1 : ano;
      const m = mes === 1 ? 12 : mes - 1;
      const fim = somarDias(`${ano}-${p(mes)}-01`, -1);
      return { inicio: `${a}-${p(m)}-01`, fim };
    }
    case 'ultimos_30':
      return { inicio: somarDias(hoje, -29), fim: hoje };
    case 'ultimos_90':
      return { inicio: somarDias(hoje, -89), fim: hoje };
    case 'ano':
      return { inicio: `${ano}-01-01`, fim: hoje };
  }
}

/** Semana ISO (segunda a domingo) — devolve a segunda-feira e o número. */
export function semanaIso(iso: string): { segunda: string; numero: number; ano: number } {
  const d = paraData(iso);
  const diaSemana = (d.getUTCDay() + 6) % 7; // 0 = segunda
  const segunda = new Date(d.getTime() - diaSemana * DIA_MS);
  const quinta = new Date(segunda.getTime() + 3 * DIA_MS);
  const inicioAno = new Date(Date.UTC(quinta.getUTCFullYear(), 0, 1));
  const numero = 1 + Math.floor((quinta.getTime() - inicioAno.getTime()) / (7 * DIA_MS));
  return { segunda: paraIso(segunda), numero, ano: quinta.getUTCFullYear() };
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ── Agregação ────────────────────────────────────────────────────────────────

export function ehFechado(status: SsmaRidStatus): boolean {
  return status === 'CONCLUIDO';
}

export interface ContagemAbertosFechados {
  abertos: number;
  fechados: number;
  total: number;
}

export interface LinhaSetor extends ContagemAbertosFechados {
  setor: string;
}

export interface LinhaPeriodo extends ContagemAbertosFechados {
  chave: string;
  rotulo: string;
  /** Texto do intervalo (ex.: "27/10 a 02/11") para a dica do gráfico. */
  detalhe: string;
}

export interface ItemRanking {
  nome: string;
  quantidade: number;
  tipo?: 'comportamento' | 'condicao';
}

export interface RelatorioRid {
  inicio: string;
  fim: string;
  granularidade: 'semana' | 'mes';
  total: number;
  fechados: number;
  abertos: number;
  pctFechados: number;
  sanadosNaHora: number;
  pctSanadosNaHora: number;
  abertosMais30Dias: number;
  idadeMediaAbertos: number;
  ten: number;
  contratada: number;
  porSetor: LinhaSetor[];
  porPeriodo: LinhaPeriodo[];
  topClassificacoes: ItemRanking[];
  topAreas: ItemRanking[];
}

/** Setores mostrados no gráfico; o resto soma em "Outros". */
export const MAX_SETORES = 10;

function pct(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

function ranking(contagem: Map<string, ItemRanking>, limite: number): ItemRanking[] {
  return [...contagem.values()]
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, limite);
}

export function montarRelatorioRid(
  linhas: RidRelatorioLinha[],
  params: { inicio: string; fim: string; hoje: string; empresa?: FiltroEmpresa },
): RelatorioRid {
  const { inicio, fim, hoje } = params;
  const empresa = params.empresa ?? 'TODAS';
  const vigentes = linhas.filter(l =>
    l.status !== 'CANCELADO'
    && l.data_registro >= inicio && l.data_registro <= fim
    && (empresa === 'TODAS' || l.empresa === empresa));

  const fechados = vigentes.filter(l => ehFechado(l.status)).length;
  const abertasLinhas = vigentes.filter(l => !ehFechado(l.status));
  const idades = abertasLinhas.map(l => Math.max(0, diasEntre(l.data_registro, hoje)));
  const sanadosNaHora = vigentes.filter(l => l.sanado_imediato).length;

  // Por setor
  const setores = new Map<string, LinhaSetor>();
  for (const l of vigentes) {
    const nome = (l.setor || '').trim() || 'Não informado';
    const s = setores.get(nome) ?? { setor: nome, abertos: 0, fechados: 0, total: 0 };
    if (ehFechado(l.status)) s.fechados += 1; else s.abertos += 1;
    s.total += 1;
    setores.set(nome, s);
  }
  let porSetor = [...setores.values()].sort((a, b) => b.total - a.total || a.setor.localeCompare(b.setor, 'pt-BR'));
  if (porSetor.length > MAX_SETORES) {
    const resto = porSetor.slice(MAX_SETORES - 1);
    porSetor = [
      ...porSetor.slice(0, MAX_SETORES - 1),
      resto.reduce<LinhaSetor>((acc, s) => ({
        setor: `Outros (${resto.length})`,
        abertos: acc.abertos + s.abertos,
        fechados: acc.fechados + s.fechados,
        total: acc.total + s.total,
      }), { setor: 'Outros', abertos: 0, fechados: 0, total: 0 }),
    ];
  }

  // Evolução: semana até ~3 meses; acima disso, mês. Todos os intervalos do
  // período aparecem, inclusive os sem registro (zero também é informação).
  const granularidade: 'semana' | 'mes' = diasEntre(inicio, fim) > 92 ? 'mes' : 'semana';
  const periodos = new Map<string, LinhaPeriodo>();
  if (granularidade === 'semana') {
    for (let seg = semanaIso(inicio).segunda; seg <= fim; seg = somarDias(seg, 7)) {
      const { numero } = semanaIso(seg);
      const domingo = somarDias(seg, 6);
      periodos.set(seg, {
        chave: seg, rotulo: `S${String(numero).padStart(2, '0')}`,
        detalhe: `${dataBR(seg).slice(0, 5)} a ${dataBR(domingo).slice(0, 5)}`,
        abertos: 0, fechados: 0, total: 0,
      });
    }
  } else {
    let a = Number(inicio.slice(0, 4));
    let m = Number(inicio.slice(5, 7));
    const chaveFim = fim.slice(0, 7);
    for (;;) {
      const chave = `${a}-${String(m).padStart(2, '0')}`;
      if (chave > chaveFim) break;
      periodos.set(chave, {
        chave, rotulo: `${MESES[m - 1]}/${String(a).slice(2)}`, detalhe: `${MESES[m - 1]} de ${a}`,
        abertos: 0, fechados: 0, total: 0,
      });
      m += 1;
      if (m > 12) { m = 1; a += 1; }
    }
  }
  for (const l of vigentes) {
    const chave = granularidade === 'semana' ? semanaIso(l.data_registro).segunda : l.data_registro.slice(0, 7);
    const p = periodos.get(chave);
    if (!p) continue;
    if (ehFechado(l.status)) p.fechados += 1; else p.abertos += 1;
    p.total += 1;
  }

  // Classificações (um RID pode marcar várias) e locais
  const classificacoes = new Map<string, ItemRanking>();
  const areas = new Map<string, ItemRanking>();
  const contar = (mapa: Map<string, ItemRanking>, nome: string, tipo?: ItemRanking['tipo']) => {
    const chave = `${tipo ?? ''}|${nome.toUpperCase()}`;
    const item = mapa.get(chave) ?? { nome, quantidade: 0, tipo };
    item.quantidade += 1;
    mapa.set(chave, item);
  };
  for (const l of vigentes) {
    for (const c of l.comportamentos_inseguros ?? []) if (c?.trim()) contar(classificacoes, c.trim(), 'comportamento');
    for (const c of l.condicoes_inseguras ?? []) if (c?.trim()) contar(classificacoes, c.trim(), 'condicao');
    // "Outros" vem com texto livre (ônibus, rota 03, ...): variado demais
    // para ranking, então soma num item só.
    const area = (l.area_desvio || '').trim();
    const nomeArea = /^outr[oa]s?$/i.test(area) ? 'Outros locais' : area || 'Não informado';
    contar(areas, nomeArea);
  }

  return {
    inicio, fim, granularidade,
    total: vigentes.length,
    fechados,
    abertos: abertasLinhas.length,
    pctFechados: pct(fechados, vigentes.length),
    sanadosNaHora,
    pctSanadosNaHora: pct(sanadosNaHora, vigentes.length),
    abertosMais30Dias: idades.filter(d => d > 30).length,
    idadeMediaAbertos: idades.length ? Math.round(idades.reduce((s, d) => s + d, 0) / idades.length) : 0,
    ten: vigentes.filter(l => l.empresa === 'TEN').length,
    contratada: vigentes.filter(l => l.empresa === 'CONTRATADA').length,
    porSetor,
    porPeriodo: [...periodos.values()],
    topClassificacoes: ranking(classificacoes, 5),
    topAreas: ranking(areas, 5),
  };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function buscarRidsPeriodo(inicio: string, fim: string): Promise<RidRelatorioLinha[]> {
  if (!supabase) return [];
  const sb = supabase as any;
  return buscarTudo<RidRelatorioLinha>((de, ate) =>
    sb.from('ssma_rid_desvios')
      .select('id, setor, data_registro, empresa, area_desvio, area_desvio_outro, sanado_imediato, status, comportamentos_inseguros, condicoes_inseguras')
      .is('excluido_em', null)
      .gte('data_registro', inicio)
      .lte('data_registro', fim)
      .order('id')
      .range(de, ate));
}
