import { describe, it, expect } from 'vitest';
import {
  normalizarListaEmails,
  montarMailtoComConfig,
  CONFIGS_EMAIL_PADRAO,
} from './emailConfigApi';

describe('emailConfigApi', () => {
  describe('normalizarListaEmails', () => {
    it('deve extrair e-mails separados por vírgula, ponto e vírgula e espaços', () => {
      const entrada = 'andre.araujo@ten.ind.br, jefferson.santana@ten.ind.br; compras@ten.ind.br \n  diretoria@ten.ind.br ';
      const resultado = normalizarListaEmails(entrada);
      expect(resultado).toEqual([
        'andre.araujo@ten.ind.br',
        'jefferson.santana@ten.ind.br',
        'compras@ten.ind.br',
        'diretoria@ten.ind.br',
      ]);
    });

    it('deve filtrar entradas vazias ou sem @', () => {
      const entrada = '  , texto_invalido , teste@empresa.com ; ';
      const resultado = normalizarListaEmails(entrada);
      expect(resultado).toEqual(['teste@empresa.com']);
    });

    it('deve retornar array vazio para string nula ou vazia', () => {
      expect(normalizarListaEmails(null)).toEqual([]);
      expect(normalizarListaEmails('')).toEqual([]);
      expect(normalizarListaEmails('   ')).toEqual([]);
    });
  });

  describe('montarMailtoComConfig', () => {
    it('deve montar mailto com múltiplos destinatários, CC, BCC, assunto e corpo', () => {
      const url = montarMailtoComConfig({
        destinatarios: 'destinatario1@ten.ind.br, destinatario2@ten.ind.br',
        copia: 'copia@ten.ind.br',
        copiaOculta: 'oculto@ten.ind.br',
        assunto: 'Assunto Teste',
        corpo: 'Linha 1\nLinha 2',
      });

      expect(url.startsWith('mailto:destinatario1%40ten.ind.br%2Cdestinatario2%40ten.ind.br?')).toBe(true);
      expect(url).toContain('cc=copia%40ten.ind.br');
      expect(url).toContain('bcc=oculto%40ten.ind.br');
      expect(url).toContain('subject=Assunto%20Teste');
      expect(url).toContain('body=Linha%201%0D%0ALinha%202');
    });

    it('deve omitir parâmetros opcionais quando não fornecidos', () => {
      const url = montarMailtoComConfig({
        destinatarios: 'andre@ten.ind.br',
        corpo: 'Mensagem simples',
      });

      expect(url).toBe('mailto:andre%40ten.ind.br?body=Mensagem%20simples');
      expect(url).not.toContain('cc=');
      expect(url).not.toContain('bcc=');
      expect(url).not.toContain('subject=');
    });
  });

  describe('CONFIGS_EMAIL_PADRAO', () => {
    it('deve conter as chaves essenciais do SISTEN', () => {
      const chaves = CONFIGS_EMAIL_PADRAO.map(c => c.chave);
      expect(chaves).toContain('cadastro_sap');
      expect(chaves).toContain('expedicao_chegada');
      expect(chaves).toContain('expedicao_tramos');
      expect(chaves).toContain('portaria_relatorio');
      expect(chaves).toContain('rh_ase_hora_extra');
    });
  });
});
