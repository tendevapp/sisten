import { describe, it, expect } from 'vitest';
import { Profile, Role } from '../types';
import { espelharPageAccess, itensNaoEspelhados, resumoEspelhamento } from './espelharAcessos';

const perfil = (id: string, roles: Role[], sector_id: string, page_access: Record<string, boolean> = {}): Profile => ({
  id,
  email: `${id}@x`,
  name: id,
  cargo: '',
  sector_id,
  roles,
  status: 'ativo' as Profile['status'],
  created_at: '2026-01-01',
  page_access,
});

describe('espelharPageAccess', () => {
  it('destino passa a enxergar exatamente o que a origem enxerga', () => {
    const origem = perfil('a', ['solicitante'], '12', { formularios: true, form_ssma: true, almox_home: true });
    const destino = perfil('b', ['gestor'], '1', { suprimentos_home: true, form_rh: false });
    const novo = { ...destino, page_access: espelharPageAccess(origem, destino) };
    expect(itensNaoEspelhados(origem, novo)).toEqual([]);
  });

  it('descarta as liberações antigas do destino', () => {
    const origem = perfil('a', ['solicitante'], '1');
    const destino = perfil('b', ['solicitante'], '1', { formularios: true, almox_home: true });
    const pa = espelharPageAccess(origem, destino);
    expect(pa).toEqual({});
    expect(resumoEspelhamento(origem, destino).ganha).toBe(0);
  });

  it('origem admin vira liberação explícita em tudo que é editável', () => {
    const origem = perfil('a', ['admin'], '1');
    const destino = perfil('b', ['solicitante'], '1');
    const pa = espelharPageAccess(origem, destino);
    const novo = { ...destino, page_access: pa };
    // Facilities e RH são travados por pessoa/setor: ficam de fora e não viram override inútil.
    const restantes = itensNaoEspelhados(origem, novo);
    expect(restantes.length).toBeGreaterThan(0);
    expect(restantes.every(l => /^(FACILITIES|RH) ›/.test(l))).toBe(true);
    expect(Object.keys(pa).some(k => k.startsWith('facilities'))).toBe(false);
  });

  it('copia flags de tela fora da lista de páginas', () => {
    const origem = perfil('a', ['solicitante'], '1', { rh_ase_ver_todas: true });
    const destino = perfil('b', ['solicitante'], '1');
    expect(espelharPageAccess(origem, destino).rh_ase_ver_todas).toBe(true);
  });
});
