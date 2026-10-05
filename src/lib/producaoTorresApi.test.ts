/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Testes unitários para producaoTorresApi
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  salvarApontamentoOperacao,
  buscarTramoComApontamentos,
  listarTramosProducao,
} from './producaoTorresApi';
import { supabase } from '../db/supabaseClient';

vi.mock('../db/supabaseClient', () => {
  const fromMock = vi.fn();
  const storageMock = {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({ error: null }),
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage/signed-foto.jpg' } }),
    })),
  };
  return {
    supabase: {
      from: fromMock,
      storage: storageMock,
    },
  };
});

describe('producaoTorresApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exige código de tramo no formato TX-XXXX ao apontar no Marco-Porta', async () => {
    await expect(
      salvarApontamentoOperacao({
        nave: 'nave1',
        fabrica: 'fabrica3',
        processoId: 'marco_porta',
        processoNome: 'Marco-Porta',
        tramoCodigo: '', // Vazio
      }),
    ).rejects.toThrow(/numeração do Tramo.*obrigatória/i);

    await expect(
      salvarApontamentoOperacao({
        nave: 'nave1',
        fabrica: 'fabrica3',
        processoId: 'marco_porta',
        processoNome: 'Marco-Porta',
        tramoCodigo: 'INVALIDO', // Formato não bate com TX-XXXX
      }),
    ).rejects.toThrow(/numeração do Tramo.*obrigatória/i);
  });

  it('salva apontamento e cria tramo na Nave 2 ao concluir Marco-Porta com sucesso', async () => {
    const mockInsertOperacoes = vi.fn().mockResolvedValue({ error: null });
    const mockInsertTramos = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'tramo-uuid-1' }, error: null }),
      }),
    });
    const mockUpdateTramos = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    (supabase.from as any).mockImplementation((tabela: string) => {
      if (tabela === 'prod_apt_operacoes') {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ codigo: 'APT-051026-01' }] }),
            }),
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ processo_id: 'marco_porta' }] }),
            }),
          }),
          insert: mockInsertOperacoes,
        };
      }
      if (tabela === 'prod_apt_tramos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }), // tramo ainda não existe
            }),
          }),
          insert: mockInsertTramos,
          update: mockUpdateTramos,
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const res = await salvarApontamentoOperacao({
      nave: 'nave1',
      fabrica: 'fabrica3',
      processoId: 'marco_porta',
      processoNome: 'Marco-Porta',
      tramoCodigo: 'T1-3143',
      virolaNumero: 'V5',
      opNumero: 'OP-9988',
      observacao: 'Tramo finalizado na 3ª fábrica',
    });

    expect(res.ok).toBe(true);
    expect(res.codigo).toMatch(/^APT-\d{6}-02$/);
    expect(mockInsertTramos).toHaveBeenCalledWith(
      expect.objectContaining({
        codigo_tramo: 'T1-3143',
        estagio_atual: 'nave2',
        virola_origem: 'V5',
        op_origem: 'OP-9988',
      }),
    );
    expect(mockInsertOperacoes).toHaveBeenCalledWith(
      expect.objectContaining({
        codigo: expect.stringMatching(/^APT-\d{6}-02$/),
        nave: 'nave1',
        processo_id: 'marco_porta',
        tramo_codigo: 'T1-3143',
        realizado: true,
      }),
    );
  });
});
