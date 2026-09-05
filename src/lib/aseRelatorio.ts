/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Agregações do relatório de ASE - Hora Extra (FRM.RHU-0007).
 *
 * Fica fora da tela porque é a parte que precisa de teste: filtro por período
 * e recortes (setor, turno, status, solicitante) alimentam ao mesmo tempo os
 * gráficos e a exportação — os dois têm de contar exatamente a mesma coisa,
 * senão o Excel diverge do painel que o usuário estava olhando.
 *
 * Datas são sempre tratadas como string ISO `YYYY-MM-DD` e comparadas
 * lexicograficamente. `new Date('2026-09-01')` volta como 31/08 em UTC-3 e
 * jogaria registros para o dia anterior no gráfico diário.
 */

import type { AseHoraExtraCompleta } from '../types';

/** Um colaborador dentro de uma ASE, achatado com o contexto da solicitação. */
export interface LinhaColaboradorAse {
  solicitacao_id: string;
  protocolo: string;
  data_execucao: string;
  status: string;
  setor: string;
  turno: string;
  solicitante: string;
  registro: string;
  nome: string;
  cargo: string;
  hora_entrada: string;
  hora_saida: string;
  intervalo_minutos: number;
  percentual_he: number | null;
  horas: number;
  transporte: boolean;
  refeicao: boolean;
  rota: string;
  ponto_embarque: string;
  contato: string;
  observacao: string;
}

export interface FiltroRelatorioAse {
  /** ISO `YYYY-MM-DD`; string vazia = sem limite. */
  de: string;
  ate: string;
  setores: Set<string>;
  turnos: Set<string>;
  status: Set<string>;
  solicitantes: Set<string>;
  /** `true` mantém só quem tem transporte; `false` só quem não tem. */
  apenasTransporte?: boolean;
  apenasRefeicao?: boolean;
}

export interface ResumoAse {
  ases: number;
  colaboradores: number;
  /** Colaboradores distintos por matrícula — a mesma pessoa pode aparecer em vários dias. */
  pessoasDistintas: number;
  horas: number;
  mediaHorasPorColaborador: number;
  mediaColaboradoresPorAse: number;
  transportes: number;
  refeicoes: number;
  diasComAse: number;
}

export interface PontoDiario {
  dia: string;
  label: string;
  ases: number;
  colaboradores: number;
  horas: number;
  transportes: number;
  refeicoes: number;
}

export interface GrupoAse {
  nome: string;
  horas: number;
  colaboradores: number;
  ases: number;
  transportes: number;
  refeicoes: number;
}

export const SEM_INFO = 'Não informado';

export const STATUS_ASE_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  ENVIADO: 'Enviado',
  CANCELADO: 'Cancelado',
};

export function filtroVazio(): FiltroRelatorioAse {
  return {
    de: '',
    ate: '',
    setores: new Set(),
    turnos: new Set(),
    status: new Set(),
    solicitantes: new Set(),
  };
}

/** Data local de hoje em ISO — `toISOString` devolveria o dia seguinte à noite. */
export function hojeISO(base = new Date()): string {
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type PresetPeriodoAse =
  | 'tudo' | 'hoje' | '7dias' | '30dias' | '90dias' | 'mes_atual' | 'mes_passado' | 'ano_atual';

export const PRESETS_PERIODO: { id: PresetPeriodoAse; label: string }[] = [
  { id: '7dias', label: 'Últimos 7 dias' },
  { id: '30dias', label: 'Últimos 30 dias' },
  { id: '90dias', label: 'Últimos 90 dias' },
  { id: 'mes_atual', label: 'Este mês' },
  { id: 'mes_passado', label: 'Mês passado' },
  { id: 'ano_atual', label: 'Este ano' },
  { id: 'hoje', label: 'Hoje' },
  { id: 'tudo', label: 'Todo o período' },
];

/**
 * Intervalo de cada atalho. O relatório olha para trás (o que já foi
 * autorizado), ao contrário do `DateRangeFilter` de vencimentos, cujos
 * atalhos são todos para a frente.
 */
export function intervaloDoPreset(preset: PresetPeriodoAse, base = new Date()): { de: string; ate: string } {
  const hoje = hojeISO(base);
  const desloca = (dias: number): string => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias);
    return hojeISO(d);
  };

  switch (preset) {
    case 'hoje':
      return { de: hoje, ate: hoje };
    case '7dias':
      return { de: desloca(-6), ate: hoje };
    case '30dias':
      return { de: desloca(-29), ate: hoje };
    case '90dias':
      return { de: desloca(-89), ate: hoje };
    case 'mes_atual': {
      const primeiro = hojeISO(new Date(base.getFullYear(), base.getMonth(), 1));
      const ultimo = hojeISO(new Date(base.getFullYear(), base.getMonth() + 1, 0));
      return { de: primeiro, ate: ultimo };
    }
    case 'mes_passado': {
      const primeiro = hojeISO(new Date(base.getFullYear(), base.getMonth() - 1, 1));
      const ultimo = hojeISO(new Date(base.getFullYear(), base.getMonth(), 0));
      return { de: primeiro, ate: ultimo };
    }
    case 'ano_atual':
      return { de: `${base.getFullYear()}-01-01`, ate: `${base.getFullYear()}-12-31` };
    case 'tudo':
    default:
      return { de: '', ate: '' };
  }
}

export function formatarDataBR(iso?: string | null): string {
  if (!iso) return '-';
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Rótulo curto do eixo diário: `DD/MM`. */
export function rotuloDia(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

function noPeriodo(dataISO: string, de: string, ate: string): boolean {
  if (de && dataISO < de) return false;
  if (ate && dataISO > ate) return false;
  return true;
}

/** Conjunto vazio = sem recorte (todos passam). */
function aceita(conjunto: Set<string>, valor: string): boolean {
  return conjunto.size === 0 || conjunto.has(valor);
}

export function setorDe(s: AseHoraExtraCompleta): string { return s.setor_nome?.trim() || SEM_INFO; }
export function turnoDe(s: AseHoraExtraCompleta): string { return s.turno_nome?.trim() || SEM_INFO; }
export function solicitanteDe(s: AseHoraExtraCompleta): string { return s.solicitante_nome?.trim() || SEM_INFO; }

/**
 * Aplica o filtro nas solicitações. Os recortes por transporte/refeição são de
 * colaborador, então derrubam os itens que não batem e, com eles, as ASEs que
 * ficaram sem nenhum colaborador.
 */
export function filtrarSolicitacoes(
  lista: AseHoraExtraCompleta[],
  filtro: FiltroRelatorioAse,
): AseHoraExtraCompleta[] {
  const filtraItens = filtro.apenasTransporte || filtro.apenasRefeicao;

  return lista.reduce<AseHoraExtraCompleta[]>((acc, s) => {
    if (!noPeriodo(s.data_execucao, filtro.de, filtro.ate)) return acc;
    if (!aceita(filtro.setores, setorDe(s))) return acc;
    if (!aceita(filtro.turnos, turnoDe(s))) return acc;
    if (!aceita(filtro.status, s.status)) return acc;
    if (!aceita(filtro.solicitantes, solicitanteDe(s))) return acc;

    if (!filtraItens) {
      acc.push(s);
      return acc;
    }

    const itens = s.itens.filter(it =>
      (!filtro.apenasTransporte || it.transporte) &&
      (!filtro.apenasRefeicao || it.refeicao)
    );
    if (itens.length > 0) acc.push({ ...s, itens });
    return acc;
  }, []);
}

export function acharLinhas(solicitacoes: AseHoraExtraCompleta[]): LinhaColaboradorAse[] {
  return solicitacoes.flatMap(s => s.itens.map(it => ({
    solicitacao_id: s.id,
    protocolo: s.numero_protocolo,
    data_execucao: s.data_execucao,
    status: s.status,
    setor: setorDe(s),
    turno: turnoDe(s),
    solicitante: solicitanteDe(s),
    registro: it.registro || '',
    nome: it.nome || SEM_INFO,
    cargo: it.cargo || '',
    hora_entrada: it.hora_entrada || '',
    hora_saida: it.hora_saida || '',
    intervalo_minutos: it.intervalo_minutos ?? 0,
    percentual_he: it.percentual_he ?? null,
    horas: it.total_horas || 0,
    transporte: Boolean(it.transporte),
    refeicao: Boolean(it.refeicao),
    rota: it.rota_transporte?.trim() || '',
    ponto_embarque: it.ponto_embarque_transporte?.trim() || '',
    contato: it.contato_transporte?.trim() || '',
    observacao: it.observacao?.trim() || '',
  })));
}

export function resumoAse(
  solicitacoes: AseHoraExtraCompleta[],
  linhas = acharLinhas(solicitacoes),
): ResumoAse {
  const horas = linhas.reduce((acc, l) => acc + l.horas, 0);
  const transportes = linhas.filter(l => l.transporte).length;
  const refeicoes = linhas.filter(l => l.refeicao).length;
  const pessoas = new Set(linhas.map(l => l.registro || l.nome));
  const dias = new Set(solicitacoes.map(s => s.data_execucao));

  return {
    ases: solicitacoes.length,
    colaboradores: linhas.length,
    pessoasDistintas: pessoas.size,
    horas,
    mediaHorasPorColaborador: linhas.length ? horas / linhas.length : 0,
    mediaColaboradoresPorAse: solicitacoes.length ? linhas.length / solicitacoes.length : 0,
    transportes,
    refeicoes,
    diasComAse: dias.size,
  };
}

/** Série por dia de execução, em ordem cronológica. Dias sem ASE não entram. */
export function serieDiaria(solicitacoes: AseHoraExtraCompleta[]): PontoDiario[] {
  const mapa = new Map<string, PontoDiario>();

  solicitacoes.forEach(s => {
    const dia = s.data_execucao;
    let ponto = mapa.get(dia);
    if (!ponto) {
      ponto = { dia, label: rotuloDia(dia), ases: 0, colaboradores: 0, horas: 0, transportes: 0, refeicoes: 0 };
      mapa.set(dia, ponto);
    }
    ponto.ases += 1;
    ponto.colaboradores += s.itens.length;
    s.itens.forEach(it => {
      ponto!.horas += it.total_horas || 0;
      if (it.transporte) ponto!.transportes += 1;
      if (it.refeicao) ponto!.refeicoes += 1;
    });
  });

  return Array.from(mapa.values()).sort((a, b) => a.dia.localeCompare(b.dia));
}

/**
 * Agrupa os colaboradores por uma chave (setor, turno, solicitante, rota…) e
 * ordena por horas. `limite` corta o rabo da lista — o resto vira ruído no
 * gráfico de barras.
 */
export function agruparPor(
  linhas: LinhaColaboradorAse[],
  chave: (l: LinhaColaboradorAse) => string,
  limite?: number,
): GrupoAse[] {
  const mapa = new Map<string, GrupoAse & { ids: Set<string> }>();

  linhas.forEach(l => {
    const nome = chave(l) || SEM_INFO;
    let g = mapa.get(nome);
    if (!g) {
      g = { nome, horas: 0, colaboradores: 0, ases: 0, transportes: 0, refeicoes: 0, ids: new Set() };
      mapa.set(nome, g);
    }
    g.horas += l.horas;
    g.colaboradores += 1;
    g.ids.add(l.solicitacao_id);
    if (l.transporte) g.transportes += 1;
    if (l.refeicao) g.refeicoes += 1;
  });

  const arr = Array.from(mapa.values())
    .map(({ ids, ...g }) => ({ ...g, ases: ids.size }))
    .sort((a, b) => b.horas - a.horas || b.colaboradores - a.colaboradores || a.nome.localeCompare(b.nome));

  return limite ? arr.slice(0, limite) : arr;
}

/** Ranking de pessoas por horas acumuladas no período. */
export function topColaboradores(linhas: LinhaColaboradorAse[], limite?: number): GrupoAse[] {
  return agruparPor(linhas, l => (l.registro ? `${l.registro} - ${l.nome}` : l.nome), limite);
}

/** Só quem tem transporte, agrupado por rota. */
export function porRota(linhas: LinhaColaboradorAse[], limite?: number): GrupoAse[] {
  return agruparPor(linhas.filter(l => l.transporte), l => l.rota || SEM_INFO, limite);
}

/** Opções de um filtro, em ordem alfabética e sem repetição. */
export function opcoesDe(
  lista: AseHoraExtraCompleta[],
  chave: (s: AseHoraExtraCompleta) => string,
): string[] {
  return Array.from(new Set(lista.map(chave))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Resumo textual do filtro aplicado — vai para o cabeçalho do Excel. */
export function descreverFiltro(filtro: FiltroRelatorioAse): string {
  const partes: string[] = [];

  if (filtro.de && filtro.ate) partes.push(`Período: ${formatarDataBR(filtro.de)} a ${formatarDataBR(filtro.ate)}`);
  else if (filtro.de) partes.push(`Período: a partir de ${formatarDataBR(filtro.de)}`);
  else if (filtro.ate) partes.push(`Período: até ${formatarDataBR(filtro.ate)}`);
  else partes.push('Período: todo o histórico');

  if (filtro.setores.size) partes.push(`Setores: ${Array.from(filtro.setores).join(', ')}`);
  if (filtro.turnos.size) partes.push(`Turnos: ${Array.from(filtro.turnos).join(', ')}`);
  if (filtro.status.size) {
    partes.push(`Status: ${Array.from(filtro.status).map(s => STATUS_ASE_LABEL[s] || s).join(', ')}`);
  }
  if (filtro.solicitantes.size) partes.push(`Solicitantes: ${Array.from(filtro.solicitantes).join(', ')}`);
  if (filtro.apenasTransporte) partes.push('Somente colaboradores com transporte');
  if (filtro.apenasRefeicao) partes.push('Somente colaboradores com refeição');

  return partes.join(' | ');
}
