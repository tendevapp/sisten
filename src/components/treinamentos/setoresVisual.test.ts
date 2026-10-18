import { describe, it, expect } from 'vitest';
import { areaIdDoSetor, areaTreinamento, areasTreinamento, rotuloSetor, visualSetor } from './setoresVisual';

const SETORES = [
  { id: '5', name: 'Suprimentos' },
  { id: '6', name: 'Financeiro' },
  { id: '7', name: 'Contabilidade' },
  { id: '18', name: 'Controladoria' },
  { id: '2', name: 'Almoxarifado' },
];

describe('areasTreinamento', () => {
  it('Contabilidade, Controladoria e Financeiro viram um card só (Contab / Fin)', () => {
    const areas = areasTreinamento(SETORES);
    const contab = areas.find(a => a.id === 'contab-fin');
    expect(contab?.nome).toBe('Contab / Fin');
    expect(contab?.setorIds.sort()).toEqual(['18', '6', '7']);
    // Nenhum dos três aparece de novo como card próprio
    expect(areas.filter(a => ['6', '7', '18'].includes(a.id))).toHaveLength(0);
    // Os demais setores seguem um por card
    expect(areas.map(a => a.id).sort()).toEqual(['2', '5', 'contab-fin']);
  });

  it('abre a área pelo id dela ou por qualquer setor que ela agrupa (links antigos ?setor=7)', () => {
    expect(areaTreinamento('contab-fin', SETORES)?.id).toBe('contab-fin');
    expect(areaTreinamento('7', SETORES)?.id).toBe('contab-fin');
    expect(areaTreinamento('18', SETORES)?.id).toBe('contab-fin');
    expect(areaTreinamento('5', SETORES)?.setorIds).toEqual(['5']);
    expect(areaTreinamento('999', SETORES)).toBeUndefined();
  });

  it('areaIdDoSetor devolve a área agrupada ou o próprio setor', () => {
    expect(areaIdDoSetor('7')).toBe('contab-fin');
    expect(areaIdDoSetor('5')).toBe('5');
  });

  it('rotuloSetor mostra a área agrupada no select do cadastro', () => {
    expect(rotuloSetor({ id: '7', name: 'Contabilidade' })).toBe('Contab / Fin — Contabilidade');
    expect(rotuloSetor({ id: '5', name: 'Suprimentos' })).toBe('Suprimentos');
  });

  it('visualSetor: setores da área compartilham o visual; setor novo cai no padrão', () => {
    expect(visualSetor('7')).toBe(visualSetor('contab-fin'));
    expect(visualSetor('6')).toBe(visualSetor('18'));
    expect(visualSetor('9999')).toBeDefined();
  });
});
