import { describe, expect, it } from 'vitest';
import { deveBaixarTabelaPequena } from './sincronizacaoPequenas';

const base = { rodadaDasPequenas: true, forcar: false, temCache: true, versaoLocal: 7, versaoServidor: 7 };

describe('tabela pequena só é rebaixada quando mudou', () => {
  it('versão igual à do aparelho: não baixa de novo', () => {
    expect(deveBaixarTabelaPequena(base)).toBe(false);
  });
  it('versão nova no servidor: baixa', () => {
    expect(deveBaixarTabelaPequena({ ...base, versaoServidor: 8 })).toBe(true);
  });
  it('fora da rodada das pequenas (15 min): não baixa nem com versão nova', () => {
    expect(deveBaixarTabelaPequena({ ...base, rodadaDasPequenas: false, versaoServidor: 8 })).toBe(false);
  });
  it('sem cache ou sem versão local: baixa', () => {
    expect(deveBaixarTabelaPequena({ ...base, temCache: false })).toBe(true);
    expect(deveBaixarTabelaPequena({ ...base, versaoLocal: null })).toBe(true);
  });
  it('sem versão do servidor (falha ao ler ou tabela sem gatilho): baixa como antes', () => {
    expect(deveBaixarTabelaPequena({ ...base, versaoServidor: null })).toBe(true);
  });
  it('sincronização forçada: baixa sempre', () => {
    expect(deveBaixarTabelaPequena({ ...base, forcar: true, rodadaDasPequenas: false })).toBe(true);
  });
});
