import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/supabaseClient', () => ({ supabase: {} }));

import { calcularAutonomiaPeca, normalizarSituacaoPeca, rotuloMovimentoPeca, type ConsumoTramoPeca } from './situacaoPecaProjeto';

const tramo = (t: string, qtd: number, pendentes: number): ConsumoTramoPeca => ({
  tramo: t, secao: `S${t.slice(1)}`, qtd_por_torre: qtd, subconjuntos: [], tramos_pendentes: pendentes, tramos_total: 69,
});

describe('calcularAutonomiaPeca', () => {
  // Parafuso 404001475: 12 por tramo do T2 ao T5.
  const consumo = [tramo('T2', 12, 67), tramo('T3', 12, 68), tramo('T4', 12, 69), tramo('T5', 12, 69)];

  it('por tramo, o saldo inteiro; por torre, a soma dos tramos', () => {
    const a = calcularAutonomiaPeca(1012, consumo);
    expect(a.porTorre).toBe(48);
    expect(a.torres).toBe(21);
    expect(a.tramos[0]).toMatchObject({ tramo: 'T2', porTramo: 12, tramosCobertos: 84, pendentes: 67, necessario: 804 });
    expect(a.demandaPendente).toBe(12 * (67 + 68 + 69 + 69));
    expect(a.falta).toBe(12 * (67 + 68 + 69 + 69) - 1012);
  });

  it('saldo que cobre todos os pendentes não deixa falta', () => {
    const a = calcularAutonomiaPeca(200, [tramo('T1', 2, 66)]);
    expect(a).toMatchObject({ torres: 100, demandaPendente: 132, falta: 0 });
  });

  it('sem consumo na BOM não há torre a calcular; saldo negativo conta zero', () => {
    expect(calcularAutonomiaPeca(50, [])).toMatchObject({ tramos: [], porTorre: 0, torres: null, falta: 0 });
    expect(calcularAutonomiaPeca(-5, [tramo('T1', 2, 1)])).toMatchObject({ torres: 0, falta: 2 });
  });
});

describe('normalizarSituacaoPeca', () => {
  it('números chegam como texto do PostgREST e viram número', () => {
    const d = normalizarSituacaoPeca({
      item: { id: 'x', part_number: '60.10.92715', estoque_minimo: '0' },
      saldo: { entradas: '46', saidas: '0', refugo: '0', saldo: '46' },
      consumo: [{ tramo: 'T1', secao: 'S1', qtd_por_torre: '2.000', subconjuntos: ['a'], tramos_pendentes: 66, tramos_total: 69 }],
      pendentes_entrega: { quantidade: '8', linhas: 1, notas: 1, desde: '2026-06-01' },
      movimentos: [{ tipo: 'entrada_nf', quantidade: '46', em: '2026-09-09T11:44:07Z' }],
    })!;
    expect(d.saldo.saldo).toBe(46);
    expect(d.consumo[0].qtd_por_torre).toBe(2);
    expect(d.pendentes_entrega.quantidade).toBe(8);
    expect(d.movimentos[0].quantidade).toBe(46);
    expect(d.item.estoque_minimo).toBe(0);
  });

  it('sem item (peça fora do catálogo) devolve null', () => {
    expect(normalizarSituacaoPeca(null)).toBeNull();
    expect(normalizarSituacaoPeca({})).toBeNull();
  });
});

describe('rotuloMovimentoPeca', () => {
  it('tipo conhecido tem rótulo; desconhecido sai legível', () => {
    expect(rotuloMovimentoPeca('saida_premontagem')).toBe('Saída pré-montagem');
    expect(rotuloMovimentoPeca('novo_tipo')).toBe('novo tipo');
  });
});
