/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Projetos — motor de autonomia.
 *
 * Responde três perguntas que a planilha respondia errado:
 *
 *  1. "Quantos kits de T1 dá para separar hoje?" — o gargalo, item a item.
 *  2. "Quantas TORRES completas o estoque atende?" — o rateio em cascata. A
 *     planilha calculava cada tramo como se tivesse o estoque inteiro à
 *     disposição, e um parafuso que serve T1 e T5 era contado duas vezes.
 *  3. "Vou ter peça até o fim do pedido?" — o saldo projetado, que é onde o
 *     refugo aparece: cada peça quebrada some do fim do subprojeto.
 */

import { Tramo, TRAMOS } from './projetos';
import type { ConsumoItem } from './projetosBom';

/** Saldo do almoxarifado por part number normalizado. */
export type SaldosPorItem = Map<string, number>;

export type ConsumoPorTramo = Map<Tramo, Map<string, ConsumoItem>>;

export interface ItemCritico {
  partNumberNorm: string;
  partNumber: string;
  descricao: string;
  codSap: string | null;
  consumoPorKit: number;
  saldo: number;
  /** Quantos kits este item sozinho sustenta. */
  kitsPossiveis: number;
}

export interface AutonomiaTramo {
  tramo: Tramo;
  /** Kits inteiros que o saldo atual atende, ignorando os outros tramos. */
  kitsPossiveis: number;
  /** O item que define o teto. Nulo quando o tramo não tem consumo cadastrado. */
  gargalo: ItemCritico | null;
  /** Os que mais apertam, em ordem. Os 5 primeiros vão para o painel. */
  criticos: ItemCritico[];
  itensNoKit: number;
}

/**
 * Autonomia isolada de cada tramo: `min(saldo / consumo)` entre os componentes.
 *
 * Isolada de propósito — é a resposta para "posso abrir uma ordem de T3 agora?".
 * Somar as autonomias dos cinco tramos NÃO dá o número de torres; para isso
 * existe `ratearCascata`, porque os tramos disputam as mesmas peças.
 */
export function autonomiaPorTramo(
  consumo: ConsumoPorTramo,
  saldos: SaldosPorItem,
): AutonomiaTramo[] {
  return TRAMOS.map((tramo) => {
    const itens = Array.from(consumo.get(tramo)?.values() ?? []);

    const criticos: ItemCritico[] = itens
      .filter((i) => i.qtdPorTorre > 0)
      .map((i) => {
        const saldo = saldos.get(i.partNumberNorm) ?? 0;
        return {
          partNumberNorm: i.partNumberNorm,
          partNumber: i.partNumber,
          descricao: i.descricao,
          codSap: i.codSap,
          consumoPorKit: i.qtdPorTorre,
          saldo,
          kitsPossiveis: Math.floor(saldo / i.qtdPorTorre),
        };
      })
      .sort((a, b) => a.kitsPossiveis - b.kitsPossiveis || b.consumoPorKit - a.consumoPorKit);

    return {
      tramo,
      kitsPossiveis: criticos.length ? Math.max(0, criticos[0].kitsPossiveis) : 0,
      gargalo: criticos[0] ?? null,
      criticos: criticos.slice(0, 5),
      itensNoKit: itens.length,
    };
  });
}

export interface RateioTramo {
  tramo: Tramo;
  /** Kits atendidos, podendo ser fracionário no tramo em que o saldo acabou. */
  kits: number;
  kitsInteiros: number;
}

export interface ResultadoRateio {
  porTramo: RateioTramo[];
  /** Torres completas (os 5 tramos) que o estoque atende. */
  torresCompletas: number;
  /** Saldo que sobra depois da alocação, por item. */
  residual: SaldosPorItem;
}

/**
 * Rateio em cascata, por RODADAS DE TORRE.
 *
 * A cada rodada tenta-se montar uma torre inteira, na ordem T1→T5, debitando
 * o saldo conforme aloca. A rodada em que o saldo não fecha um tramo registra
 * a fração atendida e encerra.
 *
 * Por rodadas, e não tramo a tramo até esgotar, porque o produto é a torre:
 * gastar todo o parafuso comum em 9 kits de T1 deixaria 0 torres prontas.
 *
 * Exemplo da especificação — item com 90 un e consumo T1=10, T2=20, T4=50,
 * T5=20: T1 leva 10 (sobra 80), T2 leva 20 (sobra 60), T4 leva 50 (sobra 10),
 * T5 precisa de 20 e recebe 10 → 0,5 kit.
 */
export function ratearCascata(
  consumo: ConsumoPorTramo,
  saldos: SaldosPorItem,
  /** Trava de segurança: sem ela, um tramo sem consumo cadastrado iteraria para sempre. */
  maxRodadas = 500,
): ResultadoRateio {
  const residual: SaldosPorItem = new Map(saldos);
  const kitsPorTramo = new Map<Tramo, number>(TRAMOS.map((t) => [t, 0]));
  let torresCompletas = 0;

  for (let rodada = 0; rodada < maxRodadas; rodada += 1) {
    let rodadaFechou = true;
    let alocouAlgo = false;

    for (const tramo of TRAMOS) {
      const itens = Array.from(consumo.get(tramo)?.values() ?? []).filter((i) => i.qtdPorTorre > 0);

      // Tramo sem consumo cadastrado não bloqueia a torre nem conta como kit.
      if (!itens.length) continue;

      // Fração deste kit que o saldo restante cobre.
      let fracao = 1;
      for (const item of itens) {
        const disponivel = residual.get(item.partNumberNorm) ?? 0;
        fracao = Math.min(fracao, disponivel / item.qtdPorTorre);
        if (fracao <= 0) break;
      }
      fracao = Math.max(0, Math.min(1, fracao));

      if (fracao > 0) {
        for (const item of itens) {
          const disponivel = residual.get(item.partNumberNorm) ?? 0;
          residual.set(item.partNumberNorm, arredondar(disponivel - item.qtdPorTorre * fracao));
        }
        kitsPorTramo.set(tramo, arredondar((kitsPorTramo.get(tramo) ?? 0) + fracao));
        alocouAlgo = true;
      }

      if (fracao < 1) rodadaFechou = false;
    }

    if (rodadaFechou && alocouAlgo) torresCompletas += 1;
    if (!rodadaFechou || !alocouAlgo) break;
  }

  return {
    porTramo: TRAMOS.map((tramo) => {
      const kits = kitsPorTramo.get(tramo) ?? 0;
      return { tramo, kits, kitsInteiros: Math.floor(kits) };
    }),
    torresCompletas,
    residual,
  };
}

export interface DeficitItem {
  partNumberNorm: string;
  partNumber: string;
  descricao: string;
  codSap: string | null;
  consumoPorTorre: number;
  demandaResidual: number;
  saldoFisico: number;
  emKits: number;
  saldoProjetado: number;
  /** Positivo = falta comprar. */
  deficit: number;
}

export interface ProjecaoSubprojeto {
  torresTotais: number;
  torresConcluidas: number;
  torresRestantes: number;
  /** Verdadeiro quando algum item fecha o pedido no negativo. */
  alertaCompraComplementar: boolean;
  deficits: DeficitItem[];
  itensAvaliados: number;
}

/**
 * Saldo projetado até o fim do subprojeto.
 *
 *   projetado = saldo_no_almoxarifado + o que já está em kits montados
 *             − consumo das torres que ainda faltam
 *
 * Os kits já montados entram como crédito porque a peça deles não precisa ser
 * comprada de novo — ela só saiu do almoxarifado para a bancada. O que faz
 * este número virar negativo é o refugo: cada peça quebrada e reposta pelo
 * formulário de sobressalente sai do estoque sem avançar torre nenhuma.
 */
export function saldoProjetado(params: {
  torresTotais: number;
  torresConcluidas: number;
  consumo: ConsumoPorTramo;
  saldos: SaldosPorItem;
  /** Quantidade de cada item retida em kits prontos no buffer. */
  emKits?: SaldosPorItem;
}): ProjecaoSubprojeto {
  const { torresTotais, torresConcluidas, consumo, saldos, emKits } = params;
  const restantes = Math.max(0, torresTotais - torresConcluidas);

  // Consumo de uma torre inteira: o mesmo part number somado nos cinco tramos.
  const porTorre = new Map<string, ConsumoItem & { total: number }>();
  for (const tramo of TRAMOS) {
    for (const item of consumo.get(tramo)?.values() ?? []) {
      const atual = porTorre.get(item.partNumberNorm);
      if (atual) atual.total += item.qtdPorTorre;
      else porTorre.set(item.partNumberNorm, { ...item, total: item.qtdPorTorre });
    }
  }

  const deficits: DeficitItem[] = [];

  for (const item of porTorre.values()) {
    const saldoFisico = saldos.get(item.partNumberNorm) ?? 0;
    const retido = emKits?.get(item.partNumberNorm) ?? 0;
    const demanda = arredondar(item.total * restantes);
    const projetado = arredondar(saldoFisico + retido - demanda);

    if (projetado >= 0) continue;

    deficits.push({
      partNumberNorm: item.partNumberNorm,
      partNumber: item.partNumber,
      descricao: item.descricao,
      codSap: item.codSap,
      consumoPorTorre: item.total,
      demandaResidual: demanda,
      saldoFisico,
      emKits: retido,
      saldoProjetado: projetado,
      deficit: arredondar(-projetado),
    });
  }

  deficits.sort((a, b) => b.deficit - a.deficit);

  return {
    torresTotais,
    torresConcluidas,
    torresRestantes: restantes,
    alertaCompraComplementar: deficits.length > 0,
    deficits,
    itensAvaliados: porTorre.size,
  };
}

/** Números de peça são inteiros na prática; 3 casas evitam o ruído de ponto flutuante. */
function arredondar(v: number): number {
  return Math.round(v * 1000) / 1000;
}
