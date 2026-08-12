import { describe, it, expect, beforeEach } from 'vitest';
import { recordLogEntry, getRecentLogs, resetLogBufferForTests } from './consoleLogBuffer';

describe('consoleLogBuffer', () => {
  beforeEach(() => {
    resetLogBufferForTests();
  });

  it('deve começar vazio', () => {
    expect(getRecentLogs()).toEqual([]);
  });

  it('deve registrar uma entrada com nível e mensagem', () => {
    recordLogEntry('error', ['Falha ao salvar', 42]);
    const logs = getRecentLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('error');
    expect(logs[0].message).toBe('Falha ao salvar 42');
    expect(typeof logs[0].timestamp).toBe('string');
  });

  it('deve serializar um Error como "Nome: mensagem"', () => {
    recordLogEntry('error', [new TypeError('boom')]);
    expect(getRecentLogs()[0].message).toBe('TypeError: boom');
  });

  it('deve truncar mensagens muito longas', () => {
    recordLogEntry('warn', ['x'.repeat(1000)]);
    expect(getRecentLogs()[0].message.length).toBeLessThanOrEqual(501);
  });

  it('deve manter só as últimas 50 entradas (FIFO)', () => {
    for (let i = 0; i < 55; i++) recordLogEntry('warn', [`msg${i}`]);
    const logs = getRecentLogs();
    expect(logs).toHaveLength(50);
    expect(logs[0].message).toBe('msg5');
    expect(logs[49].message).toBe('msg54');
  });

  it('getRecentLogs devolve uma cópia (não a referência interna)', () => {
    recordLogEntry('error', ['a']);
    const logs = getRecentLogs();
    logs.push({ level: 'error', message: 'b', timestamp: 'x' });
    expect(getRecentLogs()).toHaveLength(1);
  });
});
