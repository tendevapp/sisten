import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localDb } from '../db/localDb';
import { supabase } from '../db/supabaseClient';
import type { Request } from '../types';

describe('Almoxarifado > Abrir RM - Vinculação de RM', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('vincula número de RM à solicitação e atualiza o estado local', async () => {
    const mockReq: Request = {
      id: 'req-rm-1',
      number: '2001018',
      type: 'compra',
      status: 'aprovada',
      criticality: 1,
      solicitante_id: 'u-joao',
      solicitante_name: 'JOAO',
      solicitante_sector_id: 'set-qualidade',
      created_at: '2026-09-18T14:10:00Z',
      updated_at: '2026-09-18T14:10:00Z',
    } as Request;

    localDb.setStorageItem('sisten_requests', [mockReq]);

    // Mock publishRequestRow para simular sucesso no Supabase
    vi.spyOn(localDb as any, 'publishRequestRow').mockResolvedValue(true);

    const ok = await localDb.updateLinkedRM('req-rm-1', '1200094999');
    expect(ok).toBe(true);

    const requisicoes = localDb.getRequests();
    const reqAtualizada = requisicoes.find(r => r.id === 'req-rm-1');
    expect(reqAtualizada).toBeDefined();
    expect(reqAtualizada?.linked_rm_number).toBe('1200094999');
  });

  it('retorna true sem publicar se o valor da RM não foi alterado', async () => {
    const mockReq: Request = {
      id: 'req-rm-2',
      number: '3001029',
      type: 'compra',
      status: 'aprovada',
      criticality: 1,
      solicitante_id: 'u-joao',
      solicitante_name: 'JOAO',
      solicitante_sector_id: 'set-qualidade',
      created_at: '2026-09-18T14:10:00Z',
      updated_at: '2026-09-18T14:10:00Z',
      linked_rm_number: '1200094555',
    } as Request;

    localDb.setStorageItem('sisten_requests', [mockReq]);
    const spyPublish = vi.spyOn(localDb as any, 'publishRequestRow');

    const ok = await localDb.updateLinkedRM('req-rm-2', '1200094555');
    expect(ok).toBe(true);
    expect(spyPublish).not.toHaveBeenCalled();
  });

  it('permite desvincular RM passando string vazia ou nula', async () => {
    const mockReq: Request = {
      id: 'req-rm-3',
      number: '5001008',
      type: 'compra',
      status: 'aprovada',
      criticality: 1,
      solicitante_id: 'u-israel',
      solicitante_name: 'ISRAEL',
      solicitante_sector_id: 'set-producao',
      created_at: '2026-09-16T13:06:00Z',
      updated_at: '2026-09-16T13:06:00Z',
      linked_rm_number: '1200094111',
    } as Request;

    localDb.setStorageItem('sisten_requests', [mockReq]);
    vi.spyOn(localDb as any, 'publishRequestRow').mockResolvedValue(true);

    const ok = await localDb.updateLinkedRM('req-rm-3', '   ');
    expect(ok).toBe(true);

    const req = localDb.getRequests().find(r => r.id === 'req-rm-3');
    expect(req?.linked_rm_number).toBeUndefined();
  });

  it('reverte cache local caso a publicação remota falhe', async () => {
    const mockReq: Request = {
      id: 'req-rm-4',
      number: '2001019',
      type: 'compra',
      status: 'aprovada',
      criticality: 1,
      solicitante_id: 'u-joao',
      solicitante_name: 'JOAO',
      solicitante_sector_id: 'set-qualidade',
      created_at: '2026-09-18T14:10:00Z',
      updated_at: '2026-09-18T14:10:00Z',
      linked_rm_number: undefined,
    } as Request;

    localDb.setStorageItem('sisten_requests', [mockReq]);
    vi.spyOn(localDb as any, 'publishRequestRow').mockResolvedValue(false);
    vi.spyOn(supabase, 'from').mockReturnValue({
      update: () => ({
        eq: () => Promise.resolve({ error: { message: 'Erro simulado' } }),
      }),
    } as any);

    const ok = await localDb.updateLinkedRM('req-rm-4', '1200094888');
    expect(ok).toBe(false);

    const req = localDb.getRequests().find(r => r.id === 'req-rm-4');
    expect(req?.linked_rm_number).toBeUndefined();
  });
});
