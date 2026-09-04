import { describe, expect, it } from 'vitest';
import type { EnrichedSAPRecord } from '../types';
import { avaliarEntregaParcial, temDivergenciaDeEntrega } from './entregaParcial';

function registro(over: Partial<EnrichedSAPRecord> = {}): EnrichedSAPRecord {
  return {
    ri: 'r1', ri_po: 'r1-4100441709', requisicao_de_compra: '1100320673', item_reqc: '10',
    material_code: 'MAT-1', texto_breve: 'Eletrodo', qtd_requisicao: 115, unidade_medida: 'UN',
    grupo_comprador: '314', data_solicitacao: '2026-03-01', data_remessa: '',
    requisitante_name: 'Ana', tipo_documento: 'ZR01', codigo_de_eliminacao: false,
    presente_ultima_carga: true, campos_extras: {},
    documento_compra: '4100441709', status_requisicao: 'Processado',
    qtd_po: 115, qtd_fornecida_po: 80, qtd_fornecida_total: 80,
    natureza: 'Normal', lead_time_compras_meta: 15,
    dias_em_aberto: 0, atraso_comprador: 0, faixa_atraso: '', alerta: '', status_atualizado: '',
    ...over,
  } as EnrichedSAPRecord;
}

describe('avaliarEntregaParcial', () => {
  it('marca parcial quando chegou menos do que a RM pediu', () => {
    const a = avaliarEntregaParcial(registro())!;
    expect(a.parcial).toBe(true);
    expect(a.fornecido).toBe(80);
    expect(a.solicitado).toBe(115);
    expect(a.faltando).toBe(35);
    expect(a.percentual).toBeCloseTo(69.57, 2);
    expect(temDivergenciaDeEntrega(registro())).toBe(true);
  });

  it('não marca nada quando fornecido bate com a RM', () => {
    const a = avaliarEntregaParcial(registro({ qtd_fornecida_total: 115 }))!;
    expect(a.parcial).toBe(false);
    expect(a.excedente).toBe(false);
    expect(temDivergenciaDeEntrega(registro({ qtd_fornecida_total: 115 }))).toBe(false);
  });

  it('marca excedente quando veio mais do que a RM pediu', () => {
    const a = avaliarEntregaParcial(registro({ qtd_fornecida_total: 120 }))!;
    expect(a.excedente).toBe(true);
    expect(a.parcial).toBe(false);
    expect(a.percentual).toBeCloseTo(104.35, 2);
  });

  it('entrega completa fecha em 100%', () => {
    expect(avaliarEntregaParcial(registro({ qtd_fornecida_total: 115 }))!.percentual).toBe(100);
  });

  it('soma os pedidos do item: dois POs que juntos completam a RM não são parciais', () => {
    // Linha de um dos POs (60 de 115), mas o total do item fecha os 115.
    const a = avaliarEntregaParcial(registro({ qtd_po: 60, qtd_fornecida_po: 60, qtd_fornecida_total: 115 }))!;
    expect(a.parcial).toBe(false);
  });

  it('item comprado e ainda não entregue não é entrega parcial', () => {
    expect(avaliarEntregaParcial(registro({ qtd_fornecida_po: 0, qtd_fornecida_total: 0 }))).toBeNull();
  });

  it('ignora item sem PO, sem informação de fornecimento, serviço e contrato', () => {
    expect(avaliarEntregaParcial(registro({ status_requisicao: 'Sem PO' }))).toBeNull();
    expect(avaliarEntregaParcial(registro({ qtd_fornecida_po: undefined, qtd_fornecida_total: undefined }))).toBeNull();
    // Serviço: a ZL0132 traz valor em R$ nesse campo, não quantidade.
    expect(avaliarEntregaParcial(registro({ requisicao_de_compra: '1700390296', qtd_fornecida_total: 16771.14 }))).toBeNull();
    expect(avaliarEntregaParcial(registro({ is_contrato: true }))).toBeNull();
  });

  it('tolera ruído de ponto flutuante em quantidade fracionada', () => {
    const a = avaliarEntregaParcial(registro({ qtd_requisicao: 10.5, qtd_fornecida_total: 10.5000001 }))!;
    expect(a.parcial).toBe(false);
    expect(a.excedente).toBe(false);
  });
});
