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
 * Há cenas de todo mundo (`CENAS_PUBLICAS`) e cenas só de admin (`CENAS_ADMIN`):
 * quem não é admin nunca as recebe, nem pelo sorteio, nem por `?cena=`, nem por
 * um valor que tenha ficado gravado no navegador.
 *
 * `?cena=calandra` na URL força uma cena — serve para conferir todas.
 */

export const CENAS_PUBLICAS = [
  'eolica',
  'laser',
  'guindaste',
  'bateria',
  'calandra',
  'pintura',
  'ponte',
  'solda',
  'inspecao',
  'empilhadeira',
  'amanhecer',
  'gantt',
] as const;

export const CENAS_ADMIN = [
  'torque',
  'drone',
  'jato',
  'ultrassom',
  'epi',
  'tanque',
  'cancela',
  'carreta',
  'icamento',
  'paquimetro',
  'pedido',
] as const;

export const CENAS = [...CENAS_PUBLICAS, ...CENAS_ADMIN] as const;
export type CenaId = (typeof CENAS)[number];

/** Nome para mostrar no seletor de cena do admin. */
export const NOMES_CENAS: Record<CenaId, string> = {
  eolica: 'Torre eólica',
  laser: 'Corte a laser',
  guindaste: 'Guindaste',
  bateria: 'Turbina e bateria',
  calandra: 'Calandra',
  pintura: 'Pintura',
  ponte: 'Ponte rolante',
  solda: 'Solda',
  inspecao: 'Inspeção',
  empilhadeira: 'Empilhadeira',
  amanhecer: 'Amanhecer',
  gantt: 'Gantt vivo',
  torque: 'Torque em estrela',
  drone: 'Drone',
  jato: 'Jateamento',
  ultrassom: 'Ultrassom',
  epi: 'EPI',
  tanque: 'Estoque mínimo',
  cancela: 'Cancela',
  carreta: 'Carreta',
  icamento: 'Içamento da pá',
  paquimetro: 'Paquímetro',
  pedido: 'Pedido',
};

const CHAVE_CENA_SESSAO = 'sisten_cena_inicio';
const CHAVE_ULTIMA_CENA = 'sisten_cena_inicio_ultima';

export function ehCenaId(valor: unknown): valor is CenaId {
  return typeof valor === 'string' && (CENAS as readonly string[]).includes(valor);
}

/** Cenas que essa pessoa pode ver: as de admin só entram para admin. */
export function cenasPermitidas(admin: boolean): readonly CenaId[] {
  return admin ? CENAS : CENAS_PUBLICAS;
}

function ehCenaPermitida(valor: unknown, admin: boolean): valor is CenaId {
  return typeof valor === 'string' && (cenasPermitidas(admin) as readonly string[]).includes(valor);
}

/** Sorteia uma cena diferente da anterior (se houver mais de uma para escolher). */
export function sortearCena(anterior?: string | null, aleatorio: () => number = Math.random, admin = false): CenaId {
  const candidatas = cenasPermitidas(admin).filter(c => c !== anterior);
  const indice = Math.min(Math.floor(aleatorio() * candidatas.length), candidatas.length - 1);
  return candidatas[indice];
}

/** Lê `?cena=` da query string; `null` quando ausente, desconhecida ou fora do alcance de quem pediu. */
export function cenaForcada(search: string, admin = false): CenaId | null {
  const valor = new URLSearchParams(search).get('cena');
  return ehCenaPermitida(valor, admin) ? valor : null;
}

/** Cena da sessão atual: reaproveita a já sorteada ou sorteia uma nova. */
export function cenaDaSessao(aleatorio: () => number = Math.random, admin = false): CenaId {
  try {
    const atual = sessionStorage.getItem(CHAVE_CENA_SESSAO);
    if (ehCenaPermitida(atual, admin)) return atual;
  } catch {
    /* storage indisponível: cai no sorteio abaixo, sem persistir */
  }

  let anterior: string | null = null;
  try {
    anterior = localStorage.getItem(CHAVE_ULTIMA_CENA);
  } catch {
    /* ignore */
  }

  const sorteada = sortearCena(anterior, aleatorio, admin);
  definirCenaSessao(sorteada);
  return sorteada;
}

/** Fixa a cena da sessão (o seletor do admin usa): navegar e recarregar não desfazem. */
export function definirCenaSessao(id: CenaId): void {
  try {
    sessionStorage.setItem(CHAVE_CENA_SESSAO, id);
    localStorage.setItem(CHAVE_ULTIMA_CENA, id);
  } catch {
    /* ignore */
  }
}

/** Cena seguinte (`passo` 1) ou anterior (-1) na lista de quem pode ver todas, dando a volta. */
export function proximaCena(atual: CenaId, passo: 1 | -1): CenaId {
  const i = CENAS.indexOf(atual);
  return CENAS[(i + passo + CENAS.length) % CENAS.length];
}

/** Esquece a cena da sessão. Chamar no logout, para o próximo login sortear outra. */
export function limparCenaSessao(): void {
  try {
    sessionStorage.removeItem(CHAVE_CENA_SESSAO);
  } catch {
    /* ignore */
  }
}
