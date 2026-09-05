import { describe, expect, it } from 'vitest';
import {
  DEPOSITOS_INATIVOS, descricaoDeposito, formatDeposito, isDepositoInativo, ordenarDepositos,
} from './almoxarifado';

describe('depósitos inativos', () => {
  it('reconhece os 11 depósitos com status Exclusão', () => {
    expect(DEPOSITOS_INATIVOS.size).toBe(11);
    ['0030', '0070', '0080', '0100', '0110', '0120', '0126', '0201', '0202', '0203', '0210']
      .forEach(cod => expect(isDepositoInativo(cod)).toBe(true));
  });

  it('depósito em uso continua ativo', () => {
    ['0001', '0004', '0105', '1000'].forEach(cod => expect(isDepositoInativo(cod)).toBe(false));
  });

  it('aceita código sem o zero à esquerda, como vem de planilha', () => {
    expect(isDepositoInativo('202')).toBe(true);
    expect(isDepositoInativo('30')).toBe(true);
    expect(descricaoDeposito('202')).toBe('MAT.Elab.Vestas');
  });

  it('código vazio ou desconhecido não é inativo', () => {
    expect(isDepositoInativo('')).toBe(false);
    expect(isDepositoInativo(null)).toBe(false);
    expect(isDepositoInativo('9999')).toBe(false);
  });

  it('rótulo marca o depósito inativo e preserva o ativo', () => {
    expect(formatDeposito('0202')).toBe('0202 - MAT.Elab.Vestas (inativo)');
    expect(formatDeposito('0004')).toBe('0004 - Manutenção');
    expect(formatDeposito('')).toBe('—');
  });

  it('ordena ativos primeiro e inativos ao final, cada bloco em ordem', () => {
    expect(ordenarDepositos(['0202', '0004', '0120', '0001'])).toEqual(['0001', '0004', '0120', '0202']);
    expect(ordenarDepositos(['0210', '1000'])).toEqual(['1000', '0210']);
  });
});
