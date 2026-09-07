import { describe, it, expect } from 'vitest';
import {
  COMPRADORES_PADRAO,
  salvarVinculoGrupoComprador,
  sugerirCompradorPorNiveis,
  atualizarCompradorEmLote,
  atualizarCompradoresIndividuaisEmLote,
} from './grupoCompradorApi';

describe('grupoCompradorApi', () => {
  describe('COMPRADORES_PADRAO', () => {
    it('deve conter a lista oficial de compradores da equipe', () => {
      const codigos = COMPRADORES_PADRAO.map(c => c.grupo_compras);
      expect(codigos).toContain('314'); // Itana
      expect(codigos).toContain('358'); // Isadora
      expect(codigos).toContain('575'); // Andre
      expect(codigos).toContain('602'); // Jamille
      expect(codigos).toContain('610'); // Giulia
    });

    it('deve possuir e-mails e usuarios do sistema definidos para todos os compradores', () => {
      for (const comp of COMPRADORES_PADRAO) {
        expect(comp.nome_comprador.trim().length).toBeGreaterThan(0);
        expect(comp.usuario_sistema.trim().length).toBeGreaterThan(0);
        expect(comp.email).toContain('@ten.ind.br');
      }
    });

    it('deve ter 358 para Isadora e 575 para Andre', () => {
      const isadora = COMPRADORES_PADRAO.find(c => c.grupo_compras === '358');
      const andre = COMPRADORES_PADRAO.find(c => c.grupo_compras === '575');

      expect(isadora).toBeDefined();
      expect(isadora?.nome_comprador).toBe('Isadora');
      expect(isadora?.usuario_sistema).toBe('ISANTOS');

      expect(andre).toBeDefined();
      expect(andre?.nome_comprador).toBe('André');
      expect(andre?.usuario_sistema).toBe('AMURITIBA');
    });

    it('deve marcar Jamille (602) como compradora inativa', () => {
      const jamille = COMPRADORES_PADRAO.find(c => c.grupo_compras === '602');
      expect(jamille).toBeDefined();
      expect(jamille?.ativo).toBe(false);

      const ativos = COMPRADORES_PADRAO.filter(c => c.ativo !== false);
      expect(ativos.map(c => c.grupo_compras)).not.toContain('602');
      expect(ativos.map(c => c.grupo_compras)).toEqual(['314', '358', '575', '610']);
    });
  });

  describe('validacoes de salvarVinculoGrupoComprador', () => {
    it('deve rejeitar codigo de grupo de mercadoria vazio', async () => {
      await expect(
        salvarVinculoGrupoComprador({
          grupo_compras: '358',
          grupo_mercadoria_codigo: '   ',
          grupo_mercadoria_nome: 'EPI',
        })
      ).rejects.toThrow('código do grupo de mercadorias é obrigatório');
    });

    it('deve rejeitar denominacao de grupo vazia', async () => {
      await expect(
        salvarVinculoGrupoComprador({
          grupo_compras: '358',
          grupo_mercadoria_codigo: 'M11003002',
          grupo_mercadoria_nome: '   ',
        })
      ).rejects.toThrow('nome do grupo de mercadorias é obrigatório');
    });

    it('deve rejeitar codigo de comprador vazio', async () => {
      await expect(
        salvarVinculoGrupoComprador({
          grupo_compras: '   ',
          grupo_mercadoria_codigo: 'M11003002',
          grupo_mercadoria_nome: 'EPI',
        })
      ).rejects.toThrow('código do comprador é obrigatório');
    });
  });

  describe('sugerirCompradorPorNiveis', () => {
    it('deve sugerir 358 para EPI - Segurança', () => {
      const sug = sugerirCompradorPorNiveis('CONSUMÍVEL', 'EPI - Segurança');
      expect(sug.grupo_compras).toBe('358');
      expect(sug.motivo).toContain('EPI - Segurança');
    });

    it('deve sugerir 575 para Medicamentos e Hospitalar', () => {
      expect(sugerirCompradorPorNiveis('CONSUMÍVEL', 'Medicamentos').grupo_compras).toBe('575');
      expect(sugerirCompradorPorNiveis('CONSUMÍVEL', 'Hospitalar').grupo_compras).toBe('575');
    });

    it('deve sugerir 314 para Copa e Limpeza e MRO - Manutenção', () => {
      expect(sugerirCompradorPorNiveis('CONSUMÍVEL', 'Copa e Limpeza').grupo_compras).toBe('314');
      expect(sugerirCompradorPorNiveis('CONSUMÍVEL', 'MRO - Manutenção').grupo_compras).toBe('314');
    });

    it('deve respeitar historico dominante ativo excluindo Jamille (602)', () => {
      const mockHistorico = [
        { id: '1', grupo_compras: '602', classificacao_nivel2: 'Teste Custom', ativo: true } as any,
        { id: '2', grupo_compras: '602', classificacao_nivel2: 'Teste Custom', ativo: true } as any,
        { id: '3', grupo_compras: '575', classificacao_nivel2: 'Teste Custom', ativo: true } as any,
      ];
      const sug = sugerirCompradorPorNiveis('CONSUMÍVEL', 'Teste Custom', mockHistorico);
      expect(sug.grupo_compras).toBe('575');
    });
  });

  describe('atualizarCompradorEmLote e individuais', () => {
    it('deve retornar sem erros quando ids vazios forem fornecidos', async () => {
      await expect(atualizarCompradorEmLote([], '358', 'Isadora')).resolves.toBeUndefined();
      await expect(atualizarCompradoresIndividuaisEmLote([])).resolves.toBeUndefined();
    });
  });
});
