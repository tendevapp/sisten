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
    // O ISP também exige setor Segurança ou papel admin no destino.
    const restantes = itensNaoEspelhados(origem, novo);
    const isp = 'Formulário › Inspeção de SST (ISP)';
    expect(restantes).toContain(isp);
    const ronda = 'Formulário › Ronda de Segurança do Trabalho';
    expect(restantes).toContain(ronda);
    const observacao = 'Formulário › Observação Comportamental';
    expect(restantes).toContain(observacao);
    expect(restantes.every(l => [isp, ronda, observacao].includes(l) || /^(FACILITIES|RH) ›/.test(l))).toBe(true);
    expect(pa.form_ssma_oc).toBeUndefined();
    expect(pa.form_ssma_ronda).toBeUndefined();
    expect(pa.form_ssma_isp).toBeUndefined();
    expect(Object.keys(pa).some(k => k.startsWith('facilities'))).toBe(false);
  });

  it('copia flags de tela fora da lista de páginas', () => {
    const origem = perfil('a', ['solicitante'], '1', { rh_ase_ver_todas: true });
    const destino = perfil('b', ['solicitante'], '1');
    expect(espelharPageAccess(origem, destino).rh_ase_ver_todas).toBe(true);
  });
});
