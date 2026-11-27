import { describe, expect, it } from 'vitest';
import { OCULTA_MINIMO_MS, PROCURAR_AO_VOLTAR_MINIMO_MS, momentoDeAtualizar, procurarAoVoltar } from './atualizacaoApp';

describe('procurar versão nova ao voltar à tela (cada busca baixa o sw.js do servidor)', () => {
  it('voltou logo depois da última busca: não procura de novo', () => {
    // 27/11/2026: a Vercel suspendeu o projeto por uso; no celular a tela volta toda hora.
    expect(procurarAoVoltar(1_000_000, 1_000_000 + 60_000)).toBe(false);
  });
  it('passou o intervalo mínimo: procura', () => {
    expect(procurarAoVoltar(1_000_000, 1_000_000 + PROCURAR_AO_VOLTAR_MINIMO_MS)).toBe(true);
  });
  it('nunca procurou: procura', () => {
    expect(procurarAoVoltar(null, 5)).toBe(true);
  });
});

const base = { versaoNovaPronta: true, ehTv: false, motivo: 'tick' as const, ocultaHaMs: 0, visivel: true };

describe('quando o app aplica a versão nova sozinho', () => {
  it('sem versão nova, nunca', () => {
    expect(momentoDeAtualizar({ ...base, versaoNovaPronta: false, motivo: 'navegacao' })).toBe(false);
  });
  it('TV recarrega assim que a versão nova chega', () => {
    expect(momentoDeAtualizar({ ...base, ehTv: true })).toBe(true);
  });
  it('ao trocar de tela (a pessoa já está saindo da tela atual)', () => {
    expect(momentoDeAtualizar({ ...base, motivo: 'navegacao' })).toBe(true);
  });
  it('com a tela à vista e a pessoa usando, não recarrega', () => {
    expect(momentoDeAtualizar(base)).toBe(false);
  });
  it('escondida há pouco (câmera aberta, outro app rápido): não recarrega — perderia o preenchimento', () => {
    expect(momentoDeAtualizar({ ...base, visivel: false, ocultaHaMs: 60_000 })).toBe(false);
    expect(momentoDeAtualizar({ ...base, motivo: 'voltou', ocultaHaMs: 60_000 })).toBe(false);
  });
  it('escondida há muito tempo: recarrega escondida ou logo ao voltar', () => {
    expect(momentoDeAtualizar({ ...base, visivel: false, ocultaHaMs: OCULTA_MINIMO_MS })).toBe(true);
    expect(momentoDeAtualizar({ ...base, motivo: 'voltou', ocultaHaMs: OCULTA_MINIMO_MS + 1 })).toBe(true);
  });
});
