/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sorteio da cena animada do cabeçalho da tela Início (o "easter egg").
 *
 * A cena muda a cada login: fica gravada em `sessionStorage` enquanto a sessão
 * durar (navegar e recarregar não troca) e é apagada no logout. A última cena
 * vista fica em `localStorage` só para o sorteio seguinte não repetir.
 *
 * `?cena=calandra` na URL força uma cena — serve para conferir todas.
 */

export const CENAS = ['eolica', 'laser', 'guindaste', 'bateria', 'calandra', 'pintura'] as const;
export type CenaId = (typeof CENAS)[number];

const CHAVE_CENA_SESSAO = 'sisten_cena_inicio';
const CHAVE_ULTIMA_CENA = 'sisten_cena_inicio_ultima';

export function ehCenaId(valor: unknown): valor is CenaId {
  return typeof valor === 'string' && (CENAS as readonly string[]).includes(valor);
}

/** Sorteia uma cena diferente da anterior (se houver mais de uma para escolher). */
export function sortearCena(anterior?: string | null, aleatorio: () => number = Math.random): CenaId {
  const candidatas = CENAS.filter(c => c !== anterior);
  const indice = Math.min(Math.floor(aleatorio() * candidatas.length), candidatas.length - 1);
  return candidatas[indice];
}

/** Lê `?cena=` da query string; `null` quando ausente ou desconhecida. */
export function cenaForcada(search: string): CenaId | null {
  const valor = new URLSearchParams(search).get('cena');
  return ehCenaId(valor) ? valor : null;
}

/** Cena da sessão atual: reaproveita a já sorteada ou sorteia uma nova. */
export function cenaDaSessao(aleatorio: () => number = Math.random): CenaId {
  try {
    const atual = sessionStorage.getItem(CHAVE_CENA_SESSAO);
    if (ehCenaId(atual)) return atual;
  } catch {
    /* storage indisponível: cai no sorteio abaixo, sem persistir */
  }

  let anterior: string | null = null;
  try {
    anterior = localStorage.getItem(CHAVE_ULTIMA_CENA);
  } catch {
    /* ignore */
  }

  const sorteada = sortearCena(anterior, aleatorio);
  try {
    sessionStorage.setItem(CHAVE_CENA_SESSAO, sorteada);
    localStorage.setItem(CHAVE_ULTIMA_CENA, sorteada);
  } catch {
    /* ignore */
  }
  return sorteada;
}

/** Esquece a cena da sessão. Chamar no logout, para o próximo login sortear outra. */
export function limparCenaSessao(): void {
  try {
    sessionStorage.removeItem(CHAVE_CENA_SESSAO);
  } catch {
    /* ignore */
  }
}
