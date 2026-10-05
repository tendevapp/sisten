import { describe, expect, it } from 'vitest';
import {
  codigoPorRegra,
  ehMaterialDeProjeto,
  perfilFiscal,
  sugerirCodigoImposto,
  type EntradaSugestaoCodigoImposto,
  type UsoCodigoImposto,
} from './sugestaoCodigoImposto';

const VALIDOS = new Set([
  'C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'CA', 'CB', 'CC', 'CM', 'CN',
  'H0', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'HM', 'HN',
  'I0', 'I1', 'I2', 'I3', 'I4', 'I5', 'IL', 'IM', 'D0', 'D1', 'D2', 'R5',
]);

const FORN = '12.345.678/0001-90';
const FORN_DIG = '12345678000190';

function uso(codigo: string, data = '2026-05-10', cnpj: string | null = FORN_DIG): UsoCodigoImposto {
  return { codigo, data, pedido: 'PO1', cnpj };
}

function entrada(over: Partial<EntradaSugestaoCodigoImposto> = {}): EntradaSugestaoCodigoImposto {
  return {
    material: '40351',
    cnpj: FORN,
    ufFornecedor: 'BA',
    aliqIcms: null,
    aliqIpi: null,
    cst: null,
    usosMaterial: [],
    codigosValidos: VALIDOS,
    hoje: '2026-10-05',
    ...over,
  };
}

describe('perfilFiscal', () => {
  it('sem UF, 4/7/12% é interestadual e 18% é interno', () => {
    expect(perfilFiscal({ ufFornecedor: null, aliqIcms: 12, aliqIpi: null, cst: null }).dentroDaUf).toBe(false);
    expect(perfilFiscal({ ufFornecedor: null, aliqIcms: 20.5, aliqIpi: null, cst: null }).dentroDaUf).toBe(true);
    expect(perfilFiscal({ ufFornecedor: null, aliqIcms: null, aliqIpi: null, cst: null }).dentroDaUf).toBeNull();
  });

  it('lê ST e Simples pelo CST/CSOSN', () => {
    expect(perfilFiscal({ ufFornecedor: 'SP', aliqIcms: 12, aliqIpi: null, cst: '010' }).st).toBe(true);
    expect(perfilFiscal({ ufFornecedor: 'SP', aliqIcms: 12, aliqIpi: null, cst: '000' }).st).toBe(false);
    expect(perfilFiscal({ ufFornecedor: 'SP', aliqIcms: null, aliqIpi: null, cst: '102' }).simples).toBe(true);
    expect(perfilFiscal({ ufFornecedor: 'SP', aliqIcms: 12, aliqIpi: null, cst: '000' }).simples).toBeNull();
  });

  it('o regime informado ganha do CSOSN', () => {
    expect(perfilFiscal({ ufFornecedor: 'SP', aliqIcms: null, aliqIpi: null, cst: '102', simples: false }).simples).toBe(false);
  });
});

// Casos da conferência contra a ZL0136 de 2026 (código real × fatos da NF).
describe('codigoPorRegra — consumo (conferido na ZL0136)', () => {
  const base = { icms4: false, ipi: false, st: false };

  it('BA sem ICMS: C0/H0', () => {
    const p = { ...base, dentroDaUf: true, icms: false, simples: false };
    expect(codigoPorRegra('C', p)?.codigo).toBe('C0');
    expect(codigoPorRegra('H', p)?.codigo).toBe('H0');
  });

  it('BA com ICMS: C8/H8, com IPI H9', () => {
    const p = { ...base, dentroDaUf: true, icms: true, simples: false };
    expect(codigoPorRegra('C', p)?.codigo).toBe('C8');
    expect(codigoPorRegra('H', p)?.codigo).toBe('H8');
    expect(codigoPorRegra('H', { ...p, ipi: true })?.codigo).toBe('H9');
  });

  it('fora da BA com ICMS: DIFAL (C1/H1), com IPI C3/H3', () => {
    const p = { ...base, dentroDaUf: false, icms: true, simples: false };
    expect(codigoPorRegra('C', p)?.codigo).toBe('C1');
    expect(codigoPorRegra('H', p)?.codigo).toBe('H1');
    expect(codigoPorRegra('H', { ...p, ipi: true })?.codigo).toBe('H3');
  });

  it('Simples fora da BA sem ICMS destacado: C6/H6', () => {
    const p = { ...base, dentroDaUf: false, icms: false, simples: true };
    expect(codigoPorRegra('C', p)?.codigo).toBe('C6');
    expect(codigoPorRegra('H', p)?.codigo).toBe('H6');
  });

  it('Simples fora da BA que destaca ICMS segue o DIFAL normal (H1)', () => {
    expect(codigoPorRegra('H', { ...base, dentroDaUf: false, icms: true, simples: true })?.codigo).toBe('H1');
  });

  it('ICMS 4% fora da BA: CN/HM, com IPI HN', () => {
    const p = { ...base, dentroDaUf: false, icms: true, icms4: true, simples: false };
    expect(codigoPorRegra('C', p)?.codigo).toBe('CN');
    expect(codigoPorRegra('H', p)?.codigo).toBe('HM');
    expect(codigoPorRegra('H', { ...p, ipi: true })?.codigo).toBe('HN');
  });

  it('ST: C2/H2', () => {
    const p = { ...base, dentroDaUf: false, icms: true, st: true, simples: false };
    expect(codigoPorRegra('H', p)?.codigo).toBe('H2');
  });

  it('supõe Simples quando não há ICMS fora da BA e o regime é desconhecido, e avisa', () => {
    const r = codigoPorRegra('H', { ...base, dentroDaUf: false, icms: false, simples: null });
    expect(r?.codigo).toBe('H6');
    expect(r?.suposicao).toBe(true);
  });

  it('não há regra para prefixos fora de C/H/I/D', () => {
    expect(codigoPorRegra('R', { ...base, dentroDaUf: true, icms: true, simples: false })).toBeNull();
  });
});

describe('sugerirCodigoImposto', () => {
  it('pedido anterior do mesmo fornecedor que bate com a regra: confiança alta', () => {
    const s = sugerirCodigoImposto(entrada({
      ufFornecedor: 'SP', aliqIcms: 12, aliqIpi: null, cst: '000',
      usosMaterial: [uso('H1')],
    }));
    expect(s).toMatchObject({ codigo: 'H1', confianca: 'alta', fonte: 'fornecedor', divergeDoHistorico: false });
  });

  it('divergência no consumo: vale a regra, confiança média e aviso', () => {
    // Antes o fornecedor não destacava IPI (H1); agora destaca 5% → H3.
    const s = sugerirCodigoImposto(entrada({
      ufFornecedor: 'SP', aliqIcms: 12, aliqIpi: 5, cst: '000',
      usosMaterial: [uso('H1')],
    }));
    expect(s).toMatchObject({ codigo: 'H3', confianca: 'media', divergeDoHistorico: true });
    expect(s?.ultimoUso?.codigo).toBe('H1');
    expect(s?.alternativas).toContain('H1');
  });

  it('na industrialização o histórico do fornecedor vence a regra', () => {
    // Cotação sem IPI (regra: I1), mas o SAP sempre usou I3 com este fornecedor.
    const s = sugerirCodigoImposto(entrada({
      ufFornecedor: 'SP', aliqIcms: 12, aliqIpi: null, cst: '000',
      usosMaterial: [uso('I3')],
    }));
    expect(s).toMatchObject({ codigo: 'I3', confianca: 'media', divergeDoHistorico: true });
    expect(s?.alternativas).toContain('I1');
  });

  it('sem pedido do fornecedor, usa o prefixo mais usado no material (média)', () => {
    const s = sugerirCodigoImposto(entrada({
      ufFornecedor: 'BA', aliqIcms: 20.5,
      usosMaterial: [
        uso('H1', '2026-03-01', '99999999000100'),
        uso('H3', '2026-02-01', '88888888000100'),
        uso('C1', '2025-12-01', '77777777000100'),
      ],
    }));
    expect(s).toMatchObject({ codigo: 'H8', confianca: 'media', fonte: 'material' });
  });

  it('sem nenhum histórico: material de projeto cai em I, o resto em H, com confiança baixa', () => {
    const projeto = sugerirCodigoImposto(entrada({
      material: '100000000000044512', ufFornecedor: 'SP', aliqIcms: 12, aliqIpi: 10,
    }));
    expect(projeto).toMatchObject({ codigo: 'I3', confianca: 'baixa', fonte: 'tipo' });

    const consumo = sugerirCodigoImposto(entrada({ material: '40351', ufFornecedor: 'BA', aliqIcms: 20.5 }));
    expect(consumo).toMatchObject({ codigo: 'H8', confianca: 'baixa', fonte: 'tipo' });
  });

  it('suposição (UF desconhecida) rebaixa a confiança um nível', () => {
    const s = sugerirCodigoImposto(entrada({
      ufFornecedor: null, aliqIcms: null,
      usosMaterial: [uso('H6')],
    }));
    // Regra: H6 (supôs Simples) igual ao histórico → alta, rebaixada por supor.
    expect(s).toMatchObject({ codigo: 'H6', confianca: 'media' });
  });

  it('prefixo sem regra (REIDI) repete o último uso do fornecedor', () => {
    const s = sugerirCodigoImposto(entrada({ ufFornecedor: 'SP', aliqIcms: 12, usosMaterial: [uso('R5')] }));
    expect(s).toMatchObject({ codigo: 'R5', confianca: 'media', fonte: 'fornecedor' });
  });

  it('código que não existe em sup_impostos não é sugerido', () => {
    const s = sugerirCodigoImposto(entrada({
      ufFornecedor: 'BA', aliqIcms: 20.5,
      codigosValidos: new Set(['H0']),
    }));
    expect(s).toBeNull();
  });

  it('compara o CNPJ só pelos dígitos', () => {
    const s = sugerirCodigoImposto(entrada({
      cnpj: '12345678000190', ufFornecedor: 'BA', aliqIcms: 20.5,
      usosMaterial: [uso('H8')],
    }));
    expect(s?.fonte).toBe('fornecedor');
  });
});

describe('ehMaterialDeProjeto', () => {
  it('reconhece a faixa de 18 dígitos de projeto', () => {
    expect(ehMaterialDeProjeto('100000000000044512')).toBe(true);
    expect(ehMaterialDeProjeto('40351')).toBe(false);
    expect(ehMaterialDeProjeto(null)).toBe(false);
  });
});
