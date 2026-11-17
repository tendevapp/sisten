/**
 * Roteiro da contagem do inventário cíclico: os itens na ordem em que se anda
 * pelo galpão, pela posição de estoque (`1DD.BBAAPP` da ZL0024) — depósito,
 * bloco, andar, apartamento — e agrupados pela estante/área do Gemba. Item sem
 * posição vai para o fim, na ordem da lista.
 */
import { interpretarPosicao, separarPosicoes } from './gembaEndereco';
import { localizar } from './gembaLayout';

const comparador = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** Chave `material|depósito` com o material sem zeros à esquerda e o depósito em 4 dígitos. */
export function chavePosicao(material: string | null | undefined, deposito: string | null | undefined): string {
  return `${String(material ?? '').trim().replace(/^0+/, '')}|${String(deposito ?? '').trim().padStart(4, '0')}`;
}

/** Posições de cada material × depósito, a partir das linhas da ZL0024. */
export function indexarPosicoes(
  linhas: { material?: string | null; deposito?: string | null; posicao_estoque?: string | null }[],
): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const l of linhas) {
    const posicoes = separarPosicoes(l.posicao_estoque);
    if (posicoes.length === 0) continue;
    const chave = chavePosicao(l.material, l.deposito);
    const atual = mapa.get(chave) ?? [];
    for (const p of posicoes) if (!atual.includes(p)) atual.push(p);
    mapa.set(chave, atual.sort(comparador.compare));
  }
  return mapa;
}

/** Ordena pelo roteiro (primeira posição de cada item); sem posição no fim, na ordem original. */
export function ordenarPorRoteiro<T>(itens: T[], posicoesDe: (item: T) => string[]): T[] {
  return itens
    .map((item, i) => ({ item, i, pos: posicoesDe(item)[0] ?? '' }))
    .sort((a, b) => {
      if (!a.pos !== !b.pos) return a.pos ? -1 : 1;
      return comparador.compare(a.pos, b.pos) || a.i - b.i;
    })
    .map((x) => x.item);
}

/** Estante ou área do galpão onde a posição fica — o cabeçalho do grupo no roteiro. */
export function grupoDoRoteiro(posicao: string | null | undefined): string {
  const endereco = interpretarPosicao(posicao);
  if (!endereco) return 'Sem posição na ZL0024';
  if (endereco.tipo === 'fora') return endereco.motivo === 'externo' ? 'Depósito externo' : 'Fora do mapa do galpão';
  const loc = localizar(endereco);
  if (!loc) return 'Fora do mapa do galpão';
  const corte = loc.trilha.findIndex((t) => /^(Bloco|Andar|Chão|Apto)\b/.test(t));
  return [...new Set(corte > 0 ? loc.trilha.slice(0, corte) : loc.trilha)].join(' › ');
}
