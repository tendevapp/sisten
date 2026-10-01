import { describe, it, expect } from 'vitest';
import {
  MAX_ERRO,
  classificarAparelho,
  construirSnapshot,
  formatarIdade,
  resumirPlataforma,
  snapshotsIguais,
  type EntradaFila,
  type LinhaAparelho,
} from './snapshotSincronizacao';

const e = (estado: EntradaFila['estado'], criadoEm: string, extra: Partial<EntradaFila> = {}): EntradaFila => ({ estado, criadoEm, ...extra });

describe('construirSnapshot', () => {
  it('fila vazia: tudo zerado e sem datas', () => {
    const s = construirSnapshot({ formularios: [], qualidade: [], producao: [] });
    expect(s).toMatchObject({ pendentes: 0, comErro: 0, maisAntigoEm: null, ultimoErro: null, ultimoErroRotulo: null });
  });

  it('soma as três filas e guarda a contagem de cada uma', () => {
    const s = construirSnapshot({
      formularios: [e('pendente', '2026-09-30T10:00:00Z'), e('erro', '2026-09-30T10:05:00Z', { erro: 'duplicate key', rotulo: 'RID' })],
      qualidade: [e('sincronizando', '2026-09-30T09:00:00Z')],
      producao: [e('pendente', '2026-09-30T11:00:00Z')],
    });
    expect(s.pendentes).toBe(4);
    expect(s.comErro).toBe(1);
    expect(s.detalhes).toEqual({
      formularios: { pendentes: 2, comErro: 1 },
      qualidade: { pendentes: 1, comErro: 0 },
      producao: { pendentes: 1, comErro: 0 },
    });
  });

  it('a mais antiga é a de menor data, de qualquer fila', () => {
    const s = construirSnapshot({
      formularios: [e('pendente', '2026-09-30T10:00:00Z')],
      qualidade: [e('pendente', '2026-09-29T23:00:00Z')],
      producao: [],
    });
    expect(s.maisAntigoEm).toBe('2026-09-29T23:00:00Z');
  });

  it('o último erro é o do erro mais recente, com o rótulo dele', () => {
    const s = construirSnapshot({
      formularios: [e('erro', '2026-09-30T08:00:00Z', { erro: 'antigo', rotulo: 'A' })],
      qualidade: [e('erro', '2026-09-30T12:00:00Z', { erro: 'novo', rotulo: 'B' })],
      producao: [],
    });
    expect(s.ultimoErro).toBe('novo');
    expect(s.ultimoErroRotulo).toBe('B');
  });

  it('erro sem mensagem conta, mas não vira "último erro"', () => {
    const s = construirSnapshot({ formularios: [e('erro', '2026-09-30T08:00:00Z')], qualidade: [], producao: [] });
    expect(s.comErro).toBe(1);
    expect(s.ultimoErro).toBeNull();
  });

  it('corta a mensagem muito longa', () => {
    const s = construirSnapshot({ formularios: [e('erro', '2026-09-30T08:00:00Z', { erro: 'x'.repeat(1000) })], qualidade: [], producao: [] });
    expect(s.ultimoErro).toHaveLength(MAX_ERRO);
  });
});

describe('snapshotsIguais', () => {
  const vazio = construirSnapshot({ formularios: [], qualidade: [], producao: [] });
  it('compara pelo conteúdo, e trata null', () => {
    expect(snapshotsIguais(vazio, construirSnapshot({ formularios: [], qualidade: [], producao: [] }))).toBe(true);
    expect(snapshotsIguais(vazio, construirSnapshot({ formularios: [e('pendente', '2026-09-30T08:00:00Z')], qualidade: [], producao: [] }))).toBe(false);
    expect(snapshotsIguais(null, null)).toBe(true);
    expect(snapshotsIguais(null, vazio)).toBe(false);
  });
});

describe('classificarAparelho', () => {
  const agora = new Date('2026-09-30T12:00:00Z').getTime();
  const minAtras = (m: number) => new Date(agora - m * 60_000).toISOString();
  const linha = (extra: Partial<LinhaAparelho>): LinhaAparelho => ({
    pendentes: 0,
    comErro: 0,
    maisAntigoEm: null,
    online: true,
    reportadoEm: minAtras(1),
    ...extra,
  });

  it('fila vazia está em dia, mesmo calado há dias', () => {
    expect(classificarAparelho(linha({ reportadoEm: minAtras(60 * 24 * 3) }), agora)).toBe('ok');
  });

  it('erro vence tudo, inclusive aparelho calado', () => {
    expect(classificarAparelho(linha({ pendentes: 2, comErro: 1, reportadoEm: minAtras(600) }), agora)).toBe('erro');
  });

  it('fila recente e aparelho reportando: pendente', () => {
    expect(classificarAparelho(linha({ pendentes: 1, maisAntigoEm: minAtras(5) }), agora)).toBe('pendente');
  });

  it('fila velha com o aparelho online e reportando: parado', () => {
    expect(classificarAparelho(linha({ pendentes: 1, maisAntigoEm: minAtras(45) }), agora)).toBe('parado');
  });

  it('fila velha mas aparelho sem rede: ainda pendente (esperando a rede)', () => {
    expect(classificarAparelho(linha({ pendentes: 1, maisAntigoEm: minAtras(45), online: false }), agora)).toBe('pendente');
  });

  it('com fila e sem reportar há mais de 30 min: sumiu', () => {
    expect(classificarAparelho(linha({ pendentes: 1, maisAntigoEm: minAtras(100), reportadoEm: minAtras(40) }), agora)).toBe('sumiu');
  });

  it('o limite é de 30 minutos (30 ainda não passou)', () => {
    expect(classificarAparelho(linha({ pendentes: 1, maisAntigoEm: minAtras(30), reportadoEm: minAtras(30) }), agora)).toBe('pendente');
    expect(classificarAparelho(linha({ pendentes: 1, maisAntigoEm: minAtras(31), reportadoEm: minAtras(1) }), agora)).toBe('parado');
  });
});

describe('formatarIdade', () => {
  const agora = new Date('2026-09-30T12:00:00Z').getTime();
  const h = (ms: number) => new Date(agora - ms).toISOString();
  it('escolhe a unidade', () => {
    expect(formatarIdade(null, agora)).toBe('—');
    expect(formatarIdade(h(20_000), agora)).toBe('agora');
    expect(formatarIdade(h(5 * 60_000), agora)).toBe('há 5 min');
    expect(formatarIdade(h(3 * 3_600_000), agora)).toBe('há 3 h');
    expect(formatarIdade(h(2 * 86_400_000), agora)).toBe('há 2 d');
    expect(formatarIdade('lixo', agora)).toBe('—');
  });
});

describe('resumirPlataforma', () => {
  it('sistema e navegador', () => {
    expect(resumirPlataforma('Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36')).toBe('Android · Chrome');
    expect(resumirPlataforma('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('iPhone/iPad · Safari');
    expect(resumirPlataforma('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0')).toBe('Windows · Edge');
    expect(resumirPlataforma('')).toBe('Dispositivo');
  });
});
