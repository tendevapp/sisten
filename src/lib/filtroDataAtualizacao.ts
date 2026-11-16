/**
 * Filtro "Data de atualização" de listas com cadastro alterável (ex.: Itens
 * BOM — foto, localização, etiqueta). Os atalhos olham para trás (hoje,
 * últimos 7/30 dias, este mês); "Período" usa De/Até; "Nunca" é quem ainda não
 * tem cadastro. A data do registro (timestamptz) vira o dia no fuso do
 * aparelho antes de comparar — `slice(0, 10)` daria o dia em UTC.
 */
import { dataHojeLocal, dataLocalMaisDias, paraISOLocal } from './dataLocal';

export type PresetAtualizacao = 'todos' | 'hoje' | '7dias' | '30dias' | 'este_mes' | 'periodo' | 'nunca';

export interface FiltroAtualizacao {
  preset: PresetAtualizacao;
  /** YYYY-MM-DD; só no preset "periodo" (vazio = sem limite). */
  de: string;
  ate: string;
}

export const FILTRO_ATUALIZACAO_VAZIO: FiltroAtualizacao = { preset: 'todos', de: '', ate: '' };

export const ROTULO_PRESET_ATUALIZACAO: Record<PresetAtualizacao, string> = {
  todos: 'Qualquer data de atualização',
  hoje: 'Atualizados hoje',
  '7dias': 'Atualizados nos últimos 7 dias',
  '30dias': 'Atualizados nos últimos 30 dias',
  este_mes: 'Atualizados este mês',
  periodo: 'Atualizados no período…',
  nunca: 'Nunca cadastrados',
};

/** Intervalo de dias (inclusivo) do filtro; null quando não limita por data. */
export function intervaloAtualizacao(f: FiltroAtualizacao, agora: Date = new Date()): { de: string; ate: string } | null {
  const hoje = dataHojeLocal(agora);
  switch (f.preset) {
    case 'hoje': return { de: hoje, ate: hoje };
    case '7dias': return { de: dataLocalMaisDias(-6, agora), ate: hoje };
    case '30dias': return { de: dataLocalMaisDias(-29, agora), ate: hoje };
    case 'este_mes': return { de: `${hoje.slice(0, 8)}01`, ate: hoje };
    case 'periodo': {
      if (!f.de && !f.ate) return null;
      // De/Até trocados: a pessoa quis o intervalo entre as duas datas.
      if (f.de && f.ate && f.de > f.ate) return { de: f.ate, ate: f.de };
      return { de: f.de, ate: f.ate };
    }
    default: return null;
  }
}

/** O registro (data de atualização, ou nada quando não tem cadastro) entra no filtro? */
export function casaAtualizacao(
  atualizadoEm: string | null | undefined,
  f: FiltroAtualizacao,
  agora: Date = new Date(),
): boolean {
  if (f.preset === 'todos') return true;
  if (f.preset === 'nunca') return !atualizadoEm;
  const intervalo = intervaloAtualizacao(f, agora);
  if (!intervalo) return true;
  if (!atualizadoEm) return false;
  const quando = new Date(atualizadoEm);
  if (Number.isNaN(quando.getTime())) return false;
  const dia = paraISOLocal(quando);
  if (intervalo.de && dia < intervalo.de) return false;
  if (intervalo.ate && dia > intervalo.ate) return false;
  return true;
}
