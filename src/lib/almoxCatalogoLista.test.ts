/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lista do Cadastro de Itens: tudo o que tem saldo, mais o que já teve e
 * zerou, mais o que o aparelho já mostrava — item que apareceu não some.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/supabaseClient', () => ({ supabase: null }));
vi.mock('../db/localDb', () => ({ localDb: {} }));

import {
  filtrarEAgruparZl0024Consumiveis, montarListaCatalogo,
  type ItemConsumivelZl0024, type MaterialVistoCatalogo,
} from './almoxCatalogoApi';
import type { EstoqueItem } from '../types';

const linhaZl = (p: Partial<EstoqueItem>): EstoqueItem => ({
  material: '1430880', deposito: '0004', quantidade: 14, umb: 'UN',
  txt_breve_material: 'INTERRUPTOR BOSCH', grp_mercad: 'E02005006', grupo_mercadorias: 'PECAS', tipo_material: 'Peças',
  ...p,
} as EstoqueItem);

const visto = (codigo: string, descricao = 'ITEM ZERADO'): MaterialVistoCatalogo => ({
  codigo_sap: codigo, descricao, texto_tecnico: null, grp_mercad: 'M14001001', grupo_mercadorias: 'ABRASIVOS', umb: 'UN',
});

describe('montarListaCatalogo', () => {
  it('peça com saldo (não consumível) entra no catálogo', () => {
    const atuais = filtrarEAgruparZl0024Consumiveis([linhaZl({})], [], [], false);
    const lista = montarListaCatalogo(atuais, [], [], []);
    expect(lista.map(i => i.codigo_sap)).toEqual(['1430880']);
    expect(lista[0].saldo_total).toBe(14);
  });

  it('item que zerou continua, com saldo 0, e não duplica o que tem saldo', () => {
    const atuais = filtrarEAgruparZl0024Consumiveis([linhaZl({})], [], [], false);
    const lista = montarListaCatalogo(atuais, [visto('1430880'), visto('1111111')], [], []);
    expect(lista.map(i => i.codigo_sap)).toEqual(['1430880', '1111111']);
    expect(lista[1]).toMatchObject({ descricao: 'ITEM ZERADO', saldo_total: 0, depositos: [] });
  });

  it('mantém o que o aparelho já mostrava e deixa de fora item de projeto', () => {
    const anterior = [{ codigo_sap: '2222222', descricao: 'ANTIGO', saldo_total: 5, depositos: ['0001'] } as ItemConsumivelZl0024];
    const lista = montarListaCatalogo([], [visto('1000001234')], anterior, []);
    expect(lista.map(i => i.codigo_sap)).toEqual(['2222222']);
    expect(lista[0].saldo_total).toBe(0);
  });

  it('classifica o item zerado pela taxonomia do grupo', () => {
    const lista = montarListaCatalogo([], [visto('3333333')], [], [
      { codigo: 'M14001001', denominacao: 'ABRASIVOS', classificacao_nivel1: 'CONSUMÍVEL', classificacao_nivel2: 'MRO - Manutenção' },
    ]);
    expect(lista[0].classificacao_nivel2).toBe('MRO - Manutenção');
  });
});
