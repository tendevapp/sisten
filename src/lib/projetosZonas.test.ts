/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { zonasDoTramo, zonaPorId, consumoDaZona, zonasPendentes, rotuloTramoComZona, type ZonaDef } from './projetosZonas';
import { montarArvore, type BomLinha } from './projetosBom';

/**
 * Recorte fiel ao padrão real de T1: um parafuso comum (PARAFUSO-M16)
 * atravessa Escada, Plataforma Inferior E Plataforma Superior — igual ao
 * caso real confirmado na BOM (402.000.020 aparece em 7 grupos distintos
 * de S1). Grupos residuais (ELETRICO, PORTA) não pertencem a zona nomeada
 * nenhuma — devem cair no catch-all.
 */
const BOM_T1: BomLinha[] = [
  { id: 1, level: 1, section: 'S1', group: 'ESCADA', part_number: 'PAI-ESC', quantity: 1 },
  { id: 2, level: 2, section: 'S1', group: 'ESCADA', part_number: 'DEGRAU', quantity: 13 },
  { id: 3, level: 2, section: 'S1', group: 'ESCADA', part_number: 'PARAFUSOM16', quantity: 4 },
  { id: 4, level: 1, section: 'S1', group: 'PLATAFORMA INFERIOR', part_number: 'PAI-INF', quantity: 1 },
  { id: 5, level: 2, section: 'S1', group: 'PLATAFORMA INFERIOR', part_number: 'BASE', quantity: 2 },
  { id: 6, level: 2, section: 'S1', group: 'PLATAFORMA INFERIOR', part_number: 'PARAFUSOM16', quantity: 6 },
  { id: 7, level: 1, section: 'S1', group: 'PLATAFORMA SUPERIOR', part_number: 'PAI-SUP', quantity: 1 },
  { id: 8, level: 2, section: 'S1', group: 'PLATAFORMA SUPERIOR', part_number: 'CHAPA', quantity: 1 },
  { id: 9, level: 2, section: 'S1', group: 'PLATAFORMA SUPERIOR', part_number: 'PARAFUSOM16', quantity: 5 },
  { id: 10, level: 1, section: 'S1', group: 'PLATAFORMA MEDIA', part_number: 'PAI-MED', quantity: 1 },
  { id: 11, level: 2, section: 'S1', group: 'PLATAFORMA MEDIA', part_number: 'ARRUELA', quantity: 8 },
  { id: 12, level: 1, section: 'S1', group: 'ELETRICO', part_number: 'PAI-ELE', quantity: 1 },
  { id: 13, level: 2, section: 'S1', group: 'ELETRICO', part_number: 'CABO', quantity: 1 },
  { id: 14, level: 1, section: 'S1', group: 'PORTA', part_number: 'PAI-PORTA', quantity: 1 },
  { id: 15, level: 2, section: 'S1', group: 'PORTA', part_number: 'DOBRADICA', quantity: 2 },
];

describe('zonasDoTramo', () => {
  it('T1 tem 4 zonas: 3 nomeadas + catch-all', () => {
    const zonas = zonasDoTramo('T1')!;
    expect(zonas.map((z) => z.id)).toEqual(['plataforma_sup_media', 'plataforma_inferior', 'escada_acesso', 'outros']);
  });

  it('T2..T5 não têm zona — romaneio único, como sempre', () => {
    expect(zonasDoTramo('T2')).toBeNull();
    expect(zonasDoTramo('T3')).toBeNull();
    expect(zonasDoTramo('T4')).toBeNull();
    expect(zonasDoTramo('T5')).toBeNull();
  });
});

describe('consumoDaZona', () => {
  const arvore = montarArvore(BOM_T1);
  const zonas = zonasDoTramo('T1')!;
  const porId = (id: string) => zonas.find((z) => z.id === id)!;

  it('Escada de Acesso: só as linhas do grupo ESCADA', () => {
    const c = consumoDaZona(arvore, 'T1', porId('escada_acesso'));
    expect(Array.from(c.keys()).sort()).toEqual(['DEGRAU', 'PARAFUSOM16']);
    expect(c.get('PARAFUSOM16')!.qtdPorTorre).toBe(4);
  });

  it('Plataforma Sup e Média: soma Superior + Média, mesmo item em dois grupos não duplica errado', () => {
    const c = consumoDaZona(arvore, 'T1', porId('plataforma_sup_media'));
    expect(Array.from(c.keys()).sort()).toEqual(['ARRUELA', 'CHAPA', 'PARAFUSOM16']);
    expect(c.get('PARAFUSOM16')!.qtdPorTorre).toBe(5); // só a fatia de PLATAFORMA SUPERIOR
  });

  it('Plataforma Inferior: só a fatia dela do parafuso compartilhado', () => {
    const c = consumoDaZona(arvore, 'T1', porId('plataforma_inferior'));
    expect(c.get('PARAFUSOM16')!.qtdPorTorre).toBe(6);
  });

  it('catch-all "Outros": pega ELETRICO e PORTA — o que não é nenhuma zona nomeada', () => {
    const c = consumoDaZona(arvore, 'T1', porId('outros'));
    expect(Array.from(c.keys()).sort()).toEqual(['CABO', 'DOBRADICA']);
  });

  it('as 4 zonas juntas cobrem o romaneio inteiro do tramo, sem perder nem duplicar item', () => {
    const totalPorZona = new Map<string, number>();
    for (const zona of zonas) {
      for (const [pn, item] of consumoDaZona(arvore, 'T1', zona)) {
        totalPorZona.set(pn, (totalPorZona.get(pn) ?? 0) + item.qtdPorTorre);
      }
    }
    // PARAFUSO-M16 espalhado em 3 zonas: 4+6+5 = 15, igual ao total do tramo inteiro.
    expect(totalPorZona.get('PARAFUSOM16')).toBe(15);
    expect(totalPorZona.get('DEGRAU')).toBe(13);
    expect(totalPorZona.get('BASE')).toBe(2);
    expect(totalPorZona.get('CHAPA')).toBe(1);
    expect(totalPorZona.get('ARRUELA')).toBe(8);
    expect(totalPorZona.get('CABO')).toBe(1);
    expect(totalPorZona.get('DOBRADICA')).toBe(2);
  });
});

describe('zonasPendentes', () => {
  it('sem nenhuma zona separada, as 4 estão pendentes', () => {
    expect(zonasPendentes('T1', new Set()).map((z) => z.id)).toHaveLength(4);
  });

  it('some da lista a zona já separada', () => {
    const pendentes = zonasPendentes('T1', new Set(['escada_acesso']));
    expect(pendentes.map((z) => z.id)).not.toContain('escada_acesso');
    expect(pendentes).toHaveLength(3);
  });

  it('lista vazia quando as 4 já foram separadas', () => {
    const todas = new Set(zonasDoTramo('T1')!.map((z) => z.id));
    expect(zonasPendentes('T1', todas)).toEqual([]);
  });

  it('tramo sem zona (T2) não tem pendência de zona — sempre vazio', () => {
    expect(zonasPendentes('T2', new Set())).toEqual([]);
  });
});

describe('zonaPorId', () => {
  it('acha a zona pelo id salvo na ordem', () => {
    expect(zonaPorId('T1', 'escada_acesso')?.rotulo).toBe('Escada de Acesso');
  });

  it('null quando o id é null/vazio (ordem sem zona)', () => {
    expect(zonaPorId('T1', null)).toBeNull();
    expect(zonaPorId('T1', undefined)).toBeNull();
  });

  it('null num tramo sem zona, mesmo com id preenchido', () => {
    expect(zonaPorId('T2', 'escada_acesso')).toBeNull();
  });
});

describe('rotuloTramoComZona', () => {
  it('combina tramo e zona quando há zona', () => {
    const zona: ZonaDef = { id: 'escada_acesso', rotulo: 'Escada de Acesso', grupos: ['ESCADA'] };
    expect(rotuloTramoComZona('T1', zona)).toBe('T1 · Escada de Acesso');
  });

  it('só o tramo quando não há zona (T2..T5)', () => {
    expect(rotuloTramoComZona('T2', null)).toBe('T2');
    expect(rotuloTramoComZona('T2')).toBe('T2');
  });
});
