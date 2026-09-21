import { describe, it, expect } from 'vitest';
import { ehItemDeContrato } from '../../lib/contratoPedido';
import { EnrichedSAPRecord } from '../../types';
import type { ContratoFilter } from './FiltrosSuprimentos';

function mockRecord(overrides: Partial<EnrichedSAPRecord>): EnrichedSAPRecord {
  return {
    ri: 'RI-1',
    item_reqc: '10',
    requisicao_de_compra: '10001',
    data_solicitacao: '2026-02-01',
    status_requisicao: 'Processado',
    data_status: '2026-02-05',
    dias_status: 4,
    status_sla: 'Dentro do Prazo',
    urgente: false,
    alerta: 'OK',
    sla_previsto: '2026-02-10',
    prazo_status: 'No Prazo',
    ...overrides,
  } as EnrichedSAPRecord;
}

function filtrarPorContrato(records: EnrichedSAPRecord[], modo: ContratoFilter): EnrichedSAPRecord[] {
  return records.filter(r => {
    if (modo === 'com_contrato' && !ehItemDeContrato(r)) return false;
    if (modo === 'sem_contrato' && ehItemDeContrato(r)) return false;
    return true;
  });
}

describe('Filtro de Contratos em Gestão de Suprimentos', () => {
  const itemContrato = mockRecord({
    ri: 'RI-CONTRATO',
    documento_compra: '4500012345',
    contrato_po: '5200001234',
    item_contrato_po: '10',
  });

  const itemSpot = mockRecord({
    ri: 'RI-SPOT',
    documento_compra: '4500099999',
    contrato_po: null,
  });

  const itemSemPo = mockRecord({
    ri: 'RI-SEM-PO',
    status_requisicao: 'Sem PO',
    documento_compra: undefined,
    contrato_po: null,
  });

  const lista = [itemContrato, itemSpot, itemSemPo];

  it('filtra apenas itens SEM contrato por default (sem_contrato)', () => {
    const res = filtrarPorContrato(lista, 'sem_contrato');
    expect(res.map(r => r.ri)).toEqual(['RI-SPOT', 'RI-SEM-PO']);
    expect(res.some(r => ehItemDeContrato(r))).toBe(false);
  });

  it('filtra apenas itens COM contrato quando selecionado (com_contrato)', () => {
    const res = filtrarPorContrato(lista, 'com_contrato');
    expect(res.map(r => r.ri)).toEqual(['RI-CONTRATO']);
    expect(res.every(r => ehItemDeContrato(r))).toBe(true);
  });

  it('retorna todos os itens quando selecionado "todos"', () => {
    const res = filtrarPorContrato(lista, 'todos');
    expect(res.length).toBe(3);
  });
});
