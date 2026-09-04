import { describe, expect, it } from 'vitest';
import type { EnrichedSAPRecord } from '../types';
import {
  numeroContratoPO, itemContratoPO, ehItemDeContrato, origemCompra, calcSpendContratado,
} from './contratoPedido';

function registro(over: Partial<EnrichedSAPRecord> = {}): EnrichedSAPRecord {
  return {
    ri: '120009412500010', requisicao_de_compra: '1200094125', item_reqc: '10',
    material_code: '1437514', texto_breve: 'CHAVE DE IMPACTO', qtd_requisicao: 5, unidade_medida: 'UN',
    grupo_comprador: '314', data_solicitacao: '2026-08-20', data_remessa: '',
    requisitante_name: 'Ana', tipo_documento: 'ZR01', codigo_de_eliminacao: false,
    presente_ultima_carga: true, campos_extras: {},
    documento_compra: '4100465946', data_pedido: '2026-08-26',
    natureza: 'Normal', status_requisicao: 'Processado', lead_time_compras_meta: 15,
    dias_em_aberto: 0, atraso_comprador: 0, faixa_atraso: '', alerta: '', status_atualizado: '',
    ...over,
  } as EnrichedSAPRecord;
}

describe('numeroContratoPO', () => {
  it('devolve o contrato quando o PO foi criado por referência a um', () => {
    expect(numeroContratoPO(registro({ contrato_po: '5200001234' }))).toBe('5200001234');
  });

  // A ZL0132 escreve '0' em item_contrato (e às vezes em contrato) na linha sem
  // contrato: tratar isso como número faria toda compra spot virar contrato.
  it('trata 0, vazio e nulo como ausência de contrato', () => {
    expect(numeroContratoPO(registro({ contrato_po: '0' }))).toBeNull();
    expect(numeroContratoPO(registro({ contrato_po: '' }))).toBeNull();
    expect(numeroContratoPO(registro({ contrato_po: null }))).toBeNull();
    expect(numeroContratoPO(registro({}))).toBeNull();
    expect(itemContratoPO(registro({ item_contrato_po: '0' }))).toBeNull();
    expect(itemContratoPO(registro({ item_contrato_po: '10' }))).toBe('10');
  });
});

describe('ehItemDeContrato', () => {
  it('vale pelos dois caminhos: KONNR no PO e categoria D no ME5A', () => {
    expect(ehItemDeContrato(registro({ contrato_po: '5200001234' }))).toBe(true);
    expect(ehItemDeContrato(registro({ is_contrato: true }))).toBe(true);
    expect(ehItemDeContrato(registro({}))).toBe(false);
  });

  // ZP06 é "Serviço", não contrato — a base tem 6.181 itens ZP06 e só 885 com
  // contrato. Usar o tipo de documento como atalho inflaria o contratado em 7x.
  it('não confunde pedido de serviço (ZP06) com pedido de contrato', () => {
    expect(ehItemDeContrato(registro({ tipo_doc_po: 'ZP06' }))).toBe(false);
  });
});

describe('origemCompra', () => {
  it('só classifica item já pedido', () => {
    expect(origemCompra(registro({ contrato_po: '5200001234' }))).toBe('contrato');
    expect(origemCompra(registro({}))).toBe('spot');
    expect(origemCompra(registro({ status_requisicao: 'Sem PO', documento_compra: undefined }))).toBeNull();
  });
});

describe('calcSpendContratado', () => {
  const base = [
    registro({ ri: 'a', contrato_po: '5200001234', documento_compra: '4700000001', valor_total: 100 }),
    registro({ ri: 'b', contrato_po: '5200001234', documento_compra: '4700000002', valor_total: 50 }),
    registro({ ri: 'c', contrato_po: '5900005811', documento_compra: '4100000003', valor_total: 25 }),
    registro({ ri: 'd', valor_total: 325 }),
    registro({ ri: 'e', status_requisicao: 'Sem PO', documento_compra: undefined, valor_total: undefined }),
  ];

  it('soma o contratado e sua participação no spend do período', () => {
    const r = calcSpendContratado(base);
    expect(r.valor).toBe(175);
    expect(r.valorTotal).toBe(500);
    expect(r.participacao).toBeCloseTo(0.35);
    expect(r.itens).toBe(3);
    expect(r.contratos).toBe(2);
    expect(r.pedidos).toBe(3);
  });

  // Nem todo PO traz valor. O item entra na contagem, não no dinheiro — a mesma
  // regra de cobertura de calcSpend.
  it('conta item de contrato sem valor, sem somá-lo ao spend', () => {
    const r = calcSpendContratado([...base, registro({ ri: 'f', contrato_po: '5200009999', valor_total: undefined })]);
    expect(r.valor).toBe(175);
    expect(r.itens).toBe(4);
    expect(r.contratos).toBe(3);
  });

  it('não divide por zero quando não há pedido no recorte', () => {
    const r = calcSpendContratado([registro({ status_requisicao: 'Sem PO', documento_compra: undefined })]);
    expect(r.participacao).toBe(0);
  });
});
