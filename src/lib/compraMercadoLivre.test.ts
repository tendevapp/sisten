import { describe, expect, it } from 'vitest';
import {
  ehLinkMercadoLivre, itemFoiComprado, normalizarLinkMl, statusAposCompraMl, normalizarNumeroCompraMl, observacaoComCompraMl,
  passaFiltroCompraMl, resumirComprasMl, type ItemMercadoLivre,
} from './compraMercadoLivre';

const item = (over: Partial<ItemMercadoLivre>): ItemMercadoLivre => ({
  ri: '1000', rm: '1000', item_reqc: '10', material_code: null, texto_breve: null, qtd: 1, unidade: 'UN',
  link: 'https://produto.mercadolivre.com.br/MLB-1', numero_compra: null, compra_registrada_em: null,
  compra_registrada_por_nome: null, criado_por_nome: null, created_at: '', updated_at: '', ...over,
});

describe('normalizarNumeroCompraMl', () => {
  it('tira o # e espaços do jeito que o ML mostra', () => {
    expect(normalizarNumeroCompraMl('# 2000015616071149')).toBe('2000015616071149');
    expect(normalizarNumeroCompraMl('Compra #2000015616071149')).toBe('2000015616071149');
  });
  it('recusa número curto demais', () => {
    expect(normalizarNumeroCompraMl('#123')).toBeNull();
    expect(normalizarNumeroCompraMl('')).toBeNull();
  });
});

describe('normalizarLinkMl', () => {
  it('aceita link colado sem protocolo', () => {
    expect(normalizarLinkMl('produto.mercadolivre.com.br/MLB-123')).toBe('https://produto.mercadolivre.com.br/MLB-123');
  });
  it('recusa texto que não é endereço', () => {
    expect(normalizarLinkMl('cabo flexível')).toBeNull();
    expect(normalizarLinkMl('   ')).toBeNull();
  });
});

describe('ehLinkMercadoLivre', () => {
  it('reconhece domínios do ML e o encurtador', () => {
    expect(ehLinkMercadoLivre('https://produto.mercadolivre.com.br/MLB-1')).toBe(true);
    expect(ehLinkMercadoLivre('https://www.mercadolivre.com.br/p/MLB2')).toBe(true);
    expect(ehLinkMercadoLivre('https://meli.la/abc')).toBe(true);
    expect(ehLinkMercadoLivre('https://www.amazon.com.br/x')).toBe(false);
  });
});

describe('observacaoComCompraMl', () => {
  it('acrescenta numa linha nova sem apagar a nota', () => {
    expect(observacaoComCompraMl('Urgente', '2000015616071149')).toBe('Urgente\nCompra ML #2000015616071149');
    expect(observacaoComCompraMl('', '2000015616071149')).toBe('Compra ML #2000015616071149');
  });
  it('não repete o número já gravado', () => {
    expect(observacaoComCompraMl('Compra ML #2000015616071149', '2000015616071149')).toBe('Compra ML #2000015616071149');
  });
});

describe('resumirComprasMl', () => {
  it('agrupa itens de várias RMs pela compra', () => {
    const resumo = resumirComprasMl([
      item({ ri: 'a', rm: '200', numero_compra: '2000015616071149', compra_registrada_em: '2026-10-27T10:00:00Z' }),
      item({ ri: 'b', rm: '100', numero_compra: '2000015616071149', compra_registrada_em: '2026-10-27T10:00:00Z' }),
      item({ ri: 'c', rm: '100', numero_compra: '2000015600000001', compra_registrada_em: '2026-10-20T10:00:00Z' }),
      item({ ri: 'd', rm: '300' }),
    ]);
    expect(resumo.map(r => r.numero)).toEqual(['2000015616071149', '2000015600000001']);
    expect(resumo[0]).toMatchObject({ itens: 2, rms: ['100', '200'] });
  });
});

describe('statusAposCompraMl', () => {
  it('vira Comprado antes do pedido', () => {
    expect(statusAposCompraMl('Aguardando Cotação')).toBe('Comprado');
    expect(statusAposCompraMl('')).toBe('Comprado');
    expect(statusAposCompraMl(undefined)).toBe('Comprado');
  });
  it('não volta quem já está mais adiante', () => {
    expect(statusAposCompraMl('Em rota de entrega')).toBe('Em rota de entrega');
    expect(statusAposCompraMl('Entregue')).toBe('Entregue');
  });
});

describe('itemFoiComprado', () => {
  it('PO, compra ML ou status Comprado contam como comprado', () => {
    expect(itemFoiComprado({ temPo: true })).toBe(true);
    expect(itemFoiComprado({ temPo: false, numeroCompraMl: '2000015616071149' })).toBe(true);
    expect(itemFoiComprado({ temPo: false, itemStatus: 'Comprado' })).toBe(true);
    expect(itemFoiComprado({ temPo: false, itemStatus: 'Aguardando Cotação' })).toBe(false);
  });
});

describe('passaFiltroCompraMl', () => {
  it('separa os que faltam comprar e os de uma compra', () => {
    const semCompra = item({});
    const comprado = item({ numero_compra: '2000015616071149' });
    expect(passaFiltroCompraMl(semCompra, 'sem_compra')).toBe(true);
    expect(passaFiltroCompraMl(comprado, 'sem_compra')).toBe(false);
    expect(passaFiltroCompraMl(comprado, '2000015616071149')).toBe(true);
    expect(passaFiltroCompraMl(undefined, 'todos')).toBe(false);
  });
});
