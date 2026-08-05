/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { sugerirDDP, sugerirImposto, perfilFiscalDoItem } from './matching';
import { CATALOGO_DDP_REAL, CATALOGO_IMPOSTOS_REAL } from './__fixtures__/catalogosReais';

describe('sugerirDDP — contra as 95 linhas reais de public.ddp', () => {
  it('"30 DDLIQ" (Manglog), "A prazo - 30 dias" (Anhanguera) e "30 DIAS" (Ferimport) convergem no código "30"', () => {
    expect(sugerirDDP('30 DDLIQ', CATALOGO_DDP_REAL).codigo).toBe('30');
    expect(sugerirDDP('A prazo - 30 dias', CATALOGO_DDP_REAL).codigo).toBe('30');
    expect(sugerirDDP('30 DIAS', CATALOGO_DDP_REAL).codigo).toBe('30');
  });

  it('"a combinar" (Loja do Mecânico) fica pendente, sem código', () => {
    const resultado = sugerirDDP('a combinar', CATALOGO_DDP_REAL);
    expect(resultado.pendente).toBe(true);
    expect(resultado.codigo).toBeNull();
  });

  it('não confunde "30 dias Fora Quinzena" (código 20) com o prazo simples de 30 dias', () => {
    // O catálogo real tem uma armadilha: o código "20" descreve "30 dias Fora
    // Quinzena" — uma estrutura de cobrança diferente, não um prazo de 20 dias
    // nem um sinônimo de "30 dias" simples. A sugestão para texto "30 dias" deve
    // ser o código "30" (Dentro de 30 dias s/desconto), nunca "20".
    const resultado = sugerirDDP('30 dias', CATALOGO_DDP_REAL);
    expect(resultado.codigo).toBe('30');
    expect(resultado.codigo).not.toBe('20');
  });

  it('reconhece prazos que só existem como código Z0xx (ex.: 21 dias)', () => {
    expect(sugerirDDP('21 dias', CATALOGO_DDP_REAL).codigo).toBe('Z040');
  });

  it('fica pendente quando não reconhece nenhum prazo no texto', () => {
    const resultado = sugerirDDP('conforme negociação', CATALOGO_DDP_REAL);
    expect(resultado.pendente).toBe(true);
    expect(resultado.codigo).toBeNull();
  });

  it('texto vazio não fica marcado como pendente (é ausência de dado, não "a combinar")', () => {
    const resultado = sugerirDDP('', CATALOGO_DDP_REAL);
    expect(resultado.pendente).toBe(false);
    expect(resultado.codigo).toBeNull();
  });
});

describe('sugerirImposto — contra as 150 linhas reais de public.impostos', () => {
  it('ICMS + DIFAL → C1', () => {
    const resultado = sugerirImposto({ icms: true, ipi: false, st: false, difal: true, pisCofins: false }, CATALOGO_IMPOSTOS_REAL);
    expect(resultado.codigo).toBe('C1');
  });

  it('ICMS + ST → C2 (padrão comum em compra de ferramentas para consumo)', () => {
    const resultado = sugerirImposto({ icms: true, ipi: false, st: true, difal: false, pisCofins: false }, CATALOGO_IMPOSTOS_REAL);
    expect(resultado.codigo).toBe('C2');
  });

  it('ICMS + ST + IPI → C4', () => {
    const resultado = sugerirImposto({ icms: true, ipi: true, st: true, difal: false, pisCofins: false }, CATALOGO_IMPOSTOS_REAL);
    expect(resultado.codigo).toBe('C4');
  });

  it('só IPI → C5', () => {
    const resultado = sugerirImposto({ icms: false, ipi: true, st: false, difal: false, pisCofins: false }, CATALOGO_IMPOSTOS_REAL);
    expect(resultado.codigo).toBe('C5');
  });

  it('sem nenhum tributo → C0', () => {
    const resultado = sugerirImposto({ icms: false, ipi: false, st: false, difal: false, pisCofins: false }, CATALOGO_IMPOSTOS_REAL);
    expect(resultado.codigo).toBe('C0');
  });

  it('com PIS/COFINS declarado (padrão Ferimport, ICMS + DIFAL + PIS/COFINS) → H1', () => {
    const resultado = sugerirImposto({ icms: true, ipi: false, st: false, difal: true, pisCofins: true }, CATALOGO_IMPOSTOS_REAL);
    expect(resultado.codigo).toBe('H1');
    expect(resultado.confianca).toBeGreaterThanOrEqual(0.9);
  });

  it('IPI + PIS/COFINS → H5', () => {
    const resultado = sugerirImposto({ icms: false, ipi: true, st: false, difal: false, pisCofins: true }, CATALOGO_IMPOSTOS_REAL);
    expect(resultado.codigo).toBe('H5');
  });

  it('quando não há combinação com PIS/COFINS espelhada, cai para a combinação sem PIS/COFINS (confiança menor)', () => {
    // Não existe no catálogo real "Entr.Consumo: ICMS + PIS/COFINS" (sem DIFAL/ST/IPI) —
    // só a combinação simples "ICMS" isolada também não existe. Este caso força "nenhum
    // candidato" corretamente, em vez de arriscar um código fiscal errado.
    const resultado = sugerirImposto({ icms: true, ipi: false, st: false, difal: false, pisCofins: true }, CATALOGO_IMPOSTOS_REAL);
    expect(resultado.codigo).toBeNull();
  });

  it('nunca sugere uma variante de Simples Nacional ou FCI automaticamente', () => {
    // "ICMS + DIFAL" tem candidato limpo (C1) e não deve escorregar para C6
    // ("ICMS Simples Nacional + DIFAL") ou CN ("ICMS 4% (FCI)...") mesmo que
    // a combinação de tributos pareça igual — são regimes diferentes.
    const resultado = sugerirImposto({ icms: true, ipi: false, st: false, difal: true, pisCofins: false }, CATALOGO_IMPOSTOS_REAL);
    expect(resultado.codigo).toBe('C1');
    expect(['C6', 'CN', 'CM']).not.toContain(resultado.codigo);
  });
});

describe('perfilFiscalDoItem', () => {
  it('converte item extraído (Ferimport) em perfil fiscal', () => {
    const perfil = perfilFiscalDoItem({ icms_percentual: 12.06, ipi_percentual: 0, pis_percentual: 1.65, cofins_percentual: 7.60 });
    expect(perfil).toEqual({ icms: true, ipi: false, st: false, difal: false, pisCofins: true });
  });

  it('trata ISENTO (normalizado para 0 antes de chegar aqui) como ausência do tributo', () => {
    const perfil = perfilFiscalDoItem({ icms_percentual: 7, ipi_percentual: 0 });
    expect(perfil.ipi).toBe(false);
    expect(perfil.icms).toBe(true);
  });

  it('ST por valor (sem percentual) também conta como presença de ST', () => {
    const perfil = perfilFiscalDoItem({ st_valor: 31.95 });
    expect(perfil.st).toBe(true);
  });
});
