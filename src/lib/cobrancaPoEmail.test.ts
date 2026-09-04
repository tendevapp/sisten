import { describe, expect, it } from 'vitest';
import {
  obterEmailsFornecedor,
  montarAssuntoCobrancaPo,
  montarCorpoCobrancaPo,
  LinhaItemCobrancaPo,
} from './cobrancaPoEmail';
import type { ContatoFornecedor } from '../types';

describe('cobrancaPoEmail', () => {
  const contatosExemplo: ContatoFornecedor[] = [
    {
      id: '1',
      cod_vendor: '0001002345',
      fornecedor: 'WEG EQUIPAMENTOS ELETRICOS S.A.',
      nome_fantasia: 'WEG',
      email: 'vendas@weg.net',
      representante_email: 'contato.vendedor@weg.net',
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: '2',
      cod_vendor: '500800',
      fornecedor: 'PARAFUSOS SAO PAULO LTDA',
      email: 'comercial@parafusossp.com.br',
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: '3',
      cod_vendor: '999999',
      fornecedor: 'FORNECEDOR SEM EMAIL',
      created_at: '2026-01-01T00:00:00Z',
    },
  ];

  describe('obterEmailsFornecedor', () => {
    it('encontra e-mails por codigo exato incluindo geral e representante', () => {
      const emails = obterEmailsFornecedor('0001002345', undefined, contatosExemplo);
      expect(emails).toContain('vendas@weg.net');
      expect(emails).toContain('contato.vendedor@weg.net');
      expect(emails.split('; ')).toHaveLength(2);
    });

    it('encontra e-mails por codigo sem zeros a esquerda', () => {
      const emails = obterEmailsFornecedor('1002345', undefined, contatosExemplo);
      expect(emails).toContain('vendas@weg.net');
      expect(emails).toContain('contato.vendedor@weg.net');
    });

    it('encontra e-mails com entrada de codigo menor sem zeros contra cadastro com zeros', () => {
      const emails = obterEmailsFornecedor('0000500800', undefined, contatosExemplo);
      expect(emails).toBe('comercial@parafusossp.com.br');
    });

    it('encontra e-mails por nome do fornecedor caso codigo nao bata', () => {
      const emails = obterEmailsFornecedor(undefined, 'parafusos sao paulo ltda', contatosExemplo);
      expect(emails).toBe('comercial@parafusossp.com.br');
    });

    it('retorna string vazia quando nao encontra o fornecedor', () => {
      const emails = obterEmailsFornecedor('888888', 'FORNECEDOR INEXISTENTE', contatosExemplo);
      expect(emails).toBe('');
    });

    it('retorna string vazia quando fornecedor existe mas nao tem e-mails cadastrados', () => {
      const emails = obterEmailsFornecedor('999999', 'FORNECEDOR SEM EMAIL', contatosExemplo);
      expect(emails).toBe('');
    });
  });

  describe('montarAssuntoCobrancaPo', () => {
    it('monta o assunto com o formato Atualização do PO-[numero]', () => {
      expect(montarAssuntoCobrancaPo('4500123456')).toBe('Atualização do PO-4500123456');
    });

    it('trata espacos extras no numero do PO', () => {
      expect(montarAssuntoCobrancaPo('  4500999888  ')).toBe('Atualização do PO-4500999888');
    });
  });

  describe('montarCorpoCobrancaPo', () => {
    it('monta texto cordial com dados do PO, fornecedor e lista de itens', () => {
      const itens: LinhaItemCobrancaPo[] = [
        {
          material: '1004567',
          descricao: 'PARAFUSO SEXTAVADO 1/2 X 2 POL',
          quantidade: 100,
          unidade: 'PC',
          previsao: '2026-04-15',
          rm: '10234 / 10',
        },
        {
          material: '1004568',
          descricao: 'PORCA SEXTAVADA 1/2 POL',
          quantidade: 100,
          unidade: 'PC',
          previsao: '2026-04-15',
        },
      ];

      const corpo = montarCorpoCobrancaPo({
        fornecedorNome: 'WEG EQUIPAMENTOS',
        docCompra: '4500123456',
        dataPedido: '2026-03-01',
        previsaoGeral: '2026-04-15',
        itens,
        solicitanteNome: 'André Araújo',
      });

      expect(corpo).toContain('Prezada equipe da WEG EQUIPAMENTOS,');
      expect(corpo).toContain('Pedido de Compra (PO): 4500123456');
      expect(corpo).toContain('Data do Pedido: 01/03/2026');
      expect(corpo).toContain('Previsão de Entrega: 15/04/2026');
      expect(corpo).toContain('[1004567] PARAFUSO SEXTAVADO 1/2 X 2 POL (RM: 10234 / 10)');
      expect(corpo).toContain('Quantidade: 100 PC | Previsão de Entrega: 15/04/2026');
      expect(corpo).toContain('[1004568] PORCA SEXTAVADA 1/2 POL');
      expect(corpo).toContain('confirmar a previsão atualizada de entrega');
      expect(corpo).not.toContain('Espero que este e-mail os encontre bem');
      expect(corpo).not.toContain('cordialmente');
      expect(corpo).not.toContain('Atenciosamente');
      expect(corpo).not.toContain('TEN - Torres Eólicas do Nordeste');
    });
  });
});
