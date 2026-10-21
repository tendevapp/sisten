/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Filtro por data de alteração do Cadastro de Itens: atalhos (hoje, ontem,
 * últimos N dias) ou período escolhido. Compara pelo dia LOCAL do aparelho —
 * um cadastro salvo às 22h de 20/10 em UTC-3 já é 21/10 em UTC e cairia no
 * dia errado se fosse fatiado da string ISO.
 */

import { diaLocal } from './sessaoDiaria';

export type FiltroDataAlteracao = 'todas' | 'hoje' | 'ontem' | '7dias' | '30dias' | 'periodo';

export const OPCOES_FILTRO_DATA: { valor: FiltroDataAlteracao; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Qualquer data' },
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: 'ontem', rotulo: 'Ontem' },
  { valor: '7dias', rotulo: 'Últimos 7 dias' },
  { valor: '30dias', rotulo: 'Últimos 30 dias' },
  { valor: 'periodo', rotulo: 'Período…' },
];

function diasAtras(agora: Date, n: number): string {
  const d = new Date(agora);
  d.setDate(d.getDate() - n);
  return diaLocal(d);
}

/** Intervalo [de, até] em AAAA-MM-DD; ponta vazia = sem limite. */
export function intervaloDoFiltro(
  filtro: FiltroDataAlteracao,
  periodo: { de: string; ate: string },
  agora = new Date(),
): { de: string; ate: string } | null {
  const hoje = diaLocal(agora);
  switch (filtro) {
    case 'todas': return null;
    case 'hoje': return { de: hoje, ate: hoje };
    case 'ontem': { const ontem = diasAtras(agora, 1); return { de: ontem, ate: ontem }; }
    case '7dias': return { de: diasAtras(agora, 6), ate: hoje };
    case '30dias': return { de: diasAtras(agora, 29), ate: hoje };
    case 'periodo':
      // Datas trocadas (até antes de de) valem como o mesmo intervalo.
      return periodo.de && periodo.ate && periodo.de > periodo.ate
        ? { de: periodo.ate, ate: periodo.de }
        : { de: periodo.de, ate: periodo.ate };
  }
}

/** "21/10 15:03" no fuso do aparelho; o ano só aparece quando não é o atual. */
export function formatarAlteracao(alteradoEm: string, agora = new Date()): string {
  const d = new Date(alteradoEm);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  const ano = d.getFullYear() === agora.getFullYear() ? '' : `/${d.getFullYear()}`;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}${ano} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** O instante `alteradoEm` (ISO) cai no intervalo? Sem data, fica fora de qualquer filtro ativo. */
export function alteradoNoIntervalo(alteradoEm: string | null | undefined, intervalo: { de: string; ate: string } | null): boolean {
  if (!intervalo) return true;
  if (!alteradoEm) return false;
  const instante = new Date(alteradoEm);
  if (Number.isNaN(instante.getTime())) return false;
  const dia = diaLocal(instante);
  if (intervalo.de && dia < intervalo.de) return false;
  if (intervalo.ate && dia > intervalo.ate) return false;
  return true;
}
