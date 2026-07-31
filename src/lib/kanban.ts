/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Quadro Kanban de Demandas (Contratos > Demandas).
 *
 * As colunas são o status real da solicitação (o mesmo mostrado em Minhas
 * Solicitações) — não um status paralelo. "Customizável" aqui é reordenar,
 * ocultar e renomear o rótulo da coluna; arrastar um card sempre muda o
 * status de verdade, via `localDb.updateRequestStatus`.
 *
 * A coluna "Aberto" é a porta de entrada de toda demanda nova (ver
 * `submitRequest`) e por isso fica fixa na primeira posição, sempre visível.
 */

import { RequestStatus } from '../types';

export interface KanbanColumnConfig {
  status: RequestStatus;
  label: string;
  visible: boolean;
}

/**
 * Coluna de entrada, fixa na primeira posição e sempre visível — é para onde
 * toda demanda nova nasce (`submitRequest` sempre cria o chamado com esse
 * status). Fica fora da lista customizável de propósito: mexer nela quebraria
 * a porta de entrada do quadro.
 */
export const COLUNA_INICIAL: KanbanColumnConfig = { status: 'aberto', label: 'Aberto', visible: true };

/** Colunas customizáveis (reordenar, ocultar, renomear) — tudo depois da coluna inicial. */
export const DEFAULT_KANBAN_COLUMNS: KanbanColumnConfig[] = [
  { status: 'em_atendimento', label: 'Em Atendimento', visible: true },
  { status: 'aguardando_solicitante', label: 'Aguardando Solicitante', visible: true },
  { status: 'resolvido', label: 'Resolvido', visible: true },
  { status: 'fechado', label: 'Fechado', visible: true },
  { status: 'reaberto', label: 'Reaberto', visible: false },
  { status: 'cancelada', label: 'Cancelada', visible: false },
];

/** Status possíveis de uma demanda jurídica (chamado) — mesmo vocabulário do resto do app. */
export const STATUS_LABEL_DEMANDA: Record<RequestStatus, string> = {
  rascunho: 'Rascunho',
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
  em_revisao: 'Em Revisão',
  aberto: 'Aberto',
  em_atendimento: 'Em Atendimento',
  aguardando_solicitante: 'Aguardando Solicitante',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
  reaberto: 'Reaberto',
  cancelada: 'Cancelada',
};

/** Status relevantes ao ciclo de vida de um chamado — os que fazem sentido escolher no seletor de status da demanda. */
export const STATUS_OPTIONS_DEMANDA: RequestStatus[] = [
  'aberto', 'em_atendimento', 'aguardando_solicitante', 'resolvido', 'fechado', 'reaberto', 'cancelada',
];

const STORAGE_KEY = 'sisten_juridico_kanban_colunas';

/** Carrega a customização salva, mesclando com o padrão (cobre status novo que a versão salva não conhecia). */
export function carregarColunasKanban(): KanbanColumnConfig[] {
  const salvo = localStorage.getItem(STORAGE_KEY);
  if (!salvo) return DEFAULT_KANBAN_COLUMNS.map(c => ({ ...c }));

  try {
    const parsed: KanbanColumnConfig[] = JSON.parse(salvo);
    const porStatus = new Map(parsed.map(c => [c.status, c]));
    // Preserva a ordem salva; acrescenta ao fim qualquer status do padrão que
    // a versão salva ainda não tinha (ex.: coluna nova adicionada depois).
    const conhecidos = parsed.filter(c => DEFAULT_KANBAN_COLUMNS.some(d => d.status === c.status));
    const faltantes = DEFAULT_KANBAN_COLUMNS.filter(d => !porStatus.has(d.status));
    return [...conhecidos, ...faltantes];
  } catch {
    return DEFAULT_KANBAN_COLUMNS.map(c => ({ ...c }));
  }
}

export function salvarColunasKanban(colunas: KanbanColumnConfig[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colunas));
}

/** Cor de identidade de cada status — usada na faixa da coluna e no chip do card. */
export function corDoStatus(status: RequestStatus, tokens: { good: string; warning: string; serious: string; critical: string }, brand: string, muted: string): string {
  switch (status) {
    case 'aberto': return brand;
    case 'em_atendimento': return tokens.warning;
    case 'aguardando_solicitante': return tokens.serious;
    case 'resolvido': return tokens.good;
    case 'reaberto': return tokens.critical;
    case 'fechado':
    case 'cancelada':
    default:
      return muted;
  }
}

/** Rótulo de prioridade do card — a mesma criticidade 1-5 usada no resto do app, só com nome. */
export const PRIORIDADE_LABEL: Record<number, string> = {
  1: 'Baixa', 2: 'Normal', 3: 'Média', 4: 'Alta', 5: 'Urgente',
};

export function corPrioridade(criticality: number, tokens: { good: string; warning: string; serious: string; critical: string }, muted: string): string {
  switch (criticality) {
    case 5: return tokens.critical;
    case 4: return tokens.serious;
    case 3: return tokens.warning;
    case 2: return tokens.good;
    default: return muted;
  }
}

/** Código curto do card (ex.: "JUR-1042") — só de exibição, não muda a numeração real da solicitação. */
export function codigoCurtoDemanda(number: string): string {
  return `JUR-${number.slice(-4)}`;
}

/** Chip de prazo do card: quanto falta, ou há quanto tempo passou do prazo. */
export function formatarPrazoRestante(prazo?: string | null, agora: Date = new Date()): { texto: string; atrasado: boolean } | null {
  if (!prazo) return null;

  const alvo = new Date(`${prazo}T23:59:59`);
  const diffMs = alvo.getTime() - agora.getTime();
  const atrasado = diffMs < 0;
  const horas = Math.abs(diffMs) / (1000 * 60 * 60);

  if (atrasado) {
    const dias = Math.max(1, Math.round(horas / 24));
    return { texto: `Atrasado ${dias}d`, atrasado: true };
  }
  if (horas < 24) {
    return { texto: `${Math.max(1, Math.round(horas))}h restantes`, atrasado: false };
  }
  return { texto: `${Math.round(horas / 24)}d restantes`, atrasado: false };
}
