/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A busca do Histórico de Cotações depende de o termo digitado ser quebrado
 * exatamente como o banco normalizou `busca_norm` — acento, pontuação e caixa
 * precisam sumir dos dois lados, senão a busca simplesmente não acha nada.
 */

import { describe, expect, it } from 'vitest';
import { palavrasChaveBusca } from './cotacoesHistoricoApi';

describe('palavrasChaveBusca', () => {
  it('quebra a frase em palavras independentes', () => {
    expect(palavrasChaveBusca('cabo flexivel 750v')).toEqual(['CABO', 'FLEXIVEL', '750V']);
  });

  it('derruba acento e pontuação, como o f_norm_cotacao do banco', () => {
    // "Válvula 1/2" NPT" precisa virar as mesmas palavras de "VALVULA 1 2 NPT".
    expect(palavrasChaveBusca('Válvula 1/2" NPT')).toEqual(['VALVULA', '1', '2', 'NPT']);
    expect(palavrasChaveBusca('óculos')).toEqual(['OCULOS']);
  });

  it('mantém expressão entre aspas como uma palavra só', () => {
    expect(palavrasChaveBusca('"fita dupla face" 3M')).toEqual(['FITA DUPLA FACE', '3M']);
  });

  it('devolve lista vazia quando não há termo utilizável', () => {
    expect(palavrasChaveBusca('')).toEqual([]);
    expect(palavrasChaveBusca('   ')).toEqual([]);
    expect(palavrasChaveBusca('---')).toEqual([]);
  });
});
