import { describe, expect, it } from 'vitest';
import { OCULTA_MINIMO_MS, momentoDeAtualizar } from './atualizacaoApp';

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
