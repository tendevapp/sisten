import { describe, expect, it } from 'vitest';
import {
  casaBuscaCompraFinMl, etapaItem, formatarLinhaDigitavel, lerValorBRL, passaFiltroCompraFinMl, resumirComprasFinMl,
  saldoItem, valorLiberadoParaBaixa,
  type BaixaFinMl, type CompraFinMl, type ItemFinMl,
} from './finMercadoLivre';

const item = (over: Partial<ItemFinMl> = {}): ItemFinMl => ({
  ri: '120009113100170', rm: '1200091131', item_reqc: '170', material_code: '123', texto_breve: 'SINALEIRO',
  qtd: 2, unidade: 'UN', link: null, numero_compra: '2000015616071149',
  compra_registrada_em: '2026-10-27T10:00:00Z', compra_registrada_por_nome: 'Comprador',
  pedidos: null, fornecedores: null, valor_pedido: null, qtd_pedido: null, qtd_fornecida: null,
  data_pedido: null, data_migo: null, qtd_recebida: null, data_recebimento: null, notas_fiscais: null,
  data_chegada: null, valor_baixado: 0, ultima_baixa: null,
  ...over,
});

const compra = (over: Partial<CompraFinMl> = {}): CompraFinMl => ({
  numero_compra: '2000015616071149', valor_boleto: 100, vencimento: '2026-10-30', pago_em: '2026-10-29',
  doc_adiantamento: null, observacao: null, atualizado_por_nome: null, updated_at: '2026-10-28T00:00:00Z',
  ...over,
});

const baixa = (over: Partial<BaixaFinMl> = {}): BaixaFinMl => ({
  id: 'b1', numero_compra: '2000015616071149', ri: '120009113100170', valor: 10, data_baixa: '2026-11-05',
  nota_fiscal: null, doc_compensacao: null, observacao: null, criado_por_id: 'u', criado_por_nome: 'Fin',
  created_at: '2026-11-05T10:00:00Z', estornado_em: null, estornado_por_nome: null, motivo_estorno: null,
  ...over,
});

describe('etapaItem', () => {
  it('avança comprado → PO → almox → MIGO → baixado', () => {
    expect(etapaItem(item())).toBe('comprado');
    expect(etapaItem(item({ pedidos: ['4100474237'], valor_pedido: 15.37 }))).toBe('pedido');
    expect(etapaItem(item({ pedidos: ['4100474237'], valor_pedido: 15.37, data_chegada: '2026-11-01' }))).toBe('recebido');
    expect(etapaItem(item({ pedidos: ['4100474237'], valor_pedido: 15.37, data_migo: '2026-11-02' }))).toBe('migo');
    expect(etapaItem(item({ pedidos: ['4100474237'], valor_pedido: 15.37, data_migo: '2026-11-02', valor_baixado: 15.37 }))).toBe('baixado');
  });

  it('baixa parcial não conta como baixado', () => {
    expect(etapaItem(item({ pedidos: ['1'], valor_pedido: 100, data_migo: '2026-11-02', valor_baixado: 40 }))).toBe('migo');
  });
});

describe('valorLiberadoParaBaixa', () => {
  it('sem PO ou sem entrega não libera nada', () => {
    expect(valorLiberadoParaBaixa(item())).toBe(0);
    expect(valorLiberadoParaBaixa(item({ pedidos: ['1'], valor_pedido: 100 }))).toBe(0);
  });

  it('MIGO sem quantidade libera o item inteiro, descontando o já baixado', () => {
    expect(valorLiberadoParaBaixa(item({ pedidos: ['1'], valor_pedido: 100, qtd_pedido: 10, data_migo: '2026-11-02' }))).toBe(100);
    expect(valorLiberadoParaBaixa(item({ pedidos: ['1'], valor_pedido: 100, qtd_pedido: 10, data_migo: '2026-11-02', valor_baixado: 30 }))).toBe(70);
  });

  it('MIGO parcial libera proporcional à quantidade fornecida', () => {
    expect(valorLiberadoParaBaixa(item({ pedidos: ['1'], valor_pedido: 100, qtd_pedido: 10, qtd_fornecida: 4, data_migo: '2026-11-02' }))).toBe(40);
  });

  it('antes da MIGO usa a quantidade conferida no almoxarifado', () => {
    expect(valorLiberadoParaBaixa(item({ pedidos: ['1'], valor_pedido: 90, qtd_pedido: 3, qtd_recebida: 1, data_recebimento: '2026-11-01' }))).toBe(30);
    // Só "chegou", sem conferência com quantidade: ainda não comprova valor.
    expect(valorLiberadoParaBaixa(item({ pedidos: ['1'], valor_pedido: 90, qtd_pedido: 3, data_chegada: '2026-11-01' }))).toBe(0);
  });

  it('nunca passa do valor do PO', () => {
    expect(valorLiberadoParaBaixa(item({ pedidos: ['1'], valor_pedido: 50, qtd_pedido: 2, qtd_fornecida: 5, data_migo: '2026-11-02' }))).toBe(50);
  });
});

describe('saldoItem', () => {
  it('é o valor do PO menos o baixado, sem ficar negativo', () => {
    expect(saldoItem(item({ valor_pedido: 15.37, valor_baixado: 5 }))).toBe(10.37);
    expect(saldoItem(item({ valor_pedido: 15.37, valor_baixado: 20 }))).toBe(0);
  });
});

describe('resumirComprasFinMl', () => {
  it('soma baixas válidas (inclusive avulsas) e ignora estornadas', () => {
    const [r] = resumirComprasFinMl(
      [item({ pedidos: ['1'], valor_pedido: 60, data_migo: '2026-11-02' }), item({ ri: 'X', rm: '1100', valor_pedido: null })],
      [compra({ valor_boleto: 100 })],
      [baixa({ valor: 60 }), baixa({ id: 'b2', ri: null, valor: 5 }), baixa({ id: 'b3', valor: 99, estornado_em: '2026-11-06T00:00:00Z' })],
    );
    expect(r.valorBaixado).toBe(65);
    expect(r.saldoAdiantamento).toBe(35);
    expect(r.itensSemPedido).toBe(1);
    expect(r.rms).toEqual(['1100', '1200091131']);
    expect(r.situacao).toBe('em_aberto');
  });

  it('situação: sem boleto → a pagar → em aberto → baixada', () => {
    const itens = [item()];
    expect(resumirComprasFinMl(itens, [], [])[0].situacao).toBe('sem_boleto');
    expect(resumirComprasFinMl(itens, [compra({ pago_em: null })], [])[0].situacao).toBe('aguardando_pagamento');
    expect(resumirComprasFinMl(itens, [compra()], [baixa({ valor: 100 })])[0].situacao).toBe('quitada');
  });

  it('mantém visível o boleto de uma compra sem itens', () => {
    const r = resumirComprasFinMl([], [compra({ numero_compra: '2000099999999999' })], []);
    expect(r.map(x => x.numero)).toEqual(['2000099999999999']);
  });

  it('filtra e busca por PO, NF e nº da compra', () => {
    const [r] = resumirComprasFinMl(
      [item({ pedidos: ['4100474237'], valor_pedido: 10, data_migo: '2026-11-02', notas_fiscais: ['12345'] })],
      [compra()], [],
    );
    expect(passaFiltroCompraFinMl(r, 'prontas')).toBe(true);
    expect(passaFiltroCompraFinMl(r, 'quitadas')).toBe(false);
    expect(casaBuscaCompraFinMl(r, '4100474237')).toBe(true);
    expect(casaBuscaCompraFinMl(r, '12345')).toBe(true);
    expect(casaBuscaCompraFinMl(r, '# 2000015616071149')).toBe(true);
    expect(casaBuscaCompraFinMl(r, 'parafuso')).toBe(false);
  });
});

describe('lerValorBRL', () => {
  it('aceita formato brasileiro e com ponto decimal', () => {
    expect(lerValorBRL('1.234,56')).toBe(1234.56);
    expect(lerValorBRL('R$ 15,37')).toBe(15.37);
    expect(lerValorBRL('15.37')).toBe(15.37);
    expect(lerValorBRL('')).toBeNull();
    expect(lerValorBRL('abc')).toBeNull();
  });

  it('corrige o valor colado do ML sem a vírgula', () => {
    expect(lerValorBRL('R$ 1.87874')).toBe(1878.74);
  });
});

describe('formatarLinhaDigitavel', () => {
  it('quebra os 47 dígitos nos blocos do boleto e deixa o resto como veio', () => {
    expect(formatarLinhaDigitavel('34191790010104351004791020150008291070026000'.padEnd(47, '0')))
      .toBe('34191.79001 01043.510047 91020.150008 2 91070026000000');
    expect(formatarLinhaDigitavel('123')).toBe('123');
  });
});

describe('resumirComprasFinMl × nº de PO gravado como compra', () => {
  it('ignora o item cujo nº da compra é um PO do SAP', () => {
    const r = resumirComprasFinMl([item(), item({ ri: 'x', numero_compra: '4100475935' })], [], []);
    expect(r.map(c => c.numero)).toEqual(['2000015616071149']);
  });
  it('mantém se o Financeiro já lançou boleto nesse número', () => {
    const r = resumirComprasFinMl([item({ ri: 'x', numero_compra: '4100475935' })], [compra({ numero_compra: '4100475935' })], []);
    expect(r.map(c => c.numero)).toEqual(['4100475935']);
  });
});

describe('resumirComprasFinMl × devolução/reembolso lançados na Central', () => {
  const oc = (over: Record<string, unknown> = {}) => ({
    id: 'o1', ri: '120009113100170', numero_compra: '2000015616071149', tipo: 'reembolso' as const,
    percentual: null, valor: null, motivo: null, recomprar: false,
    recompra_feita_em: null, recompra_feita_por_nome: null, recompra_numero_compra: null,
    criado_por_id: 'u', criado_por_nome: 'Comprador', created_at: '2026-11-09T10:00:00Z',
    excluido_em: null, excluido_por_nome: null,
    ...over,
  });

  it('soma em R$ (% sobre o PO do item), conta % sem PO e recompras pendentes', () => {
    const [r] = resumirComprasFinMl(
      [item({ valor_pedido: 400 }), item({ ri: 'sem-po', valor_pedido: null })],
      [compra()],
      [],
      [
        oc({ id: 'a', percentual: 30 }),
        oc({ id: 'b', ri: 'sem-po', percentual: 50 }),
        oc({ id: 'c', valor: 10 }),
        oc({ id: 'd', tipo: 'devolucao', recomprar: true }),
        oc({ id: 'e', valor: 999, excluido_em: '2026-11-09T11:00:00Z' }),
        oc({ id: 'f', valor: 5, numero_compra: '2000000000000009' }),
      ],
    );
    expect(r.ocorrencias.map(o => o.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.valorOcorrencias).toBe(130);
    expect(r.ocorrenciasSemValor).toBe(1);
    expect(r.recompraPendente).toBe(1);
  });
});
