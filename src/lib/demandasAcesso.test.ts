import { describe, it, expect } from 'vitest';
import type { DemQuadro, Profile, Sector } from '../types';
import {
  setoresVisiveis, podeVerQuadro, podeGerenciarQuadro, setoresParaNovoQuadro, filtrarQuadrosVisiveis,
} from './demandasAcesso';

const SECTORS: Sector[] = [
  { id: '1', name: 'RH', is_support: false, helpdesk_enabled: false },
  { id: '5', name: 'Suprimentos', is_support: false, helpdesk_enabled: false },
  { id: '7', name: 'Produção', is_support: false, helpdesk_enabled: false },
];

const user = (o: Partial<Profile> = {}): Profile => ({
  id: 'u1', email: 'u@x.com', name: 'U', cargo: '', sector_id: '5',
  roles: ['requisitante'], status: 'ativo', created_at: '2026-01-01', ...o,
});

const quadro = (o: Partial<DemQuadro> = {}): DemQuadro => ({
  id: 'q1', nome: 'Q', descricao: null, setor_id: '5', cor: null,
  membros_extra: [], arquivado: false, ordem: 0, criado_por: 'outro',
  created_at: '2026-09-01', updated_at: '2026-09-01', excluido_em: null, excluido_por: null, ...o,
});

describe('setoresVisiveis', () => {
  it('admin vê todos os setores', () => {
    expect(setoresVisiveis(user({ roles: ['admin'] }), SECTORS).sort()).toEqual(['1', '5', '7']);
  });
  it('comum vê o próprio setor + demandas_setores', () => {
    expect(setoresVisiveis(user({ sector_id: '5', demandas_setores: ['7'] }), SECTORS).sort()).toEqual(['5', '7']);
  });
});

describe('podeVerQuadro', () => {
  it('vê pelo setor', () => {
    expect(podeVerQuadro(user({ sector_id: '5' }), quadro({ setor_id: '5' }), SECTORS)).toBe(true);
  });
  it('não vê quadro de outro setor', () => {
    expect(podeVerQuadro(user({ sector_id: '5' }), quadro({ setor_id: '7' }), SECTORS)).toBe(false);
  });
  it('vê quadro compartilhado com ele', () => {
    expect(podeVerQuadro(user({ id: 'u1', sector_id: '5' }), quadro({ setor_id: '7', membros_extra: ['u1'] }), SECTORS)).toBe(true);
  });
  it('vê quadro que ele criou', () => {
    expect(podeVerQuadro(user({ id: 'u1', sector_id: '5' }), quadro({ setor_id: '7', criado_por: 'u1' }), SECTORS)).toBe(true);
  });
  it('gestor vê os setores liberados pelo admin', () => {
    const g = user({ roles: ['gestor'], sector_id: '5', demandas_setores: ['7'] });
    expect(podeVerQuadro(g, quadro({ setor_id: '7' }), SECTORS)).toBe(true);
  });
});

describe('podeGerenciarQuadro', () => {
  it('criador gerencia', () => {
    expect(podeGerenciarQuadro(user({ id: 'u1' }), quadro({ criado_por: 'u1' }), SECTORS)).toBe(true);
  });
  it('gestor do setor gerencia; requisitante não', () => {
    expect(podeGerenciarQuadro(user({ roles: ['gestor'], sector_id: '5' }), quadro({ setor_id: '5' }), SECTORS)).toBe(true);
    expect(podeGerenciarQuadro(user({ roles: ['requisitante'], sector_id: '5' }), quadro({ setor_id: '5' }), SECTORS)).toBe(false);
  });
});

describe('setoresParaNovoQuadro / filtrarQuadrosVisiveis', () => {
  it('limita os setores de criação aos visíveis', () => {
    expect(setoresParaNovoQuadro(user({ sector_id: '5' }), SECTORS).map(s => s.id)).toEqual(['5']);
  });
  it('filtra a lista de quadros', () => {
    const qs = [quadro({ id: 'a', setor_id: '5' }), quadro({ id: 'b', setor_id: '7' })];
    expect(filtrarQuadrosVisiveis(user({ sector_id: '5' }), qs, SECTORS).map(q => q.id)).toEqual(['a']);
  });
});
