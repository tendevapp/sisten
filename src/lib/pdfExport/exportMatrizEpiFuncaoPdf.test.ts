import { describe, expect, it, vi } from 'vitest';
import {
  HEADCOUNTS_PADRAO_TEN,
  exportMatrizEpiFuncaoPdf,
  sanitizePdfText,
} from './exportMatrizEpiFuncaoPdf';
import type { SsmaEpiFuncao, SsmaEpiPorFuncao } from '../ssmaEpiPorFuncaoApi';
import type { SsmaBookEpi } from '../ssmaBookEpisApi';

// Mock do downloadPdf para não tentar disparar downloads de DOM em testes node
vi.mock('./core', async () => {
  const actual = await vi.importActual<typeof import('./core')>('./core');
  return {
    ...actual,
    downloadPdf: vi.fn().mockResolvedValue(undefined),
  };
});

describe('exportMatrizEpiFuncaoPdf', () => {
  it('sanitiza caracteres problemáticos e unicode fora do padrão', () => {
    expect(sanitizePdfText('EPI – Luva de Raspa “A”')).toBe('EPI - Luva de Raspa "A"');
    expect(sanitizePdfText('Seta ➔ Teste')).toBe('Seta -> Teste');
    expect(sanitizePdfText(null)).toBe('');
  });

  it('mantém os headcounts padrão de fábrica da TEN', () => {
    expect(HEADCOUNTS_PADRAO_TEN['FUN-001']).toBe(1);
    expect(HEADCOUNTS_PADRAO_TEN['FUN-002']).toBe(3);
    expect(HEADCOUNTS_PADRAO_TEN['FUN-003']).toBe(2);
    expect(HEADCOUNTS_PADRAO_TEN['FUN-004']).toBe(2);
  });

  it('gera o documento PDF em formato paisagem a partir dos dados do cadastro', async () => {
    const funcoesMock: SsmaEpiFuncao[] = [
      { id: 'f-1', codigo_origem: 'FUN-001', nome: 'ALMOXARIFE', ativo: true },
      { id: 'f-2', codigo_origem: 'FUN-002', nome: 'ELETRICISTA', ativo: true },
    ];

    const bookMock: SsmaBookEpi[] = [
      {
        id: 'b-1',
        codigo_sap: 'SAP-101',
        descricao_sap: 'CAPACETE AZUL',
        descricao_epi: 'Capacete de Seguranca',
        numero_ca: '12345',
        validade_ca: '2028-12-31',
        ativo: true,
        fabricante: '3M',
        grupo_epi: 'CAPACETE',
        tamanho: 'UN',
        cor: 'AZUL',
        especificacao_tecnica: null,
        foto_url: null,
      },
    ];

    const requisitosMock: SsmaEpiPorFuncao[] = [
      {
        id: 'r-1',
        funcao_id: 'f-1',
        epi_book_id: 'b-1',
        codigo_vinculo_origem: 'VINC-001',
        codigo_epi_origem: 'EPI-001',
        descricao_epi_origem: 'CAPACETE SEG ABA FRON PLAS',
        ca_origem: '12345',
        classificacao: 'BASICO_OBRIGATORIO',
        condicao_uso: null,
        ativo: true,
      },
      {
        id: 'r-2',
        funcao_id: 'f-2',
        epi_book_id: null,
        codigo_vinculo_origem: 'VINC-002',
        codigo_epi_origem: 'EPI-002',
        descricao_epi_origem: 'LUVA SEGURANCA VAQ CT10 UN',
        ca_origem: '67890',
        classificacao: 'ESPECIFICO_OBRIGATORIO',
        condicao_uso: null,
        ativo: true,
      },
    ];

    await expect(
      exportMatrizEpiFuncaoPdf({
        funcoes: funcoesMock,
        requisitos: requisitosMock,
        book: bookMock,
      })
    ).resolves.not.toThrow();
  });
});
