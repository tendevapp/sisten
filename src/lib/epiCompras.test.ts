import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/supabaseClient', () => ({ supabase: {} }));

import {
  aplicarCaNaObservacao,
  chaveCodigoSap,
  formatarCas,
  removerCaDaObservacao,
  situacaoEpi,
  type StatusEpiMaterial,
} from './epiCompras';

const status = (extra: Partial<StatusEpiMaterial>): StatusEpiMaterial => ({
  codigo: '1', eh_grupo_epi: false, no_book: false, book_inativo: false, cas: [], descricao_book: null, ...extra,
});

describe('situacaoEpi', () => {
  it('classifica pelo Book antes do grupo SAP', () => {
    expect(situacaoEpi(status({ no_book: true, eh_grupo_epi: true }))).toBe('no_book');
    expect(situacaoEpi(status({ no_book: true }))).toBe('no_book'); // uniforme do Book
    expect(situacaoEpi(status({ book_inativo: true, eh_grupo_epi: true }))).toBe('book_inativo');
    expect(situacaoEpi(status({ eh_grupo_epi: true }))).toBe('fora_do_book');
    expect(situacaoEpi(status({}))).toBe('nao_epi');
    expect(situacaoEpi(undefined)).toBe('nao_epi');
  });

  it('compara código SAP sem zeros à esquerda', () => {
    expect(chaveCodigoSap(' 0001357022 ')).toBe('1357022');
  });
});

describe('CA na observação', () => {
  it('junta CAs de várias linhas e ignora "não aplicável"', () => {
    expect(formatarCas(['8304\n498', '8304'])).toBe('8304 / 498');
    expect(formatarCas(['não aplicável'])).toBe('');
  });

  it('acrescenta a linha de CA ao fim da observação', () => {
    expect(aplicarCaNaObservacao('', ['12345'])).toBe('CA (Book de EPIs): 12345');
    expect(aplicarCaNaObservacao('ITEM GENÉRICO: botina cano alto', ['12345']))
      .toBe('ITEM GENÉRICO: botina cano alto\nCA (Book de EPIs): 12345');
  });

  it('substitui a linha anterior em vez de duplicar', () => {
    const primeira = aplicarCaNaObservacao('Urgente', ['111']);
    expect(aplicarCaNaObservacao(primeira, ['222'])).toBe('Urgente\nCA (Book de EPIs): 222');
  });

  it('remove só a linha automática', () => {
    expect(removerCaDaObservacao('Urgente\nCA (Book de EPIs): 111\nentregar no pátio')).toBe('Urgente\nentregar no pátio');
    expect(aplicarCaNaObservacao('Urgente\nCA (Book de EPIs): 111', ['não aplicável'])).toBe('Urgente');
  });
});
