import { describe, expect, it } from 'vitest';
import {
  calcularEstagioCompraPorSap, normalizarRm, proximoStatusAutomaticoCompra,
} from './statusAutomaticoCompra';

describe('normalizarRm', () => {
  it('remove zeros à esquerda', () => {
    expect(normalizarRm('0001200094199')).toBe('1200094199');
  });

  it('mantém string vazia ou só zeros como está', () => {
    expect(normalizarRm('0000')).toBe('0000');
    expect(normalizarRm('')).toBe('');
    expect(normalizarRm(undefined)).toBe('');
  });
});

describe('calcularEstagioCompraPorSap', () => {
  it('retorna null quando a RM ainda não apareceu na ME5A', () => {
    expect(calcularEstagioCompraPorSap([], false)).toBeNull();
  });

  it('aparece na ME5A, sem cotação, sem PO → aprovada (fila de suprimentos)', () => {
    const registros = [{ documento_compra: undefined, data_migo: null, status_requisicao: 'Sem PO' as const }];
    expect(calcularEstagioCompraPorSap(registros, false)).toBe('aprovada');
  });

  it('tem processo de cotação aberto, sem PO → em_cotacao', () => {
    const registros = [{ documento_compra: undefined, data_migo: null, status_requisicao: 'Sem PO' as const }];
    expect(calcularEstagioCompraPorSap(registros, true)).toBe('em_cotacao');
  });

  it('tem PO (status_requisicao Processado) → pedido_emitido, mesmo sem processo de cotação registrado', () => {
    const registros = [{ documento_compra: '4100467887', data_migo: null, status_requisicao: 'Processado' as const }];
    expect(calcularEstagioCompraPorSap(registros, false)).toBe('pedido_emitido');
  });

  it('tem MIGO → concluida, mesmo que também tenha cotação e PO', () => {
    const registros = [{ documento_compra: '4100467887', data_migo: '2026-09-09', status_requisicao: 'Processado' as const }];
    expect(calcularEstagioCompraPorSap(registros, true)).toBe('concluida');
  });

  it('MIGO vence quando a RM tem várias linhas (itens) em estágios diferentes', () => {
    const registros = [
      { documento_compra: '4100467887', data_migo: null, status_requisicao: 'Processado' as const },
      { documento_compra: '4100467888', data_migo: '2026-09-10', status_requisicao: 'Processado' as const },
    ];
    expect(calcularEstagioCompraPorSap(registros, false)).toBe('concluida');
  });
});

describe('proximoStatusAutomaticoCompra', () => {
  it('avança de aprovada para em_cotacao', () => {
    expect(proximoStatusAutomaticoCompra('aprovada', 'em_cotacao')).toBe('em_cotacao');
  });

  it('pula direto de aprovada para pedido_emitido quando não passou por cotação', () => {
    expect(proximoStatusAutomaticoCompra('aprovada', 'pedido_emitido')).toBe('pedido_emitido');
  });

  it('nunca regride: em_cotacao não volta para aprovada mesmo que o cálculo aponte pra trás', () => {
    expect(proximoStatusAutomaticoCompra('em_cotacao', 'aprovada')).toBeNull();
  });

  it('não muda quando o estágio calculado é igual ao atual', () => {
    expect(proximoStatusAutomaticoCompra('pedido_emitido', 'pedido_emitido')).toBeNull();
  });

  it('não muda quando a RM ainda não apareceu no SAP (estágio null)', () => {
    expect(proximoStatusAutomaticoCompra('aprovada', null)).toBeNull();
  });

  it('ignora status fora do trecho automático (pendente, rejeitada, cancelada)', () => {
    expect(proximoStatusAutomaticoCompra('pendente', 'concluida')).toBeNull();
    expect(proximoStatusAutomaticoCompra('rejeitada', 'concluida')).toBeNull();
    expect(proximoStatusAutomaticoCompra('cancelada', 'concluida')).toBeNull();
  });

  it('uma compra já concluída fica travada, mesmo que o cálculo aponte outro estágio', () => {
    expect(proximoStatusAutomaticoCompra('concluida', 'pedido_emitido')).toBeNull();
  });
});
