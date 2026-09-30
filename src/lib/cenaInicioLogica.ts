/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Contas puras das cenas animadas da tela Início (as que têm regra além do
 * desenho): fase do dia da "torre ao amanhecer" e propagação do cronograma do
 * "Gantt vivo". Ficam fora dos componentes para serem testadas em ambiente node.
 */

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export interface FaseDoDia {
  /** 0 = noite fechada, 1 = dia pleno. */
  luz: number;
  /** 0 a 1: quão perto do nascer/pôr do sol (tom alaranjado do céu). */
  crepusculo: number;
  /** Posição do sol no arco (0 nasce, 1 se põe); fora de 0..1 ele está abaixo do horizonte. */
  solFrac: number;
  /** Idem para a lua, que faz o arco de 18h a 6h. */
  luaFrac: number;
}

/** Dia entre 6h e 18h; `hora` é fracionária (13,5 = 13h30) e dá a volta em 24. */
export function faseDoDia(hora: number): FaseDoDia {
  const h = ((hora % 24) + 24) % 24;
  const altura = Math.sin((Math.PI * (h - 6)) / 12);
  return {
    luz: limitar((altura + 0.2) / 0.5, 0, 1),
    crepusculo: limitar(1 - Math.abs(altura) / 0.35, 0, 1),
    solFrac: (h - 6) / 12,
    luaFrac: ((((h - 18) % 24) + 24) % 24) / 12,
  };
}

const canal = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

/** Mistura dois `#rrggbb`: t=0 devolve `a`, t=1 devolve `b`. */
export function misturarCor(a: string, b: string, t: number): string {
  const k = limitar(t, 0, 1);
  const parte = (i: number) =>
    Math.round(canal(a, i) + (canal(b, i) - canal(a, i)) * k)
      .toString(16)
      .padStart(2, '0');
  return `#${parte(0)}${parte(1)}${parte(2)}`;
}

export interface BarraGantt {
  id: string;
  inicio: number;
  dur: number;
  /** Id da barra que precisa terminar antes desta começar. */
  dep?: string;
}

const fim = (b: BarraGantt) => b.inicio + b.dur;

/**
 * Desloca a barra `id` em `delta` e leva junto todas as que dependem dela
 * (direta ou indiretamente), mantendo a folga entre elas. O deslocamento é
 * limitado para ninguém sair de [0, limite] nem a barra começar antes do fim
 * da sua predecessora. Devolve um novo vetor.
 */
export function propagarGantt(barras: BarraGantt[], id: string, delta: number, limite: number): BarraGantt[] {
  const alvo = barras.find(b => b.id === id);
  if (!alvo) return barras;

  const movem = new Set([id]);
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (const b of barras) {
      if (b.dep && movem.has(b.dep) && !movem.has(b.id)) {
        movem.add(b.id);
        mudou = true;
      }
    }
  }
  const afetadas = barras.filter(b => movem.has(b.id));

  let minimo = Math.max(...afetadas.map(b => -b.inicio));
  const pred = alvo.dep ? barras.find(b => b.id === alvo.dep) : undefined;
  if (pred) minimo = Math.max(minimo, fim(pred) - alvo.inicio);
  const maximo = Math.min(...afetadas.map(b => limite - fim(b)));

  const d = minimo > maximo ? 0 : limitar(delta, minimo, maximo);
  if (d === 0) return barras;
  return barras.map(b => (movem.has(b.id) ? { ...b, inicio: b.inicio + d } : b));
}
