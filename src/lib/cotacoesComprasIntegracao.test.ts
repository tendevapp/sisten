import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localDb } from '../db/localDb';
import { limparComprasMemoryCache } from '../views/Compras';
import type { RequisicaoCompra } from '../types';

describe('Integração Central de Compras e Cotações', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('limparComprasMemoryCache', () => {
    it('pode ser chamado sem erros para invalidar o cache da Central de Compras', () => {
      expect(() => limparComprasMemoryCache()).not.toThrow();
    });
  });

  describe('atualizarStatusItensCotacao', () => {
    it('atualiza o item_status das requisições locais para "Análise de Cotações" e registra auditoria', async () => {
      const mockReq: RequisicaoCompra = {
        ri: '1001004/00010',
        requisicao: '1001004',
        item: '00010',
        status_ri: 'LIBERADO',
        item_status: 'Aguardando Cotação',
        material: '1456972',
        texto_breve: 'CABO ELETRICO 10MM',
        data_solicitacao: '2026-09-20',
      };

      // Grava no cache de memória do localDb
      localDb.setStorageItem('sisten_requisicoes', [mockReq]);

      // Executa a atualização de status
      const resultado = await localDb.atualizarStatusItensCotacao(['1001004/00010'], 'Comprador Silva');

      expect(resultado).toBeDefined();
      expect(resultado.ok).toBeGreaterThanOrEqual(0);

      // Lê do localDb
      const requisicoes = localDb.getRequisicoes();
      const reqAtualizada = requisicoes.find(r => r.ri === '1001004/00010');
      expect(reqAtualizada).toBeDefined();
      expect(reqAtualizada?.item_status).toBe('Análise de Cotações');
      expect(reqAtualizada?.item_status_updated_by).toBe('Comprador Silva');
      expect(reqAtualizada?.item_status_updated_at).toBeDefined();
    });

    it('ignora RIs vazias retornando ok 0 e failed vazio', async () => {
      const resVazio = await localDb.atualizarStatusItensCotacao([], 'Teste');
      expect(resVazio).toEqual({ ok: 0, failed: [] });
    });
  });

  describe('Extração de Parâmetros do Hash Router para Mapa Comparativo', () => {
    it('extrai corretamente processoId e fase=mapa a partir de hash com query string', () => {
      const hash = '#/suprimentos/cotacoes?processoId=COT-210926-01&fase=mapa';
      const hashQuery = hash.includes('?') ? hash.split('?')[1] : '';
      const params = new URLSearchParams(hashQuery);

      expect(params.get('processoId')).toBe('COT-210926-01');
      expect(params.get('fase')).toBe('mapa');
    });

    it('extrai corretamente quando codificado com URI components', () => {
      const processoId = 'COT 210926/01';
      const hash = `#/suprimentos/analise-cotacoes?processoId=${encodeURIComponent(processoId)}&fase=mapa`;
      const hashQuery = hash.includes('?') ? hash.split('?')[1] : '';
      const params = new URLSearchParams(hashQuery);

      expect(params.get('processoId')).toBe(processoId);
      expect(params.get('fase')).toBe('mapa');
    });
  });
});
