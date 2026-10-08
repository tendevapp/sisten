import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from './supabaseClient';
import { localDb } from './localDb';

describe('importZL0024Raw', () => {
  const insertedPayloads: any[] = [];
  let deleteCalled = false;

  beforeEach(() => {
    insertedPayloads.length = 0;
    deleteCalled = false;

    if (supabase) {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: null } as any);

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'sap_zl0024_stk') {
          return {
            select: vi.fn().mockResolvedValue({ count: 10, error: null }),
            delete: vi.fn(() => ({
              gte: vi.fn().mockImplementation(() => {
                deleteCalled = true;
                return Promise.resolve({ error: null });
              })
            })),
            insert: vi.fn((rows: any[]) => {
              insertedPayloads.push(...rows);
              return Promise.resolve({ error: null });
            })
          } as any;
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
          })),
          insert: vi.fn().mockResolvedValue({ error: null }),
          delete: vi.fn().mockResolvedValue({ error: null })
        } as any;
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mapeia a coluna Pos.dpst. para posicao_estoque', async () => {
    const headers = [
      'Cen.', 'Dep.', 'Tipo de material', 'Material', 'Referência Fabricante',
      'TxtBreveMaterial', 'Stock UL (Dep)', 'UMB', 'PMM', 'Val.Total (depósito)',
      'GrpMercad', 'Class. Item', 'Grupo de mercadorias', 'Grupo de mercadorias',
      'Texto Pedido Compra', 'Nome 1', 'Pos.dpst.'
    ];

    const dataRow = [
      '1000', '0001', 'ROH', '10000001', 'REF-ABC',
      'CHAPA DE ACO', '50', 'UN', '100.5', '5025.0',
      'GRP1', 'CL1', 'GRUPO A', 'APLIC B',
      'PEDIDO 123', 'TEN TORRES EOLICAS', '101.ARAMES'
    ];

    const log = await localDb.importZL0024Raw([headers, dataRow], 'zl0024_teste.xlsx');

    expect(deleteCalled).toBe(true);
    expect(insertedPayloads).toHaveLength(1);
    expect(insertedPayloads[0].material).toBe('10000001');
    expect(insertedPayloads[0].posicao_estoque).toBe('101.ARAMES');
    expect(log.records_inserted).toBe(1);
  });

  it('suporta variacao de cabecalho como posicao_estoque via fallback', async () => {
    const headers = [
      'Cen.', 'Dep.', 'Tipo de material', 'Material', 'Referência Fabricante',
      'TxtBreveMaterial', 'Stock UL (Dep)', 'UMB', 'PMM', 'Val.Total (depósito)',
      'GrpMercad', 'Class. Item', 'Grupo de mercadorias', 'Grupo de mercadorias',
      'Texto Pedido Compra', 'Nome 1', 'posição_estoque'
    ];

    const dataRow = [
      '1000', '0001', 'ROH', '10000002', 'REF-XYZ',
      'PARAFUSO', '100', 'PC', '2.5', '250.0',
      'GRP1', 'CL1', 'GRUPO A', 'APLIC B',
      'PEDIDO 123', 'TEN TORRES EOLICAS', '101.040100'
    ];

    const log = await localDb.importZL0024Raw([headers, dataRow], 'zl0024_teste_fallback.xlsx');

    expect(insertedPayloads).toHaveLength(1);
    expect(insertedPayloads[0].material).toBe('10000002');
    expect(insertedPayloads[0].posicao_estoque).toBe('101.040100');
    expect(log.columns_missing).not.toContain('Pos.dpst.');
  });

  it('permite importacao sem a coluna posicao_estoque mantendo compatibilidade', async () => {
    const headers = [
      'Cen.', 'Dep.', 'Tipo de material', 'Material', 'Referência Fabricante',
      'TxtBreveMaterial', 'Stock UL (Dep)', 'UMB', 'PMM', 'Val.Total (depósito)',
      'GrpMercad', 'Class. Item', 'Grupo de mercadorias', 'Grupo de mercadorias',
      'Texto Pedido Compra', 'Nome 1'
    ];

    const dataRow = [
      '1000', '0001', 'ROH', '10000003', 'REF-OLD',
      'EPI LUVA', '10', 'PAR', '15.0', '150.0',
      'GRP1', 'CL1', 'GRUPO A', 'APLIC B',
      'PEDIDO 123', 'TEN TORRES EOLICAS'
    ];

    const log = await localDb.importZL0024Raw([headers, dataRow], 'zl0024_antiga.xlsx');

    expect(insertedPayloads).toHaveLength(1);
    expect(insertedPayloads[0].material).toBe('10000003');
    expect(insertedPayloads[0].posicao_estoque).toBeNull();
    expect(log.columns_missing).not.toContain('Pos.dpst.');
  });
});
