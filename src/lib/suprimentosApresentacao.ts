/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dashboards Suprimentos › Apresentação — contas dos slides que não existem
 * prontas nas abas. Os indicadores do setor, da carteira por comprador e dos
 * fornecedores vêm das mesmas funções das abas (`lib/suprimentos.ts`), para o
 * slide bater com o que está na tela.
 */

import type { EnrichedSAPRecord } from '../types';
import {
  bucketDate, classifyCriticidade, classifyCriticidadeNatureza, classifyTipoDemanda, CRITICIDADE_LABEL, type Criticidade,
} from './demandas';
import { calcLeadTimeRmPo, temPO, umRegistroPorItem } from './suprimentos';

const DIA_MS = 86_400_000;

function paraData(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, (m || 1) - 1, d || 1));
}
const paraIso = (d: Date) => d.toISOString().slice(0, 10);
const somarDias = (iso: string, dias: number) => paraIso(new Date(paraData(iso).getTime() + dias * DIA_MS));
const diasEntre = (de: string, ate: string) => Math.round((paraData(ate).getTime() - paraData(de).getTime()) / DIA_MS);

/** Criticidade do item: natureza (distingue urgência também em serviço), com o prefixo da RM de reserva. */
export function criticidadeDoItem(r: EnrichedSAPRecord): Criticidade | 'sem' {
  return classifyCriticidadeNatureza((r as { natureza?: string }).natureza)
    ?? classifyCriticidade(r.requisicao_de_compra) ?? 'sem';
}

/* ── Janela do gráfico ─────────────────────────────────────────────────────── */

export type GranularidadeGrafico = 'dia' | 'semana' | 'mes';

/** Colunas que cabem legíveis num slide de 1600 px. */
export const MAX_COLUNAS: Record<GranularidadeGrafico, number> = { dia: 31, semana: 16, mes: 12 };

/**
 * Recorte do período que o gráfico mostra. Período maior que o máximo de
 * colunas fica com os últimos dias/semanas (o mais recente é o que se discute
 * na reunião), e o título do gráfico avisa.
 */
export function janelaDoGrafico(
  granularidade: GranularidadeGrafico, de: string, ate: string, hoje: string,
): { de: string; ate: string; cortado: boolean } {
  const fim = ate || hoje;
  if (granularidade === 'dia') {
    const inicioMin = somarDias(fim, -(MAX_COLUNAS.dia - 1));
    if (!de || de < inicioMin) return { de: inicioMin, ate: fim, cortado: true };
    return { de, ate: fim, cortado: false };
  }
  if (granularidade === 'mes') {
    const a = Number(fim.slice(0, 4));
    const m = Number(fim.slice(5, 7)) - (MAX_COLUNAS.mes - 1);
    const anoIni = a + Math.floor((m - 1) / 12);
    const mesIni = ((m - 1) % 12 + 12) % 12 + 1;
    const inicioMin = `${anoIni}-${String(mesIni).padStart(2, '0')}-01`;
    if (!de || de < inicioMin) return { de: inicioMin, ate: fim, cortado: true };
    return { de, ate: fim, cortado: false };
  }
  // Semana ISO: começa na segunda-feira.
  const dow = (paraData(fim).getUTCDay() + 6) % 7;
  const segundaFim = somarDias(fim, -dow);
  const inicioMin = somarDias(segundaFim, -7 * (MAX_COLUNAS.semana - 1));
  if (!de || de < inicioMin) return { de: inicioMin, ate: fim, cortado: true };
  return { de, ate: fim, cortado: false };
}

/* ── Evolução: requisitado por criticidade × pedido ───────────────────────── */

export interface PontoEvolucao {
  chave: string;
  rotulo: string;
  /** Itens requisitados no intervalo, por criticidade. */
  normal: number;
  urgente: number;
  maquinaParada: number;
  semCriticidade: number;
  requisitados: number;
  /** Itens que ganharam o primeiro pedido no intervalo. */
  pedidos: number;
  /** Dos requisitados no intervalo, os que continuam sem pedido — por criticidade. */
  semPoNormal: number;
  semPoUrgente: number;
  semPoMaquinaParada: number;
  semPoSemCriticidade: number;
  semPo: number;
  /** Dos sem pedido, os que já passaram da meta de compra. */
  semPoForaDaMeta: number;
  /** Valor dos pedidos colocados no intervalo (só itens com valor). */
  valorPedidos: number;
}

/**
 * Itens requisitados (pela data da solicitação, quebrados em normal / urgente
 * / máquina parada) × itens que ganharam pedido (pela data do pedido), por dia
 * ou semana. Todos os intervalos da janela aparecem, inclusive os vazios.
 * Requisitado conta item de RM uma vez; pedido conta o item no intervalo do
 * primeiro PO, e o valor soma todos os PO.
 */
export function evolucaoRequisitadoPedido(
  records: EnrichedSAPRecord[],
  granularidade: GranularidadeGrafico,
  de: string,
  ate: string,
): PontoEvolucao[] {
  const pontos = new Map<string, PontoEvolucao>();
  const criar = (dia: string): PontoEvolucao | null => {
    const b = bucketDate(dia, granularidade);
    if (!b) return null;
    let p = pontos.get(b.key);
    if (!p) {
      p = {
        chave: b.key, rotulo: b.label,
        normal: 0, urgente: 0, maquinaParada: 0, semCriticidade: 0, requisitados: 0, pedidos: 0, valorPedidos: 0,
        semPoNormal: 0, semPoUrgente: 0, semPoMaquinaParada: 0, semPoSemCriticidade: 0, semPo: 0, semPoForaDaMeta: 0,
      };
      pontos.set(b.key, p);
    }
    return p;
  };
  if (de && ate) {
    for (let d = de; d <= ate; d = somarDias(d, 1)) criar(d);
  }
  const ponto = (data: string | null | undefined): PontoEvolucao | null => {
    if (!data) return null;
    const dia = data.slice(0, 10);
    if ((de && dia < de) || (ate && dia > ate)) return null;
    return criar(dia);
  };

  for (const r of umRegistroPorItem(records)) {
    const req = ponto(r.data_solicitacao);
    if (req) {
      req.requisitados += 1;
      const c = criticidadeDoItem(r);
      if (c === 'normal') req.normal += 1;
      else if (c === 'urgente') req.urgente += 1;
      else if (c === 'maquina_parada') req.maquinaParada += 1;
      else req.semCriticidade += 1;
      if (!temPO(r)) {
        req.semPo += 1;
        if (c === 'normal') req.semPoNormal += 1;
        else if (c === 'urgente') req.semPoUrgente += 1;
        else if (c === 'maquina_parada') req.semPoMaquinaParada += 1;
        else req.semPoSemCriticidade += 1;
        if ((r.dias_em_aberto || 0) > metaDoItem(r, c)) req.semPoForaDaMeta += 1;
      }
    }
    if (temPO(r)) {
      const ped = ponto(r.data_pedido);
      if (ped) ped.pedidos += 1;
    }
  }
  for (const r of records) {
    if (!temPO(r) || typeof r.valor_total !== 'number' || !Number.isFinite(r.valor_total)) continue;
    const ped = ponto(r.data_pedido);
    if (ped) ped.valorPedidos += r.valor_total;
  }

  return [...pontos.values()].sort((a, b) => a.chave.localeCompare(b.chave));
}

/* ── Áreas ─────────────────────────────────────────────────────────────────── */

export interface LinhaArea {
  area: string;
  abertos: number;
  comPO: number;
  total: number;
}

/** Itens de RM por área solicitante; acima de `limite` áreas, o resto soma em "Outras". */
export function demandaPorArea(records: EnrichedSAPRecord[], limite = 10): LinhaArea[] {
  const mapa = new Map<string, LinhaArea>();
  for (const r of umRegistroPorItem(records)) {
    const area = r.area_solicitante?.trim() || 'Não informada';
    const l = mapa.get(area) ?? { area, abertos: 0, comPO: 0, total: 0 };
    if (temPO(r)) l.comPO += 1; else l.abertos += 1;
    l.total += 1;
    mapa.set(area, l);
  }
  const linhas = [...mapa.values()].sort((a, b) => b.total - a.total || a.area.localeCompare(b.area, 'pt-BR'));
  if (linhas.length <= limite) return linhas;
  const resto = linhas.slice(limite - 1);
  return [
    ...linhas.slice(0, limite - 1),
    resto.reduce<LinhaArea>(
      (acc, l) => ({ ...acc, abertos: acc.abertos + l.abertos, comPO: acc.comPO + l.comPO, total: acc.total + l.total }),
      { area: `Outras (${resto.length})`, abertos: 0, comPO: 0, total: 0 },
    ),
  ];
}

/* ── Criticidade e prazo × meta ───────────────────────────────────────────── */

/** Meta de lead time de compra (dias) quando o registro não traz a sua. Mesma regra do localDb. */
export const META_LEAD_TIME_PADRAO: Record<Criticidade | 'sem', number> = {
  maquina_parada: 2,
  urgente: 6,
  normal: 15,
  sem: 30,
};

export interface LinhaCriticidade {
  chave: Criticidade | 'sem';
  rotulo: string;
  itens: number;
  comPO: number;
  /** 0..100 */
  conversao: number;
  /** Lead time RM→PO médio, em dias, dos itens já com pedido. */
  leadTime: number;
  /** Meta de lead time (dias) — a mais comum entre os itens. */
  meta: number;
  /** Itens com pedido e lead time aferível. */
  medidos: number;
  /** % dos medidos com pedido dentro da meta (0..100); null sem medição. */
  pctNaMeta: number | null;
  abertos: number;
  /** Itens ainda sem pedido que já passaram da meta. */
  abertosForaDaMeta: number;
}

const ORDEM_CRITICIDADE: Array<Criticidade | 'sem'> = ['maquina_parada', 'urgente', 'normal', 'sem'];

function metaDoItem(r: EnrichedSAPRecord, c: Criticidade | 'sem'): number {
  const m = Number(r.lead_time_compras_meta);
  return Number.isFinite(m) && m > 0 ? m : META_LEAD_TIME_PADRAO[c];
}

/**
 * Normal × urgente × máquina parada: volume, conversão, lead time e aderência
 * à meta de compra. "Na meta" = pedido colocado em até `meta` dias da
 * solicitação; "fora da meta" em aberto = sem pedido há mais de `meta` dias.
 */
export function porCriticidade(records: EnrichedSAPRecord[]): LinhaCriticidade[] {
  const grupos = new Map<Criticidade | 'sem', EnrichedSAPRecord[]>();
  for (const r of umRegistroPorItem(records)) {
    const c = criticidadeDoItem(r);
    grupos.set(c, [...(grupos.get(c) ?? []), r]);
  }
  return ORDEM_CRITICIDADE
    .filter(c => grupos.has(c))
    .map(c => {
      const itens = grupos.get(c)!;
      const comPO = itens.filter(temPO).length;

      const contagemMetas = new Map<number, number>();
      let medidos = 0;
      let naMeta = 0;
      let abertos = 0;
      let abertosForaDaMeta = 0;
      for (const r of itens) {
        const meta = metaDoItem(r, c);
        contagemMetas.set(meta, (contagemMetas.get(meta) ?? 0) + 1);
        if (temPO(r)) {
          if (!r.data_solicitacao || !r.data_pedido) continue;
          const lt = diasEntre(r.data_solicitacao.slice(0, 10), r.data_pedido.slice(0, 10));
          if (lt < 0) continue;
          medidos += 1;
          if (lt <= meta) naMeta += 1;
        } else {
          abertos += 1;
          if ((r.dias_em_aberto || 0) > meta) abertosForaDaMeta += 1;
        }
      }
      const meta = [...contagemMetas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? META_LEAD_TIME_PADRAO[c];

      return {
        chave: c,
        rotulo: c === 'sem' ? 'Não classificada' : CRITICIDADE_LABEL[c],
        itens: itens.length,
        comPO,
        conversao: itens.length ? (comPO / itens.length) * 100 : 0,
        leadTime: calcLeadTimeRmPo(itens).valor,
        meta,
        medidos,
        pctNaMeta: medidos ? (naMeta / medidos) * 100 : null,
        abertos,
        abertosForaDaMeta,
      };
    });
}

/** Materiais × serviços (itens de RM). */
export function materialServico(records: EnrichedSAPRecord[]): { materiais: number; servicos: number; outros: number } {
  let materiais = 0;
  let servicos = 0;
  let outros = 0;
  for (const r of umRegistroPorItem(records)) {
    const t = classifyTipoDemanda(r.requisicao_de_compra);
    if (t === 'material') materiais += 1;
    else if (t === 'servico') servicos += 1;
    else outros += 1;
  }
  return { materiais, servicos, outros };
}

/* ── Composição de uma barra (drill-down) ─────────────────────────────────── */

export type SerieEvolucao = 'requisitados' | 'pedidos' | 'semPo';

/**
 * Itens que compõem uma barra do gráfico de evolução — mesmo critério da
 * contagem: requisitados e sem PO pela data da solicitação; pedidos pela data
 * do primeiro PO (o item pode ter sido requisitado em período anterior).
 */
export function itensDoPonto(
  records: EnrichedSAPRecord[],
  granularidade: GranularidadeGrafico,
  chave: string,
  serie: SerieEvolucao,
  criticidade?: Criticidade | 'sem',
): EnrichedSAPRecord[] {
  const noIntervalo = (data: string | null | undefined) =>
    !!data && bucketDate(data.slice(0, 10), granularidade)?.key === chave;
  return umRegistroPorItem(records).filter(r => {
    if (serie === 'pedidos') return temPO(r) && noIntervalo(r.data_pedido);
    if (!noIntervalo(r.data_solicitacao)) return false;
    if (serie === 'semPo' && temPO(r)) return false;
    return !criticidade || criticidadeDoItem(r) === criticidade;
  });
}

/** Rótulo do intervalo de uma data (ex.: "S38", "out/26", "05/10"). */
export function rotuloDoIntervalo(data: string | null | undefined, granularidade: GranularidadeGrafico): string {
  if (!data) return 'Sem data';
  return bucketDate(data.slice(0, 10), granularidade)?.label ?? 'Sem data';
}
