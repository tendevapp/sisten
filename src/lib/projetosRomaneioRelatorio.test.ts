/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { montarLinhasPorNivel, montarLinhasConsolidadas } from './projetosRomaneioRelatorio';
import { montarArvore, type BomLinha } from './projetosBom';
import type { ProjItem, ProjOrdemItem } from '../types';

const BOM_T1: BomLinha[] = [
  { id: 1, level: 1, section: 'S1', group: 'ESCADA', part_number: 'PAI-ESC', description: 'Conjunto escada', quantity: 1 },
  { id: 2, level: 2, section: 'S1', group: 'ESCADA', part_number: 'DEGRAU', description: 'Degrau', quantity: 10 },
  { id: 3, level: 2, section: 'S1', group: 'ESCADA', part_number: 'PARAFUSO', description: 'Parafuso M16', quantity: 4 },
  { id: 4, level: 1, section: 'S1', group: 'PLATAFORMA SUPERIOR', part_number: 'PAI-SUP', description: 'Conjunto plataforma', quantity: 1 },
  { id: 5, level: 2, section: 'S1', group: 'PLATAFORMA SUPERIOR', part_number: 'CHAPA', description: 'Chapa', quantity: 2 },
];

const item = (id: string, pn: string): ProjItem => ({
  id, projeto: 'GW_JACOBINA', part_number_norm: pn, part_number: pn, cod_sap: null,
  descricao: null, description: null, fornecedor: null, uom: 'each', peso_unitario_kg: null,
  localizador: null, estoque_minimo: 0, ignorar_premontagem: false, observacao: null,
});

const itemPorId = new Map<string, ProjItem>([
  ['i-degrau', item('i-degrau', 'DEGRAU')],
  ['i-parafuso', item('i-parafuso', 'PARAFUSO')],
  ['i-chapa', item('i-chapa', 'CHAPA')],
]);

const ordemItem = (itemId: string, qtd: number): ProjOrdemItem => ({
  id: `oi-${itemId}`, ordem_id: 'o1', item_id: itemId, subconjunto: null,
  qtd_por_kit: qtd, qtd_total: qtd, localizador: null, saldo_no_momento: null,
  separado: false, qtd_separada: 0, separado_em: null, separado_por_nome: null,
});

describe('montarLinhasPorNivel', () => {
  const arvore = montarArvore(BOM_T1);

  it('zona nomeada: reconstrói só o ramo da escada, pai e filhos', () => {
    const ordem = {
      tramo: 'T1',
      zona: 'escada_acesso',
      itens: [ordemItem('i-degrau', 10), ordemItem('i-parafuso', 4)],
    };
    const linhas = montarLinhasPorNivel(arvore, ordem, itemPorId);
    expect(linhas.map((l) => l.partNumber)).toEqual(['PAI-ESC', 'DEGRAU', 'PARAFUSO']);
    expect(linhas[0].quantidade).toBeNull(); // pai não tem quantidade própria na visão
    expect(linhas.find((l) => l.partNumber === 'DEGRAU')!.quantidade).toBe(10);
  });

  it('a folha carrega a quantidade CONGELADA da ordem, não a da BOM ao vivo', () => {
    // Ordem congelou 3 kits (30 no lugar de 10) — a BOM ao vivo continua com 10/torre.
    const ordem = { tramo: 'T1', zona: 'escada_acesso', itens: [ordemItem('i-degrau', 30), ordemItem('i-parafuso', 12)] };
    const linhas = montarLinhasPorNivel(arvore, ordem, itemPorId);
    expect(linhas.find((l) => l.partNumber === 'DEGRAU')!.quantidade).toBe(30);
  });

  it('sem zona (tramo inteiro): reconstrói os dois ramos', () => {
    const ordem = { tramo: 'T1', zona: null, itens: [ordemItem('i-degrau', 10), ordemItem('i-parafuso', 4), ordemItem('i-chapa', 2)] };
    const linhas = montarLinhasPorNivel(arvore, ordem, itemPorId);
    expect(linhas.map((l) => l.partNumber)).toEqual(['PAI-ESC', 'DEGRAU', 'PARAFUSO', 'PAI-SUP', 'CHAPA']);
  });

  it('profundidade é relativa ao trecho mostrado, não ao nível absoluto da BOM', () => {
    const ordem = { tramo: 'T1', zona: 'escada_acesso', itens: [ordemItem('i-degrau', 10)] };
    const linhas = montarLinhasPorNivel(arvore, ordem, itemPorId);
    expect(linhas[0].profundidade).toBe(0); // PAI-ESC, nível 1
    expect(linhas[1].profundidade).toBe(1); // DEGRAU, nível 2
  });

  it('folha marca folha=true e o pai marca folha=false', () => {
    const ordem = { tramo: 'T1', zona: 'escada_acesso', itens: [ordemItem('i-degrau', 10)] };
    const linhas = montarLinhasPorNivel(arvore, ordem, itemPorId);
    expect(linhas.find((l) => l.partNumber === 'PAI-ESC')!.folha).toBe(false);
    expect(linhas.find((l) => l.partNumber === 'DEGRAU')!.folha).toBe(true);
  });
});

describe('montarLinhasConsolidadas', () => {
  it('uma linha por item, ordenada por part number', () => {
    const linhas = montarLinhasConsolidadas(
      [ordemItem('i-parafuso', 4), ordemItem('i-degrau', 10)],
      itemPorId,
    );
    expect(linhas.map((l) => l.partNumber)).toEqual(['DEGRAU', 'PARAFUSO']);
    expect(linhas[0].quantidade).toBe(10);
  });

  it('item sem cadastro cai no id do item, não quebra a lista', () => {
    const linhas = montarLinhasConsolidadas([ordemItem('sem-cadastro', 5)], itemPorId);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].partNumber).toBe('sem-cadastro');
  });
});
