/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Helpers puros do módulo Demandas — rótulos, cores, ordenação de cartões,
 * progresso de checklist, agrupamento por dia para o calendário e geração do
 * código do cartão. Nada aqui toca rede; o I/O está em `demandasApi.ts` e as
 * regras de acesso em `demandasAcesso.ts`.
 */

import type { DemChecklistItem, DemPrioridade, DemStatus, DemTarefa } from '../types';
import { gerarCodigoFormulario, proximoIndiceCodigo } from './codigosFormulario';

export { formatarPrazoRestante } from './kanban';

/* Rótulos ---------------------------------------------------------------- */

export const STATUS_LABEL: Record<DemStatus, string> = {
  nao_iniciado: 'Não iniciado',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
};

export const STATUS_ORDER: DemStatus[] = ['nao_iniciado', 'em_andamento', 'concluida'];

export const PRIORIDADE_LABEL: Record<DemPrioridade, string> = {
  baixa: 'Baixa',
  media: 'Média',
  importante: 'Importante',
  urgente: 'Urgente',
};

export const PRIORIDADE_ORDER: DemPrioridade[] = ['baixa', 'media', 'importante', 'urgente'];

/** Peso para ordenar cartões — mais urgente primeiro. */
export const PRIORIDADE_PESO: Record<DemPrioridade, number> = {
  urgente: 4, importante: 3, media: 2, baixa: 1,
};

/* Cores (recebem os tokens já resolvidos, como em `lib/kanban.ts`) -------- */

interface StatusTokens { good: string; warning: string; serious: string; critical: string }

export function corStatus(
  status: DemStatus,
  tokens: StatusTokens,
  brand: string,
  muted: string,
): string {
  switch (status) {
    case 'em_andamento': return brand;
    case 'concluida': return tokens.good;
    case 'nao_iniciado':
    default: return muted;
  }
}

export function corPrioridade(
  prioridade: DemPrioridade,
  tokens: StatusTokens,
  muted: string,
): string {
  switch (prioridade) {
    case 'urgente': return tokens.critical;
    case 'importante': return tokens.serious;
    case 'media': return tokens.warning;
    case 'baixa':
    default: return muted;
  }
}

/* Checklist ------------------------------------------------------------- */

export function progressoChecklist(checklist: DemChecklistItem[] | null | undefined): {
  feitos: number; total: number;
} {
  const lista = checklist ?? [];
  return { feitos: lista.filter(i => i.feito).length, total: lista.length };
}

/* Ordenação de cartões / buckets ------------------------------------------ */

/**
 * Reordena `itens` movendo o elemento de `fromIndex` para `toIndex` e devolve
 * a lista já com `ordem` recalculada (0,1,2…). Serve tanto para arrastar
 * cartões dentro de um bucket quanto para reordenar buckets.
 */
export function reordenarComOrdem<T extends { id: string; ordem: number }>(
  itens: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= itens.length) {
    return itens.map((it, i) => ({ ...it, ordem: i }));
  }
  const copia = [...itens];
  const [movido] = copia.splice(fromIndex, 1);
  copia.splice(Math.max(0, Math.min(toIndex, copia.length)), 0, movido);
  return copia.map((it, i) => ({ ...it, ordem: i }));
}

/** Próximo valor de `ordem` para acrescentar um item ao fim de uma lista. */
export function proximaOrdem(itens: { ordem: number }[]): number {
  return itens.reduce((max, it) => Math.max(max, it.ordem), -1) + 1;
}

/** Cartões de um bucket na ordem de exibição: por `ordem`, empate pelo mais recente. */
export function ordenarTarefas(tarefas: DemTarefa[]): DemTarefa[] {
  return [...tarefas].sort(
    (a, b) => a.ordem - b.ordem
      || new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/* Calendário ---------------------------------------------------------------- */

/** Data usada para posicionar a tarefa no calendário: vencimento, senão início. */
export function dataAgenda(t: DemTarefa): string | null {
  return t.data_vencimento || t.data_inicio || null;
}

/**
 * Agrupa tarefas por dia (`YYYY-MM-DD`) a partir de `dataAgenda`. Tarefas sem
 * data ficam de fora — o componente as lista à parte como "não agendadas".
 */
export function mapaCalendario(tarefas: DemTarefa[]): Map<string, DemTarefa[]> {
  const mapa = new Map<string, DemTarefa[]>();
  for (const t of tarefas) {
    const dia = dataAgenda(t);
    if (!dia) continue;
    const chave = dia.slice(0, 10);
    const grupo = mapa.get(chave);
    if (grupo) grupo.push(t);
    else mapa.set(chave, [t]);
  }
  return mapa;
}

export function tarefasNaoAgendadas(tarefas: DemTarefa[]): DemTarefa[] {
  return tarefas.filter(t => !dataAgenda(t));
}

/* Código do cartão — `DEM-DDMMYY-NN`, reiniciado por mês -------------------- */

/**
 * Gera o código de um novo cartão. O índice reinicia a cada mês — passe em
 * `codigosDoMes` apenas os códigos já gravados no mês da `dataISO` (a consulta
 * que monta essa lista mora em `demandasApi.criarTarefa`).
 */
export function gerarCodigoTarefa(dataISO: string, codigosDoMes: (string | null | undefined)[]): string {
  const indice = proximoIndiceCodigo('DEM', codigosDoMes);
  return gerarCodigoFormulario('DEM', dataISO, indice);
}
