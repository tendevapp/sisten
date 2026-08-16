import { describe, it, expect } from 'vitest';
import {
  classifyTipoDemanda,
  classifyCriticidade,
  classifyCriticidadeNatureza,
  isProjetoItem,
  resolveDataCorte,
} from './demandas';

describe('demandas - classificacoes e utilitarios', () => {
  describe('isProjetoItem', () => {
    it('deve identificar codigos de 18 digitos iniciados em 1000000 / 100000 como Projeto', () => {
      expect(isProjetoItem('100000000000047981')).toBe(true);
      expect(isProjetoItem('100000000000000110')).toBe(true);
      expect(isProjetoItem('100000000000000138')).toBe(true);
      expect(isProjetoItem('100000123456789012')).toBe(true);
    });

    it('deve lidar com zeros a esquerda para itens de projeto', () => {
      expect(isProjetoItem('000000100000000000047981')).toBe(true);
    });

    it('deve identificar codigos normais / curtos de consumo como Consumo (isProjetoItem = false)', () => {
      expect(isProjetoItem('1433206')).toBe(false);
      expect(isProjetoItem('2000123')).toBe(false);
      expect(isProjetoItem('300045')).toBe(false);
      expect(isProjetoItem('10000123')).toBe(false);
      expect(isProjetoItem('10000456')).toBe(false);
    });

    it('deve retornar false para valores vazios ou placeholders', () => {
      expect(isProjetoItem('')).toBe(false);
      expect(isProjetoItem(null)).toBe(false);
      expect(isProjetoItem(undefined)).toBe(false);
      expect(isProjetoItem('—')).toBe(false);
    });
  });

  describe('classifyTipoDemanda', () => {
    it('deve classificar RMs iniciadas em 11, 12, 13 como material', () => {
      expect(classifyTipoDemanda('1100012345')).toBe('material');
      expect(classifyTipoDemanda('1200012345')).toBe('material');
      expect(classifyTipoDemanda('1300012345')).toBe('material');
    });

    it('deve classificar RMs iniciadas em 17 como servico', () => {
      expect(classifyTipoDemanda('1700012345')).toBe('servico');
    });

    it('deve classificar outros prefixos como outro', () => {
      expect(classifyTipoDemanda('9900012345')).toBe('outro');
      expect(classifyTipoDemanda('')).toBe('outro');
      expect(classifyTipoDemanda(null)).toBe('outro');
    });
  });

  describe('classifyCriticidade', () => {
    it('deve mapear prefixo de RM para criticidade', () => {
      expect(classifyCriticidade('1100000000')).toBe('normal');
      expect(classifyCriticidade('1200000000')).toBe('urgente');
      expect(classifyCriticidade('1300000000')).toBe('maquina_parada');
      expect(classifyCriticidade('1700000000')).toBeNull();
    });
  });

  describe('resolveDataCorte', () => {
    it('deve usar data_pedido se status for Processado e data_pedido existir', () => {
      const res = resolveDataCorte({
        status_requisicao: 'Processado',
        data_solicitacao: '2026-01-10',
        data_pedido: '2026-02-15',
      });
      expect(res).toBe('2026-02-15');
    });

    it('deve usar data_solicitacao se nao houver PO colocado', () => {
      const res = resolveDataCorte({
        status_requisicao: 'Sem PO',
        data_solicitacao: '2026-01-10',
        data_pedido: null,
      });
      expect(res).toBe('2026-01-10');
    });
  });
});
