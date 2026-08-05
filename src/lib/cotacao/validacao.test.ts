/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { validarItem, validarProposta } from './validacao';
import {
  PROPOSTA_MANGLOG,
  PROPOSTA_FERIMPORT,
  PROPOSTA_ANHANGUERA_PARCIAL,
  PROPOSTA_LOJA_DO_MECANICO_PARCIAL,
} from './__fixtures__/propostasEstruturadasReais';

describe('validarProposta — documentos reais', () => {
  it('Manglog: soma das 26 linhas fecha exatamente com o total declarado (32.175,99)', () => {
    const resultado = validarProposta(PROPOSTA_MANGLOG);
    expect(resultado.totalCalculado).toBeCloseTo(32175.99, 2);
    expect(resultado.status).toBe('ok');
    expect(resultado.itensComProblema).toEqual([]);
    expect(resultado.contagemDivergente).toBe(false);
  });

  it('Ferimport: soma das 27 linhas (com lacuna 25/26 e número partido 10.966,17) fecha com 21.645,80', () => {
    const resultado = validarProposta(PROPOSTA_FERIMPORT);
    expect(resultado.totalCalculado).toBeCloseTo(21645.80, 2);
    expect(resultado.status).toBe('ok');
    // Documento declara "27 itens" e numera até 29, pulando 25 e 26 — a
    // contagem bate (27 linhas extraídas) mesmo com numeração descontínua.
    expect(resultado.contagemDivergente).toBe(false);
  });

  it('reconcilia soma + IPI quando é essa combinação que bate com o total declarado (padrão Anhanguera: total inclui R$ 76,53 de IPI que não aparece na soma dos subtotais)', () => {
    const somaSubtotais = 1125.71 + 401.64 + 1001.40 + 296.77;
    const proposta = {
      ...PROPOSTA_ANHANGUERA_PARCIAL,
      // ipi_valor por item, somando ao total do documento de IPI (76,53) — no
      // documento real esse valor aparece só no rodapé, não por linha; aqui
      // simulamos o item que concentra o IPI para exercitar a reconciliação.
      itens: [
        ...PROPOSTA_ANHANGUERA_PARCIAL.itens.slice(0, -1),
        { ...PROPOSTA_ANHANGUERA_PARCIAL.itens[PROPOSTA_ANHANGUERA_PARCIAL.itens.length - 1], ipi_valor: 76.53 },
      ],
      total_declarado: somaSubtotais + 76.53,
    };
    const resultado = validarProposta(proposta);
    expect(resultado.status).toBe('ok');
    expect(resultado.totalCalculado).toBeCloseTo(somaSubtotais + 76.53, 2);
  });

  it('Loja do Mecânico: fecha quando soma + frete (R$ 216,39) é considerada', () => {
    const proposta = {
      ...PROPOSTA_LOJA_DO_MECANICO_PARCIAL,
      total_declarado: 419.60 + 187.80 + 1369.90 + 216.39, // soma do subconjunto + frete
    };
    const resultado = validarProposta(proposta);
    expect(resultado.status).toBe('ok');
    expect(resultado.totalCalculado).toBeCloseTo(419.60 + 187.80 + 1369.90 + 216.39, 2);
  });

  it('sinaliza divergência quando a soma não fecha de nenhuma forma', () => {
    const proposta = {
      itens: [{ linha_ordem: 1, descricao_bruta: 'x', quantidade: 1, preco_unitario_bruto: 100, subtotal: 100 }],
      total_declarado: 500,
    };
    const resultado = validarProposta(proposta);
    expect(resultado.status).toBe('divergente');
    expect(resultado.detalhe).toContain('diferença');
  });

  it('status "nao_declarado" quando o documento não declara total', () => {
    const proposta = {
      itens: [{ linha_ordem: 1, descricao_bruta: 'x', quantidade: 1, preco_unitario_bruto: 100, subtotal: 100 }],
    };
    const resultado = validarProposta(proposta);
    expect(resultado.status).toBe('nao_declarado');
  });
});

describe('validarItem', () => {
  it('detecta subtotal inconsistente com quantidade × preço (dígito colado/perdido)', () => {
    const item = { linha_ordem: 1, descricao_bruta: 'x', quantidade: 3, preco_unitario_bruto: 136.44, subtotal: 4093.2 };
    const resultado = validarItem(item);
    expect(resultado.ok).toBe(false);
    expect(resultado.subtotalCalculado).toBeCloseTo(409.32, 2);
  });

  it('aceita item sem subtotal declarado (nada a conferir)', () => {
    const item = { linha_ordem: 1, descricao_bruta: 'x', quantidade: 1, preco_unitario_bruto: 100 };
    expect(validarItem(item).ok).toBe(true);
  });
});
