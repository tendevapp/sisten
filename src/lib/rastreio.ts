/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Lógica de negócio pura (sem React) da página Rastreio Compras.
// Mantida isolada da UI para facilitar leitura, reuso e testes futuros.

import { isSameDay, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { EnrichedSAPRecord } from '../types';

// Uma linha de rastreio = uma requisição/item enriquecido, já mapeado para os
// campos que a tela exibe. Sem preços/valores — é uma visão não financeira.
export interface RastreioRow {
  ri: string;
  rm: string;          // requisicao_de_compra
  item: string;        // item_reqc
  po: string;          // documento_compra / pedido
  material: string;    // material_code
  descricao: string;   // texto_breve
  fornecedor: string;  // fornecedor_name
  setor: string;       // area_solicitante / requisitante_name
  qtd?: number;        // qtd_requisicao
  unidade: string;     // unidade_medida
  dataCriacao: string;   // data_pedido / data_solicitacao
  dataPrevista: string;  // data_entrega_prevista / data_entrega_sap
  dataEntrega: string;   // data_migo
  status: string;        // status exibido (Entregue quando há MIGO; senão item_status)
  statusReq: string;     // status_requisicao ('Sem PO' | 'Processado')
  observacoes: string;   // obs_comprador
  grupoComprador: string; // grupo_comprador (roteamento de notificações)
}

export type DeliveryStatus = 'entregue' | 'no_prazo' | 'atrasado' | 'sem_data';

export type DeliveryScope = 'todos' | 'aberto'; // 'aberto' = ainda sem entrega (MIGO)

export interface RastreioFilters {
  query: string;
  status: string; // 'Todos' ou um item_status
  setor: string;  // 'Todos' ou um setor
  ano: string;    // 'Todos' ou um ano (YYYY)
  scope: DeliveryScope;
}

const EMPTY = '—';

// Normaliza um valor textual para exibição, tratando nulos/vazios/placeholders.
const txt = (v: any): string => {
  const s = String(v ?? '').trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined' || s === '0') return EMPTY;
  return s;
};

export const hasValue = (v?: string): boolean => !!v && v !== EMPTY;

// Converte uma string de data em Date, ou null se inválida/ausente.
export const parseDate = (d?: string): Date | null => {
  if (!hasValue(d)) return null;
  const t = new Date(d as string);
  return isNaN(t.getTime()) ? null : t;
};

// Formata data no padrão brasileiro (dd/mm/aaaa), com fallback para '—'.
export const formatDateBR = (d?: string): string => {
  const parsed = parseDate(d);
  return parsed ? parsed.toLocaleDateString('pt-BR') : EMPTY;
};

export const formatDateTimeBR = (d?: string | null): string => {
  if (!d) return EMPTY;
  const parsed = new Date(d);
  return isNaN(parsed.getTime())
    ? String(d)
    : parsed.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const yearOf = (d?: string): string => {
  const parsed = parseDate(d);
  return parsed ? String(parsed.getFullYear()) : '';
};

// Mapeia os registros enriquecidos do SAP para linhas da tela de rastreio.
export function buildRastreioRows(records: EnrichedSAPRecord[]): RastreioRow[] {
  return records.map(r => {
    const raw = r as any;
    return {
      ri: txt(r.ri) === EMPTY ? `${r.requisicao_de_compra}-${r.item_reqc}` : r.ri,
      rm: txt(r.requisicao_de_compra),
      item: txt(r.item_reqc),
      po: txt(r.documento_compra) !== EMPTY ? txt(r.documento_compra) : txt(r.pedido),
      material: txt(r.material_code),
      descricao: txt(r.texto_breve),
      fornecedor: txt(r.fornecedor_name),
      setor: txt(r.area_solicitante) !== EMPTY ? txt(r.area_solicitante) : txt(r.requisitante_name),
      qtd: typeof r.qtd_requisicao === 'number' ? r.qtd_requisicao : undefined,
      unidade: txt(r.unidade_medida),
      dataCriacao: hasValue(txt(r.data_pedido)) ? txt(r.data_pedido) : txt(raw.data_solicitacao),
      // Data prevista = a promessa de entrega inserida pelo comprador na tela
      // Itens Sem PO (data_entrega_prevista). NÃO usa data_entrega_sap como
      // fallback: é a data de remessa do próprio SAP, não a promessa do
      // comprador, e misturar as duas confundiria a origem do prazo exibido.
      dataPrevista: txt(r.data_entrega_prevista),
      dataEntrega: txt(r.data_migo),
      // Regra de negócio: se há data de entrega (MIGO), o status é "Entregue",
      // independentemente do item_status registrado.
      status: hasValue(txt(r.data_migo))
        ? 'Entregue'
        : (txt(r.item_status) === EMPTY ? 'Sem status' : txt(r.item_status)),
      statusReq: txt(r.status_requisicao),
      observacoes: txt(r.obs_comprador),
      grupoComprador: txt(r.grupo_comprador) === EMPTY ? '' : txt(r.grupo_comprador),
    };
  });
}

// Deriva o status de prazo de entrega de uma linha, para colorir o cronograma.
// `hoje` é injetado para manter a função pura e testável.
export function deriveDeliveryStatus(row: RastreioRow, hoje: Date): DeliveryStatus {
  if (hasValue(row.dataEntrega)) return 'entregue';
  const prevista = parseDate(row.dataPrevista);
  if (!prevista) return 'sem_data';
  // Compara por dia (ignora horas): atrasado só se a data prevista já passou.
  const hojeDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const prevDia = new Date(prevista.getFullYear(), prevista.getMonth(), prevista.getDate());
  return prevDia < hojeDia ? 'atrasado' : 'no_prazo';
}

export const DELIVERY_STATUS_META: Record<DeliveryStatus, { label: string; dot: string; badge: string }> = {
  entregue:  { label: 'Entregue',        dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30' },
  no_prazo:  { label: 'No prazo',        dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30' },
  atrasado:  { label: 'Atrasado',        dot: 'bg-rose-500',    badge: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30' },
  sem_data:  { label: 'Sem data',        dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600' },
};

// Filtra as linhas por busca textual parcial + filtros combináveis.
export function filterRegistros(rows: RastreioRow[], f: RastreioFilters): RastreioRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter(r => {
    if (f.scope === 'aberto' && hasValue(r.dataEntrega)) return false;
    if (f.status !== 'Todos' && r.status !== f.status) return false;
    if (f.setor !== 'Todos' && r.setor !== f.setor) return false;
    if (f.ano !== 'Todos' && yearOf(r.dataCriacao) !== f.ano) return false;
    if (q) {
      const hit =
        r.rm.toLowerCase().includes(q) ||
        r.po.toLowerCase().includes(q) ||
        r.descricao.toLowerCase().includes(q) ||
        r.material.toLowerCase().includes(q) ||
        r.fornecedor.toLowerCase().includes(q) ||
        r.setor.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
}

// Ordenação padrão: registros sem entrega (sem MIGO) primeiro — são os que
// precisam de acompanhamento —, seguidos dos já entregues; em cada grupo,
// ordena por descrição crescente.
export function defaultSort(rows: RastreioRow[]): RastreioRow[] {
  return [...rows].sort((a, b) => {
    const aEntregue = hasValue(a.dataEntrega);
    const bEntregue = hasValue(b.dataEntrega);
    if (aEntregue !== bEntregue) return aEntregue ? 1 : -1;
    return a.descricao.localeCompare(b.descricao, 'pt-BR', { numeric: true });
  });
}

// Opções de filtro derivadas dos dados carregados.
export function statusOptions(rows: RastreioRow[]): string[] {
  return Array.from(new Set(rows.map(r => r.status).filter(s => hasValue(s)))).sort();
}
export function setorOptions(rows: RastreioRow[]): string[] {
  return Array.from(new Set(rows.map(r => r.setor).filter(s => hasValue(s)))).sort();
}
export function anoOptions(rows: RastreioRow[]): string[] {
  return Array.from(new Set(rows.map(r => yearOf(r.dataCriacao)).filter(Boolean)))
    .sort((a, b) => Number(b) - Number(a));
}

// --- Cronograma: agrupamento por data prevista de entrega -------------------

// Só entram no cronograma linhas com data prevista válida e que ainda não
// foram entregues (sem MIGO) — o cronograma é uma agenda do que falta
// receber, não um histórico do que já chegou.
export function schedulableRows(rows: RastreioRow[]): RastreioRow[] {
  return rows.filter(r => parseDate(r.dataPrevista) !== null && !hasValue(r.dataEntrega));
}

// Entregas previstas para um dia específico.
export function entriesForDay(rows: RastreioRow[], day: Date): RastreioRow[] {
  return rows.filter(r => {
    const p = parseDate(r.dataPrevista);
    return p !== null && isSameDay(p, day);
  });
}

// Dias (segunda→domingo) da semana que contém `refDate`.
export function weekDays(refDate: Date): Date[] {
  const start = startOfWeek(refDate, { weekStartsOn: 1 });
  const end = endOfWeek(refDate, { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

// Matriz de semanas (cada uma com 7 dias) cobrindo o mês de `refDate`,
// completando com dias das semanas vizinhas para formar uma grade retangular.
export function monthMatrix(refDate: Date): Date[][] {
  const first = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const last = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
  const gridStart = startOfWeek(first, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(last, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}
