import { describe, expect, it } from 'vitest';
import { interpretarPosicao, separarPosicoes } from './gembaEndereco';

describe('gembaEndereco - interpretarPosicao', () => {
  it('lê depósito, bloco, andar e apartamento', () => {
    expect(interpretarPosicao('104.130218')).toEqual({
      tipo: 'prateleira', deposito: '0004', bloco: 13, andar: 2, apartamento: 18, bruto: '104.130218',
    });
  });

  it('apartamento 00 vira null e andar 00 é o chão', () => {
    expect(interpretarPosicao('104.020100')).toMatchObject({ deposito: '0004', bloco: 2, andar: 1, apartamento: null });
    expect(interpretarPosicao('104.440200')).toMatchObject({ bloco: 44, andar: 2 });
    expect(interpretarPosicao('102.010200')).toMatchObject({ deposito: '0002', bloco: 1, andar: 2 });
    expect(interpretarPosicao('101.040000')).toMatchObject({ deposito: '0001', bloco: 4, andar: 0, apartamento: null });
  });

  it('completa os zeros que o Excel corta e aceita sem ponto', () => {
    expect(interpretarPosicao('101.0401')).toMatchObject({ deposito: '0001', bloco: 4, andar: 1, apartamento: null });
    expect(interpretarPosicao('104150209')).toMatchObject({ deposito: '0004', bloco: 15, andar: 2, apartamento: 9 });
    expect(interpretarPosicao(' 104.130218 ')).toMatchObject({ bloco: 13 });
  });

  it('posições com nome', () => {
    expect(interpretarPosicao('102.ANEXO')).toMatchObject({ tipo: 'zona', zona: 'apoio_manutencao' });
    expect(interpretarPosicao('104.cabos')).toMatchObject({ tipo: 'zona', zona: 'rua_04' });
    expect(interpretarPosicao('AREA RECEB')).toMatchObject({ tipo: 'zona', zona: 'recebimento' });
    expect(interpretarPosicao('101.ARAMES')).toMatchObject({ tipo: 'deposito', deposito: '0001' });
    expect(interpretarPosicao('DEPVIRTUAL')).toMatchObject({ tipo: 'fora', motivo: 'virtual' });
    expect(interpretarPosicao('BAIA EXTER')).toMatchObject({ tipo: 'fora', motivo: 'externo' });
  });

  it('depósitos de fora do galpão e erros de digitação', () => {
    expect(interpretarPosicao('200.TINTAS')).toMatchObject({ tipo: 'fora', motivo: 'externo' });
    expect(interpretarPosicao('200.090100')).toMatchObject({ tipo: 'fora', motivo: 'externo' });
    // 110 lê como depósito 0010, que o layout não conhece.
    expect(interpretarPosicao('110.080316')).toMatchObject({ tipo: 'prateleira', deposito: '0010' });
    expect(interpretarPosicao('XPTO')).toMatchObject({ tipo: 'fora', motivo: 'desconhecido' });
  });

  it('vazio não é endereço', () => {
    expect(interpretarPosicao('')).toBeNull();
    expect(interpretarPosicao(null)).toBeNull();
    expect(interpretarPosicao('   ')).toBeNull();
  });
});

describe('gembaEndereco - separarPosicoes', () => {
  it('quebra a lista e tira repetidas', () => {
    expect(separarPosicoes('104.130218, 104.020100, 104.130218')).toEqual(['104.130218', '104.020100']);
    expect(separarPosicoes('')).toEqual([]);
  });
});
