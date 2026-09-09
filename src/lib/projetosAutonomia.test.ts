/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { autonomiaPorTramo, ratearCascata, saldoProjetado, type ConsumoPorTramo, type SaldosPorItem } from './projetosAutonomia';
import type { ConsumoItem } from './projetosBom';
import type { Tramo } from './projetos';

const item = (pn: string, qtd: number): ConsumoItem => ({
  partNumberNorm: pn,
  partNumber: pn,
  codSap: null,
  descricao: pn,
  qtdPorTorre: qtd,
  subconjuntos: [],
  linhasBom: 1,
  niveis: [],
});

/** Monta o mapa de consumo a partir de `{ T1: { PN: qtd } }`. */
const consumoDe = (spec: Partial<Record<Tramo, Record<string, number>>>): ConsumoPorTramo => {
  const mapa: ConsumoPorTramo = new Map();
  for (const [tramo, itens] of Object.entries(spec)) {
    const m = new Map<string, ConsumoItem>();
    for (const [pn, qtd] of Object.entries(itens as Record<string, number>)) m.set(pn, item(pn, qtd));
    mapa.set(tramo as Tramo, m);
  }
  return mapa;
};

const saldosDe = (spec: Record<string, number>): SaldosPorItem => new Map(Object.entries(spec));

describe('ratearCascata — exemplo da especificação', () => {
  /**
   * Item com 90 un em estoque. Consumos por torre: T1=10, T2=20, T4=50, T5=20.
   * Alocação esperada: T1 e T2 e T4 fecham 1 kit; o T5 recebe as 10 que
   * sobraram e fica em 0,5 kit.
   */
  const consumo = consumoDe({ T1: { P: 10 }, T2: { P: 20 }, T4: { P: 50 }, T5: { P: 20 } });

  it('aloca na fila T1→T5 e deixa a fração no tramo em que o saldo acaba', () => {
    const r = ratearCascata(consumo, saldosDe({ P: 90 }));
    const kits = Object.fromEntries(r.porTramo.map((t) => [t.tramo, t.kits]));

    expect(kits.T1).toBe(1);
    expect(kits.T2).toBe(1);
    expect(kits.T4).toBe(1);
    expect(kits.T5).toBe(0.5);
    expect(r.residual.get('P')).toBe(0);
  });

  it('não conta torre completa quando o T5 ficou pela metade', () => {
    expect(ratearCascata(consumo, saldosDe({ P: 90 })).torresCompletas).toBe(0);
  });

  it('conta a torre quando o saldo fecha os cinco tramos', () => {
    // T3 não tem consumo cadastrado neste cenário e não bloqueia.
    const r = ratearCascata(consumo, saldosDe({ P: 100 }));
    expect(r.torresCompletas).toBe(1);
    expect(r.residual.get('P')).toBe(0);
  });

  it('duas torres com o dobro do saldo', () => {
    const r = ratearCascata(consumo, saldosDe({ P: 200 }));
    expect(r.torresCompletas).toBe(2);
    expect(r.porTramo.find((t) => t.tramo === 'T5')!.kits).toBe(2);
  });
});

describe('ratearCascata — casos de borda', () => {
  it('estoque zerado não aloca nada', () => {
    const r = ratearCascata(consumoDe({ T1: { P: 5 } }), saldosDe({}));
    expect(r.torresCompletas).toBe(0);
    expect(r.porTramo.every((t) => t.kits === 0)).toBe(true);
  });

  it('item que falta em um tramo não impede os anteriores', () => {
    const consumo = consumoDe({ T1: { A: 1 }, T2: { B: 1 } });
    const r = ratearCascata(consumo, saldosDe({ A: 5, B: 0 }));
    expect(r.porTramo.find((t) => t.tramo === 'T1')!.kits).toBe(1);
    expect(r.porTramo.find((t) => t.tramo === 'T2')!.kits).toBe(0);
    expect(r.torresCompletas).toBe(0);
  });

  it('consumo vazio em todos os tramos termina sem laço infinito', () => {
    const r = ratearCascata(new Map(), saldosDe({ P: 10 }));
    expect(r.torresCompletas).toBe(0);
    expect(r.residual.get('P')).toBe(10);
  });

  it('não deixa o saldo residual negativo', () => {
    const r = ratearCascata(consumoDe({ T1: { P: 7 }, T2: { P: 7 } }), saldosDe({ P: 10 }));
    expect(r.residual.get('P')!).toBeGreaterThanOrEqual(0);
  });
});

describe('autonomiaPorTramo', () => {
  const consumo = consumoDe({ T1: { PARAFUSO: 10, ARRUELA: 20, PORCA: 10 } });

  it('o teto é o menor saldo/consumo e o gargalo é quem o define', () => {
    const a = autonomiaPorTramo(consumo, saldosDe({ PARAFUSO: 100, ARRUELA: 45, PORCA: 100 }))
      .find((t) => t.tramo === 'T1')!;

    expect(a.kitsPossiveis).toBe(2); // floor(45/20)
    expect(a.gargalo!.partNumber).toBe('ARRUELA');
    expect(a.gargalo!.kitsPossiveis).toBe(2);
  });

  it('lista os críticos em ordem de aperto, no máximo 5', () => {
    const a = autonomiaPorTramo(consumo, saldosDe({ PARAFUSO: 100, ARRUELA: 45, PORCA: 30 }))
      .find((t) => t.tramo === 'T1')!;
    expect(a.criticos.map((c) => c.partNumber)).toEqual(['ARRUELA', 'PORCA', 'PARAFUSO']);
    expect(a.criticos.length).toBeLessThanOrEqual(5);
  });

  it('tramo sem consumo cadastrado dá zero, não infinito', () => {
    const a = autonomiaPorTramo(consumo, saldosDe({})).find((t) => t.tramo === 'T3')!;
    expect(a.kitsPossiveis).toBe(0);
    expect(a.gargalo).toBeNull();
    expect(a.itensNoKit).toBe(0);
  });

  it('devolve sempre os cinco tramos', () => {
    expect(autonomiaPorTramo(consumo, saldosDe({}))).toHaveLength(5);
  });
});

describe('saldoProjetado', () => {
  const consumo = consumoDe({ T1: { P: 10 }, T5: { P: 5 } }); // 15 por torre

  it('sem déficit não dispara alerta', () => {
    const p = saldoProjetado({
      torresTotais: 23,
      torresConcluidas: 3,
      consumo,
      saldos: saldosDe({ P: 15 * 20 }),
    });
    expect(p.torresRestantes).toBe(20);
    expect(p.alertaCompraComplementar).toBe(false);
    expect(p.deficits).toHaveLength(0);
  });

  it('refugo derruba o projetado e dispara o alerta com o volume exato', () => {
    // 20 torres restantes x 15 = 300; estoque 290 (10 peças refugadas).
    const p = saldoProjetado({
      torresTotais: 23,
      torresConcluidas: 3,
      consumo,
      saldos: saldosDe({ P: 290 }),
    });
    expect(p.alertaCompraComplementar).toBe(true);
    expect(p.deficits[0].deficit).toBe(10);
    expect(p.deficits[0].demandaResidual).toBe(300);
  });

  it('peça retida em kit montado conta como crédito', () => {
    const p = saldoProjetado({
      torresTotais: 23,
      torresConcluidas: 3,
      consumo,
      saldos: saldosDe({ P: 290 }),
      emKits: saldosDe({ P: 10 }),
    });
    expect(p.alertaCompraComplementar).toBe(false);
  });

  it('soma o mesmo part number nos cinco tramos', () => {
    const p = saldoProjetado({ torresTotais: 1, torresConcluidas: 0, consumo, saldos: saldosDe({ P: 0 }) });
    expect(p.deficits[0].consumoPorTorre).toBe(15);
    expect(p.itensAvaliados).toBe(1);
  });

  it('pedido concluído não gera demanda residual', () => {
    const p = saldoProjetado({ torresTotais: 23, torresConcluidas: 23, consumo, saldos: saldosDe({ P: 0 }) });
    expect(p.torresRestantes).toBe(0);
    expect(p.alertaCompraComplementar).toBe(false);
  });
});
