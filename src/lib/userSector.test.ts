import { describe, it, expect, beforeEach } from 'vitest';
import { localDb } from '../db/localDb';
import { INITIAL_SECTORS } from '../data/sectors';
import type { Profile, Sector } from '../types';

describe('Gestão de Setores de Usuários no localDb', () => {
  beforeEach(() => {
    // Garante que o localDb tem estado inicial para perfis de teste
    (localDb as any).setStorageItem('sisten_sectors', INITIAL_SECTORS);

    const mockProfiles: Profile[] = [
      {
        id: 'u-101',
        name: 'Carlos Silva',
        email: 'carlos@empresa.com',
        cargo: 'Comprador Pleno',
        sector_id: '5',
        roles: ['comprador'],
        status: 'ativo',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'u-102',
        name: 'Mariana Costa',
        email: 'mariana@empresa.com',
        cargo: 'Analista de Sistemas',
        sector_id: '9',
        roles: ['solicitante'],
        status: 'ativo',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    (localDb as any).setStorageItem('sisten_profiles', mockProfiles);
  });

  it('deve atualizar o setor de um usuario com sucesso', async () => {
    const ok = await localDb.updateUserSector('u-101', '9');
    expect(ok).toBe(true);

    const profiles = localDb.getProfiles();
    const updated = profiles.find(p => p.id === 'u-101');
    expect(updated?.sector_id).toBe('9');
  });

  it('deve retornar false caso o usuario nao exista', async () => {
    const ok = await localDb.updateUserSector('usuario-inexistente', '1');
    expect(ok).toBe(false);
  });

  it('deve mapear corretamente o nome do setor pelo id', () => {
    const sectors = localDb.getSectors();
    const map = new Map(sectors.map(s => [s.id, s.name]));

    expect(map.get('1')).toBe('RH');
    expect(map.get('5')).toBe('Suprimentos');
    expect(map.get('9')).toBe('TI');
    expect(map.get('16')).toBe('Diretoria');
    expect(map.get('999')).toBeUndefined();
  });

  it('deve converter o nome do usuario sempre para maiusculo ao atualizar o perfil', async () => {
    const updated = await localDb.updateProfileFields('u-101', 'carlos eduardo da silva', 'Coordenador', '5');
    expect(updated?.name).toBe('CARLOS EDUARDO DA SILVA');

    const profiles = localDb.getProfiles();
    const user = profiles.find(p => p.id === 'u-101');
    expect(user?.name).toBe('CARLOS EDUARDO DA SILVA');
  });
});
