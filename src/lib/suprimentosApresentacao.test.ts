import { describe, it, expect } from 'vitest';
import type { EnrichedSAPRecord } from '../types';
import {
  demandaPorArea, evolucaoRequisitadoPedido, janelaDoGrafico, materialServico, porCriticidade,
} from './suprimentosApresentacao';

let seq = 0;
const reg = (extra: Partial<EnrichedSAPRecord> & { natureza?: string }): EnrichedSAPRecord => ({
  ri: `ri${++seq}`,
  status_requisicao: 'Sem PO',
  data_solicitacao: '2026-10-05',
  requisicao_de_compra: '1100000001',
  area_solicitante: 'ALMO',
  dias_em_aberto: 0,
  ...extra,
} as unknown as EnrichedSAPRecord);

describe('janelaDoGrafico', () => {
  it('por dia, período longo fica com os últimos 31 dias', () => {
    expect(janelaDoGrafico('dia', '2026-01-01', '2026-11-03', '2026-11-03')).toEqual({ de: '2026-10-04', ate: '2026-11-03', cortado: true });
    expect(janelaDoGrafico('dia', '2026-10-10', '2026-11-03', '2026-11-03')).toEqual({ de: '2026-10-10', ate: '2026-11-03', cortado: false });
  });
  it('por semana, período longo fica com as últimas 16 semanas (a partir da segunda-feira)', () => {
    // 03/11/2026 é terça; a semana começa em 02/11; 15 semanas antes = 20/07.
    expect(janelaDoGrafico('semana', '2026-01-01', '2026-11-03', '2026-11-03')).toEqual({ de: '2026-07-20', ate: '2026-11-03', cortado: true });
  });
  it('sem data final usa hoje', () => {
    expect(janelaDoGrafico('dia', '2026-11-01', '', '2026-11-03').ate).toBe('2026-11-03');
  });
});

describe('evolucaoRequisitadoPedido', () => {
  it('quebra requisitados por criticidade; pedido pela data do PO; item com 2 PO conta 1 e soma valores', () => {
    const pontos = evolucaoRequisitadoPedido([
      reg({ ri: 'A', data_solicitacao: '2026-10-05', natureza: 'Normal', status_requisicao: 'Processado', data_pedido: '2026-10-06', valor_total: 100 }),
      reg({ ri: 'A', data_solicitacao: '2026-10-05', natureza: 'Normal', status_requisicao: 'Processado', data_pedido: '2026-10-07', valor_total: 50 }),
      reg({ ri: 'B', data_solicitacao: '2026-10-06', natureza: 'Urgente' }),
      reg({ ri: 'C', data_solicitacao: '2026-10-06', natureza: 'Serviço - Urgente' }),
      reg({ ri: 'D', data_solicitacao: '2026-09-01', status_requisicao: 'Processado', data_pedido: '2026-10-07', valor_total: 10 }),
    ], 'semana', '2026-10-05', '2026-10-11');
    expect(pontos).toHaveLength(1);
    expect(pontos[0]).toMatchObject({ requisitados: 3, normal: 1, urgente: 2, maquinaParada: 0, pedidos: 2, valorPedidos: 160 });
  });

  it('por dia, todos os dias da janela aparecem, mesmo vazios', () => {
    const pontos = evolucaoRequisitadoPedido([reg({ data_solicitacao: '2026-10-02' })], 'dia', '2026-10-01', '2026-10-03');
    expect(pontos.map(p => p.requisitados)).toEqual([0, 1, 0]);
  });
});

describe('demandaPorArea', () => {
  it('separa com/sem pedido e agrupa o excesso em Outras', () => {
    const recs = [
      reg({ area_solicitante: 'X', status_requisicao: 'Processado', data_pedido: '2026-10-10' }),
      reg({ area_solicitante: 'X' }),
      reg({ area_solicitante: 'Y' }),
      reg({ area_solicitante: 'Z' }),
      reg({ area_solicitante: '' }),
    ];
    const linhas = demandaPorArea(recs, 3);
    expect(linhas[0]).toEqual({ area: 'X', abertos: 1, comPO: 1, total: 2 });
    expect(linhas.at(-1)).toMatchObject({ area: 'Outras (2)', total: 2 });
  });
});

describe('porCriticidade', () => {
  it('usa a natureza (serviço urgente) e ordena por gravidade', () => {
    const recs = [
      reg({ requisicao_de_compra: '1700000001', natureza: 'Serviço - Urgente' }),
      reg({ requisicao_de_compra: '1300000001', natureza: 'Máquina Parada', status_requisicao: 'Processado', data_solicitacao: '2026-10-01', data_pedido: '2026-10-03' }),
      reg({ requisicao_de_compra: '1100000001', natureza: 'Normal' }),
    ];
    const linhas = porCriticidade(recs);
    expect(linhas.map(l => l.chave)).toEqual(['maquina_parada', 'urgente', 'normal']);
    expect(linhas[0]).toMatchObject({ itens: 1, comPO: 1, conversao: 100, leadTime: 2, meta: 2, pctNaMeta: 100 });
    expect(materialServico(recs)).toEqual({ materiais: 2, servicos: 1, outros: 0 });
  });

  it('% na meta pela meta do registro; abertos fora da meta pela idade', () => {
    const linhas = porCriticidade([
      reg({ natureza: 'Urgente', lead_time_compras_meta: 6, status_requisicao: 'Processado', data_solicitacao: '2026-10-01', data_pedido: '2026-10-05' }),
      reg({ natureza: 'Urgente', lead_time_compras_meta: 6, status_requisicao: 'Processado', data_solicitacao: '2026-10-01', data_pedido: '2026-10-20' }),
      reg({ natureza: 'Urgente', lead_time_compras_meta: 6, dias_em_aberto: 10 }),
      reg({ natureza: 'Urgente', lead_time_compras_meta: 6, dias_em_aberto: 3 }),
    ]);
    expect(linhas[0]).toMatchObject({ chave: 'urgente', meta: 6, medidos: 2, pctNaMeta: 50, abertos: 2, abertosForaDaMeta: 1 });
  });
});

describe('itensDoPonto', () => {
  it('pedidos pela data do PO (inclui item requisitado antes); requisitados e sem PO pela solicitação', async () => {
    const { itensDoPonto } = await import('./suprimentosApresentacao');
    const recs = [
      reg({ ri: 'velho', data_solicitacao: '2026-09-01', natureza: 'Normal', status_requisicao: 'Processado', data_pedido: '2026-10-06' }),
      reg({ ri: 'novo', data_solicitacao: '2026-10-06', natureza: 'Urgente' }),
      reg({ ri: 'novo-po', data_solicitacao: '2026-10-07', natureza: 'Normal', status_requisicao: 'Processado', data_pedido: '2026-10-08' }),
    ];
    const chave = '2026-10-05'; // semana de 05/10
    expect(itensDoPonto(recs, 'semana', chave, 'pedidos').map(r => r.ri).sort()).toEqual(['novo-po', 'velho']);
    expect(itensDoPonto(recs, 'semana', chave, 'requisitados').map(r => r.ri).sort()).toEqual(['novo', 'novo-po']);
    expect(itensDoPonto(recs, 'semana', chave, 'requisitados', 'urgente').map(r => r.ri)).toEqual(['novo']);
    expect(itensDoPonto(recs, 'semana', chave, 'semPo').map(r => r.ri)).toEqual(['novo']);
  });
});
