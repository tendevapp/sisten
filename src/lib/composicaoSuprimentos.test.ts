import { describe, it, expect } from 'vitest';
import type { EnrichedSAPRecord } from '../types';
import { STATUS_SEM_PO_ATE_CRITICO, STATUS_SEM_PO_CRITICO, statusFiltroEnrichedSAPRecord } from './composicaoSuprimentos';

const reg = (extra: Partial<EnrichedSAPRecord>): EnrichedSAPRecord =>
  ({ ri: 'ri1', status_requisicao: 'Sem PO', dias_em_aberto: 0, ...extra } as unknown as EnrichedSAPRecord);

describe('statusFiltroEnrichedSAPRecord', () => {
  it('item com pedido fica só no status do SAP', () => {
    expect(statusFiltroEnrichedSAPRecord(reg({ status_requisicao: 'Processado', dias_em_aberto: 90 }))).toEqual(['Processado']);
  });

  it('sem PO entra em "Sem PO" e na faixa: até 30 d ou crítico', () => {
    expect(statusFiltroEnrichedSAPRecord(reg({ dias_em_aberto: 30 }))).toEqual(['Sem PO', STATUS_SEM_PO_ATE_CRITICO]);
    expect(statusFiltroEnrichedSAPRecord(reg({ dias_em_aberto: 31 }))).toEqual(['Sem PO', STATUS_SEM_PO_CRITICO]);
  });
});
