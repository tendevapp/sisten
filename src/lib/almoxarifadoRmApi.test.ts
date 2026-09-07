import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  agruparMarcasPorExportacao,
  indexarExportacaoVigente,
  indexarUltimaExportacao,
  buscarGruposMercadoriaPorCodigosSap,
  concluirAjusteSapRm,
  liberarParaExportarRm,
  reabrirSolicitacaoPorRequestId,
} from './almoxarifadoRmApi';
import { supabase } from '../db/supabaseClient';

vi.mock('../db/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('almoxarifadoRmApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('indexarUltimaExportacao', () => {
    it('deve indexar apenas a primeira (mais recente) ocorrência de cada request_id', () => {
      const marcas = [
        { id: 'm1', request_id: 'req-1', request_number: '100', exportacao_id: 'exp-1', total_itens: 2, created_at: '2026-09-06T15:00:00Z' },
        { id: 'm2', request_id: 'req-2', request_number: '101', exportacao_id: 'exp-1', total_itens: 1, created_at: '2026-09-06T15:00:00Z' },
        { id: 'm3', request_id: 'req-1', request_number: '100', exportacao_id: 'exp-0', total_itens: 2, created_at: '2026-09-05T10:00:00Z' },
      ];

      const indexado = indexarUltimaExportacao(marcas as any);
      expect(indexado.size).toBe(2);
      expect(indexado.get('req-1')?.exportacao_id).toBe('exp-1');
      expect(indexado.get('req-2')?.exportacao_id).toBe('exp-1');
    });
  });

  describe('indexarExportacaoVigente', () => {
    // req-1 saiu na exp-0, foi reaberta, e saiu de novo na exp-1: está
    // exportada. req-2 saiu uma vez e foi reaberta: voltou para a fila.
    const marcas = [
      { id: 'm1', request_id: 'req-1', request_number: '100', exportacao_id: 'exp-1', total_itens: 2, created_at: '2026-09-06T15:00:00Z', reaberto_em: null },
      { id: 'm2', request_id: 'req-2', request_number: '101', exportacao_id: 'exp-1', total_itens: 1, created_at: '2026-09-06T15:00:00Z', reaberto_em: '2026-09-06T16:00:00Z', reaberto_por_nome: 'ANDRE' },
      { id: 'm3', request_id: 'req-1', request_number: '100', exportacao_id: 'exp-0', total_itens: 2, created_at: '2026-09-05T10:00:00Z', reaberto_em: '2026-09-05T11:00:00Z' },
    ] as any;

    it('ignora as marcas reabertas', () => {
      const vigente = indexarExportacaoVigente(marcas);
      expect(vigente.size).toBe(1);
      expect(vigente.get('req-1')?.exportacao_id).toBe('exp-1');
      expect(vigente.has('req-2')).toBe(false);
    });

    it('a última exportação continua enxergando o que foi reaberto', () => {
      // É essa diferença que produz a observação "já exportada antes".
      const ultima = indexarUltimaExportacao(marcas);
      expect(ultima.get('req-2')?.reaberto_por_nome).toBe('ANDRE');
    });
  });

  describe('agruparMarcasPorExportacao', () => {
    it('agrupa por lote e ordena pelo número da solicitação', () => {
      const grupos = agruparMarcasPorExportacao([
        { id: 'm1', request_id: 'r2', request_number: '2001004', exportacao_id: 'exp-1', total_itens: 1, created_at: 'x' },
        { id: 'm2', request_id: 'r1', request_number: '1000001', exportacao_id: 'exp-1', total_itens: 3, created_at: 'x' },
        { id: 'm3', request_id: 'r3', request_number: '4000005', exportacao_id: 'exp-2', total_itens: 2, created_at: 'x' },
      ] as any);

      expect(grupos.get('exp-1')?.map(m => m.request_number)).toEqual(['1000001', '2001004']);
      expect(grupos.get('exp-2')?.map(m => m.request_number)).toEqual(['4000005']);
    });
  });

  describe('reabrirSolicitacaoPorRequestId', () => {
    function mockUpdateChain(data: any[] | null, error: any = null) {
      const mockSelect = vi.fn().mockResolvedValue({ data, error });
      const mockIs = vi.fn().mockReturnValue({ select: mockSelect });
      const mockEq = vi.fn().mockReturnValue({ is: mockIs });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });
      return { mockUpdate, mockEq, mockIs };
    }

    it('devolve true e grava o motivo quando havia uma exportação vigente', async () => {
      const { mockUpdate, mockEq } = mockUpdateChain([{ id: 'm1' }]);

      const ok = await reabrirSolicitacaoPorRequestId(
        'req-1', { id: 'u1', nome: 'ANDRE' }, 'Alterada por ANDRE: Item incluído: Caneta (10 UN)',
      );

      expect(ok).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        reaberto_por_id: 'u1',
        reaberto_por_nome: 'ANDRE',
        reaberto_motivo: 'Alterada por ANDRE: Item incluído: Caneta (10 UN)',
      }));
      expect(mockEq).toHaveBeenCalledWith('request_id', 'req-1');
    });

    it('devolve false quando a solicitação não estava exportada', async () => {
      mockUpdateChain([]);
      const ok = await reabrirSolicitacaoPorRequestId('req-2', { id: 'u1', nome: 'ANDRE' });
      expect(ok).toBe(false);
    });

    it('propaga o erro do Supabase', async () => {
      mockUpdateChain(null, { message: 'falha de rede' });
      await expect(
        reabrirSolicitacaoPorRequestId('req-3', { id: 'u1', nome: 'ANDRE' }),
      ).rejects.toThrow('falha de rede');
    });
  });

  describe('concluirAjusteSapRm', () => {
    function mockUpdateChain(data: any[] | null, error: any = null) {
      const mockSelect = vi.fn().mockResolvedValue({ data, error });
      const mockIs = vi.fn().mockReturnValue({ select: mockSelect });
      const mockNot = vi.fn().mockReturnValue({ is: mockIs });
      const mockIn = vi.fn().mockReturnValue({ not: mockNot });
      const mockUpdate = vi.fn().mockReturnValue({ in: mockIn });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });
      return { mockUpdate, mockIn, mockNot, mockIs };
    }

    it('devolve zero sem chamar o Supabase quando a lista está vazia', async () => {
      const total = await concluirAjusteSapRm([], { id: 'u1', nome: 'ANDRE' });
      expect(total).toBe(0);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('marca as solicitações informadas e devolve quantas foram carimbadas', async () => {
      const { mockUpdate, mockIn } = mockUpdateChain([{ id: 'm1' }, { id: 'm2' }]);

      const total = await concluirAjusteSapRm(['req-1', 'req-2'], { id: 'u1', nome: 'ANDRE' });

      expect(total).toBe(2);
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        concluido_por_id: 'u1',
        concluido_por_nome: 'ANDRE',
      }));
      expect(mockIn).toHaveBeenCalledWith('request_id', ['req-1', 'req-2']);
    });

    it('devolve zero quando nenhuma das solicitações estava com ajuste pendente', async () => {
      mockUpdateChain([]);
      const total = await concluirAjusteSapRm(['req-3'], { id: 'u1', nome: 'ANDRE' });
      expect(total).toBe(0);
    });

    it('propaga o erro do Supabase', async () => {
      mockUpdateChain(null, { message: 'falha de rede' });
      await expect(
        concluirAjusteSapRm(['req-4'], { id: 'u1', nome: 'ANDRE' }),
      ).rejects.toThrow('falha de rede');
    });
  });

  describe('liberarParaExportarRm', () => {
    // Uma etapa a mais que concluirAjusteSapRm: dois .is() em sequência
    // (concluido_em e liberado_exportar_em), não um só.
    function mockUpdateChain(data: any[] | null, error: any = null) {
      const mockSelect = vi.fn().mockResolvedValue({ data, error });
      const mockIsLiberado = vi.fn().mockReturnValue({ select: mockSelect });
      const mockIsConcluido = vi.fn().mockReturnValue({ is: mockIsLiberado });
      const mockNot = vi.fn().mockReturnValue({ is: mockIsConcluido });
      const mockIn = vi.fn().mockReturnValue({ not: mockNot });
      const mockUpdate = vi.fn().mockReturnValue({ in: mockIn });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });
      return { mockUpdate, mockIn };
    }

    it('devolve zero sem chamar o Supabase quando a lista está vazia', async () => {
      const total = await liberarParaExportarRm([], { id: 'u1', nome: 'ANDRE' });
      expect(total).toBe(0);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('libera as solicitações informadas e devolve quantas foram carimbadas', async () => {
      const { mockUpdate, mockIn } = mockUpdateChain([{ id: 'm1' }]);

      const total = await liberarParaExportarRm(['req-5'], { id: 'u1', nome: 'ANDRE' });

      expect(total).toBe(1);
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        liberado_exportar_por_id: 'u1',
        liberado_exportar_por_nome: 'ANDRE',
      }));
      expect(mockIn).toHaveBeenCalledWith('request_id', ['req-5']);
    });

    it('devolve zero quando nenhuma solicitação estava elegível', async () => {
      mockUpdateChain([]);
      const total = await liberarParaExportarRm(['req-6'], { id: 'u1', nome: 'ANDRE' });
      expect(total).toBe(0);
    });

    it('propaga o erro do Supabase', async () => {
      mockUpdateChain(null, { message: 'falha de rede' });
      await expect(
        liberarParaExportarRm(['req-7'], { id: 'u1', nome: 'ANDRE' }),
      ).rejects.toThrow('falha de rede');
    });
  });

  describe('buscarGruposMercadoriaPorCodigosSap', () => {
    it('deve retornar mapa vazio se lista de códigos for vazia', async () => {
      const res = await buscarGruposMercadoriaPorCodigosSap([]);
      expect(res.size).toBe(0);
    });

    it('deve consultar catálogo SAP e indexar por código original, com e sem zeros', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: [
            { material_code: '1042290', grupo_mercadoria_codigo: 'M05002005' },
            { material_code: '09000001', grupo_mercadoria_codigo: 'M07001005' },
          ],
          error: null,
        }),
      });

      (supabase.from as any).mockReturnValue({
        select: mockSelect,
      });

      const res = await buscarGruposMercadoriaPorCodigosSap(['1042290', '9000001']);
      expect(supabase.from).toHaveBeenCalledWith('sap_zl0169_162_catalogo');
      expect(res.get('1042290')).toBe('M05002005');
      expect(res.get('01042290')).toBe('M05002005');
      expect(res.get('09000001')).toBe('M07001005');
      expect(res.get('9000001')).toBe('M07001005');
    });
  });
});
