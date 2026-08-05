/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  normalizarAliquota,
  precoUnitarioEfetivo,
  custoTotalUnitario,
  compararItem,
  compararTotais,
  type ItemComparado,
} from './calculo';
import type { ItemExtraido } from './tipos';

function item(overrides: Partial<ItemExtraido>): ItemExtraido {
  return {
    linha_ordem: 1,
    descricao_bruta: 'item de teste',
    quantidade: 1,
    preco_unitario_bruto: null,
    ...overrides,
  };
}

describe('normalizarAliquota', () => {
  it('converte ISENTO, "-", vazio e N/A em 0 (nunca null)', () => {
    expect(normalizarAliquota('ISENTO')).toBe(0);
    expect(normalizarAliquota('isento')).toBe(0);
    expect(normalizarAliquota('-')).toBe(0);
    expect(normalizarAliquota('')).toBe(0);
    expect(normalizarAliquota('N/A')).toBe(0);
    expect(normalizarAliquota(null)).toBe(0);
    expect(normalizarAliquota(undefined)).toBe(0);
  });

  it('converte "-" declarado no ICMS do item 17 do Ferimport (CST 60) em 0', () => {
    expect(normalizarAliquota('-')).toBe(0);
  });

  it('interpreta percentuais em texto e em número', () => {
    expect(normalizarAliquota('7%')).toBe(7);
    expect(normalizarAliquota('12,06%')).toBe(12.06);
    expect(normalizarAliquota(7)).toBe(7);
  });
});

describe('precoUnitarioEfetivo', () => {
  it('usa subtotal/quantidade quando há subtotal — nunca o preço cheio (Loja do Mecânico, item 4540)', () => {
    // Tesoura de Chapas: preço cheio R$ 116,56, desconto R$ 46,64, subtotal R$ 419,60, qtd 4.
    // O efetivo real é 419,60 / 4 = 104,90 — o próprio documento confirma isso
    // entre parênteses "(R$ 104,90 unid.)".
    const i = item({
      quantidade: 4,
      preco_unitario_bruto: 116.56,
      desconto_valor: 46.64,
      subtotal: 419.60,
    });
    expect(precoUnitarioEfetivo(i)).toBe(104.90);
  });

  it('cai para bruto − desconto quando não há subtotal', () => {
    const i = item({ quantidade: 2, preco_unitario_bruto: 100, desconto_valor: 20 });
    expect(precoUnitarioEfetivo(i)).toBe(90); // desconto de 20 no total, 10 por unidade
  });

  it('cai para bruto − (bruto × desconto%) quando só há percentual', () => {
    const i = item({ quantidade: 1, preco_unitario_bruto: 100, desconto_percentual: 10 });
    expect(precoUnitarioEfetivo(i)).toBe(90);
  });

  it('retorna o preço bruto quando não há desconto nem subtotal (Manglog)', () => {
    const i = item({ quantidade: 1, preco_unitario_bruto: 2983.34 });
    expect(precoUnitarioEfetivo(i)).toBe(2983.34);
  });

  it('retorna null quando não há preço nem subtotal', () => {
    expect(precoUnitarioEfetivo(item({ quantidade: 1 }))).toBeNull();
  });
});

describe('custoTotalUnitario', () => {
  it('soma IPI e ST por valor quando informados (Loja do Mecânico item 90424, com ST)', () => {
    // Macaco Garrafa: efetivo 93,90; VLR. ST: R$ 31,95 para qtd 2 → 15,975/un.
    const i = item({
      quantidade: 2,
      preco_unitario_bruto: 104.33,
      desconto_valor: 20.86,
      subtotal: 187.80,
      st_valor: 31.95,
    });
    expect(custoTotalUnitario(i)).toBeCloseTo(93.90 + 15.975, 2);
  });

  it('soma IPI por alíquota quando não há valor informado', () => {
    const i = item({ quantidade: 1, preco_unitario_bruto: 100, ipi_percentual: 10 });
    expect(custoTotalUnitario(i)).toBe(110);
  });

  it('ISENTO em IPI não adiciona custo (Manglog)', () => {
    const i = item({ quantidade: 1, preco_unitario_bruto: 2983.34, ipi_percentual: 0, icms_percentual: 7 });
    // ICMS não compõe o custo (é imposto por dentro, o preço já o inclui) — só IPI/ST/FCP entram.
    expect(custoTotalUnitario(i)).toBe(2983.34);
  });

  it('não inclui frete — frete é decisão do módulo, fica de fora do custo por item', () => {
    const i = item({ quantidade: 1, preco_unitario_bruto: 100 });
    expect(custoTotalUnitario(i)).toBe(100);
  });
});

describe('compararItem', () => {
  it('elege o vencedor pelo menor custo total entre os NÃO divergentes', () => {
    // Furadeira GSB 20-2 RE 800W: Manglog 2983,34 (bruto, sem IPI/ST), Anhanguera 1125,71,
    // Loja do Mecânico 1369,90, Ferimport 525,00 mas é um MODELO DIFERENTE (GSB 16 RE 850W).
    const itens: ItemComparado[] = [
      { propostaId: 'manglog', itemExtraido: item({}), precoEfetivo: 2983.34, custoTotal: 2983.34, divergente: false },
      { propostaId: 'anhanguera', itemExtraido: item({}), precoEfetivo: 1125.71, custoTotal: 1125.71, divergente: false },
      { propostaId: 'loja_mecanico', itemExtraido: item({}), precoEfetivo: 1369.90, custoTotal: 1369.90, divergente: false },
      { propostaId: 'ferimport', itemExtraido: item({}), precoEfetivo: 525.00, custoTotal: 525.00, divergente: true },
    ];
    const resultado = compararItem('item-furadeira', itens);
    expect(resultado.propostaVencedoraId).toBe('anhanguera');
    expect(resultado.deltaPercentual['ferimport']).toBeNull(); // divergente não recebe Δ%
    expect(resultado.deltaPercentual['anhanguera']).toBe(0);
    expect(resultado.deltaPercentual['manglog']).toBeGreaterThan(0);
  });

  it('quando todas as propostas do item são divergentes, não há vencedor sugerido', () => {
    const itens: ItemComparado[] = [
      { propostaId: 'a', itemExtraido: item({}), precoEfetivo: 10, custoTotal: 10, divergente: true },
      { propostaId: 'b', itemExtraido: item({}), precoEfetivo: 5, custoTotal: 5, divergente: true },
    ];
    const resultado = compararItem('item-x', itens);
    expect(resultado.propostaVencedoraId).toBeNull();
  });

  it('item não cotado (custoTotal null) fica de fora da disputa', () => {
    const itens: ItemComparado[] = [
      { propostaId: 'a', itemExtraido: item({}), precoEfetivo: null, custoTotal: null, divergente: false },
      { propostaId: 'b', itemExtraido: item({}), precoEfetivo: 296.77, custoTotal: 296.77, divergente: false },
    ];
    const resultado = compararItem('item-pasta', itens);
    expect(resultado.propostaVencedoraId).toBe('b');
  });
});

describe('compararTotais', () => {
  it('sinaliza quando o vencedor por soma de itens diverge do vencedor por total (frete pesa)', () => {
    const totais = [
      { propostaId: 'a', somaItens: 100, freteValor: 0, totalComFrete: 100 },
      { propostaId: 'b', somaItens: 90, freteValor: 50, totalComFrete: 140 },
    ];
    const resultado = compararTotais(totais);
    expect(resultado.vencedorPorSomaItensId).toBe('b');
    expect(resultado.vencedorPorTotalId).toBe('a');
    expect(resultado.divergenciaFreteTotal).toBe(true);
  });

  it('não sinaliza divergência quando o mesmo fornecedor vence dos dois jeitos', () => {
    const totais = [
      { propostaId: 'a', somaItens: 100, freteValor: 0, totalComFrete: 100 },
      { propostaId: 'b', somaItens: 200, freteValor: 0, totalComFrete: 200 },
    ];
    const resultado = compararTotais(totais);
    expect(resultado.divergenciaFreteTotal).toBe(false);
  });
});
